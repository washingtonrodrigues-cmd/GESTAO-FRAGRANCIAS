/* ═══════════════════════════════════════════════════════════════════
   0025 — Recebimento por produto e quantidade
   ───────────────────────────────────────────────────────────────────
   Os revendedores pagam por peça, não por parcela: "hoje te acerto 3
   frascos". Até aqui só dava para registrar um valor em dinheiro e
   alocar nas parcelas, e a conta de quantas peças já estavam pagas
   ficava na cabeça de quem opera.

   Passa a existir o recebimento POR ITEM. Vale nas duas origens em que
   o revendedor deve:
     · venda direta ao revendedor  → item de venda
     · prestação de contas          → evento de item vendido em consignação

   ATENÇÃO: as colunas de cache `qtd_paga` criadas aqui são REMOVIDAS na
   migração 0028 — `remessa_item_eventos` é livro-razão imutável e não
   aceita UPDATE. Ficam registradas para a história bater com o que
   realmente rodou em produção.
   ═══════════════════════════════════════════════════════════════════ */

ALTER TABLE public.venda_itens
  ADD COLUMN IF NOT EXISTS qtd_paga NUMERIC(14,3) NOT NULL DEFAULT 0;
ALTER TABLE public.remessa_item_eventos
  ADD COLUMN IF NOT EXISTS qtd_paga NUMERIC(14,3) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.recebimento_itens (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id         UUID NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  venda_item_id          UUID REFERENCES public.venda_itens(id),
  remessa_item_evento_id UUID REFERENCES public.remessa_item_eventos(id),
  produto_id             UUID NOT NULL REFERENCES public.produtos(id),
  quantidade             NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
  valor_unitario         NUMERIC(14,2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total            NUMERIC(14,2) NOT NULL CHECK (valor_total >= 0),
  estornado              BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             UUID REFERENCES public.usuarios(id),
  CONSTRAINT chk_recebimento_item_origem CHECK (
    (venda_item_id IS NOT NULL) <> (remessa_item_evento_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_receb_itens_recebimento ON public.recebimento_itens(recebimento_id);
CREATE INDEX IF NOT EXISTS idx_receb_itens_venda_item  ON public.recebimento_itens(venda_item_id)
  WHERE venda_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receb_itens_evento      ON public.recebimento_itens(remessa_item_evento_id)
  WHERE remessa_item_evento_id IS NOT NULL;

COMMENT ON TABLE public.recebimento_itens IS
  'Peças pagas em cada recebimento. Existe só quando o acerto foi feito por produto '
  'e quantidade; recebimento por valor não gera linha aqui.';

ALTER TABLE public.recebimento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_receb_itens_sel ON public.recebimento_itens;
CREATE POLICY p_receb_itens_sel ON public.recebimento_itens FOR SELECT TO authenticated
  USING (public.fn_tem_permissao('financeiro','ler'));
DROP POLICY IF EXISTS p_receb_itens_ins ON public.recebimento_itens;
CREATE POLICY p_receb_itens_ins ON public.recebimento_itens FOR INSERT TO authenticated
  WITH CHECK (public.fn_tem_permissao('financeiro','editar'));
DROP POLICY IF EXISTS p_receb_itens_upd ON public.recebimento_itens;
CREATE POLICY p_receb_itens_upd ON public.recebimento_itens FOR UPDATE TO authenticated
  USING (public.fn_tem_permissao('financeiro','editar'));
DROP POLICY IF EXISTS p_receb_itens_del ON public.recebimento_itens;
CREATE POLICY p_receb_itens_del ON public.recebimento_itens FOR DELETE TO authenticated
  USING (public.fn_tem_permissao('financeiro','excluir'));

REVOKE ALL ON public.recebimento_itens FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recebimento_itens TO authenticated;

/* Estornar o recebimento inteiro precisa refletir nas peças. */
CREATE OR REPLACE FUNCTION public.trg_fn_estorno_reflete_itens()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.estornado IS DISTINCT FROM OLD.estornado THEN
    UPDATE public.recebimento_itens SET estornado = NEW.estornado
     WHERE recebimento_id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_estorno_reflete_itens() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_recebimento_estorno_itens ON public.recebimentos;
CREATE TRIGGER trg_recebimento_estorno_itens
  AFTER UPDATE OF estornado ON public.recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_estorno_reflete_itens();
