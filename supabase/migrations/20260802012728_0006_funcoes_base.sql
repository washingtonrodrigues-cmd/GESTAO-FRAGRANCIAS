CREATE OR REPLACE FUNCTION public.fn_usuario_atual()
RETURNS UUID LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.fn_dinheiro(p_valor NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT round(COALESCE(p_valor, 0)::NUMERIC, 2);
$$;

-- ── RATEIO DOS CUSTOS ACESSÓRIOS (ADR-03) ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ratear_custos_compra(p_compra_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compra RECORD; v_base_total NUMERIC(18,4);
    v_soma NUMERIC(14,2) := 0; v_residuo NUMERIC(14,2);
    v_item RECORD; v_maior UUID; v_rateio NUMERIC(14,2);
BEGIN
    SELECT * INTO v_compra FROM public.compras WHERE id = p_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada'; END IF;

    IF v_compra.criterio_rateio = 'VALOR' THEN
        SELECT SUM(subtotal) INTO v_base_total FROM public.compra_itens WHERE compra_id = p_compra_id;
    ELSE
        SELECT SUM(quantidade) INTO v_base_total FROM public.compra_itens WHERE compra_id = p_compra_id;
    END IF;
    IF COALESCE(v_base_total,0) = 0 THEN
        RAISE EXCEPTION 'Adicione ao menos um produto à compra antes de confirmar.';
    END IF;

    SELECT id INTO v_maior FROM public.compra_itens WHERE compra_id = p_compra_id
     ORDER BY (CASE WHEN v_compra.criterio_rateio='VALOR' THEN subtotal ELSE quantidade END) DESC, id ASC
     LIMIT 1;

    FOR v_item IN SELECT id, quantidade, subtotal FROM public.compra_itens WHERE compra_id = p_compra_id LOOP
        v_rateio := public.fn_dinheiro(v_compra.custo_acessorio *
            (CASE WHEN v_compra.criterio_rateio='VALOR' THEN v_item.subtotal ELSE v_item.quantidade END)
            / v_base_total);
        UPDATE public.compra_itens
           SET rateio_acessorio = v_rateio,
               custo_unitario_final = round((v_item.subtotal + v_rateio)/v_item.quantidade, 4)
         WHERE id = v_item.id;
        v_soma := v_soma + v_rateio;
    END LOOP;

    v_residuo := v_compra.custo_acessorio - v_soma;
    IF v_residuo <> 0 THEN
        UPDATE public.compra_itens ci
           SET rateio_acessorio = GREATEST(ci.rateio_acessorio + v_residuo, 0),
               custo_unitario_final = round(
                 (ci.subtotal + GREATEST(ci.rateio_acessorio + v_residuo,0))/ci.quantidade, 4)
         WHERE ci.id = v_maior;
    END IF;
END; $$;

-- ── CUSTO MÉDIO PONDERADO MÓVEL (ADR-02) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_atualizar_custo_medio(
    p_produto_id UUID, p_qtd_entrada NUMERIC, p_custo_unitario NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd NUMERIC(14,3); v_custo NUMERIC(14,4); v_novo NUMERIC(14,4);
BEGIN
    SELECT qtd_total, custo_medio INTO v_qtd, v_custo FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
    IF (v_qtd + p_qtd_entrada) <= 0 THEN
        v_novo := p_custo_unitario;
    ELSE
        v_novo := round((v_qtd*v_custo + p_qtd_entrada*p_custo_unitario)/(v_qtd + p_qtd_entrada), 4);
    END IF;
    UPDATE public.produtos
       SET custo_medio = v_novo, ultimo_custo = p_custo_unitario,
           data_ultima_entrada = CURRENT_DATE, updated_at = now()
     WHERE id = p_produto_id;
END; $$;

-- ── RECÁLCULO INTEGRAL (usado no cancelamento de compra) ─────────────
CREATE OR REPLACE FUNCTION public.fn_recalcular_custo_medio(p_produto_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd NUMERIC(14,3) := 0; v_custo NUMERIC(14,4) := 0; v_mov RECORD;
BEGIN
    FOR v_mov IN
        SELECT m.quantidade, m.custo_unitario FROM public.movimentacoes_estoque m
         WHERE m.produto_id = p_produto_id
           AND m.tipo IN ('ENTRADA_COMPRA','AJUSTE_POSITIVO')
           AND NOT EXISTS (SELECT 1 FROM public.movimentacoes_estoque e WHERE e.estorno_de_id = m.id)
         ORDER BY m.data_movimento, m.created_at, m.id
    LOOP
        IF (v_qtd + v_mov.quantidade) <= 0 THEN
            v_custo := v_mov.custo_unitario; v_qtd := GREATEST(v_qtd + v_mov.quantidade, 0);
        ELSE
            v_custo := round((v_qtd*v_custo + v_mov.quantidade*v_mov.custo_unitario)/(v_qtd+v_mov.quantidade), 4);
            v_qtd := v_qtd + v_mov.quantidade;
        END IF;
    END LOOP;
    UPDATE public.produtos SET custo_medio = v_custo, updated_at = now() WHERE id = p_produto_id;
    RETURN v_custo;
END; $$;

-- ── LANÇAMENTO NO LIVRO-RAZÃO (ADR-01) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_lancar_movimento(
    p_produto_id UUID, p_bucket bucket_estoque_enum, p_tipo tipo_movimento_enum,
    p_quantidade NUMERIC, p_custo_unitario NUMERIC,
    p_origem_tabela TEXT, p_origem_id UUID,
    p_transacao_id UUID DEFAULT NULL, p_motivo TEXT DEFAULT NULL,
    p_data DATE DEFAULT NULL, p_estorno_de UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_tx UUID := COALESCE(p_transacao_id, gen_random_uuid());
        v_saldo NUMERIC(14,3); v_nome TEXT;
BEGIN
    IF p_quantidade = 0 THEN RAISE EXCEPTION 'Quantidade da movimentação não pode ser zero'; END IF;

    SELECT nome, CASE p_bucket
             WHEN 'DISPONIVEL' THEN qtd_disponivel WHEN 'RESERVADO' THEN qtd_reservado
             WHEN 'MOSTRUARIO' THEN qtd_mostruario WHEN 'CONSIGNADO' THEN qtd_consignado END
      INTO v_nome, v_saldo FROM public.produtos WHERE id = p_produto_id FOR UPDATE;

    IF (v_saldo + p_quantidade) < 0 THEN
        RAISE EXCEPTION 'Saldo insuficiente: "%" tem % unidade(s) em % e a operação exige %.',
          v_nome, v_saldo, p_bucket, abs(p_quantidade) USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.movimentacoes_estoque (
        transacao_id, produto_id, bucket, tipo, quantidade, custo_unitario, valor_total,
        origem_tabela, origem_id, motivo, data_movimento, estorno_de_id, created_by)
    VALUES (v_tx, p_produto_id, p_bucket, p_tipo, p_quantidade, p_custo_unitario,
        round(p_quantidade*p_custo_unitario,2), p_origem_tabela, p_origem_id, p_motivo,
        COALESCE(p_data, CURRENT_DATE), p_estorno_de, public.fn_usuario_atual())
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

-- ── GERAÇÃO DE PARCELAS (RN-V04) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_gerar_parcelas(
    p_origem origem_titulo_enum, p_venda_id UUID, p_prestacao_id UUID,
    p_tipo_devedor tipo_devedor_enum, p_cliente_id UUID, p_revendedor_id UUID,
    p_valor_total NUMERIC, p_qtd_parcelas SMALLINT, p_data_base DATE,
    p_intervalo_dias INTEGER DEFAULT 30, p_primeira_avista BOOLEAN DEFAULT false,
    p_lucro_total NUMERIC DEFAULT 0)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_base NUMERIC(14,2); v_res NUMERIC(14,2); v_valor NUMERIC(14,2);
    v_lb NUMERIC(14,2); v_lr NUMERIC(14,2); v_lucro NUMERIC(14,2);
    v_venc DATE; i SMALLINT;
BEGIN
    IF p_qtd_parcelas < 1 OR p_qtd_parcelas > 4 THEN
        RAISE EXCEPTION 'O parcelamento permitido é de 1 a 4 vezes.'; END IF;
    IF p_valor_total <= 0 THEN RETURN; END IF;
    IF trunc(p_valor_total / p_qtd_parcelas, 2) <= 0 THEN
        RAISE EXCEPTION 'O valor é baixo demais para % parcelas. Cada parcela precisa ter ao menos R$ 0,01.',
          p_qtd_parcelas; END IF;

    v_base := trunc(p_valor_total / p_qtd_parcelas, 2);
    v_res  := p_valor_total - (v_base * p_qtd_parcelas);
    v_lb   := trunc(COALESCE(p_lucro_total,0) / p_qtd_parcelas, 2);
    v_lr   := COALESCE(p_lucro_total,0) - (v_lb * p_qtd_parcelas);

    FOR i IN 1..p_qtd_parcelas LOOP
        v_valor := v_base + CASE WHEN i=1 THEN v_res ELSE 0 END;
        v_lucro := v_lb   + CASE WHEN i=1 THEN v_lr  ELSE 0 END;
        v_venc := CASE
            WHEN p_primeira_avista AND i=1 THEN p_data_base
            WHEN p_primeira_avista THEN p_data_base + ((i-1)*p_intervalo_dias)
            ELSE p_data_base + (i*p_intervalo_dias) END;
        INSERT INTO public.titulos_receber (
            origem, venda_id, prestacao_id, tipo_devedor, cliente_id, revendedor_id,
            numero_parcela, total_parcelas, valor_original, data_emissao, data_vencimento,
            lucro_proporcional, created_by)
        VALUES (p_origem, p_venda_id, p_prestacao_id, p_tipo_devedor, p_cliente_id, p_revendedor_id,
            i, p_qtd_parcelas, v_valor, p_data_base, v_venc, v_lucro, public.fn_usuario_atual());
    END LOOP;
END; $$;
