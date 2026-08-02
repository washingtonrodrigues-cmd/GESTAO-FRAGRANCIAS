-- ═══ COMPRAS ═══
CREATE OR REPLACE FUNCTION public.fn_confirmar_compra(p_compra_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c RECORD; v_tx UUID := gen_random_uuid(); v_i RECORD; v_n INT;
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF v_c.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'Somente compras em rascunho podem ser confirmadas.'; END IF;
  SELECT COUNT(*) INTO v_n FROM public.compra_itens WHERE compra_id=p_compra_id;
  IF v_n = 0 THEN RAISE EXCEPTION 'Adicione ao menos um produto à compra.'; END IF;

  PERFORM public.fn_ratear_custos_compra(p_compra_id);

  FOR v_i IN SELECT produto_id, quantidade, custo_unitario_final
               FROM public.compra_itens WHERE compra_id=p_compra_id LOOP
    PERFORM public.fn_atualizar_custo_medio(v_i.produto_id, v_i.quantidade, v_i.custo_unitario_final);
    PERFORM public.fn_lancar_movimento(v_i.produto_id,'DISPONIVEL','ENTRADA_COMPRA',
      v_i.quantidade, v_i.custo_unitario_final,'compras',p_compra_id,v_tx,NULL,v_c.data_compra);
  END LOOP;

  UPDATE public.compras SET status='CONFIRMADO', data_confirmacao=now(),
    updated_by=public.fn_usuario_atual() WHERE id=p_compra_id;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_cancelar_compra(p_compra_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c RECORD; v_tx UUID := gen_random_uuid(); v_m RECORD; v_disp NUMERIC; v_nome TEXT;
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF v_c.status <> 'CONFIRMADO' THEN RAISE EXCEPTION 'Só é possível cancelar uma compra confirmada.'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;

  FOR v_m IN SELECT m.*, p.nome, p.qtd_disponivel FROM public.movimentacoes_estoque m
               JOIN public.produtos p ON p.id=m.produto_id
              WHERE m.origem_tabela='compras' AND m.origem_id=p_compra_id
                AND NOT EXISTS (SELECT 1 FROM public.movimentacoes_estoque e WHERE e.estorno_de_id=m.id) LOOP
    IF v_m.qtd_disponivel < v_m.quantidade THEN
      RAISE EXCEPTION 'Não é possível cancelar: das % unidades de "%", só % continuam disponíveis. O restante já saiu do estoque.',
        v_m.quantidade, v_m.nome, v_m.qtd_disponivel;
    END IF;
    PERFORM public.fn_lancar_movimento(v_m.produto_id, v_m.bucket, 'ESTORNO',
      -v_m.quantidade, v_m.custo_unitario, 'compras', p_compra_id, v_tx,
      'Cancelamento da compra nº ' || v_c.numero, CURRENT_DATE, v_m.id);
  END LOOP;

  FOR v_m IN SELECT DISTINCT produto_id FROM public.compra_itens WHERE compra_id=p_compra_id LOOP
    PERFORM public.fn_recalcular_custo_medio(v_m.produto_id);
  END LOOP;

  UPDATE public.compras SET status='CANCELADO', data_cancelamento=now(),
    motivo_cancelamento=p_motivo, updated_by=public.fn_usuario_atual() WHERE id=p_compra_id;
END; $$;

-- ═══ VENDAS ═══
CREATE OR REPLACE FUNCTION public.fn_confirmar_venda(p_venda_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_v RECORD; v_tx UUID := gen_random_uuid(); v_i RECORD;
        v_custo NUMERIC(14,2) := 0; v_avista BOOLEAN; v_dev tipo_devedor_enum;
        v_rec UUID; v_n INT;
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

  PERFORM public.fn_gerar_parcelas('VENDA', p_venda_id, NULL, v_dev,
    v_v.cliente_id, v_v.revendedor_id, v_v.valor_total, v_v.qtd_parcelas,
    v_v.data_venda, 30, v_avista, v_v.valor_total - v_custo);

  IF v_avista AND v_v.valor_total > 0 THEN
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
END; $$;

CREATE OR REPLACE FUNCTION public.fn_cancelar_venda(p_venda_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_v RECORD; v_tx UUID := gen_random_uuid(); v_m RECORD; v_pago NUMERIC(14,2);
BEGIN
  SELECT * INTO v_v FROM public.vendas WHERE id=p_venda_id FOR UPDATE;
  IF v_v.status <> 'CONFIRMADO' THEN RAISE EXCEPTION 'Só é possível cancelar uma venda confirmada.'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;

  SELECT COALESCE(SUM(valor_recebido),0) INTO v_pago FROM public.titulos_receber
   WHERE venda_id=p_venda_id AND situacao <> 'CANCELADO';
  IF v_pago > 0 THEN
    RAISE EXCEPTION 'Esta venda já teve R$ % recebidos. Estorne o recebimento antes de cancelar a venda.',
      to_char(v_pago,'FM999G999G990D00'); END IF;

  FOR v_m IN SELECT m.* FROM public.movimentacoes_estoque m
              WHERE m.origem_tabela='vendas' AND m.origem_id=p_venda_id
                AND NOT EXISTS (SELECT 1 FROM public.movimentacoes_estoque e WHERE e.estorno_de_id=m.id) LOOP
    PERFORM public.fn_lancar_movimento(v_m.produto_id, v_m.bucket,'ESTORNO',
      -v_m.quantidade, v_m.custo_unitario,'vendas',p_venda_id,v_tx,
      'Cancelamento da venda nº ' || v_v.numero, CURRENT_DATE, v_m.id);
  END LOOP;

  UPDATE public.titulos_receber SET situacao='CANCELADO', data_quitacao=NULL
   WHERE venda_id=p_venda_id AND situacao <> 'CANCELADO';

  UPDATE public.vendas SET status='CANCELADO', data_cancelamento=now(),
    motivo_cancelamento=p_motivo, updated_by=public.fn_usuario_atual() WHERE id=p_venda_id;
END; $$;

-- ═══ CONSIGNAÇÃO ═══
CREATE OR REPLACE FUNCTION public.fn_confirmar_remessa(p_remessa_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r RECORD; v_tx UUID := gen_random_uuid(); v_i RECORD;
        v_bucket bucket_estoque_enum; v_n INT;
BEGIN
  SELECT * INTO v_r FROM public.remessas WHERE id=p_remessa_id FOR UPDATE;
  IF v_r.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'Somente remessas em rascunho podem ser confirmadas.'; END IF;
  SELECT COUNT(*) INTO v_n FROM public.remessa_itens WHERE remessa_id=p_remessa_id;
  IF v_n = 0 THEN RAISE EXCEPTION 'Adicione ao menos um produto à remessa.'; END IF;

  v_bucket := CASE WHEN v_r.tipo='MOSTRUARIO' THEN 'MOSTRUARIO'::bucket_estoque_enum
                   ELSE 'CONSIGNADO'::bucket_estoque_enum END;

  FOR v_i IN SELECT produto_id, quantidade, valor_custo_unitario
               FROM public.remessa_itens WHERE remessa_id=p_remessa_id LOOP
    -- Transferência entre bolsos: NÃO gera receita nem título (RN-M01)
    PERFORM public.fn_lancar_movimento(v_i.produto_id,'DISPONIVEL','SAIDA_REMESSA',
      -v_i.quantidade, v_i.valor_custo_unitario,'remessas',p_remessa_id,v_tx,NULL,v_r.data_envio);
    PERFORM public.fn_lancar_movimento(v_i.produto_id, v_bucket,'SAIDA_REMESSA',
      v_i.quantidade, v_i.valor_custo_unitario,'remessas',p_remessa_id,v_tx,NULL,v_r.data_envio);
  END LOOP;

  UPDATE public.remessas SET status='CONFIRMADO', updated_by=public.fn_usuario_atual()
   WHERE id=p_remessa_id;
END; $$;

-- p_itens: [{"remessa_item_id":"…","vendida":3,"devolvida":1,"perdida":0,"motivo":"…"}]
CREATE OR REPLACE FUNCTION public.fn_prestar_contas(
  p_revendedor_id UUID, p_data DATE, p_itens JSONB,
  p_cobrar_perdas BOOLEAN DEFAULT true, p_qtd_parcelas SMALLINT DEFAULT 1,
  p_forma_pagamento_id UUID DEFAULT NULL, p_observacoes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p UUID; v_tx UUID := gen_random_uuid(); e JSONB; v_ri RECORD;
  v_vend NUMERIC(14,3); v_devo NUMERIC(14,3); v_perd NUMERIC(14,3);
  v_bucket bucket_estoque_enum;
  t_qv NUMERIC(14,3):=0; t_qd NUMERIC(14,3):=0; t_qp NUMERIC(14,3):=0;
  t_vv NUMERIC(14,2):=0; t_cv NUMERIC(14,2):=0; t_vd NUMERIC(14,2):=0; t_vp NUMERIC(14,2):=0;
  v_devido NUMERIC(14,2);
BEGIN
  INSERT INTO public.prestacoes_contas (revendedor_id, data_acerto, cobrar_perdas,
      qtd_parcelas, forma_pagamento_id, observacoes, created_by)
  VALUES (p_revendedor_id, COALESCE(p_data,CURRENT_DATE), p_cobrar_perdas,
      COALESCE(p_qtd_parcelas,1), p_forma_pagamento_id, p_observacoes, public.fn_usuario_atual())
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

    IF v_ri.rev <> p_revendedor_id THEN
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
        round(v_vend*v_ri.valor_revenda_unitario,2), v_ri.valor_custo_unitario,
        COALESCE(p_data,CURRENT_DATE), public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'BAIXA_VENDA_CONSIGNADA',
        -v_vend, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,COALESCE(p_data,CURRENT_DATE));
      UPDATE public.produtos SET data_ultima_saida=COALESCE(p_data,CURRENT_DATE) WHERE id=v_ri.produto_id;
      t_qv := t_qv + v_vend;
      t_vv := t_vv + round(v_vend*v_ri.valor_revenda_unitario,2);
      t_cv := t_cv + round(v_vend*v_ri.valor_custo_unitario,2);
    END IF;

    IF v_devo > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, created_by)
      VALUES (v_ri.id, v_p, 'DEVOLVIDO', v_devo, v_ri.valor_revenda_unitario,
        round(v_devo*v_ri.valor_revenda_unitario,2), v_ri.valor_custo_unitario,
        COALESCE(p_data,CURRENT_DATE), public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'RETORNO_DEVOLUCAO',
        -v_devo, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,COALESCE(p_data,CURRENT_DATE));
      PERFORM public.fn_lancar_movimento(v_ri.produto_id,'DISPONIVEL','RETORNO_DEVOLUCAO',
        v_devo, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,COALESCE(p_data,CURRENT_DATE));
      t_qd := t_qd + v_devo;
      t_vd := t_vd + round(v_devo*v_ri.valor_custo_unitario,2);
    END IF;

    IF v_perd > 0 THEN
      INSERT INTO public.remessa_item_eventos (remessa_item_id, prestacao_id, status_novo,
        quantidade, valor_unitario, valor_total, custo_unitario, data_evento, motivo, created_by)
      VALUES (v_ri.id, v_p, 'PERDIDO', v_perd, v_ri.valor_revenda_unitario,
        round(v_perd*v_ri.valor_revenda_unitario,2), v_ri.valor_custo_unitario,
        COALESCE(p_data,CURRENT_DATE), COALESCE(e->>'motivo','Perda informada na prestação de contas'),
        public.fn_usuario_atual());
      PERFORM public.fn_lancar_movimento(v_ri.produto_id, v_bucket,'BAIXA_PERDA',
        -v_perd, v_ri.valor_custo_unitario,'prestacoes_contas',v_p,v_tx,NULL,COALESCE(p_data,CURRENT_DATE));
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

  -- Perda absorvida pela empresa vira despesa
  IF NOT p_cobrar_perdas AND t_vp > 0 THEN
    INSERT INTO public.despesas (categoria, natureza, descricao, valor, data_despesa,
      origem_tabela, origem_id, created_by)
    VALUES ('PERDA_ESTOQUE','VARIAVEL',
      'Perda de produtos em consignação — prestação de contas', t_vp,
      COALESCE(p_data,CURRENT_DATE),'prestacoes_contas',v_p, public.fn_usuario_atual());
  END IF;

  IF v_devido > 0 THEN
    PERFORM public.fn_gerar_parcelas('PRESTACAO_CONTAS', NULL, v_p,'REVENDEDOR',
      NULL, p_revendedor_id, v_devido, COALESCE(p_qtd_parcelas,1),
      COALESCE(p_data,CURRENT_DATE), 30, COALESCE(p_qtd_parcelas,1)=1, t_vv - t_cv);
  END IF;

  -- Encerra remessas que ficaram sem itens em posse (RN-M07)
  UPDATE public.remessas SET encerrada=true, data_encerramento=COALESCE(p_data,CURRENT_DATE)
   WHERE revendedor_id=p_revendedor_id AND status='CONFIRMADO'
     AND NOT encerrada AND qtd_em_posse=0;

  RETURN v_p;
END; $$;

-- ═══ FINANCEIRO ═══
-- p_alocacoes: [{"titulo_id":"…","valor":299.00}]
CREATE OR REPLACE FUNCTION public.fn_registrar_recebimento(
  p_tipo_devedor tipo_devedor_enum, p_cliente_id UUID, p_revendedor_id UUID,
  p_data DATE, p_valor NUMERIC, p_forma_pagamento_id UUID,
  p_alocacoes JSONB, p_observacoes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r UUID; a JSONB; v_soma NUMERIC(14,2) := 0; v_t RECORD; v_val NUMERIC(14,2);
BEGIN
  IF p_valor <= 0 THEN RAISE EXCEPTION 'O valor recebido precisa ser maior que zero.'; END IF;

  SELECT COALESCE(SUM((x->>'valor')::NUMERIC),0) INTO v_soma
    FROM jsonb_array_elements(p_alocacoes) x;
  IF v_soma > p_valor THEN
    RAISE EXCEPTION 'A alocação (R$ %) é maior que o valor recebido (R$ %).',
      to_char(v_soma,'FM999G999G990D00'), to_char(p_valor,'FM999G999G990D00'); END IF;

  INSERT INTO public.recebimentos (tipo_devedor, cliente_id, revendedor_id, data_recebimento,
      valor_total, forma_pagamento_id, observacoes, created_by)
  VALUES (p_tipo_devedor, p_cliente_id, p_revendedor_id, COALESCE(p_data,CURRENT_DATE),
      p_valor, p_forma_pagamento_id, p_observacoes, public.fn_usuario_atual())
  RETURNING id INTO v_r;

  FOR a IN SELECT * FROM jsonb_array_elements(p_alocacoes) LOOP
    v_val := (a->>'valor')::NUMERIC;
    CONTINUE WHEN COALESCE(v_val,0) <= 0;
    SELECT * INTO v_t FROM public.titulos_receber WHERE id=(a->>'titulo_id')::UUID FOR UPDATE;
    IF v_t.situacao='CANCELADO' THEN RAISE EXCEPTION 'Não é possível receber um título cancelado.'; END IF;
    IF v_val > v_t.saldo THEN
      RAISE EXCEPTION 'A parcela % tem saldo de R$ % e foi informado R$ %.',
        v_t.numero_parcela, to_char(v_t.saldo,'FM999G999G990D00'), to_char(v_val,'FM999G999G990D00'); END IF;
    INSERT INTO public.recebimento_alocacoes (recebimento_id, titulo_id, valor, created_by)
    VALUES (v_r, v_t.id, v_val, public.fn_usuario_atual());
  END LOOP;

  RETURN v_r;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_estornar_recebimento(p_recebimento_id UUID, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r RECORD; a RECORD;
BEGIN
  SELECT * INTO v_r FROM public.recebimentos WHERE id=p_recebimento_id FOR UPDATE;
  IF v_r.estornado THEN RAISE EXCEPTION 'Este recebimento já foi estornado.'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;

  FOR a IN SELECT id FROM public.recebimento_alocacoes
            WHERE recebimento_id=p_recebimento_id AND NOT estornada LOOP
    UPDATE public.recebimento_alocacoes SET estornada=true WHERE id=a.id;
  END LOOP;

  UPDATE public.recebimentos SET estornado=true, data_estorno=now(), motivo_estorno=p_motivo
   WHERE id=p_recebimento_id;
END; $$;

-- ═══ ESTOQUE ═══
CREATE OR REPLACE FUNCTION public.fn_ajustar_estoque(
  p_produto_id UUID, p_quantidade NUMERIC, p_motivo TEXT, p_data DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_custo NUMERIC(14,4); v_id UUID; v_tipo tipo_movimento_enum;
BEGIN
  IF p_quantidade = 0 THEN RAISE EXCEPTION 'A quantidade do ajuste não pode ser zero.'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Todo ajuste de estoque exige um motivo com pelo menos 5 caracteres.'; END IF;

  SELECT custo_medio INTO v_custo FROM public.produtos WHERE id=p_produto_id;
  v_tipo := CASE WHEN p_quantidade > 0 THEN 'AJUSTE_POSITIVO'::tipo_movimento_enum
                 ELSE 'AJUSTE_NEGATIVO'::tipo_movimento_enum END;

  v_id := public.fn_lancar_movimento(p_produto_id,'DISPONIVEL',v_tipo,
    p_quantidade, COALESCE(v_custo,0),'ajustes',NULL,NULL,p_motivo,COALESCE(p_data,CURRENT_DATE));

  IF p_quantidade < 0 AND COALESCE(v_custo,0) > 0 THEN
    INSERT INTO public.despesas (categoria, natureza, descricao, valor, data_despesa,
      produto_id, origem_tabela, origem_id, created_by)
    VALUES ('PERDA_ESTOQUE','VARIAVEL','Ajuste de estoque: ' || p_motivo,
      round(abs(p_quantidade)*v_custo,2), COALESCE(p_data,CURRENT_DATE),
      p_produto_id,'ajustes',v_id, public.fn_usuario_atual());
  END IF;
  RETURN v_id;
END; $$;
