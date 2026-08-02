/* ═══════════════════════════════════════════════════════════════════
   0020 — Corrige regressão introduzida pela migração 0017
   ───────────────────────────────────────────────────────────────────
   A 0017 revogou EXECUTE de todas as funções que a interface não chama
   diretamente. Isso foi correto para os ajudantes internos, que só são
   chamados de dentro de funções SECURITY DEFINER — ali o Postgres não
   checa a permissão de quem disparou a operação.

   Mas `fn_norm` é diferente: ela aparece em SETE ÍNDICES, e expressão
   de índice É avaliada com a permissão de quem faz o INSERT/UPDATE.
   Resultado: gravar produto, cliente, revendedor, fornecedor, categoria
   ou marca passou a falhar com

       permission denied for function fn_norm

   `fn_norm` é IMMUTABLE, STRICT, sem SECURITY DEFINER, e só faz
   lower(unaccent(texto)) — não lê nem escreve dado nenhum. Expor o
   EXECUTE não abre superfície de ataque alguma.
   ═══════════════════════════════════════════════════════════════════ */

GRANT EXECUTE ON FUNCTION public.fn_norm(text) TO authenticated;

COMMENT ON FUNCTION public.fn_norm(text) IS
  'Normaliza texto para busca (minúsculas, sem acento). Usada em 7 índices — '
  'o EXECUTE precisa ficar concedido a authenticated, senão todo INSERT/UPDATE '
  'nas tabelas indexadas falha. Ver migração 0020.';

/* ── Rede de proteção ───────────────────────────────────────────────
   Se alguém repetir um REVOKE em massa no futuro, esta view acusa antes
   de quebrar: lista funções sem EXECUTE para `authenticated` que apareçam
   em índice, constraint, default, coluna gerada ou view — os lugares onde
   o Postgres CHECA a permissão de quem opera. Deve estar sempre vazia. */

CREATE OR REPLACE VIEW public.vw_permissoes_faltando AS
WITH bloqueadas AS (
  SELECT p.oid, p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.prokind = 'f'
)
SELECT b.proname AS funcao, 'índice' AS usada_em, i.relname::text AS objeto
  FROM bloqueadas b JOIN pg_index x ON true JOIN pg_class i ON i.oid = x.indexrelid
 WHERE pg_get_indexdef(i.oid) ~ ('\m' || b.proname || '\M')
UNION
SELECT b.proname, 'constraint', c.conname::text
  FROM bloqueadas b JOIN pg_constraint c ON pg_get_constraintdef(c.oid) ~ ('\m' || b.proname || '\M')
UNION
SELECT b.proname, 'default ou coluna gerada', cl.relname::text
  FROM bloqueadas b JOIN pg_attrdef d ON pg_get_expr(d.adbin, d.adrelid) ~ ('\m' || b.proname || '\M')
  JOIN pg_class cl ON cl.oid = d.adrelid
UNION
SELECT b.proname, 'view', cl.relname::text
  FROM bloqueadas b JOIN pg_class cl ON cl.relkind = 'v'
  JOIN pg_namespace n2 ON n2.oid = cl.relnamespace AND n2.nspname = 'public'
 WHERE cl.relname <> 'vw_permissoes_faltando'
   AND pg_get_viewdef(cl.oid) ~ ('\m' || b.proname || '\M');

ALTER VIEW public.vw_permissoes_faltando SET (security_invoker = on);
GRANT SELECT ON public.vw_permissoes_faltando TO authenticated;

COMMENT ON VIEW public.vw_permissoes_faltando IS
  'Deve estar sempre vazia. Qualquer linha aqui significa que uma função sem '
  'EXECUTE para authenticated está sendo usada onde o Postgres checa permissão — '
  'ou seja, alguma gravação vai falhar.';
