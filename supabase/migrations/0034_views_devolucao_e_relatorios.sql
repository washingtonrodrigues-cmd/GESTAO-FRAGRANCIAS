-- 0034 — Views líquidas de devolução e a view dos três relatórios do revendedor.
--
-- Atenção ao recriar: CREATE OR REPLACE VIEW só permite ACRESCENTAR colunas no
-- fim e exige tipo idêntico ao da versão anterior — por isso os casts
-- explícitos em receita_liquida, cmv, lucro_bruto e qtd_devida.

-- Receita, CMV e lucro líquidos de devolução (RN-V13).
CREATE OR REPLACE VIEW public.vw_resultado_vendas
WITH (security_invoker = on) AS
 SELECT v.id, v.numero, v.data_venda, (v.tipo)::text AS tipo,
    COALESCE(cl.nome, rv.nome, 'Consumidor não identificado'::text) AS comprador,
    v.subtotal, v.desconto_valor,
    ((v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric)))::numeric(14,2) AS receita_liquida,
    ((v.custo_total - COALESCE(v.custo_devolvido,(0)::numeric)))::numeric(14,2) AS cmv,
    (((v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))
     - (v.custo_total - COALESCE(v.custo_devolvido,(0)::numeric))))::numeric(14,2) AS lucro_bruto,
        CASE WHEN (v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric)) > (0)::numeric
             THEN round(((((v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))
                          - (v.custo_total - COALESCE(v.custo_devolvido,(0)::numeric)))
                        / (v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))) * (100)::numeric), 2)
             ELSE (0)::numeric END AS margem_percentual,
    COALESCE(t.recebido, (0)::numeric) AS valor_recebido,
    COALESCE(t.em_aberto, (0)::numeric) AS valor_em_aberto,
        CASE WHEN (v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric)) > (0)::numeric
             THEN round(((((v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))
                          - (v.custo_total - COALESCE(v.custo_devolvido,(0)::numeric)))
                        * COALESCE(t.recebido, (0)::numeric))
                        / (v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))), 2)
             ELSE (0)::numeric END AS lucro_recebido,
        CASE WHEN (v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric)) > (0)::numeric
             THEN round(((((v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))
                          - (v.custo_total - COALESCE(v.custo_devolvido,(0)::numeric)))
                        * COALESCE(t.em_aberto, (0)::numeric))
                        / (v.valor_total - COALESCE(v.valor_devolvido,(0)::numeric))), 2)
             ELSE (0)::numeric END AS lucro_a_receber
   FROM (((vendas v
     LEFT JOIN clientes cl ON ((cl.id = v.cliente_id)))
     LEFT JOIN revendedores rv ON ((rv.id = v.revendedor_id)))
     LEFT JOIN LATERAL ( SELECT sum(titulos_receber.valor_recebido) AS recebido,
            sum(titulos_receber.saldo) AS em_aberto
           FROM titulos_receber
          WHERE ((titulos_receber.venda_id = v.id)
             AND (titulos_receber.situacao <> 'CANCELADO'::situacao_titulo_enum))) t ON (true))
  WHERE (v.status = 'CONFIRMADO'::status_documento_enum);

-- Peça devolvida sai da lista do que ele tem a pagar.
CREATE OR REPLACE VIEW public.vw_itens_a_pagar_revendedor
WITH (security_invoker = on) AS
 WITH pago AS (
         SELECT ri.venda_item_id, ri.remessa_item_evento_id, sum(ri.quantidade) AS qtd
           FROM (recebimento_itens ri JOIN recebimentos r ON ((r.id = ri.recebimento_id)))
          WHERE ((NOT ri.estornado) AND (NOT r.estornado))
          GROUP BY ri.venda_item_id, ri.remessa_item_evento_id
        )
 SELECT 'VENDA'::text AS origem, v.id AS origem_id, v.numero AS origem_numero,
    v.data_venda AS origem_data, v.revendedor_id, vi.id AS venda_item_id,
    NULL::uuid AS remessa_item_evento_id, vi.produto_id,
    p.codigo AS produto_codigo, p.nome AS produto_nome,
    ((vi.quantidade - COALESCE(vi.qtd_devolvida,(0)::numeric)))::numeric(14,3) AS qtd_devida,
    COALESCE(pg.qtd, (0)::numeric) AS qtd_paga,
    ((vi.quantidade - COALESCE(vi.qtd_devolvida,(0)::numeric)) - COALESCE(pg.qtd, (0)::numeric)) AS qtd_em_aberto,
        CASE WHEN (vi.quantidade > (0)::numeric) THEN round((vi.subtotal / vi.quantidade), 2)
             ELSE (0)::numeric END AS valor_unitario,
    round((((vi.quantidade - COALESCE(vi.qtd_devolvida,(0)::numeric)) - COALESCE(pg.qtd, (0)::numeric)) *
        CASE WHEN (vi.quantidade > (0)::numeric) THEN (vi.subtotal / vi.quantidade)
             ELSE (0)::numeric END), 2) AS valor_em_aberto
   FROM (((venda_itens vi
     JOIN vendas v ON ((v.id = vi.venda_id)))
     JOIN produtos p ON ((p.id = vi.produto_id)))
     LEFT JOIN pago pg ON ((pg.venda_item_id = vi.id)))
  WHERE ((v.tipo = 'REVENDEDOR'::tipo_venda_enum)
     AND (v.status = 'CONFIRMADO'::status_documento_enum)
     AND ((vi.quantidade - COALESCE(vi.qtd_devolvida,(0)::numeric)) > COALESCE(pg.qtd, (0)::numeric)))
UNION ALL
 SELECT 'PRESTACAO'::text, pc.id, pc.numero, pc.data_acerto, pc.revendedor_id, NULL::uuid,
    e.id, ri.produto_id, p.codigo, p.nome,
    e.quantidade, COALESCE(pg.qtd, (0)::numeric),
    (e.quantidade - COALESCE(pg.qtd, (0)::numeric)), e.valor_unitario,
    round(((e.quantidade - COALESCE(pg.qtd, (0)::numeric)) * e.valor_unitario), 2)
   FROM ((((remessa_item_eventos e
     JOIN remessa_itens ri ON ((ri.id = e.remessa_item_id)))
     JOIN prestacoes_contas pc ON ((pc.id = e.prestacao_id)))
     JOIN produtos p ON ((p.id = ri.produto_id)))
     LEFT JOIN pago pg ON ((pg.remessa_item_evento_id = e.id)))
  WHERE ((e.status_novo = 'VENDIDO'::status_item_remessa_enum)
     AND (pc.status = 'CONFIRMADO'::status_documento_enum)
     AND (e.quantidade > COALESCE(pg.qtd, (0)::numeric)));

CREATE OR REPLACE VIEW public.vw_creditos
WITH (security_invoker = on) AS
 SELECT c.id, c.numero, c.tipo_devedor, c.cliente_id, c.revendedor_id,
    COALESCE(cl.nome, rv.nome) AS devedor_nome,
    COALESCE(cl.whatsapp, rv.whatsapp) AS devedor_whatsapp,
    c.origem_tabela, c.origem_id, c.valor, c.valor_utilizado, c.saldo,
    c.data_credito, c.motivo, c.observacoes, c.created_at
   FROM ((creditos c
     LEFT JOIN clientes cl ON ((cl.id = c.cliente_id)))
     LEFT JOIN revendedores rv ON ((rv.id = c.revendedor_id)));

CREATE OR REPLACE VIEW public.vw_compras_a_pagar
WITH (security_invoker = on) AS
SELECT c.id, c.numero, c.data_compra, c.data_pagamento, c.pago,
       f.nome AS fornecedor_nome, fp.nome AS forma_pagamento,
       c.subtotal_produtos, c.valor_frete, c.valor_taxa_cartao, c.outros_custos, c.custo_total,
       c.numero_documento, c.observacoes,
       CASE WHEN c.pago THEN 'PAGO'
            WHEN c.data_pagamento IS NULL THEN 'SEM_DATA'
            WHEN c.data_pagamento < CURRENT_DATE THEN 'VENCIDO'
            WHEN c.data_pagamento <= CURRENT_DATE + 7 THEN 'VENCE_EM_BREVE'
            ELSE 'A_VENCER' END AS situacao,
       (c.data_pagamento - CURRENT_DATE) AS dias_para_pagar
  FROM public.compras c
  JOIN public.fornecedores f ON f.id = c.fornecedor_id
  LEFT JOIN public.formas_pagamento fp ON fp.id = c.forma_pagamento_id
 WHERE c.status = 'CONFIRMADO'::status_documento_enum;

-- ═══ Tudo o que já passou pela mão de cada revendedor ═══
-- Uma linha por SITUAÇÃO: um item vendido com 3 pagas, 2 devolvidas e 5 em
-- aberto vira três linhas. É o que permite que os três relatórios (geral,
-- pagos, a pagar) sejam o mesmo dado com um filtro diferente.
--
-- O revendedor paga de dois jeitos: por peça (fica gravado em
-- recebimento_itens) ou por valor total (só entra dinheiro na parcela). Para o
-- relatório de "produtos pagos" funcionar nos dois casos, o dinheiro que
-- entrou sem peça amarrada é distribuído pelos itens ainda em aberto do mesmo
-- documento, na ordem.
DROP VIEW IF EXISTS public.vw_itens_revendedor;
CREATE VIEW public.vw_itens_revendedor
WITH (security_invoker = on) AS
WITH pago AS (
  SELECT ri.venda_item_id, ri.remessa_item_evento_id, sum(ri.quantidade) AS qtd
    FROM recebimento_itens ri JOIN recebimentos r ON r.id = ri.recebimento_id
   WHERE NOT ri.estornado AND NOT r.estornado
   GROUP BY ri.venda_item_id, ri.remessa_item_evento_id
),
item AS (
  SELECT 'VENDA'::text AS origem, v.id AS doc_id, v.numero AS doc_numero, v.data_venda AS doc_data,
         v.revendedor_id, vi.id AS item_id, vi.produto_id,
         CASE WHEN vi.quantidade > 0 THEN round(vi.subtotal / vi.quantidade, 2) ELSE 0 END AS vu,
         (vi.quantidade - COALESCE(vi.qtd_devolvida,0)) AS liquido,
         LEAST(COALESCE(pg.qtd,0), vi.quantidade - COALESCE(vi.qtd_devolvida,0)) AS pago_peca,
         COALESCE(vi.qtd_devolvida,0) AS devolvida
    FROM venda_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    LEFT JOIN pago pg ON pg.venda_item_id = vi.id
   WHERE v.tipo = 'REVENDEDOR'::tipo_venda_enum AND v.status = 'CONFIRMADO'::status_documento_enum
  UNION ALL
  SELECT 'PRESTACAO', pc.id, pc.numero, e.data_evento, pc.revendedor_id,
         e.id, ri.produto_id, e.valor_unitario, e.quantidade,
         LEAST(COALESCE(pg.qtd,0), e.quantidade), 0
    FROM remessa_item_eventos e
    JOIN remessa_itens ri ON ri.id = e.remessa_item_id
    JOIN prestacoes_contas pc ON pc.id = e.prestacao_id
    LEFT JOIN pago pg ON pg.remessa_item_evento_id = e.id
   WHERE e.status_novo = 'VENDIDO'::status_item_remessa_enum
     AND pc.status = 'CONFIRMADO'::status_documento_enum
),
recebido AS (
  SELECT 'VENDA'::text AS origem, venda_id AS doc_id, SUM(valor_recebido) AS valor
    FROM titulos_receber WHERE venda_id IS NOT NULL AND situacao <> 'CANCELADO' GROUP BY venda_id
  UNION ALL
  SELECT 'PRESTACAO', prestacao_id, SUM(valor_recebido)
    FROM titulos_receber WHERE prestacao_id IS NOT NULL AND situacao <> 'CANCELADO' GROUP BY prestacao_id
),
base AS (
  SELECT i.*,
         round(i.pago_peca * i.vu, 2) AS valor_peca,
         round((i.liquido - i.pago_peca) * i.vu, 2) AS valor_restante,
         GREATEST(0, COALESCE(rc.valor,0) - COALESCE(ex.valor,0)) AS sobra_doc
    FROM item i
    LEFT JOIN recebido rc ON rc.origem = i.origem AND rc.doc_id = i.doc_id
    LEFT JOIN LATERAL (SELECT SUM(round(i2.pago_peca * i2.vu, 2)) AS valor
                         FROM item i2 WHERE i2.origem = i.origem AND i2.doc_id = i.doc_id) ex ON true
),
distribuido AS (
  SELECT b.*,
         COALESCE(SUM(b.valor_restante) OVER (PARTITION BY b.origem, b.doc_id
                    ORDER BY b.item_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS antes
    FROM base b
),
final AS (
  SELECT d.*, GREATEST(0, LEAST(d.valor_restante, d.sobra_doc - d.antes)) AS valor_por_dinheiro
    FROM distribuido d
),
linhas AS (
  SELECT f.revendedor_id, f.origem, f.doc_id AS origem_id, f.doc_numero AS origem_numero, f.doc_data AS data,
         f.produto_id, 'PAGO'::text AS situacao,
         CASE WHEN f.vu > 0 THEN round((f.valor_peca + f.valor_por_dinheiro) / f.vu, 3) ELSE f.pago_peca END AS quantidade,
         f.vu AS valor_unitario, (f.valor_peca + f.valor_por_dinheiro) AS valor_total, true AS cobravel
    FROM final f WHERE (f.valor_peca + f.valor_por_dinheiro) > 0
  UNION ALL
  SELECT f.revendedor_id, f.origem, f.doc_id, f.doc_numero, f.doc_data, f.produto_id, 'A_PAGAR',
         CASE WHEN f.vu > 0 THEN round((f.valor_restante - f.valor_por_dinheiro) / f.vu, 3)
              ELSE (f.liquido - f.pago_peca) END,
         f.vu, (f.valor_restante - f.valor_por_dinheiro), true
    FROM final f WHERE (f.valor_restante - f.valor_por_dinheiro) > 0
  UNION ALL
  SELECT f.revendedor_id, 'VENDA', f.doc_id, f.doc_numero, f.doc_data, f.produto_id, 'DEVOLVIDO',
         f.devolvida, f.vu, round(f.devolvida * f.vu, 2), false
    FROM final f WHERE f.origem = 'VENDA' AND f.devolvida > 0
  UNION ALL
  SELECT r.revendedor_id,
         CASE WHEN r.tipo='MOSTRUARIO' THEN 'MOSTRUARIO' ELSE 'CONSIGNACAO' END,
         NULL::uuid, r.numero, e.data_evento, ri.produto_id,
         CASE WHEN e.status_novo IN ('DEVOLVIDO','TROCADO') THEN 'DEVOLVIDO'
              WHEN e.status_novo = 'PERDIDO' THEN 'PERDIDO'
              ELSE 'AMOSTRA_FINALIZADA' END,
         e.quantidade, ri.valor_revenda_unitario,
         round(e.quantidade * ri.valor_revenda_unitario, 2), false
    FROM remessa_item_eventos e
    JOIN remessa_itens ri ON ri.id = e.remessa_item_id
    JOIN remessas r ON r.id = ri.remessa_id
   WHERE r.status = 'CONFIRMADO'::status_documento_enum
     AND e.status_novo IN ('DEVOLVIDO','TROCADO','PERDIDO','FINALIZADO','BAIXADO')
  UNION ALL
  SELECT r.revendedor_id,
         CASE WHEN r.tipo='MOSTRUARIO' THEN 'MOSTRUARIO' ELSE 'CONSIGNACAO' END,
         NULL::uuid, r.numero, r.data_envio, ri.produto_id,
         CASE WHEN r.tipo='MOSTRUARIO' THEN 'AMOSTRA' ELSE 'EM_POSSE' END,
         ri.qtd_em_posse, ri.valor_revenda_unitario,
         round(ri.qtd_em_posse * ri.valor_revenda_unitario, 2), false
    FROM remessa_itens ri JOIN remessas r ON r.id = ri.remessa_id
   WHERE r.status = 'CONFIRMADO'::status_documento_enum AND ri.qtd_em_posse > 0
)
SELECT l.revendedor_id, rv.nome AS revendedor_nome, rv.whatsapp AS revendedor_whatsapp,
       l.origem, l.origem_id, l.origem_numero, l.data,
       CASE l.origem WHEN 'VENDA' THEN 'Venda nº ' || l.origem_numero
                     WHEN 'PRESTACAO' THEN 'Acerto nº ' || l.origem_numero
                     ELSE 'Remessa nº ' || l.origem_numero END AS documento,
       l.produto_id, p.codigo AS produto_codigo, p.nome AS produto_nome, p.tamanho AS produto_tamanho,
       l.situacao,
       CASE l.situacao WHEN 'PAGO' THEN 'Pago'
                       WHEN 'A_PAGAR' THEN 'A pagar'
                       WHEN 'DEVOLVIDO' THEN 'Devolvido'
                       WHEN 'PERDIDO' THEN 'Perdido'
                       WHEN 'EM_POSSE' THEN 'Em posse'
                       WHEN 'AMOSTRA' THEN 'Mostruário'
                       ELSE 'Mostruário finalizado' END AS situacao_label,
       l.quantidade, l.valor_unitario, l.valor_total, l.cobravel,
       CASE WHEN l.cobravel THEN l.valor_total ELSE 0 END AS valor_cobravel
  FROM linhas l
  JOIN revendedores rv ON rv.id = l.revendedor_id
  JOIN produtos p ON p.id = l.produto_id
 WHERE l.quantidade > 0;

-- Saldo de crédito na ficha do revendedor (coluna nova no fim).
CREATE OR REPLACE VIEW public.vw_extrato_revendedor
WITH (security_invoker = on) AS
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
  fin.ultimo_pagamento, ac.ultimo_acerto, (CURRENT_DATE - ac.ultimo_acerto) AS dias_desde_ultimo_acerto,
  COALESCE(cr.saldo_credito,0) AS saldo_credito
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
LEFT JOIN LATERAL (SELECT SUM(valor_total - COALESCE(valor_devolvido,0)) vv FROM public.vendas
  WHERE revendedor_id=rv.id AND status='CONFIRMADO') vd ON true
LEFT JOIN LATERAL (SELECT SUM(valor_original) devido, SUM(valor_recebido) pago,
    SUM(saldo) FILTER (WHERE situacao='ABERTO') aberto,
    SUM(saldo) FILTER (WHERE situacao='ABERTO' AND data_vencimento<CURRENT_DATE) vencido,
    MAX(data_quitacao) ultimo_pagamento
  FROM public.titulos_receber WHERE revendedor_id=rv.id AND situacao<>'CANCELADO') fin ON true
LEFT JOIN LATERAL (SELECT MAX(data_acerto) ultimo_acerto FROM public.prestacoes_contas
  WHERE revendedor_id=rv.id AND status='CONFIRMADO') ac ON true
LEFT JOIN LATERAL (SELECT SUM(saldo) saldo_credito FROM public.creditos
  WHERE revendedor_id=rv.id AND saldo>0) cr ON true
WHERE rv.deleted_at IS NULL;

-- Dashboard: a quebra por canal também fica líquida de devolução, senão não
-- fecha com o total, que já vem líquido da vw_resultado_consolidado.
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_viewdef('public.vw_dashboard'::regclass, true) INTO d;
  IF position('sum(vendas.valor_total)' IN d) > 0 THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_dashboard WITH (security_invoker = on) AS '
      || replace(d, 'sum(vendas.valor_total)',
                    'sum(vendas.valor_total - COALESCE(vendas.valor_devolvido, (0)::numeric))');
  END IF;
END $do$;

REVOKE ALL ON public.vw_itens_revendedor, public.vw_creditos, public.vw_compras_a_pagar,
              public.vw_extrato_revendedor FROM PUBLIC, anon;
GRANT SELECT ON public.vw_itens_revendedor, public.vw_creditos, public.vw_compras_a_pagar,
                public.vw_extrato_revendedor TO authenticated;
