-- ═══════════════════════════════════════════════════════════════════
-- 0011 — Dados iniciais
-- ───────────────────────────────────────────────────────────────────
-- ATENÇÃO: a versão original desta migração criava o usuário
-- administrador com e-mail e senha escritos diretamente no arquivo.
-- Isso foi removido antes de publicar o repositório: credencial não
-- entra em código-fonte.
--
-- O usuário administrador se cria pelo painel do Supabase, em
-- Authentication → Users → Add user (marcando "Auto Confirm User").
-- A migração 0019 tem um gatilho que, no mesmo instante, cria o perfil
-- correspondente em public.usuarios — o primeiro usuário do sistema
-- entra como ADMIN, os seguintes como VENDEDOR.
-- ═══════════════════════════════════════════════════════════════════

-- ── Formas de pagamento ──────────────────────────────────────────────
INSERT INTO public.formas_pagamento (nome, permite_parcelar, max_parcelas, taxa_percentual, prazo_compensacao_dias) VALUES
 ('Dinheiro', false, 1, 0.0000, 0),
 ('PIX', false, 1, 0.0000, 0),
 ('Cartão de Débito', false, 1, 1.9900, 1),
 ('Cartão de Crédito', true, 4, 3.4900, 30),
 ('Transferência', false, 1, 0.0000, 1),
 ('Crediário da loja', true, 4, 0.0000, 0)
ON CONFLICT DO NOTHING;

-- ── Categorias ───────────────────────────────────────────────────────
INSERT INTO public.categorias (nome, descricao) VALUES
 ('Perfume Masculino','Fragrâncias masculinas'),
 ('Perfume Feminino','Fragrâncias femininas'),
 ('Perfume Unissex','Fragrâncias unissex'),
 ('Body Splash','Body splash e colônias'),
 ('Kit / Presente','Kits e caixas de presente'),
 ('Hidratante','Cremes e hidratantes'),
 ('Acessórios','Necessaires, frascos, embalagens')
ON CONFLICT DO NOTHING;

-- ── Parâmetros do sistema ────────────────────────────────────────────
-- empresa_nome e empresa_slogan aparecem no cabeçalho dos documentos.
-- Os demais campos da empresa ficam em branco e são preenchidos pela
-- própria tela de Configurações.
INSERT INTO public.parametros (chave, valor, tipo, descricao, grupo) VALUES
 ('empresa_nome','ESSENZA AURA','texto','Nome exibido em recibos e relatórios','empresa'),
 ('empresa_slogan','Fragrâncias que transformam pessoas e ambientes','texto','Slogan dos documentos impressos','empresa'),
 ('empresa_documento','','texto','CPF/CNPJ da empresa','empresa'),
 ('empresa_telefone','','texto','Telefone de contato','empresa'),
 ('empresa_endereco','','texto','Endereço no cabeçalho dos documentos','empresa'),
 ('empresa_pix','','texto','Chave PIX usada nas mensagens de cobrança','empresa'),
 ('max_parcelas','4','numero','Número máximo de parcelas','vendas'),
 ('intervalo_parcelas_dias','30','numero','Dias entre parcelas','vendas'),
 ('desconto_max_sem_aprovacao','10','numero','Desconto % acima do qual pede confirmação','vendas'),
 ('dias_alerta_vencimento','3','numero','Antecedência do alerta de vencimento','financeiro'),
 ('dias_mostruario_alerta','60','numero','Dias em posse que geram alerta','mostruario'),
 ('dias_produto_parado','60','numero','Dias sem venda para marcar como parado','estoque'),
 ('criterio_rateio_padrao','VALOR','texto','Critério padrão de rateio de custos','compras'),
 ('markup_padrao_consumidor','100','numero','Markup % sugerido para consumidor','produtos'),
 ('markup_padrao_revendedor','50','numero','Markup % sugerido para revendedor','produtos')
ON CONFLICT (chave) DO NOTHING;

-- ── Permissões do perfil ADMIN ───────────────────────────────────────
INSERT INTO public.permissoes (perfil, recurso, acao, permitido)
SELECT 'ADMIN', r, a, true
FROM unnest(ARRAY['dashboard','produtos','compras','estoque','clientes','revendedores',
                  'mostruarios','vendas','financeiro','relatorios','configuracoes']) r
CROSS JOIN unnest(ARRAY['ler','criar','editar','excluir','cancelar','estornar','exportar']) a
ON CONFLICT DO NOTHING;
