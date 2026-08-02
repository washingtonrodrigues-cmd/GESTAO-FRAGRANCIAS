CREATE OR REPLACE FUNCTION public.fn_perfil_atual()
RETURNS perfil_usuario_enum LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT perfil FROM public.usuarios WHERE id = auth.uid() AND ativo;
$$;

CREATE OR REPLACE FUNCTION public.fn_tem_permissao(p_recurso TEXT, p_acao TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.fn_perfil_atual() = 'ADMIN'
        OR COALESCE((SELECT permitido FROM public.permissoes
             WHERE perfil = public.fn_perfil_atual() AND recurso=p_recurso AND acao=p_acao), false);
$$;

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
  END LOOP; END $$;

-- Exceções ao FORCE: tabelas lidas/escritas por funções SECURITY DEFINER
ALTER TABLE public.usuarios              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.logs_auditoria        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.produtos              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.remessas              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.remessa_itens         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.remessa_item_eventos  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_estoque NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compras               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compra_itens          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendas                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.venda_itens           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.titulos_receber       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_alocacoes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.prestacoes_contas     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.despesas              NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  mapa CONSTANT TEXT[][] := ARRAY[
    ['categorias','produtos'],['marcas','produtos'],['produtos','produtos'],
    ['fornecedores','compras'],['compras','compras'],['compra_itens','compras'],
    ['movimentacoes_estoque','estoque'],['clientes','clientes'],['revendedores','revendedores'],
    ['vendas','vendas'],['venda_itens','vendas'],
    ['remessas','mostruarios'],['remessa_itens','mostruarios'],['remessa_item_eventos','mostruarios'],
    ['prestacoes_contas','revendedores'],
    ['titulos_receber','financeiro'],['recebimentos','financeiro'],
    ['recebimento_alocacoes','financeiro'],['despesas','financeiro'],
    ['formas_pagamento','configuracoes'],['parametros','configuracoes']];
  i INT; tab TEXT; rec TEXT;
BEGIN
  FOR i IN 1..array_length(mapa,1) LOOP
    tab := mapa[i][1]; rec := mapa[i][2];
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated
       USING (public.fn_tem_permissao(%2$L,''ler''));', tab, rec);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated
       WITH CHECK (public.fn_tem_permissao(%2$L,''criar''));', tab, rec);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated
       USING (public.fn_tem_permissao(%2$L,''editar''));', tab, rec);
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated
       USING (public.fn_tem_permissao(%2$L,''excluir''));', tab, rec);
  END LOOP;
END $$;

CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.fn_perfil_atual()='ADMIN');
CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (public.fn_perfil_atual()='ADMIN');
CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.fn_perfil_atual()='ADMIN');

CREATE POLICY permissoes_select ON public.permissoes FOR SELECT TO authenticated USING (true);
CREATE POLICY permissoes_write ON public.permissoes FOR ALL TO authenticated
  USING (public.fn_perfil_atual()='ADMIN') WITH CHECK (public.fn_perfil_atual()='ADMIN');

CREATE POLICY logs_select ON public.logs_auditoria FOR SELECT TO authenticated
  USING (public.fn_perfil_atual() IN ('ADMIN','GERENTE'));

CREATE POLICY notif_select ON public.notificacoes FOR SELECT TO authenticated
  USING (usuario_id IS NULL OR usuario_id = auth.uid());
CREATE POLICY notif_insert ON public.notificacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY notif_update ON public.notificacoes FOR UPDATE TO authenticated
  USING (usuario_id IS NULL OR usuario_id = auth.uid());
CREATE POLICY notif_delete ON public.notificacoes FOR DELETE TO authenticated
  USING (usuario_id IS NULL OR usuario_id = auth.uid());
