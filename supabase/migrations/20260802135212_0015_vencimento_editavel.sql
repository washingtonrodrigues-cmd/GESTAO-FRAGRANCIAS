/* ═══════════════════════════════════════════════════════════════════
   0015 — Data de vencimento editável
   ───────────────────────────────────────────────────────────────────
   Até aqui o vencimento das parcelas era sempre calculado (data da
   operação + 30 dias por parcela). Passa a ser controlável em dois
   momentos:
     a) no ato da venda / prestação de contas — 1º vencimento e
        intervalo entre as parcelas;
     b) depois de gerada — fn_alterar_vencimento reagenda uma parcela
        em aberto, deixando o histórico registrado.
   ═══════════════════════════════════════════════════════════════════ */

/* ── 1. Colunas de agendamento ───────────────────────────────────── */
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS primeiro_vencimento     DATE,
  ADD COLUMN IF NOT EXISTS intervalo_parcelas_dias SMALLINT;

ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_intervalo_chk;
ALTER TABLE public.vendas ADD CONSTRAINT vendas_intervalo_chk
  CHECK (intervalo_parcelas_dias IS NULL OR intervalo_parcelas_dias BETWEEN 1 AND 365);

ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_primeiro_venc_chk;
ALTER TABLE public.vendas ADD CONSTRAINT vendas_primeiro_venc_chk
  CHECK (primeiro_vencimento IS NULL OR primeiro_vencimento >= data_venda);

COMMENT ON COLUMN public.vendas.primeiro_vencimento IS
  'Vencimento da 1ª parcela. NULL = regra automática (à vista no dia; parcelado a partir de +intervalo).';
COMMENT ON COLUMN public.vendas.intervalo_parcelas_dias IS
  'Dias entre uma parcela e a seguinte. NULL = parâmetro intervalo_parcelas_dias (padrão 30).';

ALTER TABLE public.prestacoes_contas
  ADD COLUMN IF NOT EXISTS primeiro_vencimento     DATE,
  ADD COLUMN IF NOT EXISTS intervalo_parcelas_dias SMALLINT;

ALTER TABLE public.prestacoes_contas DROP CONSTRAINT IF EXISTS prestacoes_intervalo_chk;
ALTER TABLE public.prestacoes_contas ADD CONSTRAINT prestacoes_intervalo_chk
  CHECK (intervalo_parcelas_dias IS NULL OR intervalo_parcelas_dias BETWEEN 1 AND 365);

ALTER TABLE public.prestacoes_contas DROP CONSTRAINT IF EXISTS prestacoes_primeiro_venc_chk;
ALTER TABLE public.prestacoes_contas ADD CONSTRAINT prestacoes_primeiro_venc_chk
  CHECK (primeiro_vencimento IS NULL OR primeiro_vencimento >= data_acerto);

/* ── 2. fn_gerar_parcelas passa a aceitar o 1º vencimento ────────── */
DROP FUNCTION IF EXISTS public.fn_gerar_parcelas(
  origem_titulo_enum, uuid, uuid, tipo_devedor_enum, uuid, uuid,
  numeric, smallint, date, integer, boolean, numeric);

CREATE FUNCTION public.fn_gerar_parcelas(
    p_origem          origem_titulo_enum,
    p_venda_id        UUID,
    p_prestacao_id    UUID,
    p_tipo_devedor    tipo_devedor_enum,
    p_cliente_id      UUID,
    p_revendedor_id   UUID,
    p_valor_total     NUMERIC,
    p_qtd_parcelas    SMALLINT,
    p_data_base       DATE,
    p_intervalo_dias  INTEGER DEFAULT 30,
    p_primeira_avista BOOLEAN DEFAULT false,
    p_lucro_total     NUMERIC DEFAULT 0,
    p_primeiro_venc   DATE    DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_base NUMERIC(14,2); v_res NUMERIC(14,2); v_valor NUMERIC(14,2);
    v_lb NUMERIC(14,2); v_lr NUMERIC(14,2); v_lucro NUMERIC(14,2);
    v_venc DATE; v_int INTEGER := COALESCE(NULLIF(p_intervalo_dias,0), 30); i SMALLINT;
BEGIN
    IF p_qtd_parcelas < 1 OR p_qtd_parcelas > 4 THEN
        RAISE EXCEPTION 'O parcelamento permitido é de 1 a 4 vezes.'; END IF;
    IF p_valor_total <= 0 THEN RETURN; END IF;
    IF trunc(p_valor_total / p_qtd_parcelas, 2) <= 0 THEN
        RAISE EXCEPTION 'O valor é baixo demais para % parcelas. Cada parcela precisa ter ao menos R$ 0,01.',
          p_qtd_parcelas; END IF;
    IF v_int < 1 OR v_int > 365 THEN
        RAISE EXCEPTION 'O intervalo entre parcelas deve ficar entre 1 e 365 dias.'; END IF;
    IF p_primeiro_venc IS NOT NULL AND p_primeiro_venc < p_data_base THEN
        RAISE EXCEPTION 'O vencimento (%) não pode ser anterior à data da operação (%).',
          to_char(p_primeiro_venc,'DD/MM/YYYY'), to_char(p_data_base,'DD/MM/YYYY'); END IF;

    v_base := trunc(p_valor_total / p_qtd_parcelas, 2);
    v_res  := p_valor_total - (v_base * p_qtd_parcelas);
    v_lb   := trunc(COALESCE(p_lucro_total,0) / p_qtd_parcelas, 2);
    v_lr   := COALESCE(p_lucro_total,0) - (v_lb * p_qtd_parcelas);

    FOR i IN 1..p_qtd_parcelas LOOP
        v_valor := v_base + CASE WHEN i=1 THEN v_res ELSE 0 END;
        v_lucro := v_lb   + CASE WHEN i=1 THEN v_lr  ELSE 0 END;
        v_venc := CASE
            -- 1º vencimento informado manualmente: manda nele
            WHEN p_primeiro_venc IS NOT NULL      THEN p_primeiro_venc + ((i-1)*v_int)
            WHEN p_primeira_avista AND i=1        THEN p_data_base
            WHEN p_primeira_avista                THEN p_data_base + ((i-1)*v_int)
            ELSE                                       p_data_base + (i*v_int) END;
        INSERT INTO public.titulos_receber (
            origem, venda_id, prestacao_id, tipo_devedor, cliente_id, revendedor_id,
            numero_parcela, total_parcelas, valor_original, data_emissao, data_vencimento,
            lucro_proporcional, created_by)
        VALUES (p_origem, p_venda_id, p_prestacao_id, p_tipo_devedor, p_cliente_id, p_revendedor_id,
            i, p_qtd_parcelas, v_valor, p_data_base, v_venc, v_lucro, public.fn_usuario_atual());
    END LOOP;
END; $function$;

/* ── 3. Confirmação da venda honra o agendamento escolhido ───────── */
CREATE OR REPLACE FUNCTION public.fn_confirmar_venda(p_venda_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_v RECORD; v_tx UUID := gen_random_uuid(); v_i RECORD;
        v_custo NUMERIC(14,2) := 0; v_avista BOOLEAN; v_dev tipo_devedor_enum;
        v_rec UUID; v_n INT; v_int INT; v_quitado BOOLEAN;
BEGIN
  SELECT * INTO v_v FROM public.vendas WHERE id=p_venda_id FOR UPDATE;
  IF v_v.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'Somente vendas em rascunho podem ser confirmadas.'; END IF;
  SELECT COUNT(*) INTO v_n FROM public.venda_itens WHERE venda_id=p_venda_id;
  IF v_n = 0 THEN RAISE EXCEPTION 'Adicione ao menos um produto à venda.'; END IF;
  IF v_v.qtd_parcelas > 1 AND v_v.cliente_id IS NULL AND v_v.revendedor_id IS NULL THEN
    RAISE EXCEPTION 'Vendas parceladas exigem um cliente identificado. Cadastre o cliente ou mude para pagamento à vista.';
  END IF;

  FOR v_i IN SELECT vi.id, vi.produto_id, vi.quantidade, p.custo_medio
               FROM public.venda_itens vi JOIN public.produtos p ON p.id=vi.produto_id
              WHERE vi.venda_id=p_venda_id LOOP
    UPDATE public.venda_itens SET custo_unitario_praticado=v_i.custo_medio,
      custo_total_item=round(v_i.quantidade*v_i.custo_medio,2) WHERE id=v_i.id;
    v_custo := v_custo + round(v_i.quantidade*v_i.custo_medio,2);
    PERFORM public.fn_lancar_movimento(v_i.produto_id,'DISPONIVEL','SAIDA_VENDA',
      -v_i.quantidade, v_i.custo_medio,'vendas',p_venda_id,v_tx,NULL,v_v.data_venda);
    UPDATE public.produtos SET data_ultima_saida=v_v.data_venda WHERE id=v_i.produto_id;
  END LOOP;

  UPDATE public.vendas SET custo_total=v_custo, status='CONFIRMADO', data_confirmacao=now(),
    updated_by=public.fn_usuario_atual() WHERE id=p_venda_id;

  v_avista := (v_v.qtd_parcelas = 1);
  v_dev := CASE WHEN v_v.tipo='CONSUMIDOR' THEN 'CLIENTE'::tipo_devedor_enum
                ELSE 'REVENDEDOR'::tipo_devedor_enum END;
  v_int := COALESCE(v_v.intervalo_parcelas_dias,
                    NULLIF((SELECT valor FROM public.parametros WHERE chave='intervalo_parcelas_dias'),'')::INT,
                    30);

  PERFORM public.fn_gerar_parcelas('VENDA', p_venda_id, NULL, v_dev,
    v_v.cliente_id, v_v.revendedor_id, v_v.valor_total, v_v.qtd_parcelas,
    v_v.data_venda, v_int, v_avista, v_v.valor_total - v_custo, v_v.primeiro_vencimento);

  -- Quitação automática só quando é realmente à vista: uma parcela vencendo
  -- no próprio dia da venda. Se o usuário jogou o vencimento para frente,
  -- o título nasce em aberto e entra em contas a receber.
  v_quitado := v_avista
    AND (v_v.primeiro_vencimento IS NULL OR v_v.primeiro_vencimento <= v_v.data_venda);

  IF v_quitado AND v_v.valor_total > 0 THEN
    INSERT INTO public.recebimentos (tipo_devedor, cliente_id, revendedor_id, data_recebimento,
      valor_total, forma_pagamento_id, observacoes, created_by)
    VALUES (v_dev, v_v.cliente_id, v_v.revendedor_id, v_v.data_venda, v_v.valor_total,
      v_v.forma_pagamento_id, 'Recebimento automático da venda nº ' || v_v.numero,
      public.fn_usuario_atual())
    RETURNING id INTO v_rec;
    INSERT INTO public.recebimento_alocacoes (recebimento_id, titulo_id, valor, created_by)
    SELECT v_rec, t.id, t.valor_original, public.fn_usuario_atual()
      FROM public.titulos_receber t WHERE t.venda_id=p_venda_id;
  END IF;
END; $function$;

/* ── 4. Reagendar uma parcela já gerada ──────────────────────────── */
CREATE OR REPLACE FUNCTION public.fn_alterar_vencimento(
    p_titulo_id UUID, p_nova_data DATE, p_motivo TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_t RECORD; v_nota TEXT;
BEGIN
  IF p_nova_data IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data de vencimento.'; END IF;

  SELECT * INTO v_t FROM public.titulos_receber WHERE id=p_titulo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  IF v_t.situacao = 'CANCELADO' THEN
    RAISE EXCEPTION 'Esta parcela foi cancelada — não é possível reagendar.'; END IF;
  IF v_t.situacao = 'PAGO' THEN
    RAISE EXCEPTION 'Esta parcela já está quitada. Estorne o recebimento antes de mexer no vencimento.'; END IF;
  IF p_nova_data < v_t.data_emissao THEN
    RAISE EXCEPTION 'O vencimento não pode ser anterior à emissão (%).',
      to_char(v_t.data_emissao,'DD/MM/YYYY'); END IF;
  IF p_nova_data > v_t.data_emissao + 3650 THEN
    RAISE EXCEPTION 'Data de vencimento distante demais (limite de 10 anos a partir da emissão).'; END IF;
  IF p_nova_data = v_t.data_vencimento THEN RETURN; END IF;

  v_nota := 'Vencimento alterado de ' || to_char(v_t.data_vencimento,'DD/MM/YYYY')
         || ' para ' || to_char(p_nova_data,'DD/MM/YYYY')
         || COALESCE(' — ' || NULLIF(btrim(p_motivo),''), '')
         || ' (' || to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') || ')';

  UPDATE public.titulos_receber
     SET data_vencimento = p_nova_data,
         observacoes = btrim(COALESCE(observacoes || E'\n', '') || v_nota),
         updated_by = public.fn_usuario_atual()
   WHERE id = p_titulo_id;
END; $function$;

/* ── 5. Permissões (o EXECUTE foi revogado do público em 0014) ───── */
REVOKE EXECUTE ON FUNCTION public.fn_gerar_parcelas(
  origem_titulo_enum, uuid, uuid, tipo_devedor_enum, uuid, uuid,
  numeric, smallint, date, integer, boolean, numeric, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_alterar_vencimento(uuid, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_alterar_vencimento(uuid, date, text) TO authenticated;
