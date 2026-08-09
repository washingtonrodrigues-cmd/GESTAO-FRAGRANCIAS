-- 0032 — Devolução de item vendido, crédito, relatórios do revendedor,
--         edição de itens da compra e data de pagamento da compra.
--
-- ─────────────────────────────────────────────────────────────────────────
-- REGRAS QUE ESTE ARQUIVO IMPLEMENTA
--
-- RN-V10  Item vendido pode ser devolvido parcialmente. O produto volta ao
--         bolso DISPONIVEL pelo custo congelado na venda (CMV não muda
--         retroativamente).
-- RN-V11  A devolução abate o que o comprador ainda deve NAQUELA venda, da
--         parcela mais antiga para a mais nova — mesma ordem do recebimento
--         por peça.
-- RN-V12  O que passar do que ele deve vira CRÉDITO a favor dele, porque
--         essa parte já estava paga. Crédito abate parcela em aberto; não é
--         entrada de caixa e não aparece em recebimentos.
-- RN-V13  Receita, CMV e lucro passam a ser líquidos de devolução. O
--         documento da venda continua intacto: quem muda é o resultado.
-- RN-C05  Itens de compra podem ser incluídos e excluídos, inclusive em
--         compra confirmada: o banco desfaz a entrada, refaz o rateio e dá
--         entrada de novo. Recusado se alguma unidade já saiu do estoque.
-- RN-C06  A compra registra quando será paga. Compra NÃO é despesa: a
--         mercadoria vira estoque e o custo entra no resultado como CMV na
--         venda. A data serve para acompanhar o caixa.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.venda_itens
  ADD COLUMN IF NOT EXISTS qtd_devolvida numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE public.venda_itens DROP CONSTRAINT IF EXISTS chk_venda_item_devolvida;
ALTER TABLE public.venda_itens ADD CONSTRAINT chk_venda_item_devolvida
  CHECK (qtd_devolvida >= 0 AND qtd_devolvida <= quantidade);

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS valor_devolvido numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_devolvido numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forma_pagamento_id uuid REFERENCES public.formas_pagamento(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_compras_pagamento ON public.compras(data_pagamento) WHERE NOT pago;

CREATE TABLE IF NOT EXISTS public.venda_devolucoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         bigint GENERATED ALWAYS AS IDENTITY,
  venda_id       uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  venda_item_id  uuid NOT NULL REFERENCES public.venda_itens(id) ON DELETE RESTRICT,
  produto_id     uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade     numeric(14,3) NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(14,2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total    numeric(14,2) NOT NULL CHECK (valor_total >= 0),
  custo_unitario numeric(14,2) NOT NULL DEFAULT 0,
  custo_total    numeric(14,2) NOT NULL DEFAULT 0,
  valor_abatido  numeric(14,2) NOT NULL DEFAULT 0,
  valor_credito  numeric(14,2) NOT NULL DEFAULT 0,
  data_devolucao date NOT NULL DEFAULT CURRENT_DATE,
  motivo         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.usuarios(id),
  CONSTRAINT uq_venda_devolucoes_numero UNIQUE (numero)
);
CREATE INDEX IF NOT EXISTS idx_venda_devolucoes_venda ON public.venda_devolucoes(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_devolucoes_item  ON public.venda_devolucoes(venda_item_id);
CREATE INDEX IF NOT EXISTS idx_venda_devolucoes_data  ON public.venda_devolucoes(data_devolucao);

CREATE TABLE IF NOT EXISTS public.creditos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          bigint GENERATED ALWAYS AS IDENTITY,
  tipo_devedor    tipo_devedor_enum NOT NULL,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  revendedor_id   uuid REFERENCES public.revendedores(id) ON DELETE RESTRICT,
  origem_tabela   text,
  origem_id       uuid,
  valor           numeric(14,2) NOT NULL CHECK (valor > 0),
  valor_utilizado numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_utilizado >= 0),
  saldo           numeric(14,2) GENERATED ALWAYS AS (valor - valor_utilizado) STORED,
  data_credito    date NOT NULL DEFAULT CURRENT_DATE,
  motivo          text,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.usuarios(id),
  updated_by      uuid REFERENCES public.usuarios(id),
  CONSTRAINT uq_creditos_numero UNIQUE (numero),
  CONSTRAINT chk_credito_devedor CHECK (
    (tipo_devedor = 'CLIENTE'    AND cliente_id    IS NOT NULL AND revendedor_id IS NULL) OR
    (tipo_devedor = 'REVENDEDOR' AND revendedor_id IS NOT NULL AND cliente_id    IS NULL)),
  CONSTRAINT chk_credito_utilizado CHECK (valor_utilizado <= valor)
);
CREATE INDEX IF NOT EXISTS idx_creditos_cliente    ON public.creditos(cliente_id)    WHERE cliente_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creditos_revendedor ON public.creditos(revendedor_id) WHERE revendedor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credito_usos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id uuid NOT NULL REFERENCES public.creditos(id) ON DELETE RESTRICT,
  titulo_id  uuid NOT NULL REFERENCES public.titulos_receber(id) ON DELETE RESTRICT,
  valor      numeric(14,2) NOT NULL CHECK (valor > 0),
  data_uso   date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_credito_usos_credito ON public.credito_usos(credito_id);

ALTER TABLE public.venda_devolucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credito_usos     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_venda_dev_sel ON public.venda_devolucoes;
DROP POLICY IF EXISTS p_venda_dev_ins ON public.venda_devolucoes;
DROP POLICY IF EXISTS p_venda_dev_upd ON public.venda_devolucoes;
DROP POLICY IF EXISTS p_venda_dev_del ON public.venda_devolucoes;
CREATE POLICY p_venda_dev_sel ON public.venda_devolucoes FOR SELECT USING (fn_tem_permissao('vendas','ler'));
CREATE POLICY p_venda_dev_ins ON public.venda_devolucoes FOR INSERT WITH CHECK (fn_tem_permissao('vendas','editar'));
CREATE POLICY p_venda_dev_upd ON public.venda_devolucoes FOR UPDATE USING (fn_tem_permissao('vendas','editar'));
CREATE POLICY p_venda_dev_del ON public.venda_devolucoes FOR DELETE USING (fn_tem_permissao('vendas','excluir'));

DROP POLICY IF EXISTS p_creditos_sel ON public.creditos;
DROP POLICY IF EXISTS p_creditos_ins ON public.creditos;
DROP POLICY IF EXISTS p_creditos_upd ON public.creditos;
DROP POLICY IF EXISTS p_creditos_del ON public.creditos;
CREATE POLICY p_creditos_sel ON public.creditos FOR SELECT USING (fn_tem_permissao('financeiro','ler'));
CREATE POLICY p_creditos_ins ON public.creditos FOR INSERT WITH CHECK (fn_tem_permissao('financeiro','editar'));
CREATE POLICY p_creditos_upd ON public.creditos FOR UPDATE USING (fn_tem_permissao('financeiro','editar'));
CREATE POLICY p_creditos_del ON public.creditos FOR DELETE USING (fn_tem_permissao('financeiro','excluir'));

DROP POLICY IF EXISTS p_credito_usos_sel ON public.credito_usos;
DROP POLICY IF EXISTS p_credito_usos_ins ON public.credito_usos;
DROP POLICY IF EXISTS p_credito_usos_upd ON public.credito_usos;
DROP POLICY IF EXISTS p_credito_usos_del ON public.credito_usos;
CREATE POLICY p_credito_usos_sel ON public.credito_usos FOR SELECT USING (fn_tem_permissao('financeiro','ler'));
CREATE POLICY p_credito_usos_ins ON public.credito_usos FOR INSERT WITH CHECK (fn_tem_permissao('financeiro','editar'));
CREATE POLICY p_credito_usos_upd ON public.credito_usos FOR UPDATE USING (fn_tem_permissao('financeiro','editar'));
CREATE POLICY p_credito_usos_del ON public.credito_usos FOR DELETE USING (fn_tem_permissao('financeiro','excluir'));

REVOKE ALL ON public.venda_devolucoes, public.creditos, public.credito_usos FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_devolucoes, public.creditos, public.credito_usos TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_atualiza_credito()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_c UUID := COALESCE(NEW.credito_id, OLD.credito_id);
BEGIN
  UPDATE public.creditos c
     SET valor_utilizado = COALESCE(
           (SELECT SUM(valor) FROM public.credito_usos WHERE credito_id=v_c),0),
         updated_at = now()
   WHERE c.id = v_c;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS trg_atualiza_credito ON public.credito_usos;
CREATE TRIGGER trg_atualiza_credito AFTER INSERT OR UPDATE OR DELETE ON public.credito_usos
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_atualiza_credito();

DROP TRIGGER IF EXISTS trg_creditos_updated_at ON public.creditos;
CREATE TRIGGER trg_creditos_updated_at BEFORE UPDATE ON public.creditos
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_updated_at();

DROP TRIGGER IF EXISTS trg_creditos_auditoria ON public.creditos;
CREATE TRIGGER trg_creditos_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.creditos
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auditoria();

DROP TRIGGER IF EXISTS trg_venda_devolucoes_auditoria ON public.venda_devolucoes;
CREATE TRIGGER trg_venda_devolucoes_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.venda_devolucoes
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auditoria();
