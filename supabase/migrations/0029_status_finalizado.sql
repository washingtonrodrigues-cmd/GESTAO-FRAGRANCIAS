-- 0029 — Novo status de item de remessa: FINALIZADO
--
-- "Finalizado" é a amostra de mostruário que acabou: o vidro esvaziou, o
-- produto foi consumido nas demonstrações. Ela sai do bolso MOSTRUARIO sem
-- gerar despesa nova, porque o custo já foi lançado no envio (ver 0030).
--
-- Precisa de migração própria: o PostgreSQL não deixa USAR um valor de enum
-- na mesma transação em que ele é criado.

ALTER TYPE public.status_item_remessa_enum ADD VALUE IF NOT EXISTS 'FINALIZADO';
