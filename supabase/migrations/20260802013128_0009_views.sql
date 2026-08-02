CREATE OR REPLACE VIEW public.vw_produtos AS
SELECT p.*, c.nome AS categoria_nome, m.nome AS marca_nome,
  CASE WHEN p.qtd_total=0 THEN 'ESGOTADO'
       WHEN p.qtd_disponivel>0 THEN 'DISPONIVEL'
       WHEN p.qtd_mostruario>0 THEN 'EM_MOSTRUARIO'
       WHEN p.qtd_consignado>0 THEN 'COM_REVENDEDOR'
       ELSE 'RESERVADO' END AS situacao,
  round(p.qtd_disponivel*p.custo_medio,2) AS valor_estoque_disponivel,
  round(p.qtd_reservado*p.custo_medio,2)  AS valor_reservado,
  round(p.qtd_mostruario*p.custo_medio,2) AS valor_mostruario,
  round(p.qtd_consignado*p.custo_medio,2) AS valor_consignado,
  round(p.qtd_total*p.custo_medio,2)      AS valor_total_custo,
  round(p.qtd_total*p.preco_consumidor,2) AS valor_potencial_venda,
  round(p.qtd_total*p.lucro_consumidor,2) AS lucro_potencial,
  CASE WHEN p.custo_medio>0 THEN round((p.preco_consumidor-p.custo_medio)/p.custo_medio*100,4) ELSE 0 END AS markup_consumidor,
  CASE WHEN p.custo_medio>0 THEN round((p.preco_revendedor-p.custo_medio)/p.custo_medio*100,4) ELSE 0 END AS markup_revendedor,
  (CURRENT_DATE - p.data_ultima_saida) AS dias_sem_venda,
  (p.qtd_disponivel <= p.estoque_minimo) AS estoque_baixo,
  (p.preco_consumidor < p.custo_medio) AS preco_abaixo_custo
FROM public.produtos p
LEFT JOIN public.categorias c ON c.id=p.categoria_id
LEFT JOIN public.marcas m ON m.id=p.marca_id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.vw_titulos_receber AS
SELECT t.*, COALESCE(cl.nome, rv.nome, 'Consumidor não identificado') AS devedor_nome,
  COALESCE(cl.whatsapp, rv.whatsapp) AS devedor_whatsapp,
  v.numero AS venda_numero, pc.numero AS prestacao_numero,
  CASE WHEN t.situacao='CANCELADO' THEN 'CANCELADO'
       WHEN t.saldo<=0 THEN 'PAGO'
       WHEN t.valor_recebido>0 AND t.data_vencimento<CURRENT_DATE THEN 'PARCIAL_VENCIDO'
       WHEN t.valor_recebido>0 THEN 'PARCIAL'
       WHEN t.data_vencimento<CURRENT_DATE THEN 'VENCIDO'
       WHEN t.data_vencimento<=CURRENT_DATE+3 THEN 'VENCE_EM_BREVE'
       ELSE 'A_VENCER' END AS situacao_real,
  (CURRENT_DATE - t.data_vencimento) AS dias_atraso,
  (t.data_vencimento - CURRENT_DATE) AS dias_para_vencer,
  CASE WHEN t.valor_original>0 THEN round(t.lucro_proporcional*(t.valor_recebido/t.valor_original),2) ELSE 0 END AS lucro_recebido,
  CASE WHEN t.valor_original>0 THEN round(t.lucro_proporcional*(t.saldo/t.valor_original),2) ELSE 0 END AS lucro_a_receber
FROM public.titulos_receber t
LEFT JOIN public.clientes cl ON cl.id=t.cliente_id
LEFT JOIN public.revendedores rv ON rv.id=t.revendedor_id
LEFT JOIN public.vendas v ON v.id=t.venda_id
LEFT JOIN public.prestacoes_contas pc ON pc.id=t.prestacao_id;

CREATE OR REPLACE VIEW public.vw_itens_em_posse AS
SELECT r.id AS remessa_id, r.numero AS remessa_numero, r.tipo AS tipo_remessa,
  r.data_envio, r.data_prevista_acerto,
  rv.id AS revendedor_id, rv.nome AS revendedor_nome, rv.whatsapp AS revendedor_whatsapp,
  ri.id AS remessa_item_id, p.id AS produto_id, p.codigo AS produto_codigo,
  p.nome AS produto_nome, p.foto_thumb_url,
  ri.qtd_em_posse, ri.valor_custo_unitario, ri.valor_revenda_unitario,
  round(ri.qtd_em_posse*ri.valor_custo_unitario,2) AS valor_custo_total,
  round(ri.qtd_em_posse*ri.valor_revenda_unitario,2) AS valor_revenda_total,
  (CURRENT_DATE - r.data_envio) AS dias_em_posse,
  (r.data_prevista_acerto IS NOT NULL AND r.data_prevista_acerto < CURRENT_DATE) AS acerto_atrasado
FROM public.remessa_itens ri
JOIN public.remessas r ON r.id=ri.remessa_id AND r.status='CONFIRMADO'
JOIN public.revendedores rv ON rv.id=r.revendedor_id
JOIN public.produtos p ON p.id=ri.produto_id
WHERE ri.qtd_em_posse > 0;

CREATE OR REPLACE VIEW public.vw_resultado_vendas AS
SELECT v.id, v.numero, v.data_venda, v.tipo::TEXT AS tipo,
  COALESCE(cl.nome, rv.nome, 'Consumidor não identificado') AS comprador,
  v.subtotal, v.desconto_valor, v.valor_total AS receita_liquida,
  v.custo_total AS cmv, v.lucro_bruto,
  CASE WHEN v.valor_total>0 THEN round(v.lucro_bruto/v.valor_total*100,2) ELSE 0 END AS margem_percentual,
  COALESCE(t.recebido,0) AS valor_recebido, COALESCE(t.em_aberto,0) AS valor_em_aberto,
  CASE WHEN v.valor_total>0 THEN round(v.lucro_bruto*COALESCE(t.recebido,0)/v.valor_total,2) ELSE 0 END AS lucro_recebido,
  CASE WHEN v.valor_total>0 THEN round(v.lucro_bruto*COALESCE(t.em_aberto,0)/v.valor_total,2) ELSE 0 END AS lucro_a_receber
FROM public.vendas v
LEFT JOIN public.clientes cl ON cl.id=v.cliente_id
LEFT JOIN public.revendedores rv ON rv.id=v.revendedor_id
LEFT JOIN LATERAL (SELECT SUM(valor_recebido) AS recebido, SUM(saldo) AS em_aberto
  FROM public.titulos_receber WHERE venda_id=v.id AND situacao<>'CANCELADO') t ON true
WHERE v.status='CONFIRMADO';

CREATE OR REPLACE VIEW public.vw_resultado_consignacao AS
SELECT pc.id, pc.numero, pc.data_acerto AS data_venda, 'CONSIGNACAO'::TEXT AS tipo,
  rv.nome AS comprador, pc.valor_vendido AS subtotal, 0::NUMERIC(14,2) AS desconto_valor,
  pc.valor_vendido AS receita_liquida, pc.custo_vendido AS cmv, pc.lucro_bruto,
  CASE WHEN pc.valor_vendido>0 THEN round(pc.lucro_bruto/pc.valor_vendido*100,2) ELSE 0 END AS margem_percentual,
  COALESCE(t.recebido,0) AS valor_recebido, COALESCE(t.em_aberto,0) AS valor_em_aberto,
  CASE WHEN pc.valor_devido>0 THEN round(pc.lucro_bruto*COALESCE(t.recebido,0)/pc.valor_devido,2) ELSE 0 END AS lucro_recebido,
  CASE WHEN pc.valor_devido>0 THEN round(pc.lucro_bruto*COALESCE(t.em_aberto,0)/pc.valor_devido,2) ELSE 0 END AS lucro_a_receber
FROM public.prestacoes_contas pc
JOIN public.revendedores rv ON rv.id=pc.revendedor_id
LEFT JOIN LATERAL (SELECT SUM(valor_recebido) AS recebido, SUM(saldo) AS em_aberto
  FROM public.titulos_receber WHERE prestacao_id=pc.id AND situacao<>'CANCELADO') t ON true
WHERE pc.status='CONFIRMADO';

CREATE OR REPLACE VIEW public.vw_resultado_consolidado AS
SELECT id,numero,data_venda,tipo,comprador,subtotal,desconto_valor,receita_liquida,cmv,lucro_bruto,
       margem_percentual,valor_recebido,valor_em_aberto,lucro_recebido,lucro_a_receber
  FROM public.vw_resultado_vendas
UNION ALL
SELECT id,numero,data_venda,tipo,comprador,subtotal,desconto_valor,receita_liquida,cmv,lucro_bruto,
       margem_percentual,valor_recebido,valor_em_aberto,lucro_recebido,lucro_a_receber
  FROM public.vw_resultado_consignacao;

CREATE OR REPLACE VIEW public.vw_extrato_revendedor AS
SELECT rv.id, rv.codigo, rv.nome, rv.whatsapp, rv.telefone, rv.cidade, rv.estado, rv.limite_credito,
  COALESCE(pos.qtd,0) AS qtd_em_posse, COALESCE(pos.custo,0) AS valor_custo_em_posse,
  COALESCE(pos.revenda,0) AS valor_revenda_em_posse, COALESCE(pos.dias,0) AS dias_max_em_posse,
  COALESCE(env.qtd,0) AS qtd_total_recebida,
  COALESCE(evt.qv,0) AS qtd_vendida, COALESCE(evt.qd,0) AS qtd_devolvida, COALESCE(evt.qp,0) AS qtd_perdida,
  COALESCE(evt.vv,0) AS valor_vendido_consignacao,
  COALESCE(vd.vv,0) AS valor_vendido_direto,
  COALESCE(evt.vv,0)+COALESCE(vd.vv,0) AS valor_vendido_total,
  COALESCE(fin.devido,0) AS total_devido, COALESCE(fin.pago,0) AS total_pago,
  COALESCE(fin.aberto,0) AS saldo_aberto, COALESCE(fin.vencido,0) AS saldo_vencido,
  fin.ultimo_pagamento, ac.ultimo_acerto, (CURRENT_DATE - ac.ultimo_acerto) AS dias_desde_ultimo_acerto
FROM public.revendedores rv
LEFT JOIN LATERAL (SELECT SUM(qtd_em_posse) qtd, SUM(valor_custo_total) custo,
    SUM(valor_revenda_total) revenda, MAX(dias_em_posse) dias
  FROM public.vw_itens_em_posse WHERE revendedor_id=rv.id) pos ON true
LEFT JOIN LATERAL (SELECT SUM(ri.quantidade) qtd FROM public.remessa_itens ri
  JOIN public.remessas r ON r.id=ri.remessa_id
  WHERE r.revendedor_id=rv.id AND r.status='CONFIRMADO') env ON true
LEFT JOIN LATERAL (SELECT
    SUM(e.quantidade) FILTER (WHERE e.status_novo='VENDIDO') qv,
    SUM(e.quantidade) FILTER (WHERE e.status_novo IN ('DEVOLVIDO','TROCADO')) qd,
    SUM(e.quantidade) FILTER (WHERE e.status_novo='PERDIDO') qp,
    SUM(e.valor_total) FILTER (WHERE e.status_novo='VENDIDO') vv
  FROM public.remessa_item_eventos e
  JOIN public.remessa_itens ri ON ri.id=e.remessa_item_id
  JOIN public.remessas r ON r.id=ri.remessa_id WHERE r.revendedor_id=rv.id) evt ON true
LEFT JOIN LATERAL (SELECT SUM(valor_total) vv FROM public.vendas
  WHERE revendedor_id=rv.id AND status='CONFIRMADO') vd ON true
LEFT JOIN LATERAL (SELECT SUM(valor_original) devido, SUM(valor_recebido) pago,
    SUM(saldo) FILTER (WHERE situacao='ABERTO') aberto,
    SUM(saldo) FILTER (WHERE situacao='ABERTO' AND data_vencimento<CURRENT_DATE) vencido,
    MAX(data_quitacao) ultimo_pagamento
  FROM public.titulos_receber WHERE revendedor_id=rv.id AND situacao<>'CANCELADO') fin ON true
LEFT JOIN LATERAL (SELECT MAX(data_acerto) ultimo_acerto FROM public.prestacoes_contas
  WHERE revendedor_id=rv.id AND status='CONFIRMADO') ac ON true
WHERE rv.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.vw_dashboard AS
SELECT
  (SELECT COALESCE(SUM(custo_total),0) FROM public.compras WHERE status='CONFIRMADO') AS total_compras,
  (SELECT COALESCE(SUM(subtotal_produtos),0) FROM public.compras WHERE status='CONFIRMADO') AS total_custo_produtos,
  (SELECT COALESCE(SUM(valor_frete),0) FROM public.compras WHERE status='CONFIRMADO') AS total_frete,
  (SELECT COALESCE(SUM(valor_taxa_cartao),0) FROM public.compras WHERE status='CONFIRMADO') AS total_taxa_cartao,
  (SELECT COALESCE(SUM(outros_custos),0) FROM public.compras WHERE status='CONFIRMADO') AS total_outros_custos,
  (SELECT COALESCE(SUM(valor_estoque_disponivel),0) FROM public.vw_produtos) AS valor_estoque_disponivel,
  (SELECT COALESCE(SUM(qtd_disponivel),0) FROM public.vw_produtos) AS qtd_estoque_disponivel,
  (SELECT COUNT(*) FROM public.vw_produtos WHERE qtd_disponivel>0) AS produtos_disponiveis,
  (SELECT COALESCE(SUM(valor_custo_total),0) FROM public.vw_itens_em_posse WHERE tipo_remessa='MOSTRUARIO') AS valor_mostruario,
  (SELECT COALESCE(SUM(valor_custo_total),0) FROM public.vw_itens_em_posse WHERE tipo_remessa='CONSIGNACAO') AS valor_com_revendedores,
  (SELECT COALESCE(SUM(valor_estoque_disponivel+valor_reservado),0) FROM public.vw_produtos)
    + (SELECT COALESCE(SUM(valor_custo_total),0) FROM public.vw_itens_em_posse) AS investimento_total_mercadoria,
  (SELECT COALESCE(SUM(valor_potencial_venda),0) FROM public.vw_produtos) AS potencial_venda_estoque,
  (SELECT COALESCE(SUM(receita_liquida),0) FROM public.vw_resultado_consolidado) AS total_vendido,
  (SELECT COALESCE(SUM(valor_total),0) FROM public.vendas WHERE status='CONFIRMADO' AND tipo='CONSUMIDOR') AS total_vendido_consumidor,
  (SELECT COALESCE(SUM(valor_total),0) FROM public.vendas WHERE status='CONFIRMADO' AND tipo='REVENDEDOR') AS total_vendido_revendedor_direto,
  (SELECT COALESCE(SUM(valor_vendido),0) FROM public.prestacoes_contas WHERE status='CONFIRMADO') AS total_vendido_consignacao,
  (SELECT COUNT(*) FROM public.vw_resultado_consolidado) AS qtd_vendas,
  (SELECT COALESCE(SUM(desconto_valor),0) FROM public.vendas WHERE status='CONFIRMADO') AS total_descontos,
  (SELECT CASE WHEN COUNT(*)>0 THEN round(SUM(receita_liquida)/COUNT(*),2) ELSE 0 END FROM public.vw_resultado_consolidado) AS ticket_medio,
  (SELECT COALESCE(SUM(lucro_bruto),0) FROM public.vw_resultado_consolidado) AS lucro_bruto,
  (SELECT COALESCE(SUM(lucro_recebido),0) FROM public.vw_resultado_consolidado) AS lucro_recebido,
  (SELECT COALESCE(SUM(lucro_a_receber),0) FROM public.vw_resultado_consolidado) AS lucro_a_receber,
  (SELECT COALESCE(SUM(valor),0) FROM public.despesas WHERE deleted_at IS NULL) AS total_despesas,
  (SELECT COALESCE(SUM(lucro_bruto),0) FROM public.vw_resultado_consolidado)
    - (SELECT COALESCE(SUM(valor),0) FROM public.despesas WHERE deleted_at IS NULL) AS lucro_liquido,
  (SELECT CASE WHEN COALESCE(SUM(receita_liquida),0)>0 THEN round(SUM(lucro_bruto)/SUM(receita_liquida)*100,2) ELSE 0 END
     FROM public.vw_resultado_consolidado) AS margem_bruta_percentual,
  (SELECT COALESCE(SUM(saldo),0) FROM public.titulos_receber WHERE situacao='ABERTO') AS total_a_receber,
  (SELECT COALESCE(SUM(saldo),0) FROM public.titulos_receber WHERE situacao='ABERTO' AND data_vencimento<CURRENT_DATE) AS total_vencido,
  (SELECT COALESCE(SUM(saldo),0) FROM public.titulos_receber WHERE situacao='ABERTO' AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE+7) AS total_a_vencer_7d,
  (SELECT COUNT(*) FROM public.titulos_receber WHERE situacao='ABERTO' AND data_vencimento<CURRENT_DATE) AS qtd_titulos_vencidos,
  (SELECT COALESCE(SUM(valor_total),0) FROM public.recebimentos WHERE NOT estornado) AS total_recebido_caixa,
  (SELECT CASE WHEN COALESCE(SUM(saldo),0)>0
       THEN round(COALESCE(SUM(saldo) FILTER (WHERE data_vencimento<CURRENT_DATE),0)/SUM(saldo)*100,2) ELSE 0 END
     FROM public.titulos_receber WHERE situacao='ABERTO') AS inadimplencia_percentual,
  (SELECT COUNT(*) FROM public.vw_itens_em_posse WHERE dias_em_posse > 60) AS qtd_mostruarios_antigos,
  (SELECT COUNT(*) FROM public.vw_produtos WHERE qtd_disponivel>0
     AND (data_ultima_saida IS NULL OR data_ultima_saida < CURRENT_DATE-60)) AS qtd_produtos_parados;

CREATE OR REPLACE VIEW public.vw_produtos_mais_vendidos AS
SELECT p.id,p.codigo,p.nome,p.foto_thumb_url,
  SUM(vi.quantidade) AS qtd_vendida, SUM(vi.subtotal) AS valor_vendido, SUM(vi.lucro_item) AS lucro_gerado
FROM public.venda_itens vi
JOIN public.vendas v ON v.id=vi.venda_id AND v.status='CONFIRMADO'
JOIN public.produtos p ON p.id=vi.produto_id
GROUP BY p.id,p.codigo,p.nome,p.foto_thumb_url ORDER BY qtd_vendida DESC;

CREATE OR REPLACE VIEW public.vw_produtos_parados AS
SELECT id,codigo,nome,foto_thumb_url,qtd_disponivel,valor_estoque_disponivel,data_ultima_saida,
  COALESCE(dias_sem_venda,9999) AS dias_sem_venda
FROM public.vw_produtos WHERE qtd_disponivel>0
  AND (data_ultima_saida IS NULL OR data_ultima_saida < CURRENT_DATE-60)
ORDER BY dias_sem_venda DESC NULLS FIRST;

CREATE OR REPLACE VIEW public.vw_ranking_revendedores AS
SELECT id,nome,cidade,estado,whatsapp,valor_vendido_total,qtd_em_posse,valor_custo_em_posse,
  saldo_aberto,saldo_vencido FROM public.vw_extrato_revendedor ORDER BY valor_vendido_total DESC NULLS LAST;

CREATE OR REPLACE VIEW public.vw_ranking_clientes AS
SELECT c.id,c.nome,c.whatsapp,COUNT(v.id) AS qtd_compras,
  COALESCE(SUM(v.valor_total),0) AS valor_total_comprado, MAX(v.data_venda) AS ultima_compra
FROM public.clientes c
LEFT JOIN public.vendas v ON v.cliente_id=c.id AND v.status='CONFIRMADO'
WHERE c.deleted_at IS NULL GROUP BY c.id,c.nome,c.whatsapp
ORDER BY valor_total_comprado DESC;

CREATE OR REPLACE VIEW public.vw_evolucao_vendas AS
SELECT date_trunc('month',data_venda)::DATE AS mes, COUNT(*) AS qtd_operacoes,
  SUM(receita_liquida) AS receita, SUM(cmv) AS cmv, SUM(lucro_bruto) AS lucro_bruto
FROM public.vw_resultado_consolidado GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW public.vw_fluxo_caixa AS
SELECT data, SUM(entrada) AS entradas, SUM(saida) AS saidas,
  SUM(entrada)-SUM(saida) AS saldo_dia,
  SUM(SUM(entrada)-SUM(saida)) OVER (ORDER BY data) AS saldo_acumulado
FROM (
  SELECT data_recebimento AS data, valor_total AS entrada, 0::NUMERIC AS saida
    FROM public.recebimentos WHERE NOT estornado
  UNION ALL SELECT COALESCE(data_pagamento,data_despesa),0,valor FROM public.despesas WHERE deleted_at IS NULL
  UNION ALL SELECT data_compra,0,custo_total FROM public.compras WHERE status='CONFIRMADO'
) x GROUP BY data ORDER BY data;

CREATE OR REPLACE VIEW public.vw_fluxo_caixa_projetado AS
SELECT data, SUM(entrada) AS entradas_previstas, SUM(saida) AS saidas_previstas,
  SUM(entrada)-SUM(saida) AS saldo_dia,
  SUM(SUM(entrada)-SUM(saida)) OVER (ORDER BY data) AS saldo_acumulado
FROM (
  SELECT data_vencimento AS data, saldo AS entrada, 0::NUMERIC AS saida
    FROM public.titulos_receber WHERE situacao='ABERTO' AND data_vencimento>=CURRENT_DATE
  UNION ALL SELECT (data_despesa + INTERVAL '1 month')::DATE,0,valor
    FROM public.despesas WHERE deleted_at IS NULL AND recorrente
) x GROUP BY data ORDER BY data;

CREATE OR REPLACE VIEW public.vw_kardex AS
SELECT m.*, p.codigo AS produto_codigo, p.nome AS produto_nome,
  (m.estorno_de_id IS NOT NULL) AS e_estorno,
  EXISTS (SELECT 1 FROM public.movimentacoes_estoque e WHERE e.estorno_de_id=m.id) AS foi_estornado
FROM public.movimentacoes_estoque m JOIN public.produtos p ON p.id=m.produto_id;

CREATE OR REPLACE FUNCTION public.fn_dre(p_inicio DATE, p_fim DATE)
RETURNS TABLE (receita_bruta NUMERIC, descontos NUMERIC, receita_liquida NUMERIC, cmv NUMERIC,
  lucro_bruto NUMERIC, despesas_fixas NUMERIC, despesas_variaveis NUMERIC, despesas_total NUMERIC,
  lucro_liquido NUMERIC, margem_bruta NUMERIC, margem_liquida NUMERIC,
  lucro_recebido NUMERIC, lucro_a_receber NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH res AS (SELECT COALESCE(SUM(receita_liquida),0) rl, COALESCE(SUM(cmv),0) cmv,
    COALESCE(SUM(lucro_bruto),0) lb, COALESCE(SUM(lucro_recebido),0) lr,
    COALESCE(SUM(lucro_a_receber),0) lar
  FROM public.vw_resultado_consolidado WHERE data_venda BETWEEN p_inicio AND p_fim),
dv AS (SELECT COALESCE(SUM(desconto_valor),0) d FROM public.vendas
  WHERE status='CONFIRMADO' AND data_venda BETWEEN p_inicio AND p_fim),
ds AS (SELECT COALESCE(SUM(valor) FILTER (WHERE natureza='FIXA'),0) fx,
    COALESCE(SUM(valor) FILTER (WHERE natureza='VARIAVEL'),0) vr
  FROM public.despesas WHERE deleted_at IS NULL AND data_despesa BETWEEN p_inicio AND p_fim)
SELECT res.rl+dv.d, dv.d, res.rl, res.cmv, res.lb, ds.fx, ds.vr, ds.fx+ds.vr,
  res.lb-(ds.fx+ds.vr),
  CASE WHEN res.rl>0 THEN round(res.lb/res.rl*100,4) ELSE 0 END,
  CASE WHEN res.rl>0 THEN round((res.lb-(ds.fx+ds.vr))/res.rl*100,4) ELSE 0 END,
  res.lr, res.lar
FROM res, dv, ds;
$$;
