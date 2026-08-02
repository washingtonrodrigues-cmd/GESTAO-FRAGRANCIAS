/* 0018 — Corrige um erro que impedia qualquer UPDATE em `usuarios`.
   O gatilho trg_fn_updated_at grava updated_at e updated_by. A tabela
   `usuarios` é a única com updated_at e SEM updated_by, então toda
   alteração nela morria em:
     ERROR: record "new" has no field "updated_by"
   Nunca tinha aparecido porque nada havia editado o usuário até agora.
   Solução: uma função irmã, sem updated_by, só para essa tabela. */

CREATE OR REPLACE FUNCTION public.trg_fn_updated_at_simples()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_updated_at_simples() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_updated_at_simples();
