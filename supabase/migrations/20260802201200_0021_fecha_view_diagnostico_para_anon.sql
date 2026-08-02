/* 0021 — A view de diagnóstico criada em 0020 nasceu legível para o
   visitante não autenticado, porque o Supabase concede privilégio
   padrão a `anon` em objetos novos do schema public. Ela não expõe
   dado de negócio (só nomes de função), mas a regra da casa é: nada
   para quem não está logado. */

REVOKE ALL ON public.vw_permissoes_faltando FROM anon, PUBLIC;
GRANT SELECT ON public.vw_permissoes_faltando TO authenticated;
