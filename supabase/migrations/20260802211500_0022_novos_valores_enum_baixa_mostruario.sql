/* 0022 — Valores novos de enum para a baixa de mostruário.
   Vem separada da 0023 porque o PostgreSQL não deixa USAR um valor de
   enum na mesma transação em que ele é criado. */

ALTER TYPE public.status_item_remessa_enum  ADD VALUE IF NOT EXISTS 'BAIXADO';
ALTER TYPE public.tipo_movimento_enum       ADD VALUE IF NOT EXISTS 'BAIXA_MOSTRUARIO';
ALTER TYPE public.categoria_despesa_enum    ADD VALUE IF NOT EXISTS 'BAIXA_MOSTRUARIO';
