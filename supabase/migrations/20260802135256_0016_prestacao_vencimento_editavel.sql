/* 0016 — Prestação de contas também aceita 1º vencimento e intervalo. */

DROP FUNCTION IF EXISTS public.fn_prestar_contas(uuid, date, jsonb, boolean, smallint, uuid, text);

CREATE FUNCTION public.fn_prestar_contas(
    p_revendedor_id     UUID,
    p_data              DATE,
    p_itens             JSONB,
    p_cobrar_perdas     BOOLEAN  DEFAULT true,
    p_qtd_parcelas      SMALLINT DEFAULT 1,
    p_forma_pagamento_id UUID    DEFAULT NULL,
    p_observacoes       TEXT     DEFAULT NULL,
    p_primeiro_venc     DATE     DEFAULT NULL,
    p_intervalo_dias    INTEGER  DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_p UUID; v_tx UUID := gen_random_uuid(); e JSONB; v_ri RECORD;
  v_vend NUMERIC(14,3); v_devo NUMERIC(14,3); v_perd NUMERIC(14,3);
  v_bucket bucket_estoque_enum; v_parc SMALLINT := COALESCE(p_qtd_parcelas,1);
  v_dt DATE := COALESCE(p_data, CURRENT_DATE); v_int INTEGER;
  t_qv NUMERIC(14,3):=0; t_qd NUMERIC(14,3):=0; t_qp NUMERIC(14,3):=0;
  t_vv NUMERIC(14,2):=0; t_cv NUMERIC(14,2):=0; t_vd NUMERIC(14,2):=0; t_vp NUMERIC(14,2):=0;
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
    CONTINUE WHEN (v_vend + v_devo + v_perd) = 0;

    SELECT ri.*, r.tipo AS tipo_remessa, r.revendedor_id AS rev
      INTO v_ri FROM public.remessa_itens ri
      JOIN public.remessas r ON r.id=ri.remessa_id
     WHERE ri.id = (e->>'remessa_item_id')::UUID FOR UPDATE;

    IF v_ri.rev IS NULL OR v_ri.rev <> p_revendedor_id THEN
      RAISE EXCEPTION 'Item não pertence a este revendedor.'; END IF;
    IF (v_vend + v_devo + v_perd) > v_ri.qtd_em_posse THEN
      RAISE EXCEPTION 'O revendedor tem % unidade(s) em posse deste item, mas foram informadas %.',
        v_ri.qtd_em_posse, (v_vend + v_devo + v_perd); END IF;

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

REVOKE EXECUTE ON FUNCTION public.fn_prestar_contas(uuid, date, jsonb, boolean, smallint, uuid, text, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_prestar_contas(uuid, date, jsonb, boolean, smallint, uuid, text, date, integer) TO authenticated;
