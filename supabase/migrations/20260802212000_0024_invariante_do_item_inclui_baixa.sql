/* 0024 — A invariante do item de remessa precisa contar a baixa.
   Sem isso, o gatilho da 0023 batia em
     chk_remessa_itens_saldo violated
   porque a soma dos contadores antigos não fechava com a quantidade
   enviada quando havia unidade baixada. */

ALTER TABLE public.remessa_itens DROP CONSTRAINT IF EXISTS chk_remessa_itens_saldo;
ALTER TABLE public.remessa_itens ADD CONSTRAINT chk_remessa_itens_saldo
  CHECK (qtd_em_posse + qtd_vendida + qtd_devolvida + qtd_perdida + qtd_baixada = quantidade);

ALTER TABLE public.remessa_itens DROP CONSTRAINT IF EXISTS remessa_itens_qtd_baixada_check;
ALTER TABLE public.remessa_itens ADD CONSTRAINT remessa_itens_qtd_baixada_check
  CHECK (qtd_baixada >= 0);

COMMENT ON CONSTRAINT chk_remessa_itens_saldo ON public.remessa_itens IS
  'Nada some: tudo que saiu tem de estar em posse, vendido, devolvido, perdido ou baixado.';
