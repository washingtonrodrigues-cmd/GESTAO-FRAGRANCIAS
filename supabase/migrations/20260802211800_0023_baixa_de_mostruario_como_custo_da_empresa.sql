/* ═══════════════════════════════════════════════════════════════════
   0023 — Mostruário se baixa como custo da empresa; nunca vira venda
   ───────────────────────────────────────────────────────────────────
   Regra de negócio: produto enviado como MOSTRUÁRIO é amostra de
   demonstração. Ele não é vendido pelo revendedor. Os dois desfechos
   legítimos são:

     · DEVOLVIDO — volta para o estoque disponível, sem custo nenhum
     · BAIXADO   — foi consumido, danificado ou perdeu a validade
                   comercial: sai do estoque e vira DESPESA DA EMPRESA,
                   nunca cobrança do revendedor

   Se um dia o item de mostruário for realmente vendido, o caminho certo
   é devolvê-lo ao estoque e registrar uma venda normal — aí o custo
   médio e o CMV entram pela porta da frente.
   ═══════════════════════════════════════════════════════════════════ */

ALTER TABLE public.remessa_itens
  ADD COLUMN IF NOT EXISTS qtd_baixada NUMERIC(14,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.remessa_itens.qtd_baixada IS
  'Unidades de mostruário baixadas como custo da empresa (não cobradas do revendedor).';

CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_remessa_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_item UUID := NEW.remessa_item_id; v_rem UUID;
BEGIN
  WITH totais AS (
    SELECT COALESCE(SUM(quantidade) FILTER (WHERE status_novo='VENDIDO'),0) AS vend,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo IN ('DEVOLVIDO','TROCADO')),0) AS devo,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo='PERDIDO'),0) AS perd,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo='BAIXADO'),0) AS baix,
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

DROP FUNCTION IF EXISTS public.fn_prestar_contas(uuid, date, jsonb, boolean, smallint, uuid, text, date, integer);

CREATE FUNCTION public.fn_prestar_contas(
    p_revendedor_id      UUID,
    p_data               DATE,
    p_itens              JSONB,
    p_cobrar_perdas      BOOLEAN  DEFAULT true,
    p_qtd_parcelas       SMALLINT DEFAULT 1,
    p_forma_pagamento_id UUID     DEFAULT NULL,
    p_observacoes        TEXT     DEFAULT NULL,
    p_primeiro_venc      DATE     DEFAULT NULL,
    p_intervalo_dias     INTEGER  DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    v_baix := COALESCE((e->>'baixada')::NUMERIC,0);
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

    IF v_ri.tipo_remessa = 'MOSTRUARIO' AND v_vend > 0 THEN
      RAISE EXCEPTION 'Produto em mostruário não pode ser vendido. Para vender, devolva ao estoque e registre uma venda normal.';
    END IF;
    IF v_ri.tipo_remessa <> 'MOSTRUARIO' AND v_baix > 0 THEN
      RAISE EXCEPTION 'A baixa como custo da empresa vale apenas para mostruário. Em consignação use devolvido ou perdido.';
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

    -- BAIXA DE MOSTRUÁRIO: sai do estoque, vira despesa da empresa.
    -- Não gera título, não entra em valor devido, não toca no revendedor.
    IF v_baix > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, motivo, created_by)
      VALUES (v_ri.id, v_p, 'BAIXADO', v_baix, 0, 0, v_ri.valor_custo_unitario, v_dt,
        COALESCE(NULLIF(btrim(e->>'motivo'),''),'Amostra de mostruário baixada como custo da empresa'),
        public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'BAIXA_MOSTRUARIO',
        -v_baix, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,
        'Baixa de mostruário como custo da empresa', v_dt);
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

  IF t_vb > 0 THEN
    INSERT INTO public.despesas (categoria, natureza, descricao, valor, data_despesa,
      origem_tabela, origem_id, created_by)
    VALUES ('BAIXA_MOSTRUARIO','VARIAVEL',
      'Baixa de mostruário (' || t_qb || ' un) — prestação de contas nº ' ||
        (SELECT numero FROM public.prestacoes_contas WHERE id=v_p),
      t_vb, v_dt, 'prestacoes_contas', v_p, public.fn_usuario_atual());
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

REVOKE EXECUTE ON FUNCTION public.fn_prestar_contas(uuid, date, jsonb, boolean, smallint, uuid, text, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_prestar_contas(uuid, date, jsonb, boolean, smallint, uuid, text, date, integer) TO authenticated;
