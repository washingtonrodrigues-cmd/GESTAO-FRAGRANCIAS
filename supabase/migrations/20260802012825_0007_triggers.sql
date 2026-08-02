CREATE OR REPLACE FUNCTION public.trg_fn_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now();
      NEW.updated_by := COALESCE(public.fn_usuario_atual(), NEW.updated_by);
      RETURN NEW; END; $$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['categorias','marcas','fornecedores','clientes','revendedores','produtos',
    'compras','vendas','remessas','prestacoes_contas','titulos_receber','despesas','usuarios'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.trg_fn_updated_at();', t);
  END LOOP; END $$;

-- ── IMUTABILIDADE DOS FATOS ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_bloquear_alteracao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION
  'A tabela % é um registro histórico imutável. Use lançamento de estorno.', TG_TABLE_NAME; END; $$;

CREATE TRIGGER trg_mov_imutavel BEFORE UPDATE OR DELETE ON public.movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_bloquear_alteracao();
CREATE TRIGGER trg_eventos_imutavel BEFORE UPDATE OR DELETE ON public.remessa_item_eventos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_bloquear_alteracao();

-- ── SALDOS DE ESTOQUE ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_saldo_produto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.produtos SET
    qtd_disponivel = qtd_disponivel + CASE WHEN NEW.bucket='DISPONIVEL' THEN NEW.quantidade ELSE 0 END,
    qtd_reservado  = qtd_reservado  + CASE WHEN NEW.bucket='RESERVADO'  THEN NEW.quantidade ELSE 0 END,
    qtd_mostruario = qtd_mostruario + CASE WHEN NEW.bucket='MOSTRUARIO' THEN NEW.quantidade ELSE 0 END,
    qtd_consignado = qtd_consignado + CASE WHEN NEW.bucket='CONSIGNADO' THEN NEW.quantidade ELSE 0 END,
    updated_at = now()
  WHERE id = NEW.produto_id;
  RETURN NEW; END; $$;

CREATE TRIGGER trg_atualiza_saldo_produto AFTER INSERT ON public.movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_atualiza_saldo_produto();

-- ── TOTAIS DE COMPRA E VENDA ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_totaliza_compra()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID := COALESCE(NEW.compra_id, OLD.compra_id);
BEGIN
  UPDATE public.compras c SET subtotal_produtos =
    COALESCE((SELECT SUM(subtotal) FROM public.compra_itens WHERE compra_id=v),0)
  WHERE c.id=v AND c.status='RASCUNHO';
  RETURN COALESCE(NEW, OLD); END; $$;
CREATE TRIGGER trg_totaliza_compra AFTER INSERT OR UPDATE OR DELETE ON public.compra_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_totaliza_compra();

CREATE OR REPLACE FUNCTION public.trg_fn_totaliza_venda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID := COALESCE(NEW.venda_id, OLD.venda_id); s NUMERIC(14,2);
BEGIN
  SELECT COALESCE(SUM(subtotal),0) INTO s FROM public.venda_itens WHERE venda_id=v;
  UPDATE public.vendas x SET subtotal = s,
      desconto_valor = LEAST(x.desconto_valor, s),
      valor_total = s - LEAST(x.desconto_valor, s)
   WHERE x.id=v AND x.status='RASCUNHO';
  RETURN COALESCE(NEW, OLD); END; $$;
CREATE TRIGGER trg_totaliza_venda AFTER INSERT OR UPDATE OR DELETE ON public.venda_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_totaliza_venda();

-- ── TÍTULOS: saldo e situação (ADR-04) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_titulo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t UUID := COALESCE(NEW.titulo_id, OLD.titulo_id);
        v_rec NUMERIC(14,2); v_orig NUMERIC(14,2); v_sit situacao_titulo_enum;
BEGIN
  SELECT COALESCE(SUM(valor),0) INTO v_rec FROM public.recebimento_alocacoes
   WHERE titulo_id=v_t AND NOT estornada;
  SELECT valor_original, situacao INTO v_orig, v_sit FROM public.titulos_receber WHERE id=v_t;

  UPDATE public.titulos_receber SET
    valor_recebido = v_rec,
    situacao = CASE WHEN v_sit='CANCELADO' THEN 'CANCELADO'
                    WHEN v_rec >= v_orig THEN 'PAGO' ELSE 'ABERTO' END,
    data_quitacao = CASE WHEN v_sit='CANCELADO' THEN NULL
                         WHEN v_rec >= v_orig THEN COALESCE(data_quitacao, CURRENT_DATE)
                         ELSE NULL END,
    updated_at = now()
  WHERE id=v_t;

  UPDATE public.recebimentos r SET valor_alocado =
    COALESCE((SELECT SUM(valor) FROM public.recebimento_alocacoes
               WHERE recebimento_id=r.id AND NOT estornada),0)
  WHERE r.id = COALESCE(NEW.recebimento_id, OLD.recebimento_id);
  RETURN COALESCE(NEW, OLD); END; $$;

CREATE TRIGGER trg_atualiza_titulo AFTER INSERT OR UPDATE OR DELETE ON public.recebimento_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_atualiza_titulo();

-- ── CONSIGNAÇÃO: saldo inicial e baixas (ADR-05) ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_remessa_item_inicial()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.qtd_em_posse := NEW.quantidade; RETURN NEW; END; $$;
CREATE TRIGGER trg_remessa_item_inicial BEFORE INSERT ON public.remessa_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_remessa_item_inicial();

CREATE OR REPLACE FUNCTION public.trg_fn_totaliza_remessa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v UUID := COALESCE(NEW.remessa_id, OLD.remessa_id);
BEGIN
  UPDATE public.remessas r SET
    qtd_total_enviada = COALESCE((SELECT SUM(quantidade) FROM public.remessa_itens WHERE remessa_id=v),0),
    qtd_em_posse = COALESCE((SELECT SUM(qtd_em_posse) FROM public.remessa_itens WHERE remessa_id=v),0),
    valor_custo_total = COALESCE((SELECT SUM(round(quantidade*valor_custo_unitario,2))
                                    FROM public.remessa_itens WHERE remessa_id=v),0),
    valor_revenda_total = COALESCE((SELECT SUM(round(quantidade*valor_revenda_unitario,2))
                                    FROM public.remessa_itens WHERE remessa_id=v),0),
    updated_at = now()
  WHERE r.id=v;
  RETURN COALESCE(NEW, OLD); END; $$;
CREATE TRIGGER trg_totaliza_remessa AFTER INSERT OR UPDATE OR DELETE ON public.remessa_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_totaliza_remessa();

-- Atualiza os QUATRO saldos numa única instrução: sem estado intermediário inválido
CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_remessa_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item UUID := NEW.remessa_item_id; v_rem UUID;
BEGIN
  WITH totais AS (
    SELECT COALESCE(SUM(quantidade) FILTER (WHERE status_novo='VENDIDO'),0) AS vend,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo IN ('DEVOLVIDO','TROCADO')),0) AS devo,
           COALESCE(SUM(quantidade) FILTER (WHERE status_novo='PERDIDO'),0) AS perd,
           MAX(data_evento) FILTER (WHERE status_novo IN ('DEVOLVIDO','TROCADO')) AS dt
      FROM public.remessa_item_eventos WHERE remessa_item_id=v_item)
  UPDATE public.remessa_itens ri SET
    qtd_vendida = t.vend, qtd_devolvida = t.devo, qtd_perdida = t.perd,
    qtd_em_posse = ri.quantidade - t.vend - t.devo - t.perd,
    data_ultima_devolucao = t.dt
  FROM totais t WHERE ri.id=v_item
  RETURNING ri.remessa_id INTO v_rem;

  UPDATE public.remessas r SET
    qtd_em_posse = COALESCE((SELECT SUM(qtd_em_posse) FROM public.remessa_itens WHERE remessa_id=r.id),0),
    updated_at = now()
  WHERE r.id = v_rem;
  RETURN NEW; END; $$;
CREATE TRIGGER trg_atualiza_remessa_item AFTER INSERT ON public.remessa_item_eventos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_atualiza_remessa_item();

-- ── AUDITORIA UNIVERSAL ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campos TEXT[]; v_nome TEXT;
BEGIN
  SELECT nome INTO v_nome FROM public.usuarios WHERE id = public.fn_usuario_atual();
  IF TG_OP='UPDATE' THEN
    SELECT array_agg(key) INTO v_campos FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
  END IF;
  INSERT INTO public.logs_auditoria
    (usuario_id, usuario_nome, acao, tabela, registro_id, dados_anteriores, dados_novos, campos_alterados)
  VALUES (public.fn_usuario_atual(), v_nome, TG_OP::acao_auditoria_enum, TG_TABLE_NAME,
    CASE WHEN TG_OP='DELETE' THEN (OLD.id)::UUID ELSE (NEW.id)::UUID END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END, v_campos);
  RETURN COALESCE(NEW, OLD); END; $$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['produtos','clientes','revendedores','fornecedores','compras',
    'vendas','remessas','prestacoes_contas','titulos_receber','recebimentos','despesas','usuarios'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auditoria();', t);
  END LOOP; END $$;

-- ── DOCUMENTO CONFIRMADO É IMUTÁVEL (ADR-07) ─────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_protege_documento()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ignorar TEXT[] := ARRAY['observacoes','updated_at','updated_by',
    'qtd_em_posse','qtd_total_enviada','valor_custo_total','valor_revenda_total',
    'encerrada','data_encerramento','subtotal','subtotal_produtos','valor_total','custo_total',
    'status','data_confirmacao','data_cancelamento','motivo_cancelamento'];
  v_novo JSONB := to_jsonb(NEW); v_ant JSONB := to_jsonb(OLD); k TEXT;
BEGIN
  IF OLD.status='CANCELADO' THEN RAISE EXCEPTION 'Documento cancelado não pode ser alterado.'; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF OLD.status='CONFIRMADO' AND NEW.status='CONFIRMADO' THEN
    FOREACH k IN ARRAY v_ignorar LOOP v_novo := v_novo - k; v_ant := v_ant - k; END LOOP;
    IF v_novo IS DISTINCT FROM v_ant THEN
      RAISE EXCEPTION 'Documento já confirmado não pode ser alterado. Cancele e refaça o lançamento.';
    END IF;
  END IF;
  RETURN NEW; END; $$;

CREATE TRIGGER trg_protege_compra BEFORE UPDATE ON public.compras
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protege_documento();
CREATE TRIGGER trg_protege_venda BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protege_documento();
CREATE TRIGGER trg_protege_remessa BEFORE UPDATE ON public.remessas
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protege_documento();

CREATE OR REPLACE FUNCTION public.trg_fn_protege_produto_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND OLD.qtd_total > 0 THEN
    RAISE EXCEPTION 'Não é possível excluir "%": ainda existem % unidade(s) em estoque. Inative o produto.',
      OLD.nome, OLD.qtd_total;
  END IF;
  RETURN NEW; END; $$;
CREATE TRIGGER trg_protege_produto_delete BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protege_produto_delete();
