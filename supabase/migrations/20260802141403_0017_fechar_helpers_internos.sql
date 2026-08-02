/* 0017 — Fecha a porta dos ajudantes internos.
   Só as 11 funções que a interface realmente chama continuam expostas
   como RPC. Os ajudantes (rateio, custo médio, movimento de estoque,
   geração de parcelas) e as funções de gatilho deixam de ser chamáveis
   pela API — continuam funcionando por dentro, porque quem as executa é
   a função SECURITY DEFINER que as chama, não o usuário logado. */
DO $$
DECLARE
  r RECORD;
  publicas TEXT[] := ARRAY[
    'fn_ajustar_estoque','fn_alterar_vencimento','fn_cancelar_compra','fn_cancelar_venda',
    'fn_confirmar_compra','fn_confirmar_remessa','fn_confirmar_venda','fn_dre',
    'fn_estornar_recebimento','fn_prestar_contas','fn_registrar_recebimento',
    'fn_usuario_atual','fn_perfil_atual','fn_tem_permissao'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (publicas))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.assinatura);
  END LOOP;
END $$;
