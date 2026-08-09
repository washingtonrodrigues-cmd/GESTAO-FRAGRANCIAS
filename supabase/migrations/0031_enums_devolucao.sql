-- 0031 — Tipo de movimento para devolução de venda
--
-- No Kardex precisa dar para distinguir "voltou porque o cliente devolveu" de
-- "voltou porque a venda foi cancelada" (ESTORNO). Migração própria: o
-- PostgreSQL não deixa USAR um valor de enum na mesma transação que o cria.
ALTER TYPE public.tipo_movimento_enum ADD VALUE IF NOT EXISTS 'DEVOLUCAO_VENDA';
