-- 0035 — Compra e venda editáveis depois de salvas.
--
-- A forma segura de alterar um documento confirmado é desfazer o que ele
-- produziu, voltar para rascunho, regravar e confirmar de novo pelo caminho
-- normal. Assim estoque, custo médio, títulos e quitação automática passam
-- pelas mesmas funções já testadas — nada é recalculado "na mão".
--
-- RN-V14  Venda com recebimento só pode ser alterada estornando o recebimento
--         antes. O estorno é explícito: quem chama precisa pedir.
-- RN-V15  Venda com devolução registrada não pode ser alterada — apagaria o
--         histórico da devolução e o crédito gerado por ela.
-- RN-V16  Alterar uma venda recalcula o CMV pelo custo médio do momento da
--         alteração: a mercadoria voltou ao estoque e saiu de novo.
-- RN-C07  Alterar uma compra confirmada refaz o rateio inteiro, então o custo
--         unitário de todos os itens da nota muda. Recusado se alguma unidade
--         daquela compra já saiu do estoque.

-- Parcela CANCELADA não é parcela: existe só para o histórico e para as
-- alocações de recebimento estornadas continuarem apontando para algum lugar.
-- Sem isto, alterar uma venda não conseguiria gerar a parcela 1 de novo.
DROP INDEX IF EXISTS public.uq_titulo_venda_parcela;
DROP INDEX IF EXISTS public.uq_titulo_prestacao_parcela;
CREATE UNIQUE INDEX uq_titulo_venda_parcela ON public.titulos_receber
  USING btree (venda_id, numero_parcela)
  WHERE (venda_id IS NOT NULL AND situacao <> 'CANCELADO'::situacao_titulo_enum);
CREATE UNIQUE INDEX uq_titulo_prestacao_parcela ON public.titulos_receber
  USING btree (prestacao_id, numero_parcela)
  WHERE (prestacao_id IS NOT NULL AND situacao <> 'CANCELADO'::situacao_titulo_enum);

DROP FUNCTION IF EXISTS public.fn_editar_itens_compra(uuid, jsonb, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.fn_editar_compra(
  p_compra_id uuid, p_dados jsonb, p_itens jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c RECORD; v_tx UUID := gen_random_uuid(); v_m RECORD; e JSONB; v_prods UUID[];
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada.'; END IF;
  IF v_c.status = 'CANCELADO' THEN RAISE EXCEPTION 'Compra cancelada não pode ser alterada.'; END IF;
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A compra precisa ter ao menos um produto.'; END IF;

  PERFORM set_config('app.editando_compra','on', true);

  SELECT array_agg(DISTINCT produto_id) INTO v_prods
    FROM public.compra_itens WHERE compra_id = p_compra_id;

  -- Só as ENTRADAS: estornar uma linha de ESTORNO devolveria estoque.
  IF v_c.status = 'CONFIRMADO' THEN
    FOR v_m IN SELECT m.*, p.nome, p.qtd_disponivel FROM public.movimentacoes_estoque m
                 JOIN public.produtos p ON p.id=m.produto_id
                WHERE m.origem_tabela='compras' AND m.origem_id=p_compra_id
                  AND m.tipo = 'ENTRADA_COMPRA'::tipo_movimento_enum
                  AND NOT EXISTS (SELECT 1 FROM public.movimentacoes_estoque x WHERE x.estorno_de_id=m.id)
                ORDER BY m.created_at LOOP
      IF v_m.qtd_disponivel < v_m.quantidade THEN
        RAISE EXCEPTION 'Não dá para alterar esta compra: das % unidades de "%", só % continuam no estoque. O restante já saiu.',
          v_m.quantidade, v_m.nome, v_m.qtd_disponivel;
      END IF;
      PERFORM public.fn_lancar_movimento(v_m.produto_id, v_m.bucket, 'ESTORNO',
        -v_m.quantidade, v_m.custo_unitario, 'compras', p_compra_id, v_tx,
        'Alteração da compra nº ' || v_c.numero, CURRENT_DATE, v_m.id);
    END LOOP;
  END IF;

  UPDATE public.compras SET
    status            = 'RASCUNHO',
    data_confirmacao  = NULL,
    fornecedor_id     = COALESCE((p_dados->>'fornecedor_id')::UUID, fornecedor_id),
    data_compra       = COALESCE((p_dados->>'data_compra')::DATE, data_compra),
    numero_documento  = CASE WHEN p_dados ? 'numero_documento'
                             THEN NULLIF(btrim(p_dados->>'numero_documento'),'') ELSE numero_documento END,
    criterio_rateio   = COALESCE((p_dados->>'criterio_rateio')::criterio_rateio_enum, criterio_rateio),
    valor_frete       = COALESCE((p_dados->>'valor_frete')::NUMERIC, valor_frete),
    valor_taxa_cartao = COALESCE((p_dados->>'valor_taxa_cartao')::NUMERIC, valor_taxa_cartao),
    outros_custos     = COALESCE((p_dados->>'outros_custos')::NUMERIC, outros_custos),
    observacoes       = CASE WHEN p_dados ? 'observacoes'
                             THEN NULLIF(btrim(p_dados->>'observacoes'),'') ELSE observacoes END,
    data_pagamento    = CASE WHEN p_dados ? 'data_pagamento'
                             THEN (p_dados->>'data_pagamento')::DATE ELSE data_pagamento END,
    pago              = COALESCE((p_dados->>'pago')::BOOLEAN, pago),
    forma_pagamento_id= CASE WHEN p_dados ? 'forma_pagamento_id'
                             THEN (p_dados->>'forma_pagamento_id')::UUID ELSE forma_pagamento_id END,
    updated_by        = public.fn_usuario_atual()
  WHERE id = p_compra_id;

  DELETE FROM public.compra_itens WHERE compra_id = p_compra_id;
  FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    IF COALESCE((e->>'quantidade')::NUMERIC,0) <= 0 THEN
      RAISE EXCEPTION 'Informe uma quantidade maior que zero para todos os produtos.'; END IF;
    IF COALESCE((e->>'valor_unitario')::NUMERIC,-1) < 0 THEN
      RAISE EXCEPTION 'Informe o valor de compra de todos os produtos.'; END IF;
    INSERT INTO public.compra_itens (compra_id, produto_id, quantidade, valor_unitario, subtotal, observacoes)
    VALUES (p_compra_id, (e->>'produto_id')::UUID,
      (e->>'quantidade')::NUMERIC, (e->>'valor_unitario')::NUMERIC,
      round((e->>'quantidade')::NUMERIC * (e->>'valor_unitario')::NUMERIC, 2),
      NULLIF(btrim(e->>'observacoes'),''));
  END LOOP;

  UPDATE public.compras SET subtotal_produtos =
    COALESCE((SELECT SUM(subtotal) FROM public.compra_itens WHERE compra_id = p_compra_id), 0)
   WHERE id = p_compra_id;

  PERFORM public.fn_confirmar_compra(p_compra_id);

  FOR v_m IN SELECT DISTINCT unnest(COALESCE(v_prods, ARRAY[]::UUID[])) AS produto_id
             UNION SELECT DISTINCT produto_id FROM public.compra_itens WHERE compra_id=p_compra_id LOOP
    PERFORM public.fn_recalcular_custo_medio(v_m.produto_id);
  END LOOP;

  PERFORM set_config('app.editando_compra','off', true);
END; $function$;

-- chk_vendas_total exige valor_total = subtotal − desconto. Mexer no desconto
-- antes de trocar os itens quebra a conta no meio do caminho. Por isso o
-- desconto entra DEPOIS dos itens, junto com o total, numa instrução só.
CREATE OR REPLACE FUNCTION public.fn_editar_venda(
  p_venda_id uuid, p_dados jsonb, p_itens jsonb,
  p_estornar_recebimentos boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_v RECORD; v_tx UUID := gen_random_uuid(); v_m RECORD; e JSONB;
        v_recebido NUMERIC(14,2); v_r RECORD; v_sub NUMERIC(14,2); v_desc NUMERIC(14,2);
BEGIN
  SELECT * INTO v_v FROM public.vendas WHERE id=p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
  IF v_v.status = 'CANCELADO' THEN RAISE EXCEPTION 'Venda cancelada não pode ser alterada.'; END IF;
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa ter ao menos um produto.'; END IF;

  IF EXISTS (SELECT 1 FROM public.venda_devolucoes WHERE venda_id=p_venda_id) THEN
    RAISE EXCEPTION 'Esta venda tem devolução registrada e não pode ser alterada. Cancele a venda e lance de novo.';
  END IF;

  SELECT COALESCE(SUM(valor_recebido),0) INTO v_recebido FROM public.titulos_receber
   WHERE venda_id=p_venda_id AND situacao <> 'CANCELADO';

  IF v_recebido > 0 AND NOT p_estornar_recebimentos THEN
    RAISE EXCEPTION 'Esta venda já teve R$ % recebidos. Confirme o estorno do recebimento para poder alterar.',
      to_char(v_recebido,'FM999G999G990D00');
  END IF;

  IF v_recebido > 0 THEN
    FOR v_r IN SELECT DISTINCT r.id FROM public.recebimentos r
                 JOIN public.recebimento_alocacoes a ON a.recebimento_id = r.id
                 JOIN public.titulos_receber t ON t.id = a.titulo_id
                WHERE t.venda_id = p_venda_id AND NOT r.estornado AND NOT a.estornada LOOP
      PERFORM public.fn_estornar_recebimento(v_r.id,
        'Estorno para alteração da venda nº ' || v_v.numero);
    END LOOP;
  END IF;

  IF v_v.status = 'CONFIRMADO' THEN
    FOR v_m IN SELECT m.* FROM public.movimentacoes_estoque m
                WHERE m.origem_tabela='vendas' AND m.origem_id=p_venda_id
                  AND m.tipo <> 'ESTORNO'::tipo_movimento_enum
                  AND NOT EXISTS (SELECT 1 FROM public.movimentacoes_estoque x WHERE x.estorno_de_id=m.id) LOOP
      PERFORM public.fn_lancar_movimento(v_m.produto_id, v_m.bucket, 'ESTORNO',
        -v_m.quantidade, v_m.custo_unitario, 'vendas', p_venda_id, v_tx,
        'Alteração da venda nº ' || v_v.numero, CURRENT_DATE, v_m.id);
    END LOOP;
  END IF;

  UPDATE public.titulos_receber
     SET situacao='CANCELADO', data_quitacao=NULL,
         observacoes = concat_ws(' | ', observacoes, 'Cancelado na alteração da venda')
   WHERE venda_id=p_venda_id AND situacao <> 'CANCELADO';

  UPDATE public.vendas SET
    status                  = 'RASCUNHO',
    data_confirmacao        = NULL,
    cliente_id              = CASE WHEN p_dados ? 'cliente_id' THEN (p_dados->>'cliente_id')::UUID ELSE cliente_id END,
    revendedor_id           = CASE WHEN p_dados ? 'revendedor_id' THEN (p_dados->>'revendedor_id')::UUID ELSE revendedor_id END,
    data_venda              = COALESCE((p_dados->>'data_venda')::DATE, data_venda),
    forma_pagamento_id      = COALESCE((p_dados->>'forma_pagamento_id')::UUID, forma_pagamento_id),
    qtd_parcelas            = COALESCE((p_dados->>'qtd_parcelas')::SMALLINT, qtd_parcelas),
    primeiro_vencimento     = CASE WHEN p_dados ? 'primeiro_vencimento'
                                   THEN (p_dados->>'primeiro_vencimento')::DATE ELSE primeiro_vencimento END,
    intervalo_parcelas_dias = CASE WHEN p_dados ? 'intervalo_parcelas_dias'
                                   THEN (p_dados->>'intervalo_parcelas_dias')::INT ELSE intervalo_parcelas_dias END,
    observacoes             = CASE WHEN p_dados ? 'observacoes'
                                   THEN NULLIF(btrim(p_dados->>'observacoes'),'') ELSE observacoes END,
    valor_devolvido = 0, custo_devolvido = 0,
    updated_by = public.fn_usuario_atual()
  WHERE id = p_venda_id;

  DELETE FROM public.venda_itens WHERE venda_id = p_venda_id;
  FOR e IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    IF COALESCE((e->>'quantidade')::NUMERIC,0) <= 0 THEN
      RAISE EXCEPTION 'Informe uma quantidade maior que zero para todos os produtos.'; END IF;
    IF COALESCE((e->>'preco_unitario')::NUMERIC,-1) < 0 THEN
      RAISE EXCEPTION 'Informe o preço de todos os produtos.'; END IF;
    INSERT INTO public.venda_itens (venda_id, produto_id, quantidade, preco_unitario,
      desconto_item, subtotal)
    VALUES (p_venda_id, (e->>'produto_id')::UUID,
      (e->>'quantidade')::NUMERIC, (e->>'preco_unitario')::NUMERIC,
      COALESCE((e->>'desconto_item')::NUMERIC,0),
      round((e->>'quantidade')::NUMERIC * (e->>'preco_unitario')::NUMERIC
            - COALESCE((e->>'desconto_item')::NUMERIC,0), 2));
  END LOOP;

  SELECT subtotal INTO v_sub FROM public.vendas WHERE id = p_venda_id;
  v_desc := CASE
    WHEN p_dados ? 'desconto_valor' THEN COALESCE((p_dados->>'desconto_valor')::NUMERIC,0)
    WHEN p_dados ? 'desconto_percentual' THEN round(v_sub * COALESCE((p_dados->>'desconto_percentual')::NUMERIC,0) / 100, 2)
    ELSE v_v.desconto_valor END;
  v_desc := LEAST(GREATEST(v_desc, 0), v_sub);

  UPDATE public.vendas
     SET desconto_valor = v_desc,
         desconto_percentual = CASE WHEN v_sub > 0 THEN round(v_desc / v_sub * 100, 4) ELSE 0 END,
         valor_total = v_sub - v_desc
   WHERE id = p_venda_id;

  PERFORM public.fn_confirmar_venda(p_venda_id);
END; $function$;

REVOKE ALL ON FUNCTION public.fn_editar_compra(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_editar_venda(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_editar_compra(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_editar_venda(uuid, jsonb, jsonb, boolean) TO authenticated;
