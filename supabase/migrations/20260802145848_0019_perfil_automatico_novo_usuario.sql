/* 0019 — Usuário criado pelo painel do Supabase ganha perfil automaticamente.
   Sem isso, quem fosse criado em Authentication → Users conseguia autenticar
   mas não entrava: o sistema procura a linha correspondente em
   public.usuarios, não encontra, e devolve
     "Seu usuário não tem perfil configurado no sistema."
   O gatilho abaixo cria essa linha no mesmo instante.

   Perfil atribuído: ADMIN quando ainda não existe nenhum usuário ativo
   (primeiro acesso do sistema), VENDEDOR nos demais casos — quem já é ADMIN
   promove depois em Configurações → Usuários. Assim, criar um usuário no
   painel nunca vira, sem querer, um administrador a mais. */

CREATE OR REPLACE FUNCTION public.trg_fn_novo_usuario_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_nome TEXT; v_perfil perfil_usuario_enum;
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = NEW.id) THEN RETURN NEW; END IF;

  v_nome := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'nome'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    initcap(replace(split_part(NEW.email, '@', 1), '.', ' ')));

  v_perfil := CASE WHEN EXISTS (SELECT 1 FROM public.usuarios WHERE ativo)
                   THEN 'VENDEDOR'::perfil_usuario_enum
                   ELSE 'ADMIN'::perfil_usuario_enum END;

  INSERT INTO public.usuarios (id, nome, email, perfil, ativo)
  VALUES (NEW.id, v_nome, NEW.email, v_perfil, true)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_novo_usuario_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_novo_usuario ON auth.users;
CREATE TRIGGER trg_auth_novo_usuario AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_novo_usuario_auth();

/* Mantém o e-mail em public.usuarios em dia se ele for trocado pelo painel. */
CREATE OR REPLACE FUNCTION public.trg_fn_email_usuario_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.usuarios SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_email_usuario_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_email_usuario ON auth.users;
CREATE TRIGGER trg_auth_email_usuario AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_email_usuario_auth();
