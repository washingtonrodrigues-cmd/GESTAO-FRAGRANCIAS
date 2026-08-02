-- ─────────────────────────────────────────────────────────────────────
-- 1. VIEWS COM security_invoker
--
-- No PostgreSQL, uma view roda por padrão com os privilégios de QUEM A
-- CRIOU, ignorando o RLS de quem consulta. Com um único administrador
-- isso não é explorável, mas no dia em que existir um perfil VENDEDOR
-- ele leria, através das views, dados que as policies negam na tabela.
-- security_invoker = on faz a view respeitar o RLS do usuário logado.
-- ─────────────────────────────────────────────────────────────────────
DO $$ DECLARE v TEXT; BEGIN
  FOR v IN SELECT table_name FROM information_schema.views WHERE table_schema='public' LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on);', v);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. FUNÇÕES SECURITY DEFINER NÃO PODEM SER CHAMADAS POR VISITANTE
--
-- Por padrão o Postgres concede EXECUTE a PUBLIC. Como as funções de
-- negócio são SECURITY DEFINER (rodam como dono), um visitante não
-- autenticado poderia chamá-las e alterar dados. Revogamos de PUBLIC e
-- de anon, e concedemos apenas a authenticated.
-- ─────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- O visitante não autenticado não lê nem escreve nada
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ─────────────────────────────────────────────────────────────────────
-- 3. fn_norm com search_path fixo (é usada em índices)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_norm(p_texto TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public, extensions AS $$
    SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_texto));
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Notificações: o INSERT deixa de ser irrestrito
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notif_insert ON public.notificacoes;
CREATE POLICY notif_insert ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (usuario_id IS NULL OR usuario_id = auth.uid());
