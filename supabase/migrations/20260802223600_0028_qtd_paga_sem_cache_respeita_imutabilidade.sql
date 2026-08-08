/* ═══════════════════════════════════════════════════════════════════
   0028 — A quantidade paga passa a ser calculada, não cacheada
   ───────────────────────────────────────────────────────────────────
   A 0025 criou `qtd_paga` como cache em `venda_itens` e em
   `remessa_item_eventos`, mantido por gatilho. Só que
   `remessa_item_eventos` é registro histórico IMUTÁVEL — há um gatilho
   que recusa qualquer UPDATE nela, e com razão: é o livro-razão da
   consignação. O cache batia de frente com essa regra.

   Solução: nada de cache. A view soma `recebimento_itens` na hora. O
   volume é pequeno e o resultado nunca pode divergir da verdade.
   ═══════════════════════════════════════════════════════════════════ */

DROP TRIGGER IF EXISTS trg_receb_itens_qtd_paga ON public.recebimento_itens;
DROP FUNCTION IF EXISTS public.trg_fn_atualiza_qtd_paga();
DROP VIEW IF EXISTS public.vw_itens_a_pagar_revendedor;

ALTER TABLE public.remessa_item_eventos DROP COLUMN IF EXISTS qtd_paga;
ALTER TABLE public.venda_itens          DROP COLUMN IF EXISTS qtd_paga;

CREATE VIEW public.vw_itens_a_pagar_revendedor AS
WITH pago AS (
  SELECT ri.venda_item_id, ri.remessa_item_evento_id, SUM(ri.quantidade) AS qtd
    FROM public.recebimento_itens ri
    JOIN public.recebimentos r ON r.id = ri.recebimento_id
   WHERE NOT ri.estornado AND NOT r.estornado
   GROUP BY ri.venda_item_id, ri.remessa_item_evento_id
)
SELECT
  'VENDA'::TEXT                 AS origem,
  v.id                          AS origem_id,
  v.numero                      AS origem_numero,
  v.data_venda                  AS origem_data,
  v.revendedor_id,
  vi.id                         AS venda_item_id,
  NULL::UUID                    AS remessa_item_evento_id,
  vi.produto_id,
  p.codigo                      AS produto_codigo,
  p.nome                        AS produto_nome,
  vi.quantidade                 AS qtd_devida,
  COALESCE(pg.qtd, 0)           AS qtd_paga,
  (vi.quantidade - COALESCE(pg.qtd,0)) AS qtd_em_aberto,
  CASE WHEN vi.quantidade > 0 THEN round(vi.subtotal / vi.quantidade, 2) ELSE 0 END AS valor_unitario,
  round((vi.quantidade - COALESCE(pg.qtd,0))
        * CASE WHEN vi.quantidade > 0 THEN vi.subtotal / vi.quantidade ELSE 0 END, 2) AS valor_em_aberto
FROM public.venda_itens vi
JOIN public.vendas   v ON v.id = vi.venda_id
JOIN public.produtos p ON p.id = vi.produto_id
LEFT JOIN pago pg ON pg.venda_item_id = vi.id
WHERE v.tipo = 'REVENDEDOR'
  AND v.status = 'CONFIRMADO'
  AND vi.quantidade > COALESCE(pg.qtd, 0)

UNION ALL

SELECT
  'PRESTACAO'::TEXT,
  pc.id, pc.numero, pc.data_acerto, pc.revendedor_id,
  NULL::UUID, e.id,
  ri.produto_id, p.codigo, p.nome,
  e.quantidade,
  COALESCE(pg.qtd, 0),
  (e.quantidade - COALESCE(pg.qtd,0)),
  e.valor_unitario,
  round((e.quantidade - COALESCE(pg.qtd,0)) * e.valor_unitario, 2)
FROM public.remessa_item_eventos e
JOIN public.remessa_itens     ri ON ri.id = e.remessa_item_id
JOIN public.prestacoes_contas pc ON pc.id = e.prestacao_id
JOIN public.produtos           p ON p.id = ri.produto_id
LEFT JOIN pago pg ON pg.remessa_item_evento_id = e.id
WHERE e.status_novo = 'VENDIDO'
  AND pc.status = 'CONFIRMADO'
  AND e.quantidade > COALESCE(pg.qtd, 0);

ALTER VIEW public.vw_itens_a_pagar_revendedor SET (security_invoker = on);
REVOKE ALL ON public.vw_itens_a_pagar_revendedor FROM anon, PUBLIC;
GRANT SELECT ON public.vw_itens_a_pagar_revendedor TO authenticated;

COMMENT ON VIEW public.vw_itens_a_pagar_revendedor IS
  'Peças que o revendedor ainda deve, de venda direta ou de prestação de contas. '
  'A quantidade paga é somada de recebimento_itens na hora — sem cache, para não '
  'precisar alterar o livro-razão imutável da consignação.';
