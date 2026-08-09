-- 0033 — Funções da devolução, do crédito e da edição de compra.

-- Reduz UM título em aberto. Não é recebimento: nada entra no caixa.
CREATE OR REPLACE FUNCTION public.fn_abater_titulo(
  p_titulo_id uuid, p_valor numeric, p_data date, p_nota text)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t RECORD; v_ab NUMERIC(14,2); v_novo NUMERIC(14,2); v_lucro NUMERIC(14,2);
BEGIN
  SELECT * INTO v_t FROM public.titulos_receber WHERE id=p_titulo_id FOR UPDATE;
  IF NOT FOUND OR v_t.situacao <> 'ABERTO' THEN RETURN 0; END IF;

  v_ab := LEAST(round(COALESCE(p_valor,0),2), v_t.valor_original - v_t.valor_recebido);
  IF v_ab <= 0 THEN RETURN 0; END IF;

  v_novo  := round(v_t.valor_original - v_ab, 2);
  v_lucro := CASE WHEN v_t.valor_original > 0
                  THEN round(v_t.lucro_proporcional * (v_novo / v_t.valor_original), 2)
                  ELSE 0 END;

  IF v_novo <= 0 THEN
    -- valor_original tem CHECK (> 0): parcela zerada se cancela, não vira zero.
    UPDATE public.titulos_receber
       SET situacao='CANCELADO', data_quitacao=NULL, lucro_proporcional=0,
           observacoes = concat_ws(' | ', observacoes, p_nota), updated_by=public.fn_usuario_atual()
     WHERE id=p_titulo_id;
  ELSE
    UPDATE public.titulos_receber
       SET valor_original = v_novo, lucro_proporcional = v_lucro,
           situacao = CASE WHEN v_t.valor_recebido >= v_novo THEN 'PAGO'::situacao_titulo_enum
                           ELSE 'ABERTO'::situacao_titulo_enum END,
           data_quitacao = CASE WHEN v_t.valor_recebido >= v_novo
                                THEN COALESCE(data_quitacao, COALESCE(p_data, CURRENT_DATE))
                                ELSE NULL END,
           observacoes = concat_ws(' | ', observacoes, p_nota), updated_by=public.fn_usuario_atual()
     WHERE id=p_titulo_id;
  END IF;
  RETURN v_ab;
END; $function$;

-- Abate as parcelas em aberto de uma venda, da mais antiga para a mais nova.
CREATE OR REPLACE FUNCTION public.fn_abater_titulos_venda(
  p_venda_id uuid, p_valor numeric, p_data date, p_nota text)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t RECORD; v_falta NUMERIC(14,2) := round(COALESCE(p_valor,0),2); v_ab NUMERIC(14,2);
        v_total NUMERIC(14,2) := 0;
BEGIN
  IF v_falta <= 0 THEN RETURN 0; END IF;
  FOR v_t IN SELECT id FROM public.titulos_receber
              WHERE venda_id = p_venda_id AND situacao='ABERTO'
              ORDER BY data_vencimento, numero_parcela LOOP
    EXIT WHEN v_falta <= 0;
    v_ab := public.fn_abater_titulo(v_t.id, v_falta, p_data, p_nota);
    v_total := round(v_total + v_ab, 2);
    v_falta := round(v_falta - v_ab, 2);
  END LOOP;
  RETURN v_total;
END; $function$;

REVOKE ALL ON FUNCTION public.fn_abater_titulo(uuid, numeric, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abater_titulos_venda(uuid, numeric, date, text) FROM PUBLIC, anon, authenticated;

-- Devolução de um item vendido (RN-V10 a RN-V13).
CREATE OR REPLACE FUNCTION public.fn_devolver_item_venda(
  p_venda_item_id uuid, p_quantidade numeric DEFAULT NULL,
  p_data date DEFAULT NULL, p_motivo text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_vi RECORD; v_v RECORD; v_q NUMERIC(14,3); v_dt DATE := COALESCE(p_data, CURRENT_DATE);
  v_disp NUMERIC(14,3); v_fator NUMERIC(18,10); v_vu NUMERIC(14,2); v_val NUMERIC(14,2);
  v_cu NUMERIC(14,2); v_custo NUMERIC(14,2); v_abatido NUMERIC(14,2); v_credito NUMERIC(14,2);
  v_nota TEXT; v_id UUID; v_cred UUID;
BEGIN
  SELECT * INTO v_vi FROM public.venda_itens WHERE id = p_venda_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da venda não encontrado.'; END IF;

  SELECT * INTO v_v FROM public.vendas WHERE id = v_vi.venda_id FOR UPDATE;
  IF v_v.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'Só é possível devolver item de venda confirmada.'; END IF;
  IF v_dt < v_v.data_venda THEN
    RAISE EXCEPTION 'A data da devolução (%) não pode ser anterior à venda (%).',
      to_char(v_dt,'DD/MM/YYYY'), to_char(v_v.data_venda,'DD/MM/YYYY'); END IF;

  v_disp := v_vi.quantidade - v_vi.qtd_devolvida;
  v_q := COALESCE(p_quantidade, v_disp);
  IF v_q <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.'; END IF;
  IF v_q > v_disp THEN
    RAISE EXCEPTION 'Restam % unidade(s) desta venda para devolver, e foram informadas %.',
      v_disp, v_q; END IF;

  -- Valor efetivamente cobrado por unidade: subtotal do item já é líquido do
  -- desconto do item; o desconto do cabeçalho entra rateado pelo mesmo fator.
  v_fator := CASE WHEN v_v.subtotal > 0 THEN v_v.valor_total / v_v.subtotal ELSE 1 END;
  v_vu    := round((v_vi.subtotal / v_vi.quantidade) * v_fator, 2);
  v_val   := round(v_q * v_vu, 2);
  v_cu    := v_vi.custo_unitario_praticado;
  v_custo := round(v_q * v_cu, 2);
  v_nota  := 'Devolução de ' || rtrim(rtrim(to_char(v_q,'FM999999990.000'),'0'),'.')
             || ' un em ' || to_char(v_dt,'DD/MM/YYYY');

  -- 1. produto volta ao estoque disponível, pelo custo congelado na venda
  PERFORM public.fn_lancar_movimento(v_vi.produto_id,'DISPONIVEL','DEVOLUCAO_VENDA',
    v_q, v_cu, 'vendas', v_v.id, gen_random_uuid(),
    COALESCE(NULLIF(btrim(p_motivo),''),'Devolução de produto vendido'), v_dt);

  -- 2. quantidades e totais da venda
  UPDATE public.venda_itens SET qtd_devolvida = qtd_devolvida + v_q WHERE id = p_venda_item_id;
  UPDATE public.vendas SET valor_devolvido = valor_devolvido + v_val,
                           custo_devolvido = custo_devolvido + v_custo,
                           updated_by = public.fn_usuario_atual()
   WHERE id = v_v.id;

  -- 3. abate o que ele ainda deve nesta venda, da parcela mais antiga em diante
  v_abatido := public.fn_abater_titulos_venda(v_v.id, v_val, v_dt, v_nota);
  v_credito := round(v_val - v_abatido, 2);

  -- 4. o que sobrou é porque ele já tinha pago: vira crédito a favor dele
  IF v_credito > 0 THEN
    INSERT INTO public.creditos (tipo_devedor, cliente_id, revendedor_id,
      origem_tabela, origem_id, valor, data_credito, motivo, created_by)
    VALUES (CASE WHEN v_v.tipo='REVENDEDOR' THEN 'REVENDEDOR'::tipo_devedor_enum
                 ELSE 'CLIENTE'::tipo_devedor_enum END,
            CASE WHEN v_v.tipo='REVENDEDOR' THEN NULL ELSE v_v.cliente_id END,
            CASE WHEN v_v.tipo='REVENDEDOR' THEN v_v.revendedor_id ELSE NULL END,
            'vendas', v_v.id, v_credito, v_dt,
            'Devolução de produto já pago — venda nº ' || v_v.numero, public.fn_usuario_atual())
    RETURNING id INTO v_cred;
  END IF;

  INSERT INTO public.venda_devolucoes (venda_id, venda_item_id, produto_id, quantidade,
    valor_unitario, valor_total, custo_unitario, custo_total, valor_abatido, valor_credito,
    data_devolucao, motivo, created_by)
  VALUES (v_v.id, p_venda_item_id, v_vi.produto_id, v_q, v_vu, v_val, v_cu, v_custo,
    v_abatido, v_credito, v_dt, NULLIF(btrim(p_motivo),''), public.fn_usuario_atual())
  RETURNING id INTO v_id;

  RETURN v_id;
END; $function$;

-- Usar crédito para abater uma parcela em aberto.
CREATE OR REPLACE FUNCTION public.fn_usar_credito(
  p_credito_id uuid, p_titulo_id uuid, p_valor numeric DEFAULT NULL, p_data date DEFAULT NULL)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c RECORD; v_t RECORD; v_dt DATE := COALESCE(p_data, CURRENT_DATE);
        v_pedido NUMERIC(14,2); v_ab NUMERIC(14,2);
BEGIN
  SELECT * INTO v_c FROM public.creditos WHERE id=p_credito_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crédito não encontrado.'; END IF;
  IF v_c.saldo <= 0 THEN RAISE EXCEPTION 'Este crédito já foi usado por inteiro.'; END IF;

  SELECT * INTO v_t FROM public.titulos_receber WHERE id=p_titulo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
  IF v_t.situacao <> 'ABERTO' THEN RAISE EXCEPTION 'Esta parcela não está em aberto.'; END IF;
  IF v_t.tipo_devedor <> v_c.tipo_devedor
     OR COALESCE(v_t.cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)
        <> COALESCE(v_c.cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)
     OR COALESCE(v_t.revendedor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        <> COALESCE(v_c.revendedor_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'O crédito é de outra pessoa e não pode abater esta parcela.'; END IF;

  v_pedido := LEAST(round(COALESCE(p_valor, v_c.saldo),2), v_c.saldo);
  IF v_pedido <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;

  v_ab := public.fn_abater_titulo(p_titulo_id, v_pedido, v_dt,
    'Abatido com crédito nº ' || v_c.numero);
  IF v_ab <= 0 THEN RAISE EXCEPTION 'Não havia saldo em aberto nesta parcela para abater.'; END IF;

  INSERT INTO public.credito_usos (credito_id, titulo_id, valor, data_uso, created_by)
  VALUES (p_credito_id, p_titulo_id, v_ab, v_dt, public.fn_usuario_atual());

  RETURN v_ab;
END; $function$;

-- Compra paga: só registra quando o dinheiro saiu. Não lança despesa.
CREATE OR REPLACE FUNCTION public.fn_marcar_compra_paga(
  p_compra_id uuid, p_data date DEFAULT NULL, p_forma_pagamento_id uuid DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c RECORD;
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada.'; END IF;
  IF v_c.status = 'CANCELADO' THEN RAISE EXCEPTION 'Compra cancelada não pode ser marcada como paga.'; END IF;
  IF COALESCE(p_data, CURRENT_DATE) < v_c.data_compra THEN
    RAISE EXCEPTION 'O pagamento (%) não pode ser anterior à compra (%).',
      to_char(COALESCE(p_data,CURRENT_DATE),'DD/MM/YYYY'), to_char(v_c.data_compra,'DD/MM/YYYY'); END IF;
  UPDATE public.compras
     SET pago = true, data_pagamento = COALESCE(p_data, CURRENT_DATE),
         forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id),
         updated_by = public.fn_usuario_atual()
   WHERE id = p_compra_id;
END; $function$;

-- Frete, taxa e outros custos continuam trancados numa compra confirmada.
-- A exceção é fn_editar_itens_compra, que liga a chave no escopo da transação
-- e recalcula o rateio inteiro em seguida.
CREATE OR REPLACE FUNCTION public.trg_fn_protege_documento()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_ignorar TEXT[] := ARRAY['observacoes','updated_at','updated_by',
    'qtd_em_posse','qtd_total_enviada','valor_custo_total','valor_revenda_total',
    'encerrada','data_encerramento','subtotal','subtotal_produtos','valor_total','custo_total',
    'status','data_confirmacao','data_cancelamento','motivo_cancelamento',
    'valor_devolvido','custo_devolvido','lucro_bruto',
    'data_pagamento','pago','forma_pagamento_id','custo_acessorio'];
  v_novo JSONB := to_jsonb(NEW); v_ant JSONB := to_jsonb(OLD); k TEXT;
BEGIN
  IF OLD.status='CANCELADO' THEN RAISE EXCEPTION 'Documento cancelado não pode ser alterado.'; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('app.editando_compra', true),'') = 'on' THEN RETURN NEW; END IF;
  IF OLD.status='CONFIRMADO' AND NEW.status='CONFIRMADO' THEN
    FOREACH k IN ARRAY v_ignorar LOOP v_novo := v_novo - k; v_ant := v_ant - k; END LOOP;
    IF v_novo IS DISTINCT FROM v_ant THEN
      RAISE EXCEPTION 'Documento já confirmado não pode ser alterado. Cancele e refaça o lançamento.';
    END IF;
  END IF;
  RETURN NEW; END; $function$;

-- Incluir e excluir produto numa compra, inclusive confirmada (RN-C05).
CREATE OR REPLACE FUNCTION public.fn_editar_itens_compra(
  p_compra_id uuid, p_itens jsonb,
  p_valor_frete numeric DEFAULT NULL, p_valor_taxa numeric DEFAULT NULL,
  p_outros_custos numeric DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c RECORD; v_tx UUID := gen_random_uuid(); v_m RECORD; v_i RECORD; e JSONB;
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada.'; END IF;
  IF v_c.status = 'CANCELADO' THEN RAISE EXCEPTION 'Compra cancelada não pode ser alterada.'; END IF;
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A compra precisa ter ao menos um produto.'; END IF;

  PERFORM set_config('app.editando_compra','on', true);

  -- Só as ENTRADAS: pegar as próprias linhas de ESTORNO estornaria o estorno
  -- e devolveria a quantidade ao estoque.
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
        'Alteração dos itens da compra nº ' || v_c.numero, CURRENT_DATE, v_m.id);
    END LOOP;
  END IF;

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

  -- subtotal_produtos é mantido por gatilho que só age em rascunho.
  UPDATE public.compras
     SET subtotal_produtos = COALESCE((SELECT SUM(subtotal) FROM public.compra_itens
                                        WHERE compra_id = p_compra_id), 0),
         valor_frete   = COALESCE(p_valor_frete, valor_frete),
         valor_taxa_cartao = COALESCE(p_valor_taxa, valor_taxa_cartao),
         outros_custos = COALESCE(p_outros_custos, outros_custos),
         updated_by = public.fn_usuario_atual()
   WHERE id = p_compra_id;

  PERFORM public.fn_ratear_custos_compra(p_compra_id);

  IF v_c.status = 'CONFIRMADO' THEN
    FOR v_i IN SELECT produto_id, quantidade, custo_unitario_final
                 FROM public.compra_itens WHERE compra_id=p_compra_id LOOP
      PERFORM public.fn_atualizar_custo_medio(v_i.produto_id, v_i.quantidade, v_i.custo_unitario_final);
      PERFORM public.fn_lancar_movimento(v_i.produto_id,'DISPONIVEL','ENTRADA_COMPRA',
        v_i.quantidade, v_i.custo_unitario_final,'compras',p_compra_id,v_tx,
        'Reentrada após alteração dos itens', v_c.data_compra);
    END LOOP;
  END IF;

  FOR v_m IN SELECT DISTINCT produto_id FROM public.movimentacoes_estoque
              WHERE origem_tabela='compras' AND origem_id=p_compra_id LOOP
    PERFORM public.fn_recalcular_custo_medio(v_m.produto_id);
  END LOOP;

  PERFORM set_config('app.editando_compra','off', true);
END; $function$;

-- Mesmo defeito nos cancelamentos: nunca estornar uma linha de ESTORNO.
CREATE OR REPLACE FUNCTION public.fn_cancelar_compra(p_compra_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c RECORD; v_tx UUID := gen_random_uuid(); v_m RECORD;
BEGIN
  SELECT * INTO v_c FROM public.compras WHERE id=p_compra_id FOR UPDATE;
  IF v_c.status <> 'CONFIRMADO' THEN RAISE EXCEPTION 'Só é possível cancelar uma compra confirmada.'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;

  FOR v_m IN SELECT m.*, p.nome, p.qtd_disponivel FROM public.movimentacoes_estoque m
               JOIN public.produtos p ON p.id=m.produto_id
              WHERE m.origem_tabela='compras' AND m.origem_id=p_compra_id
                AND m.tipo = 'ENTRADA_COMPRA'::tipo_movimento_enum
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
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_cancelar_venda(p_venda_id uuid, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  -- Estorna saída de venda E devolução de venda; nunca as linhas de ESTORNO.
  FOR v_m IN SELECT m.* FROM public.movimentacoes_estoque m
              WHERE m.origem_tabela='vendas' AND m.origem_id=p_venda_id
                AND m.tipo <> 'ESTORNO'::tipo_movimento_enum
                AND NOT EXISTS (SELECT 1 FROM public.movimentacoes_estoque e WHERE e.estorno_de_id=m.id) LOOP
    PERFORM public.fn_lancar_movimento(v_m.produto_id, v_m.bucket,'ESTORNO',
      -v_m.quantidade, v_m.custo_unitario,'vendas',p_venda_id,v_tx,
      'Cancelamento da venda nº ' || v_v.numero, CURRENT_DATE, v_m.id);
  END LOOP;

  UPDATE public.titulos_receber SET situacao='CANCELADO', data_quitacao=NULL
   WHERE venda_id=p_venda_id AND situacao <> 'CANCELADO';

  UPDATE public.vendas SET status='CANCELADO', data_cancelamento=now(),
    motivo_cancelamento=p_motivo, updated_by=public.fn_usuario_atual() WHERE id=p_venda_id;
END; $function$;

REVOKE ALL ON FUNCTION public.fn_devolver_item_venda(uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_usar_credito(uuid, uuid, numeric, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_marcar_compra_paga(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_editar_itens_compra(uuid, jsonb, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolver_item_venda(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_usar_credito(uuid, uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_marcar_compra_paga(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_editar_itens_compra(uuid, jsonb, numeric, numeric, numeric) TO authenticated;
