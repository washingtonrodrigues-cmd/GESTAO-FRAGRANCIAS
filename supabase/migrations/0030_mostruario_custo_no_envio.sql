-- 0030 — O mostruário vira despesa no envio, uma única vez
--
-- REGRA (RN-M08). Amostra de mostruário não é mercadoria à venda: é material
-- de demonstração. No instante em que sai para o revendedor, o custo dela vira
-- DESPESA da empresa, na categoria BAIXA_MOSTRUARIO. Uma vez só.
--
-- O que muda em relação ao comportamento anterior (0022–0024), em que a
-- despesa nascia lá na frente, na prestação de contas:
--
--   envio        → lança a despesa (era: nada)
--   devolução    → estorna a despesa, porque o produto volta a ser patrimônio
--   finalização  → não lança nada, o custo já foi (era: lançava a despesa aqui)
--   venda        → continua proibido
--   perda        → passa a ser proibido em mostruário; use "finalizar"
--
-- Por que a devolução estorna: enquanto o produto está no mostruário ele já
-- foi levado a resultado. Se volta ao estoque disponível, volta a ser um bem —
-- manter a despesa contaria o mesmo dinheiro duas vezes, com sinais opostos.
--
-- Por que a perda deixa de valer para mostruário: perda e finalização são a
-- mesma coisa em amostra ("sumiu" e "acabou" dão no mesmo resultado), e a
-- perda tem caminho próprio de despesa (PERDA_ESTOQUE) que lançaria o custo
-- de novo. Um caminho só, sem risco de duplicar.

-- ═════════════ 1. Envio: lança a despesa ═════════════

CREATE OR REPLACE FUNCTION public.fn_confirmar_remessa(p_remessa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_r RECORD; v_tx UUID := gen_random_uuid(); v_i RECORD;
        v_bucket bucket_estoque_enum; v_n INT; v_rev TEXT; v_custo NUMERIC(14,2);
BEGIN
  SELECT * INTO v_r FROM public.remessas WHERE id=p_remessa_id FOR UPDATE;
  IF v_r.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'Somente remessas em rascunho podem ser confirmadas.'; END IF;
  SELECT COUNT(*) INTO v_n FROM public.remessa_itens WHERE remessa_id=p_remessa_id;
  IF v_n = 0 THEN RAISE EXCEPTION 'Adicione ao menos um produto à remessa.'; END IF;

  SELECT nome INTO v_rev FROM public.revendedores WHERE id=v_r.revendedor_id;

  v_bucket := CASE WHEN v_r.tipo='MOSTRUARIO' THEN 'MOSTRUARIO'::bucket_estoque_enum
                   ELSE 'CONSIGNADO'::bucket_estoque_enum END;

  FOR v_i IN SELECT ri.id, ri.produto_id, ri.quantidade, ri.valor_custo_unitario,
                    p.nome AS produto_nome
               FROM public.remessa_itens ri
               JOIN public.produtos p ON p.id = ri.produto_id
              WHERE ri.remessa_id=p_remessa_id LOOP
    -- Transferência entre bolsos: NÃO gera receita nem título (RN-M01)
    PERFORM public.fn_lancar_movimento(v_i.produto_id,'DISPONIVEL','SAIDA_REMESSA',
      -v_i.quantidade, v_i.valor_custo_unitario,'remessas',p_remessa_id,v_tx,NULL,v_r.data_envio);
    PERFORM public.fn_lancar_movimento(v_i.produto_id, v_bucket,'SAIDA_REMESSA',
      v_i.quantidade, v_i.valor_custo_unitario,'remessas',p_remessa_id,v_tx,NULL,v_r.data_envio);

    -- RN-M08: mostruário é material de demonstração. O custo é da empresa e
    -- é reconhecido agora, no envio. Uma despesa por item, para que a
    -- devolução parcial possa estornar exatamente o que voltou.
    IF v_r.tipo = 'MOSTRUARIO' THEN
      v_custo := round(v_i.quantidade * v_i.valor_custo_unitario, 2);
      IF v_custo > 0 THEN
        INSERT INTO public.despesas (categoria, natureza, descricao, valor, data_despesa,
          produto_id, origem_tabela, origem_id, created_by)
        VALUES ('BAIXA_MOSTRUARIO','VARIAVEL',
          'Mostruário — ' || v_i.produto_nome || ' (' ||
            rtrim(rtrim(to_char(v_i.quantidade,'FM999999990.000'),'0'),'.') ||
            ' un) — remessa nº ' || v_r.numero || ' — ' || COALESCE(v_rev,'revendedor'),
          v_custo, v_r.data_envio, v_i.produto_id, 'remessa_itens', v_i.id,
          public.fn_usuario_atual());
      END IF;
    END IF;
  END LOOP;

  UPDATE public.remessas SET status='CONFIRMADO', updated_by=public.fn_usuario_atual()
   WHERE id=p_remessa_id;
END; $function$;

-- ═════════════ 2. Estorno da despesa quando a amostra volta ═════════════
--
-- despesas.valor tem CHECK (valor > 0), então não existe despesa negativa:
-- o estorno abate o valor da despesa original e, se zerar, apaga a linha
-- (deleted_at). O histórico fica na auditoria e no campo observações.

CREATE OR REPLACE FUNCTION public.fn_estornar_custo_mostruario(
  p_remessa_item_id uuid, p_valor numeric, p_data date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_d RECORD; v_falta NUMERIC(14,2) := round(COALESCE(p_valor,0),2);
        v_abate NUMERIC(14,2); v_total NUMERIC(14,2) := 0;
        v_nota TEXT := 'Estorno em ' || to_char(COALESCE(p_data,CURRENT_DATE),'DD/MM/YYYY')
                       || ': amostra devolvida ao estoque.';
BEGIN
  IF v_falta <= 0 THEN RETURN 0; END IF;

  FOR v_d IN SELECT id, valor FROM public.despesas
              WHERE origem_tabela='remessa_itens' AND origem_id=p_remessa_item_id
                AND categoria='BAIXA_MOSTRUARIO' AND deleted_at IS NULL
              ORDER BY created_at FOR UPDATE LOOP
    EXIT WHEN v_falta <= 0;
    v_abate := LEAST(v_d.valor, v_falta);

    IF v_abate >= v_d.valor THEN
      UPDATE public.despesas
         SET deleted_at = now(), updated_by = public.fn_usuario_atual(),
             observacoes = concat_ws(' | ', observacoes, v_nota)
       WHERE id = v_d.id;
    ELSE
      UPDATE public.despesas
         SET valor = round(v_d.valor - v_abate, 2), updated_by = public.fn_usuario_atual(),
             observacoes = concat_ws(' | ', observacoes,
               'Estorno parcial de ' || trim(to_char(v_abate,'FM999999990.00')) || '. ' || v_nota)
       WHERE id = v_d.id;
    END IF;

    v_total := round(v_total + v_abate, 2);
    v_falta := round(v_falta - v_abate, 2);
  END LOOP;

  RETURN v_total;
END; $function$;

REVOKE ALL ON FUNCTION public.fn_estornar_custo_mostruario(uuid, numeric, date) FROM PUBLIC, anon, authenticated;

-- ═════════════ 3. O gatilho passa a contar FINALIZADO ═════════════
-- BAIXADO continua sendo somado por causa dos registros já gravados antes
-- desta migração; daqui para frente só se grava FINALIZADO.

CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_remessa_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_item UUID := NEW.remessa_item_id; v_rem UUID;
BEGIN
  WITH totais AS (
    SELECT COALESCE(SUM(quantidade) FILTER (WHERE status_novo='VENDIDO'),0) AS vend,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo IN ('DEVOLVIDO','TROCADO')),0) AS devo,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo='PERDIDO'),0) AS perd,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo IN ('BAIXADO','FINALIZADO')),0) AS baix,
           MAX(data_evento) FILTER (WHERE status_novo IN ('DEVOLVIDO','TROCADO')) AS dt
      FROM public.remessa_item_eventos WHERE remessa_item_id=v_item)
  UPDATE public.remessa_itens ri SET
    qtd_vendida = t.vend, qtd_devolvida = t.devo, qtd_perdida = t.perd, qtd_baixada = t.baix,
    qtd_em_posse = ri.quantidade - t.vend - t.devo - t.perd - t.baix,
    data_ultima_devolucao = t.dt
  FROM totais t WHERE ri.id=v_item
  RETURNING ri.remessa_id INTO v_rem;

  UPDATE public.remessas r SET
    qtd_em_posse = COALESCE((SELECT SUM(qtd_em_posse) FROM public.remessa_itens WHERE remessa_id=r.id),0),
    updated_at = now()
  WHERE r.id = v_rem;
  RETURN NEW; END; $function$;

-- ═════════════ 4. Ações diretas na tela do mostruário ═════════════
-- Finalizar e devolver amostra não deveriam exigir abrir uma prestação de
-- contas: prestação de contas é documento de dinheiro a receber, e mostruário
-- nunca gera cobrança. Estas duas funções resolvem no próprio mostruário.

CREATE OR REPLACE FUNCTION public.fn_finalizar_mostruario(
  p_remessa_item_id uuid, p_quantidade numeric DEFAULT NULL,
  p_data date DEFAULT NULL, p_motivo text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ri RECORD; v_q NUMERIC(14,3); v_dt DATE := COALESCE(p_data, CURRENT_DATE);
BEGIN
  SELECT ri.*, r.tipo AS tipo_remessa, r.data_envio
    INTO v_ri FROM public.remessa_itens ri
    JOIN public.remessas r ON r.id = ri.remessa_id
   WHERE ri.id = p_remessa_item_id AND r.status='CONFIRMADO' FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Item de remessa não encontrado ou remessa não confirmada.'; END IF;
  IF v_ri.tipo_remessa <> 'MOSTRUARIO' THEN
    RAISE EXCEPTION 'Finalizar vale apenas para mostruário. Em consignação use vendido, devolvido ou perdido.'; END IF;

  v_q := COALESCE(p_quantidade, v_ri.qtd_em_posse);
  IF v_q <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
  IF v_q > v_ri.qtd_em_posse THEN
    RAISE EXCEPTION 'O revendedor está com % unidade(s) desta amostra, e foram informadas %.',
      v_ri.qtd_em_posse, v_q; END IF;
  IF v_dt < v_ri.data_envio THEN
    RAISE EXCEPTION 'A data (%) não pode ser anterior ao envio da remessa (%).',
      to_char(v_dt,'DD/MM/YYYY'), to_char(v_ri.data_envio,'DD/MM/YYYY'); END IF;

  -- Sem valor de revenda: amostra finalizada não gera receita nem cobrança.
  INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
    quantidade, valor_unitario, valor_total, custo_unitario, data_evento, motivo, created_by)
  VALUES (p_remessa_item_id, NULL, 'FINALIZADO', v_q, 0, 0, v_ri.valor_custo_unitario, v_dt,
    COALESCE(NULLIF(btrim(p_motivo),''),'Amostra de mostruário finalizada — acabou'),
    public.fn_usuario_atual());

  -- Só sai do estoque. O custo já foi despesa no envio (RN-M08).
  PERFORM public.fn_lancar_movimento(v_ri.produto_id,'MOSTRUARIO','BAIXA_MOSTRUARIO',
    -v_q, v_ri.valor_custo_unitario,'remessas',v_ri.remessa_id, gen_random_uuid(),
    'Amostra finalizada — custo já lançado no envio da remessa', v_dt);

  UPDATE public.remessas SET encerrada=true, data_encerramento=v_dt
   WHERE id = v_ri.remessa_id AND status='CONFIRMADO' AND NOT encerrada AND qtd_em_posse=0;
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_devolver_mostruario(
  p_remessa_item_id uuid, p_quantidade numeric DEFAULT NULL,
  p_data date DEFAULT NULL, p_motivo text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ri RECORD; v_q NUMERIC(14,3); v_dt DATE := COALESCE(p_data, CURRENT_DATE);
        v_tx UUID := gen_random_uuid();
BEGIN
  SELECT ri.*, r.tipo AS tipo_remessa, r.data_envio
    INTO v_ri FROM public.remessa_itens ri
    JOIN public.remessas r ON r.id = ri.remessa_id
   WHERE ri.id = p_remessa_item_id AND r.status='CONFIRMADO' FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Item de remessa não encontrado ou remessa não confirmada.'; END IF;
  IF v_ri.tipo_remessa <> 'MOSTRUARIO' THEN
    RAISE EXCEPTION 'Esta devolução rápida vale só para mostruário. Em consignação, devolva pela prestação de contas.'; END IF;

  v_q := COALESCE(p_quantidade, v_ri.qtd_em_posse);
  IF v_q <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
  IF v_q > v_ri.qtd_em_posse THEN
    RAISE EXCEPTION 'O revendedor está com % unidade(s) desta amostra, e foram informadas %.',
      v_ri.qtd_em_posse, v_q; END IF;
  IF v_dt < v_ri.data_envio THEN
    RAISE EXCEPTION 'A data (%) não pode ser anterior ao envio da remessa (%).',
      to_char(v_dt,'DD/MM/YYYY'), to_char(v_ri.data_envio,'DD/MM/YYYY'); END IF;

  INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
    quantidade, valor_unitario, valor_total, custo_unitario, data_evento, motivo, created_by)
  VALUES (p_remessa_item_id, NULL, 'DEVOLVIDO', v_q, 0, 0, v_ri.valor_custo_unitario, v_dt,
    COALESCE(NULLIF(btrim(p_motivo),''),'Amostra de mostruário devolvida ao estoque'),
    public.fn_usuario_atual());

  PERFORM public.fn_lancar_movimento(v_ri.produto_id,'MOSTRUARIO','RETORNO_DEVOLUCAO',
    -v_q, v_ri.valor_custo_unitario,'remessas',v_ri.remessa_id,v_tx,NULL,v_dt);
  PERFORM public.fn_lancar_movimento(v_ri.produto_id,'DISPONIVEL','RETORNO_DEVOLUCAO',
    v_q, v_ri.valor_custo_unitario,'remessas',v_ri.remessa_id,v_tx,NULL,v_dt);

  -- Voltou a ser patrimônio: a despesa do envio deixa de existir na medida
  -- exata do que voltou.
  PERFORM public.fn_estornar_custo_mostruario(p_remessa_item_id,
    round(v_q * v_ri.valor_custo_unitario, 2), v_dt);

  UPDATE public.remessas SET encerrada=true, data_encerramento=v_dt
   WHERE id = v_ri.remessa_id AND status='CONFIRMADO' AND NOT encerrada AND qtd_em_posse=0;
END; $function$;

REVOKE ALL ON FUNCTION public.fn_finalizar_mostruario(uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_devolver_mostruario(uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalizar_mostruario(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolver_mostruario(uuid, numeric, date, text) TO authenticated;

-- ═════════════ 5. Prestação de contas: "baixa" vira "finalizar" ═════════════

CREATE OR REPLACE FUNCTION public.fn_prestar_contas(p_revendedor_id uuid, p_data date, p_itens jsonb, p_cobrar_perdas boolean DEFAULT true, p_qtd_parcelas smallint DEFAULT 1, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_observacoes text DEFAULT NULL::text, p_primeiro_venc date DEFAULT NULL::date, p_intervalo_dias integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p UUID; v_tx UUID := gen_random_uuid(); e JSONB; v_ri RECORD;
  v_vend NUMERIC(14,3); v_devo NUMERIC(14,3); v_perd NUMERIC(14,3); v_baix NUMERIC(14,3);
  v_bucket bucket_estoque_enum; v_parc SMALLINT := COALESCE(p_qtd_parcelas,1);
  v_dt DATE := COALESCE(p_data, CURRENT_DATE); v_int INTEGER;
  t_qv NUMERIC(14,3):=0; t_qd NUMERIC(14,3):=0; t_qp NUMERIC(14,3):=0; t_qb NUMERIC(14,3):=0;
  t_vv NUMERIC(14,2):=0; t_cv NUMERIC(14,2):=0; t_vd NUMERIC(14,2):=0; t_vp NUMERIC(14,2):=0;
  t_vb NUMERIC(14,2):=0;
  v_devido NUMERIC(14,2);
BEGIN
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item na prestação de contas.'; END IF;
  IF p_primeiro_venc IS NOT NULL AND p_primeiro_venc < v_dt THEN
    RAISE EXCEPTION 'O vencimento (%) não pode ser anterior à data do acerto (%).',
      to_char(p_primeiro_venc,'DD/MM/YYYY'), to_char(v_dt,'DD/MM/YYYY'); END IF;

  v_int := COALESCE(p_intervalo_dias,
                    NULLIF((SELECT valor FROM public.parametros WHERE chave='intervalo_parcelas_dias'),'')::INT,
                    30);

  INSERT INTO public.prestacoes_contas (revendedor_id, data_acerto, cobrar_perdas,
      qtd_parcelas, forma_pagamento_id, observacoes,
      primeiro_vencimento, intervalo_parcelas_dias, created_by)
  VALUES (p_revendedor_id, v_dt, p_cobrar_perdas, v_parc, p_forma_pagamento_id,
      p_observacoes, p_primeiro_venc, p_intervalo_dias, public.fn_usuario_atual())
  RETURNING id INTO v_p;

  FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_vend := COALESCE((e->>'vendida')::NUMERIC,0);
    v_devo := COALESCE((e->>'devolvida')::NUMERIC,0);
    v_perd := COALESCE((e->>'perdida')::NUMERIC,0);
    -- "baixada" é o nome antigo do mesmo campo; aceito por compatibilidade.
    v_baix := COALESCE((e->>'finalizada')::NUMERIC, (e->>'baixada')::NUMERIC, 0);
    CONTINUE WHEN (v_vend + v_devo + v_perd + v_baix) = 0;

    SELECT ri.*, r.tipo AS tipo_remessa, r.revendedor_id AS rev
      INTO v_ri FROM public.remessa_itens ri
      JOIN public.remessas r ON r.id=ri.remessa_id
     WHERE ri.id = (e->>'remessa_item_id')::UUID FOR UPDATE;

    IF v_ri.rev IS NULL OR v_ri.rev <> p_revendedor_id THEN
      RAISE EXCEPTION 'Item não pertence a este revendedor.'; END IF;
    IF (v_vend + v_devo + v_perd + v_baix) > v_ri.qtd_em_posse THEN
      RAISE EXCEPTION 'O revendedor tem % unidade(s) em posse deste item, mas foram informadas %.',
        v_ri.qtd_em_posse, (v_vend + v_devo + v_perd + v_baix); END IF;

    -- Mostruário é amostra: não se vende nem se cobra do revendedor.
    IF v_ri.tipo_remessa = 'MOSTRUARIO' AND v_vend > 0 THEN
      RAISE EXCEPTION 'Produto em mostruário não pode ser vendido. Para vender, devolva ao estoque e registre uma venda normal.';
    END IF;
    -- Perda em mostruário duplicaria o custo, que já foi despesa no envio.
    IF v_ri.tipo_remessa = 'MOSTRUARIO' AND v_perd > 0 THEN
      RAISE EXCEPTION 'Amostra de mostruário não entra como perda: o custo dela já foi lançado no envio. Marque como finalizada.';
    END IF;
    IF v_ri.tipo_remessa <> 'MOSTRUARIO' AND v_baix > 0 THEN
      RAISE EXCEPTION 'Finalizar vale apenas para mostruário. Em consignação use devolvido ou perdido.';
    END IF;

    v_bucket := CASE WHEN v_ri.tipo_remessa='MOSTRUARIO' THEN 'MOSTRUARIO'::bucket_estoque_enum
                     ELSE 'CONSIGNADO'::bucket_estoque_enum END;

    IF v_vend > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, created_by)
      VALUES (v_ri.id, v_p, 'VENDIDO', v_vend, v_ri.valor_revenda_unitario,
        round(v_vend*v_ri.valor_revenda_unitario,2), v_ri.valor_custo_unitario, v_dt,
        public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'BAIXA_VENDA_CONSIGNADA',
        -v_vend, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,v_dt);
      UPDATE public.produtos SET data_ultima_saida=v_dt WHERE id=v_ri.produto_id;
      t_qv := t_qv + v_vend;
      t_vv := t_vv + round(v_vend*v_ri.valor_revenda_unitario,2);
      t_cv := t_cv + round(v_vend*v_ri.valor_custo_unitario,2);
    END IF;

    IF v_devo > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, created_by)
      VALUES (v_ri.id, v_p, 'DEVOLVIDO', v_devo, v_ri.valor_revenda_unitario,
        round(v_devo*v_ri.valor_revenda_unitario,2), v_ri.valor_custo_unitario, v_dt,
        public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'RETORNO_DEVOLUCAO',
        -v_devo, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,v_dt);
      PERFORM public.fn_lancar_movimento(v_ri.produto_id,'DISPONIVEL','RETORNO_DEVOLUCAO',
        v_devo, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,v_dt);
      -- Amostra que volta ao estoque volta a ser patrimônio: estorna a despesa.
      IF v_ri.tipo_remessa = 'MOSTRUARIO' THEN
        PERFORM public.fn_estornar_custo_mostruario(v_ri.id,
          round(v_devo*v_ri.valor_custo_unitario,2), v_dt);
      END IF;
      t_qd := t_qd + v_devo;
      t_vd := t_vd + round(v_devo*v_ri.valor_custo_unitario,2);
    END IF;

    IF v_perd > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, motivo, created_by)
      VALUES (v_ri.id, v_p, 'PERDIDO', v_perd, v_ri.valor_revenda_unitario,
        round(v_perd*v_ri.valor_revenda_unitario,2), v_ri.valor_custo_unitario, v_dt,
        COALESCE(e->>'motivo','Perda informada na prestação de contas'), public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'BAIXA_PERDA',
        -v_perd, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,v_dt);
      t_qp := t_qp + v_perd;
      t_vp := t_vp + round(v_perd*v_ri.valor_custo_unitario,2);
    END IF;

    -- FINALIZAÇÃO DE MOSTRUÁRIO: a amostra acabou. Sai do estoque e encerra.
    -- Não gera título, não entra em valor devido, NÃO gera despesa nova —
    -- o custo já foi reconhecido no envio da remessa (RN-M08).
    IF v_baix > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, motivo, created_by)
      VALUES (v_ri.id, v_p, 'FINALIZADO', v_baix, 0, 0, v_ri.valor_custo_unitario, v_dt,
        COALESCE(NULLIF(btrim(e->>'motivo'),''),'Amostra de mostruário finalizada — acabou'),
        public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'BAIXA_MOSTRUARIO',
        -v_baix, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,
        'Amostra finalizada — custo já lançado no envio da remessa', v_dt);
      t_qb := t_qb + v_baix;
      t_vb := t_vb + round(v_baix*v_ri.valor_custo_unitario,2);
    END IF;
  END LOOP;

  v_devido := t_vv + CASE WHEN p_cobrar_perdas THEN t_vp ELSE 0 END;

  UPDATE public.prestacoes_contas SET
    qtd_vendida=t_qv, qtd_devolvida=t_qd, qtd_perdida=t_qp,
    valor_vendido=t_vv, custo_vendido=t_cv, valor_devolvido=t_vd, valor_perdas=t_vp,
    valor_devido=v_devido, status='CONFIRMADO', data_confirmacao=now()
  WHERE id=v_p;

  IF NOT p_cobrar_perdas AND t_vp > 0 THEN
    INSERT INTO public.despesas (categoria, natureza, descricao, valor, data_despesa,
      origem_tabela, origem_id, created_by)
    VALUES ('PERDA_ESTOQUE','VARIAVEL',
      'Perda de produtos em consignação — prestação de contas nº ' ||
        (SELECT numero FROM public.prestacoes_contas WHERE id=v_p),
      t_vp, v_dt, 'prestacoes_contas', v_p, public.fn_usuario_atual());
  END IF;

  IF v_devido > 0 THEN
    PERFORM public.fn_gerar_parcelas('PRESTACAO_CONTAS'::origem_titulo_enum, NULL, v_p,
      'REVENDEDOR'::tipo_devedor_enum, NULL, p_revendedor_id, v_devido, v_parc,
      v_dt, v_int, (v_parc = 1), t_vv - t_cv, p_primeiro_venc);
  END IF;

  UPDATE public.remessas SET encerrada=true, data_encerramento=v_dt
   WHERE revendedor_id=p_revendedor_id AND status='CONFIRMADO'
     AND NOT encerrada AND qtd_em_posse=0;

  RETURN v_p;
END; $function$;

-- ═════════════ 6. Dashboard: nada de contar o mesmo dinheiro duas vezes ═════════════
-- O mostruário virou despesa. Se continuasse somando em "investimento total
-- em mercadoria", o mesmo custo apareceria como bem no estoque e como gasto
-- no resultado. Agora só a consignação — que continua sendo patrimônio.

CREATE OR REPLACE VIEW public.vw_dashboard
WITH (security_invoker = on) AS
 SELECT ( SELECT COALESCE(sum(compras.custo_total), (0)::numeric)
           FROM compras WHERE compras.status = 'CONFIRMADO'::status_documento_enum) AS total_compras,
    ( SELECT COALESCE(sum(compras.subtotal_produtos), (0)::numeric)
           FROM compras WHERE compras.status = 'CONFIRMADO'::status_documento_enum) AS total_custo_produtos,
    ( SELECT COALESCE(sum(compras.valor_frete), (0)::numeric)
           FROM compras WHERE compras.status = 'CONFIRMADO'::status_documento_enum) AS total_frete,
    ( SELECT COALESCE(sum(compras.valor_taxa_cartao), (0)::numeric)
           FROM compras WHERE compras.status = 'CONFIRMADO'::status_documento_enum) AS total_taxa_cartao,
    ( SELECT COALESCE(sum(compras.outros_custos), (0)::numeric)
           FROM compras WHERE compras.status = 'CONFIRMADO'::status_documento_enum) AS total_outros_custos,
    ( SELECT COALESCE(sum(vw_produtos.valor_estoque_disponivel), (0)::numeric)
           FROM vw_produtos) AS valor_estoque_disponivel,
    ( SELECT COALESCE(sum(vw_produtos.qtd_disponivel), (0)::numeric)
           FROM vw_produtos) AS qtd_estoque_disponivel,
    ( SELECT count(*) FROM vw_produtos WHERE vw_produtos.qtd_disponivel > (0)::numeric) AS produtos_disponiveis,
    ( SELECT COALESCE(sum(vw_itens_em_posse.valor_custo_total), (0)::numeric)
           FROM vw_itens_em_posse
          WHERE vw_itens_em_posse.tipo_remessa = 'MOSTRUARIO'::tipo_remessa_enum) AS valor_mostruario,
    ( SELECT COALESCE(sum(vw_itens_em_posse.valor_custo_total), (0)::numeric)
           FROM vw_itens_em_posse
          WHERE vw_itens_em_posse.tipo_remessa = 'CONSIGNACAO'::tipo_remessa_enum) AS valor_com_revendedores,
    (( SELECT COALESCE(sum((vw_produtos.valor_estoque_disponivel + vw_produtos.valor_reservado)), (0)::numeric)
           FROM vw_produtos)
     + ( SELECT COALESCE(sum(vw_itens_em_posse.valor_custo_total), (0)::numeric)
           FROM vw_itens_em_posse
          WHERE vw_itens_em_posse.tipo_remessa = 'CONSIGNACAO'::tipo_remessa_enum)) AS investimento_total_mercadoria,
    ( SELECT COALESCE(sum(vw_produtos.valor_potencial_venda), (0)::numeric)
           FROM vw_produtos) AS potencial_venda_estoque,
    ( SELECT COALESCE(sum(vw_resultado_consolidado.receita_liquida), (0)::numeric)
           FROM vw_resultado_consolidado) AS total_vendido,
    ( SELECT COALESCE(sum(vendas.valor_total), (0)::numeric)
           FROM vendas WHERE vendas.status = 'CONFIRMADO'::status_documento_enum
             AND vendas.tipo = 'CONSUMIDOR'::tipo_venda_enum) AS total_vendido_consumidor,
    ( SELECT COALESCE(sum(vendas.valor_total), (0)::numeric)
           FROM vendas WHERE vendas.status = 'CONFIRMADO'::status_documento_enum
             AND vendas.tipo = 'REVENDEDOR'::tipo_venda_enum) AS total_vendido_revendedor_direto,
    ( SELECT COALESCE(sum(prestacoes_contas.valor_vendido), (0)::numeric)
           FROM prestacoes_contas
          WHERE prestacoes_contas.status = 'CONFIRMADO'::status_documento_enum) AS total_vendido_consignacao,
    ( SELECT count(*) FROM vw_resultado_consolidado) AS qtd_vendas,
    ( SELECT COALESCE(sum(vendas.desconto_valor), (0)::numeric)
           FROM vendas WHERE vendas.status = 'CONFIRMADO'::status_documento_enum) AS total_descontos,
    ( SELECT CASE WHEN count(*) > 0
                  THEN round((sum(vw_resultado_consolidado.receita_liquida) / (count(*))::numeric), 2)
                  ELSE (0)::numeric END
           FROM vw_resultado_consolidado) AS ticket_medio,
    ( SELECT COALESCE(sum(vw_resultado_consolidado.lucro_bruto), (0)::numeric)
           FROM vw_resultado_consolidado) AS lucro_bruto,
    ( SELECT COALESCE(sum(vw_resultado_consolidado.lucro_recebido), (0)::numeric)
           FROM vw_resultado_consolidado) AS lucro_recebido,
    ( SELECT COALESCE(sum(vw_resultado_consolidado.lucro_a_receber), (0)::numeric)
           FROM vw_resultado_consolidado) AS lucro_a_receber,
    ( SELECT COALESCE(sum(despesas.valor), (0)::numeric)
           FROM despesas WHERE despesas.deleted_at IS NULL) AS total_despesas,
    (( SELECT COALESCE(sum(vw_resultado_consolidado.lucro_bruto), (0)::numeric)
           FROM vw_resultado_consolidado)
     - ( SELECT COALESCE(sum(despesas.valor), (0)::numeric)
           FROM despesas WHERE despesas.deleted_at IS NULL)) AS lucro_liquido,
    ( SELECT CASE WHEN COALESCE(sum(vw_resultado_consolidado.receita_liquida), (0)::numeric) > (0)::numeric
                  THEN round(((sum(vw_resultado_consolidado.lucro_bruto) / sum(vw_resultado_consolidado.receita_liquida)) * (100)::numeric), 2)
                  ELSE (0)::numeric END
           FROM vw_resultado_consolidado) AS margem_bruta_percentual,
    ( SELECT COALESCE(sum(titulos_receber.saldo), (0)::numeric)
           FROM titulos_receber WHERE titulos_receber.situacao = 'ABERTO'::situacao_titulo_enum) AS total_a_receber,
    ( SELECT COALESCE(sum(titulos_receber.saldo), (0)::numeric)
           FROM titulos_receber WHERE titulos_receber.situacao = 'ABERTO'::situacao_titulo_enum
             AND titulos_receber.data_vencimento < CURRENT_DATE) AS total_vencido,
    ( SELECT COALESCE(sum(titulos_receber.saldo), (0)::numeric)
           FROM titulos_receber WHERE titulos_receber.situacao = 'ABERTO'::situacao_titulo_enum
             AND titulos_receber.data_vencimento >= CURRENT_DATE
             AND titulos_receber.data_vencimento <= (CURRENT_DATE + 7)) AS total_a_vencer_7d,
    ( SELECT count(*) FROM titulos_receber
          WHERE titulos_receber.situacao = 'ABERTO'::situacao_titulo_enum
            AND titulos_receber.data_vencimento < CURRENT_DATE) AS qtd_titulos_vencidos,
    ( SELECT COALESCE(sum(recebimentos.valor_total), (0)::numeric)
           FROM recebimentos WHERE NOT recebimentos.estornado) AS total_recebido_caixa,
    ( SELECT CASE WHEN COALESCE(sum(titulos_receber.saldo), (0)::numeric) > (0)::numeric
                  THEN round(((COALESCE(sum(titulos_receber.saldo) FILTER (WHERE titulos_receber.data_vencimento < CURRENT_DATE), (0)::numeric) / sum(titulos_receber.saldo)) * (100)::numeric), 2)
                  ELSE (0)::numeric END
           FROM titulos_receber WHERE titulos_receber.situacao = 'ABERTO'::situacao_titulo_enum) AS inadimplencia_percentual,
    ( SELECT count(*) FROM vw_itens_em_posse WHERE vw_itens_em_posse.dias_em_posse > 60) AS qtd_mostruarios_antigos,
    ( SELECT count(*) FROM vw_produtos
          WHERE vw_produtos.qtd_disponivel > (0)::numeric
            AND (vw_produtos.data_ultima_saida IS NULL
                 OR vw_produtos.data_ultima_saida < (CURRENT_DATE - 60))) AS qtd_produtos_parados,
    -- Coluna nova entra no fim: CREATE OR REPLACE VIEW só permite acrescentar.
    ( SELECT COALESCE(sum(despesas.valor), (0)::numeric)
           FROM despesas
          WHERE despesas.deleted_at IS NULL
            AND despesas.categoria = 'BAIXA_MOSTRUARIO'::categoria_despesa_enum) AS total_custo_mostruario;

REVOKE ALL ON public.vw_dashboard FROM PUBLIC, anon;
GRANT SELECT ON public.vw_dashboard TO authenticated;

COMMENT ON COLUMN public.vw_dashboard.valor_mostruario IS
  'Custo das amostras que ainda estão na rua. Já foi lançado como despesa no envio — informativo, não é patrimônio.';
COMMENT ON COLUMN public.vw_dashboard.investimento_total_mercadoria IS
  'Dinheiro parado em mercadoria: estoque disponível + reservado + consignação. Mostruário não entra: virou despesa no envio.';
