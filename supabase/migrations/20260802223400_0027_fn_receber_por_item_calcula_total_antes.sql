/* 0027 — `recebimentos.valor_total` tem CHECK > 0, então o total precisa
   estar pronto ANTES de inserir o recebimento. A função valida e soma
   numa primeira passada e só então grava. */

CREATE OR REPLACE FUNCTION public.fn_receber_por_item(
    p_revendedor_id      UUID,
    p_data               DATE,
    p_itens              JSONB,     -- [{venda_item_id|remessa_item_evento_id, quantidade}]
    p_forma_pagamento_id UUID DEFAULT NULL,
    p_observacoes        TEXT DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_r UUID; e JSONB; v_it RECORD; v_qtd NUMERIC(14,3); v_val NUMERIC(14,2);
  v_total NUMERIC(14,2) := 0; v_dt DATE := COALESCE(p_data, CURRENT_DATE);
  v_t RECORD; v_resta NUMERIC(14,2); v_aplicar NUMERIC(14,2);
  v_origens UUID[] := '{}'; v_org UUID;
  v_linhas JSONB := '[]'::JSONB;
BEGIN
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um produto e a quantidade recebida.'; END IF;

  /* ── 1ª passada: valida e soma, sem gravar nada ── */
  FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := COALESCE((e->>'quantidade')::NUMERIC, 0);
    CONTINUE WHEN v_qtd <= 0;

    SELECT * INTO v_it FROM public.vw_itens_a_pagar_revendedor
     WHERE venda_item_id IS NOT DISTINCT FROM NULLIF(e->>'venda_item_id','')::UUID
       AND remessa_item_evento_id IS NOT DISTINCT FROM NULLIF(e->>'remessa_item_evento_id','')::UUID;

    IF v_it IS NULL THEN
      RAISE EXCEPTION 'Item não encontrado ou já totalmente pago.'; END IF;
    IF v_it.revendedor_id <> p_revendedor_id THEN
      RAISE EXCEPTION 'Este item pertence a outro revendedor.'; END IF;
    IF v_qtd > v_it.qtd_em_aberto THEN
      RAISE EXCEPTION 'Do produto % restam % unidade(s) a pagar, mas foram informadas %.',
        v_it.produto_nome, trim(to_char(v_it.qtd_em_aberto,'FM999990D999')),
        trim(to_char(v_qtd,'FM999990D999')); END IF;

    v_val   := round(v_qtd * v_it.valor_unitario, 2);
    v_total := v_total + v_val;

    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'venda_item_id', v_it.venda_item_id,
      'remessa_item_evento_id', v_it.remessa_item_evento_id,
      'produto_id', v_it.produto_id,
      'quantidade', v_qtd,
      'valor_unitario', v_it.valor_unitario,
      'valor_total', v_val));

    IF NOT (v_it.origem_id = ANY (v_origens)) THEN
      v_origens := array_append(v_origens, v_it.origem_id); END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'A soma das peças informadas deu zero. Confira as quantidades.'; END IF;

  /* ── 2ª passada: grava ── */
  INSERT INTO public.recebimentos (tipo_devedor, cliente_id, revendedor_id, data_recebimento,
      valor_total, forma_pagamento_id, observacoes, created_by)
  VALUES ('REVENDEDOR', NULL, p_revendedor_id, v_dt, v_total, p_forma_pagamento_id,
      p_observacoes, public.fn_usuario_atual())
  RETURNING id INTO v_r;

  FOR e IN SELECT * FROM jsonb_array_elements(v_linhas) LOOP
    INSERT INTO public.recebimento_itens (recebimento_id, venda_item_id, remessa_item_evento_id,
        produto_id, quantidade, valor_unitario, valor_total, created_by)
    VALUES (v_r,
        NULLIF(e->>'venda_item_id','')::UUID,
        NULLIF(e->>'remessa_item_evento_id','')::UUID,
        (e->>'produto_id')::UUID,
        (e->>'quantidade')::NUMERIC,
        (e->>'valor_unitario')::NUMERIC,
        (e->>'valor_total')::NUMERIC,
        public.fn_usuario_atual());
  END LOOP;

  /* ── abate as parcelas do documento de origem, mais antiga primeiro ── */
  v_resta := v_total;
  FOREACH v_org IN ARRAY v_origens LOOP
    FOR v_t IN
      SELECT * FROM public.titulos_receber
       WHERE (venda_id = v_org OR prestacao_id = v_org)
         AND situacao = 'ABERTO' AND saldo > 0
       ORDER BY data_vencimento, numero_parcela
       FOR UPDATE
    LOOP
      EXIT WHEN v_resta <= 0;
      v_aplicar := LEAST(v_resta, v_t.saldo);
      INSERT INTO public.recebimento_alocacoes (recebimento_id, titulo_id, valor, created_by)
      VALUES (v_r, v_t.id, v_aplicar, public.fn_usuario_atual());
      v_resta := v_resta - v_aplicar;
    END LOOP;
  END LOOP;

  IF v_resta > 0.009 THEN
    RAISE EXCEPTION 'As peças somam R$ %, mas só há R$ % em parcelas abertas deste documento. Confira se o acerto já não foi lançado.',
      to_char(v_total,'FM999G999G990D00'), to_char(v_total - v_resta,'FM999G999G990D00');
  END IF;

  RETURN v_r;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_receber_por_item(uuid, date, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_receber_por_item(uuid, date, jsonb, uuid, text) TO authenticated;
