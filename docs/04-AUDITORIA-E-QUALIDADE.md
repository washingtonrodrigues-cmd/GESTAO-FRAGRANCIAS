# SISTEMA DE GESTÃO DE FRAGRÂNCIAS
## Documento 4 — Auditoria, Segurança, Performance e Checklist de Produção

**Versão:** 1.0
**Cobertura:** Prompt 15
**Uso:** este documento é um **protocolo executável**. Cada item tem critério objetivo de aprovação. Nenhum item pode ser marcado como "ok" por inspeção visual quando existe um teste descrito.

---

## SUMÁRIO

1. [Como usar este documento](#1-como-usar-este-documento)
2. [Auditoria de banco de dados](#2-auditoria-de-banco-de-dados)
3. [Auditoria de cálculos financeiros](#3-auditoria-de-cálculos-financeiros)
4. [Auditoria de segurança](#4-auditoria-de-segurança)
5. [Auditoria de performance](#5-auditoria-de-performance)
6. [Auditoria de código](#6-auditoria-de-código)
7. [Auditoria de validações](#7-auditoria-de-validações)
8. [Auditoria de interface e responsividade](#8-auditoria-de-interface-e-responsividade)
9. [Auditoria de dashboard e relatórios](#9-auditoria-de-dashboard-e-relatórios)
10. [Plano de testes](#10-plano-de-testes)
11. [Otimizações planejadas](#11-otimizações-planejadas)
12. [Checklist de go-live](#12-checklist-de-go-live)
13. [Operação pós-produção](#13-operação-pós-produção)

---

## 1. COMO USAR ESTE DOCUMENTO

| Símbolo | Significado |
|---|---|
| 🔴 | **Bloqueante** — impede a entrada em produção |
| 🟡 | **Importante** — corrigir antes do primeiro mês de uso |
| 🟢 | **Desejável** — melhoria contínua |

Execução recomendada: rodar todas as seções na Etapa 9 do plano de desenvolvimento, registrar evidência (print, saída de consulta, relatório de teste) de cada item bloqueante, e só então liberar o acesso ao usuário final.

---

## 2. AUDITORIA DE BANCO DE DADOS

### 2.1 Estrutura

| # | Verificação | Como testar | Crit. |
|---|---|---|:---:|
| BD-01 | Toda tabela tem chave primária | `SELECT tablename FROM pg_tables t WHERE schemaname='public' AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = (quote_ident(t.tablename))::regclass AND c.contype='p')` → 0 linhas | 🔴 |
| BD-02 | Nenhuma FK declarada `NOT VALID` (o PostgreSQL já garante existência e tipo na criação; o risco real é uma constraint criada sem validar os dados antigos) | `SELECT conname FROM pg_constraint WHERE contype='f' AND NOT convalidated` → 0 linhas | 🔴 |
| BD-03 | Toda FK tem índice na coluna filha | Consulta de FKs sem índice (§2.4) → 0 linhas | 🔴 |
| BD-04 | Nenhum campo monetário usa `float`/`real`/`double` | `SELECT * FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('real','double precision')` → 0 linhas | 🔴 |
| BD-05 | Todo campo obrigatório tem `NOT NULL` | Revisão do dicionário de dados | 🔴 |
| BD-06 | Todo enum de negócio é `ENUM` nativo, não texto livre | Inspeção do schema | 🟡 |
| BD-07 | Não há coluna redundante fora dos caches declarados | Revisão do Documento 2, §1 | 🟡 |
| BD-08 | Todo `CHECK` documentado no Documento 2 existe no banco | `SELECT conname FROM pg_constraint WHERE contype='c'` comparado à lista I-01…I-25 | 🔴 |
| BD-09 | Datas de negócio são `DATE`; carimbos são `TIMESTAMPTZ` | Inspeção do schema | 🟡 |
| BD-10b | Nenhum índice usa função `STABLE`/`VOLATILE` — em especial `unaccent()` direto, que faz o `CREATE INDEX` falhar. Usar sempre `public.fn_norm()` | Tentar recriar todos os índices em base limpa | 🔴 |
| BD-10c | Nenhum `CHECK` depende de `CURRENT_DATE`/`now()` nas migrations definitivas — essas regras vão para trigger `BEFORE INSERT` (Documento 2, §22) | Inspeção de `pg_constraint` | 🟡 |
| BD-10 | Nenhuma tabela sem RLS habilitado | `SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity` → 0 linhas | 🔴 |

### 2.2 Integridade dos dados

Executar as **7 consultas de reconciliação** do Documento 2, §22.1. Todas devem retornar **zero linhas**:

| # | Reconciliação | Crit. |
|---|---|:---:|
| BD-11 | Saldo em cache de estoque = soma do livro-razão, em todos os bolsos | 🔴 |
| BD-11b | Nenhuma tabela com RLS ativo e sem policy (consulta 6 do Documento 2, §22.1) | 🔴 |
| BD-12 | `valor_recebido` do título = soma das alocações não estornadas | 🔴 |
| BD-13 | Soma das parcelas = valor total da venda | 🔴 |
| BD-14 | Soma dos rateios = custo acessório da compra | 🔴 |
| BD-15 | Lucro recebido + lucro a receber = lucro bruto (tolerância R$ 0,02 por venda) | 🔴 |
| BD-16 | `em_posse + vendida + devolvida + perdida = quantidade` em todo item de remessa | 🔴 |
| BD-17 | Nenhum saldo de estoque negativo em qualquer bolso | 🔴 |
| BD-18 | Nenhum registro órfão (FK apontando para registro inexistente) | 🔴 |

### 2.3 Testes destrutivos de constraint

Cada teste deve **falhar** com erro claro. Se algum passar, a integridade está comprometida.

```sql
-- T1 · Estoque negativo (deve falhar)
SELECT public.fn_lancar_movimento(
  '<produto_sem_saldo>', 'DISPONIVEL', 'SAIDA_VENDA',
  -999999, 10, 'sistema', NULL, NULL, 'teste');

-- T2 · Alterar movimentação histórica (deve falhar)
UPDATE public.movimentacoes_estoque SET quantidade = 999 WHERE id = '<qualquer>';

-- T3 · Excluir movimentação (deve falhar)
DELETE FROM public.movimentacoes_estoque WHERE id = '<qualquer>';

-- T4 · Título com dois devedores (deve falhar)
INSERT INTO public.titulos_receber
  (origem, tipo_devedor, cliente_id, revendedor_id, valor_original, data_vencimento)
VALUES ('AVULSO','CLIENTE','<cli>','<rev>', 100, CURRENT_DATE + 30);

-- T5 · Parcelamento acima de 4 (deve falhar)
UPDATE public.vendas SET qtd_parcelas = 5 WHERE id = '<rascunho>';

-- T6 · Desconto maior que o subtotal (deve falhar)
UPDATE public.vendas SET desconto_valor = subtotal + 1 WHERE id = '<rascunho>';

-- T7 · Editar compra confirmada (deve falhar)
UPDATE public.compras SET valor_frete = 999 WHERE status = 'CONFIRMADO';

-- T8 · Excluir produto com saldo (deve falhar)
UPDATE public.produtos SET deleted_at = now() WHERE qtd_total > 0;

-- T9 · Receber valor maior que o título (deve falhar)
INSERT INTO public.recebimento_alocacoes (recebimento_id, titulo_id, valor)
VALUES ('<receb>','<titulo>', (SELECT valor_original * 2 FROM titulos_receber WHERE id='<titulo>'));

-- T10 · Encerrar remessa com itens em posse (deve falhar)
UPDATE public.remessas SET encerrada = true WHERE qtd_em_posse > 0;
```

### 2.4 Consulta auxiliar — FKs sem índice

```sql
SELECT c.conrelid::regclass AS tabela,
       a.attname            AS coluna_fk
FROM pg_constraint c
JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey))
ORDER BY 1, 2;
```

---

## 3. AUDITORIA DE CÁLCULOS FINANCEIROS

> Esta é a seção mais crítica. Um sistema com interface bonita e cálculo errado é pior que planilha, porque a pessoa confia nele.

### 3.1 Casos de teste obrigatórios (unitários)

| # | Caso | Entrada | Resultado esperado | Crit. |
|---|---|---|---|:---:|
| CF-01 | Rateio simples | 2 itens iguais (R$ 100 cada), frete R$ 20 | R$ 10 de rateio em cada; custo unitário R$ 110 | 🔴 |
| CF-02 | Rateio com dízima | 3 itens de R$ 100, acessório R$ 100 | **33,34 + 33,33 + 33,33 = 100,00** — resíduo no item de maior valor; no empate, o de menor `id`, ou seja o primeiro | 🔴 |
| CF-03 | Rateio proporcional ao valor | Itens de R$ 100 e R$ 900, acessório R$ 100 | R$ 10 e R$ 90 (não R$ 50 e R$ 50) | 🔴 |
| CF-04 | Rateio por quantidade | 10 un e 90 un, acessório R$ 100 | R$ 10 e R$ 90 | 🟡 |
| CF-05 | Rateio com acessório zero | Frete 0, taxa 0 | Rateio 0; custo unitário = valor unitário | 🔴 |
| CF-05b | Rateio sem resíduo | Subtotais 1.300/1.500/1.400, acessório 326,58 | 101,08 + 116,64 + 108,86 = **326,58** — nenhum ajuste aplicado | 🔴 |
| CF-05c | Rateio com resíduo negativo | Mesmos itens, acessório 326,60 | Bruto 101,10 + 116,64 + 108,87 = 326,61; ajuste de −0,01 no maior (item de 1.500) → **326,60** | 🔴 |
| CF-05d | Resíduo no critério QUANTIDADE | Critério = QUANTIDADE | O item que absorve o resíduo é o de **maior quantidade**, não o de maior valor | 🟡 |
| CF-06 | Custo médio primeira compra | Saldo 0; entrada 10 un a R$ 100 | custo_medio = 100,0000 | 🔴 |
| CF-07 | Custo médio segunda compra | 10 un @ 100 + 10 un @ 200 | custo_medio = 150,0000 | 🔴 |
| CF-08 | Custo médio com quantidades diferentes | 10 @ 100 + 90 @ 200 | custo_medio = 190,0000 | 🔴 |
| CF-09 | Custo médio na saída | Venda de 5 un | custo_medio **inalterado** | 🔴 |
| CF-10 | CMV congelado | Vender a custo 100; depois comprar a 200 | O item da venda anterior continua com CMV 100 | 🔴 |
| CF-11 | Parcelas exatas | R$ 900 em 3x | 300 + 300 + 300 = 900,00 | 🔴 |
| CF-12 | Parcelas com resíduo | R$ 100 em 3x | 33,34 + 33,33 + 33,33 = **100,00** | 🔴 |
| CF-13 | Parcelas com centavo ímpar | R$ 0,01 em 4x | **Rejeitar** com mensagem de negócio: "O valor é baixo demais para 4 parcelas. Cada parcela precisa ter ao menos R$ 0,01." Exige validação explícita de parcela mínima em `fn_gerar_parcelas` — sem ela o erro vira violação de `CHECK (valor_original > 0)` | 🟡 |
| CF-14 | Venda à vista | 1x | Título PAGO na data, recebimento criado | 🔴 |
| CF-15 | Margem | Custo 100, preço 250 | Margem 60,00%; markup 150,00% | 🔴 |
| CF-16 | Margem com preço zero | Preço 0 | Retorna 0, **sem divisão por zero** | 🔴 |
| CF-17 | Lucro proporcional | Venda R$ 900, lucro R$ 300, recebido R$ 300 | Lucro recebido 100,00; a receber 200,00 | 🔴 |
| CF-18 | Alocação parcial | Título R$ 299, recebe R$ 100 | Saldo 199,00; `situacao = 'ABERTO'` na tabela e `situacao_real = 'PARCIAL'` na view `vw_titulos_receber` (o enum não tem PARCIAL — RN-F01) | 🔴 |
| CF-19 | Alocação múltipla | R$ 500 em títulos de 299 e 299 | Primeiro quitado, segundo com saldo 98,00 | 🔴 |
| CF-20 | Estorno | Estornar recebimento de R$ 300 | Título volta a ABERTO com saldo integral | 🔴 |
| CF-21 | Devolução de consignado | 1 un devolvida, custo R$ 129,33 | Volta a DISPONIVEL pelo mesmo custo | 🔴 |
| CF-22 | Perda de consignado | 1 un perdida | Despesa R$ 129,33 categoria PERDA_ESTOQUE | 🔴 |
| CF-23 | Cancelamento de venda | Cancelar venda de 5 un | Estoque volta a +5; títulos cancelados | 🔴 |
| CF-24 | Cancelamento de compra | Cancelar compra de 10 un com 4 vendidas | **Bloqueado** com mensagem clara | 🔴 |

### 3.2 Teste de cenário completo (E2E financeiro)

Roteiro único que exercita todo o motor. Ao final, todos os valores devem bater.

```
1.  Compra: 10 un a R$ 100 + frete R$ 50 + taxa R$ 30
    → custo unitário R$ 108,00 · estoque 10 · custo médio 108,0000

2.  Compra: 10 un a R$ 120, sem acessórios
    → custo unitário R$ 120,00 · estoque 20 · custo médio 114,0000

3.  Venda a consumidor: 5 un a R$ 250, à vista
    → estoque 15 · CMV R$ 570,00 · receita R$ 1.250,00 · lucro R$ 680,00
    → título PAGO · lucro recebido R$ 680,00 · a receber R$ 0,00

4.  Venda a consumidor: 4 un a R$ 250, em 4x
    → estoque 11 · CMV R$ 456,00 · receita R$ 1.000,00 · lucro R$ 544,00
    → 4 títulos de R$ 250,00 · lucro a receber R$ 544,00

5.  Recebe a 1ª parcela (R$ 250)
    → lucro recebido total R$ 680 + 136 = R$ 816,00
    → lucro a receber R$ 408,00

6.  Remessa de consignação: 6 un, revenda R$ 180 cada
    → DISPONIVEL 5 · CONSIGNADO 6 · valor investido em consignação R$ 684,00
    → receita INALTERADA (R$ 2.250,00) ← verificação crítica do Risco R1

7.  Prestação de contas: 4 vendidas, 1 devolvida, 1 perdida
    → CONSIGNADO 0 · DISPONIVEL 6 · perda: despesa R$ 114,00
    → valor devido R$ 720,00 · CMV R$ 456,00 · lucro R$ 264,00
    → título de R$ 720,00 em aberto

8.  CONFERÊNCIA FINAL
    Receita bruta ......... R$ 2.970,00   (1.250 + 1.000 + 720)
    CMV ................... R$ 1.482,00   (570 + 456 + 456)
    Lucro bruto ........... R$ 1.488,00
    Despesas .............. R$   114,00
    Lucro líquido ......... R$ 1.374,00
    Lucro recebido ........ R$   816,00
    Lucro a receber ....... R$   672,00
    ✔ 816 + 672 = 1.488 = Lucro bruto
    Estoque disponível .... 6 un
    Valor do estoque ...... 6 × 114,00 = R$ 684,00
```

Qualquer divergência neste roteiro é **bloqueante**.

### 3.3 Verificações de arredondamento

| # | Verificação | Crit. |
|---|---|:---:|
| CF-25 | Todo valor exibido tem exatamente 2 casas decimais | 🔴 |
| CF-26 | Nenhuma soma de partes difere do todo por mais de R$ 0,00 | 🔴 |
| CF-27 | Arredondamento é half-up em todo o sistema (banco e aplicação) | 🔴 |
| CF-28 | Nenhum cálculo monetário usa aritmética de ponto flutuante em JavaScript | 🔴 |
| CF-29 | Percentuais são arredondados apenas na exibição, nunca no cálculo intermediário | 🟡 |

---

## 4. AUDITORIA DE SEGURANÇA

### 4.1 Autenticação e sessão

| # | Verificação | Crit. |
|---|---|:---:|
| SEG-01 | Nenhuma rota do grupo `(app)` é acessível sem sessão válida — testar acessando a URL diretamente em aba anônima | 🔴 |
| SEG-02 | Sessão armazenada em cookie `httpOnly`, `Secure`, `SameSite=Lax` | 🔴 |
| SEG-03 | Token expira e é renovado corretamente pelo middleware | 🔴 |
| SEG-04 | Logout invalida a sessão no servidor, não apenas no cliente | 🔴 |
| SEG-05 | Política de senha: mínimo 8 caracteres, verificação contra senhas vazadas | 🟡 |
| SEG-06 | Limite de tentativas de login (bloqueio temporário após 5 falhas) | 🟡 |
| SEG-07 | MFA disponível para o perfil ADMIN | 🟢 |
| SEG-08 | Recuperação de senha por e-mail com token de uso único e expiração curta | 🔴 |

### 4.2 Autorização

| # | Verificação | Crit. |
|---|---|:---:|
| SEG-09 | RLS habilitado em **todas** as tabelas, e forçado em todas **exceto** `usuarios`, `permissoes`, `logs_auditoria`, `produtos`, `remessas` e `remessa_itens` — as seis são lidas ou escritas por funções `SECURITY DEFINER` e, com `FORCE`, nem o dono escapa das policies (Documento 2, §20) | 🔴 |
| SEG-09b | **Nenhuma tabela com RLS ativo e sem policy.** Uma tabela nessa situação simplesmente desaparece para o usuário e as funções de negócio falham com 0 linhas. Rodar a consulta de verificação do Documento 2, §20.5 → 0 linhas | 🔴 |
| SEG-09c | Toda função `SECURITY DEFINER` está na lista fechada e justificada: `fn_perfil_atual`, `fn_tem_permissao`, `trg_fn_auditoria`, `trg_fn_atualiza_saldo_produto`, `trg_fn_atualiza_remessa_item`, `trg_fn_totaliza_remessa` | 🔴 |
| SEG-10 | Sem sessão, `SELECT` em qualquer tabela retorna vazio (não erro, não dados) | 🔴 |
| SEG-11 | Nenhuma policy usa `USING (true)` sem justificativa documentada | 🔴 |
| SEG-12 | Chave `service_role` não aparece em nenhum bundle enviado ao navegador — buscar no build gerado | 🔴 |
| SEG-13 | Server Actions revalidam a permissão no servidor, não confiando no que a tela enviou | 🔴 |
| SEG-14 | Tabela de auditoria não permite INSERT/UPDATE/DELETE pelo usuário | 🔴 |
| SEG-15 | Estorno de recebimento restrito ao perfil ADMIN | 🟡 |

### 4.3 Injeção e entrada de dados

| # | Verificação | Crit. |
|---|---|:---:|
| SEG-16 | Nenhuma concatenação de string em SQL — buscar por `` `${ `` dentro de chamadas `.rpc()` / `sql` | 🔴 |
| SEG-17 | Toda função SQL declara `SET search_path = public` | 🔴 |
| SEG-18 | Funções `SECURITY DEFINER` são apenas as estritamente necessárias e estão documentadas | 🔴 |
| SEG-19 | Nenhum uso de `dangerouslySetInnerHTML` — regra de ESLint que quebra o build | 🔴 |
| SEG-20 | Toda entrada validada por schema Zod no servidor, independente da validação do cliente | 🔴 |
| SEG-21 | Upload valida MIME real (não apenas a extensão), limita tamanho e reprocessa a imagem | 🔴 |
| SEG-22 | Nome de arquivo enviado é sanitizado / substituído por UUID | 🟡 |
| SEG-23 | Exportações (Excel/PDF) escapam conteúdo — testar campo com `=1+1` (injeção de fórmula CSV) | 🟡 |

### 4.4 Dados e privacidade

| # | Verificação | Crit. |
|---|---|:---:|
| SEG-24 | HTTPS obrigatório com HSTS | 🔴 |
| SEG-25 | Nenhum dado sensível (CPF, telefone) em log de aplicação ou mensagem de erro | 🔴 |
| SEG-26 | Erro exibido ao usuário não revela estrutura do banco nem stack trace | 🔴 |
| SEG-27 | Log de auditoria registra criação, alteração, exclusão, cancelamento, estorno, login e exportação | 🔴 |
| SEG-28 | Backup automático ativo e **restauração testada com sucesso** | 🔴 |
| SEG-29 | Variáveis de ambiente fora do controle de versão (`.env*` no `.gitignore`) | 🔴 |
| SEG-30 | Cabeçalhos de segurança configurados: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | 🟡 |
| SEG-31 | Dependências sem vulnerabilidade alta/crítica (`npm audit`) | 🟡 |

---

## 5. AUDITORIA DE PERFORMANCE

### 5.1 Metas objetivas

| Métrica | Meta | Crit. |
|---|---|:---:|
| Carregamento do dashboard | < 1,5 s (dados reais) | 🔴 |
| Listagem com 10.000 registros | < 800 ms | 🔴 |
| Busca global (Ctrl+K) | < 300 ms | 🟡 |
| Confirmação de venda | < 1 s | 🔴 |
| Geração de PDF | < 3 s | 🟡 |
| Exportação Excel de 10.000 linhas | < 10 s | 🟡 |
| Largest Contentful Paint | < 2,5 s | 🟡 |
| Nenhuma consulta acima de | 500 ms | 🔴 |

### 5.2 Banco de dados

| # | Verificação | Como testar | Crit. |
|---|---|---|:---:|
| PERF-01 | Nenhuma consulta faz `Seq Scan` em tabela com mais de 1.000 linhas | `EXPLAIN ANALYZE` nas 20 consultas mais usadas | 🔴 |
| PERF-02 | Toda listagem é paginada no servidor (`LIMIT`/`OFFSET` ou keyset) | Inspeção de código | 🔴 |
| PERF-03 | Nenhum `SELECT *` em listagem — apenas as colunas exibidas | Inspeção | 🟡 |
| PERF-04 | Ausência de problema N+1 (lista de vendas não dispara uma consulta por linha) | Contagem de consultas por página | 🔴 |
| PERF-05 | Índices existem para todos os filtros das telas de listagem | Comparar filtros × índices | 🔴 |
| PERF-06 | `vw_dashboard` executa em menos de 500 ms com volume de 2 anos | `EXPLAIN ANALYZE` | 🔴 |
| PERF-07 | Índices não utilizados foram removidos | `pg_stat_user_indexes` com `idx_scan = 0` após 30 dias | 🟢 |
| PERF-08 | `VACUUM`/`ANALYZE` automáticos ativos | Configuração do Supabase | 🟡 |

### 5.3 Front-end

| # | Verificação | Crit. |
|---|---|:---:|
| PERF-09 | Imagens de produto servidas em WebP com thumbnail dedicado para listagens | 🔴 |
| PERF-10 | Carregamento tardio (lazy) de gráficos e do gerador de PDF | 🟡 |
| PERF-11 | Componentes pesados renderizados no servidor (React Server Components) | 🟡 |
| PERF-12 | Bundle JavaScript inicial abaixo de 300 KB comprimido | 🟡 |
| PERF-13 | Cache do TanStack Query com `staleTime` adequado por tipo de dado | 🟡 |
| PERF-14 | Debounce de 300 ms em campos de busca | 🟡 |
| PERF-15 | Virtualização em listas com mais de 200 linhas visíveis | 🟢 |
| PERF-16 | Nenhum `useEffect` disparando busca em cascata | 🟡 |

### 5.4 Gatilhos de escalonamento

Sinais de que é hora da próxima otimização:

| Gatilho | Ação |
|---|---|
| `movimentacoes_estoque` acima de 100.000 linhas | Migrar `vw_dashboard` para VIEW MATERIALIZADA com refresh incremental |
| `logs_auditoria` acima de 1.000.000 linhas | Particionamento mensal + arquivamento anual |
| Dashboard acima de 2 s | Tabela de agregados diários alimentada por trigger |
| Mais de 5 usuários simultâneos | Revisar pool de conexões e considerar PgBouncer |

---

## 6. AUDITORIA DE CÓDIGO

| # | Verificação | Crit. |
|---|---|:---:|
| COD-01 | Zero erro de TypeScript (`tsc --noEmit`) | 🔴 |
| COD-02 | Zero erro de ESLint; avisos justificados | 🔴 |
| COD-03 | Nenhum `any` em código de domínio ou serviço | 🔴 |
| COD-04 | Nenhum `console.log` em produção | 🟡 |
| COD-05 | Nenhum código comentado abandonado | 🟡 |
| COD-06 | Nenhum `TODO`/`FIXME` em caminho crítico | 🟡 |
| COD-07 | Nenhum valor mágico — constantes nomeadas ou vindas de `parametros` | 🟡 |
| COD-08 | Nenhuma duplicação de lógica de cálculo (verificar com `jscpd`, limite 3%) | 🔴 |
| COD-09 | Regra de negócio não aparece em componente de UI | 🔴 |
| COD-10 | Toda função de domínio tem teste unitário | 🔴 |
| COD-11 | Nomenclatura consistente com o Documento 1, §5.1 | 🟡 |
| COD-12 | Funções complexas documentadas com JSDoc explicando **por que**, não o que | 🟡 |
| COD-13 | Componentes acima de 300 linhas foram decompostos | 🟢 |
| COD-14 | Nenhuma dependência não utilizada (`depcheck`) | 🟢 |

### 6.1 Focos de duplicação a verificar

Estes são os pontos onde a lógica tende a se repetir e divergir:

| Área | Deve existir em um único lugar |
|---|---|
| Formatação de moeda | `lib/format.ts` |
| Cálculo de margem | `domain/produtos/margens.ts` |
| Geração de parcelas | `domain/vendas/gerar-parcelas.ts` **e** `fn_gerar_parcelas` no banco — os dois devem ter o mesmo teste |
| Rateio de custos | `domain/compras/ratear-custos.ts` **e** `fn_ratear_custos_compra` |
| Situação de título | Apenas `vw_titulos_receber` |
| Filtro de período | `hooks/use-filtro-periodo.ts` |
| Validação de CPF | `schemas/comuns.schema.ts` |
| Cabeçalho de PDF | `pdf/componentes/cabecalho.tsx` |

> **Regra de conflito:** quando a mesma fórmula existe no banco e na aplicação (rateio e parcelas), o **banco é a autoridade**. A versão em TypeScript existe apenas para a prévia em tempo real na tela; um teste automatizado compara as duas implementações com os mesmos 24 casos da §3.1.

---

## 7. AUDITORIA DE VALIDAÇÕES

### 7.1 Cobertura por campo

| # | Verificação | Crit. |
|---|---|:---:|
| VAL-01 | Todo campo obrigatório é validado no cliente **e** no servidor | 🔴 |
| VAL-02 | CPF valida dígito verificador, não apenas o formato | 🔴 |
| VAL-03 | E-mail valida formato | 🟡 |
| VAL-04 | Telefone aceita 10 e 11 dígitos | 🟡 |
| VAL-05 | Valores monetários rejeitam negativo onde não faz sentido | 🔴 |
| VAL-06 | Quantidades rejeitam zero e negativo | 🔴 |
| VAL-07 | Datas de negócio rejeitam futuro quando aplicável | 🔴 |
| VAL-08 | Textos têm limite de tamanho coerente com o banco | 🟡 |
| VAL-09 | Uploads validam tipo e tamanho | 🔴 |
| VAL-10 | CEP consulta ViaCEP e preenche o endereço | 🟢 |

### 7.2 Validações de negócio

| # | Regra | Onde é testada | Crit. |
|---|---|---|:---:|
| VAL-11 | Não vender sem saldo | Tela, action e banco | 🔴 |
| VAL-12 | Não enviar mostruário sem saldo | Tela, action e banco | 🔴 |
| VAL-13 | Desconto ≤ subtotal | Tela, action e banco | 🔴 |
| VAL-14 | Parcelas entre 1 e 4 | Tela, action e banco | 🔴 |
| VAL-15 | Baixa de consignação ≤ quantidade em posse | Tela, action e banco | 🔴 |
| VAL-16 | Recebimento ≤ saldo do título | Tela, action e banco | 🔴 |
| VAL-17 | Não cancelar compra com item já vendido | Action e banco | 🔴 |
| VAL-18 | Não excluir cadastro com movimento | Action e banco | 🔴 |
| VAL-19 | Venda parcelada exige cliente identificado | Tela e action | 🟡 |
| VAL-20 | Ajuste de estoque exige motivo | Tela e banco | 🔴 |

### 7.3 Qualidade das mensagens (RN-S05)

Toda mensagem de erro deve passar neste teste: **uma pessoa que não programa entende o que fazer?**

| ❌ Inaceitável | ✅ Aceitável |
|---|---|
| `Error: check constraint violation` | "Perfume A tem apenas 2 unidades disponíveis. Ajuste a quantidade." |
| `Foreign key violation on produto_id` | "Selecione um produto válido." |
| `null value in column nome` | "O nome do cliente é obrigatório." |
| `Erro ao salvar` | "Não foi possível salvar a venda porque o estoque mudou. Revise os itens." |
| `500 Internal Server Error` | "Algo deu errado ao gerar o relatório. Tente novamente em instantes." |

---

## 8. AUDITORIA DE INTERFACE E RESPONSIVIDADE

| # | Verificação | Crit. |
|---|---|:---:|
| UI-01 | Todas as 38 telas funcionam em 1920, 1440, 1024, 768 e 375 px | 🔴 |
| UI-02 | Nenhuma rolagem horizontal indesejada em nenhuma largura | 🔴 |
| UI-03 | Tabelas viram cards abaixo de 768 px | 🟡 |
| UI-04 | Área de toque mínima de 44 px em telas sensíveis ao toque | 🟡 |
| UI-05 | Menu lateral vira menu deslizante em telas pequenas | 🟡 |
| UI-06 | Todos os quatro estados (carregando, vazio, erro, sucesso) implementados em toda tela | 🔴 |
| UI-07 | Botão de envio desabilita durante o salvamento (evita duplo lançamento) | 🔴 |
| UI-08 | Confirmação obrigatória antes de excluir ou cancelar, nomeando o registro | 🔴 |
| UI-09 | Feedback visual em toda ação (toast, atualização de lista) | 🔴 |
| UI-10 | Navegação completa por teclado | 🟡 |
| UI-11 | Contraste mínimo AA em todo texto | 🟡 |
| UI-12 | Informação nunca depende apenas de cor (ícone ou rótulo junto) | 🟡 |
| UI-13 | Formulário longo alerta antes de sair com alterações não salvas | 🟡 |
| UI-14 | Impressão sai limpa, sem menu nem botões | 🟡 |
| UI-15 | Favicon, título de página e metadados corretos em cada rota | 🟢 |

---

## 9. AUDITORIA DE DASHBOARD E RELATÓRIOS

### 9.1 Consistência entre superfícies

O teste central: **o mesmo número, no mesmo período, em qualquer lugar do sistema.**

| # | Verificação | Crit. |
|---|---|:---:|
| REL-01 | "Valor vendido" do dashboard = total do relatório de vendas no mesmo período | 🔴 |
| REL-02 | "Valor do estoque" do dashboard = total do relatório de estoque | 🔴 |
| REL-03 | "Total a receber" do dashboard = total da tela de contas a receber | 🔴 |
| REL-04 | "Lucro bruto" do dashboard = lucro bruto do DRE | 🔴 |
| REL-05 | Saldo devedor na ficha do revendedor = soma dos títulos dele em aberto | 🔴 |
| REL-06 | Valor exportado para Excel = valor exibido na tela | 🔴 |
| REL-07 | Valor no PDF = valor na tela | 🔴 |
| REL-08 | Soma das linhas = total do rodapé em todo relatório | 🔴 |

### 9.2 Comportamento

| # | Verificação | Crit. |
|---|---|:---:|
| REL-09 | Dashboard atualiza automaticamente após uma venda, sem recarregar a página | 🔴 |
| REL-10 | Filtro de período aplica a todos os indicadores de fluxo | 🔴 |
| REL-11 | Indicadores de posição (estoque, contas em aberto) mostram claramente que são posição atual | 🟡 |
| REL-12 | Dashboard sem dados exibe estado vazio orientando o primeiro passo | 🟡 |
| REL-13 | Todo relatório permite período, busca, PDF, Excel e impressão | 🔴 |
| REL-14 | Relatório sem resultado mostra "nenhum registro encontrado com estes filtros" | 🟡 |
| REL-15 | Gráficos legíveis com 1, 12 e 100 pontos de dados | 🟡 |
| REL-16 | Valores negativos exibidos com clareza (vermelho e sinal) | 🟡 |

---

## 10. PLANO DE TESTES

### 10.1 Pirâmide

| Camada | Ferramenta | Cobertura mínima | Escopo |
|---|---|---|---|
| Unidade | Vitest | **90%** em `src/domain/` | Rateio, custo médio, parcelas, margens, alocação, situação de título |
| Integração | Vitest + Postgres de teste | Funções e triggers | `fn_confirmar_compra`, `fn_confirmar_venda`, prestação de contas, estorno |
| E2E | Playwright | 8 fluxos críticos | Ver §10.2 |
| Constraint | SQL | 10 testes destrutivos | §2.3 |

### 10.2 Fluxos E2E obrigatórios

| # | Fluxo | Verificação final |
|---|---|---|
| E2E-01 | Login → dashboard | Sessão criada, indicadores carregados |
| E2E-02 | Cadastrar produto → comprar → conferir estoque e custo | Estoque e custo médio corretos |
| E2E-03 | Vender à vista → gerar recibo | Estoque baixado, título PAGO, PDF gerado |
| E2E-04 | Vender em 4x → receber 2 parcelas → conferir saldo | Saldo e situação corretos |
| E2E-05 | Enviar mostruário → conferir que a receita **não** mudou | Risco R1 coberto |
| E2E-06 | Prestação de contas completa (vendido + devolvido + perdido) | Estoque, títulos e despesa corretos |
| E2E-07 | Cancelar venda com recebimento | Bloqueio ou estorno explícito conforme a regra |
| E2E-08 | Gerar relatório → exportar Excel → conferir totais | Valores idênticos aos da tela |

### 10.3 Testes de carga

| Cenário | Volume | Meta |
|---|---|---|
| Base populada | 10.000 produtos, 50.000 movimentações, 20.000 títulos | Nenhuma tela acima de 2 s |
| Dashboard sob carga | Base acima | < 1,5 s |
| Exportação Excel | 10.000 linhas | < 10 s, sem estourar memória |
| Concorrência | 2 sessões vendendo o último item simultaneamente | Uma sucede, outra recebe erro claro — **sem estoque negativo** |

---

## 11. OTIMIZAÇÕES PLANEJADAS

### 11.1 Aplicar antes do go-live

| # | Otimização | Ganho |
|---|---|---|
| OPT-01 | Índices parciais nas consultas mais frequentes (títulos abertos, remessas em aberto) | Índices menores e mais rápidos |
| OPT-02 | Índices trigram para busca com tolerância a acento e digitação parcial | Busca instantânea |
| OPT-03 | Índice BRIN em `logs_auditoria.created_at` | Índice muito menor em tabela cronológica |
| OPT-04 | Colunas `GENERATED` em vez de cálculo em consulta | Elimina cálculo repetido |
| OPT-05 | Paginação server-side em todas as listagens | Constante independente do volume |
| OPT-06 | Compressão e thumbnail no upload de imagem | Listagem rápida, storage econômico |
| OPT-07 | Server Components para conteúdo estático | Menos JavaScript no cliente |
| OPT-08 | Carregamento tardio de gráficos e PDF | Bundle inicial menor |
| OPT-09 | `staleTime` diferenciado por tipo de dado (catálogo 5 min, financeiro 30 s) | Menos requisições |
| OPT-10 | Transações únicas nas operações compostas | Consistência e menos idas ao banco |

### 11.2 Reservar para quando o volume exigir

| # | Otimização | Gatilho |
|---|---|---|
| OPT-11 | VIEW MATERIALIZADA para o dashboard | Dashboard acima de 2 s |
| OPT-12 | Tabela de agregados diários | Relatórios anuais lentos |
| OPT-13 | Particionamento de `logs_auditoria` | Acima de 1 milhão de linhas |
| OPT-14 | Paginação keyset em vez de OFFSET | Listagens com mais de 100 páginas |
| OPT-15 | Fila de processamento para PDFs em lote | Geração em massa |

> **Não otimizar antes da hora.** Cada item da §11.2 adiciona complexidade permanente; só vale quando o gatilho ocorre de fato.

---

## 12. CHECKLIST DE GO-LIVE

### 12.1 Banco de dados

- [ ] 🔴 Todas as migrations aplicadas na ordem correta em produção
- [ ] 🔴 Seed executado (formas de pagamento, categorias, parâmetros, permissões)
- [ ] 🔴 As 7 consultas de reconciliação retornam zero linhas
- [ ] 🔴 Os 10 testes destrutivos de constraint falham como esperado
- [ ] 🔴 RLS habilitado e forçado em todas as tabelas
- [ ] 🔴 Backup automático ativo
- [ ] 🔴 **Restauração testada com sucesso em ambiente separado**
- [ ] 🟡 PITR habilitado
- [ ] 🟡 Rotina de exportação semanal agendada

### 12.2 Segurança

- [ ] 🔴 Todos os itens 🔴 da §4 aprovados
- [ ] 🔴 `service_role` ausente do bundle do cliente
- [ ] 🔴 Variáveis de ambiente de produção configuradas e fora do repositório
- [ ] 🔴 HTTPS com HSTS ativo
- [ ] 🔴 Log de auditoria funcionando e testado
- [ ] 🟡 Cabeçalhos de segurança configurados
- [ ] 🟡 `npm audit` sem vulnerabilidade alta ou crítica

### 12.3 Funcionalidade

- [ ] 🔴 Os 24 testes de cálculo (§3.1) passando
- [ ] 🔴 O roteiro E2E financeiro (§3.2) fechando ao centavo
- [ ] 🔴 Os 8 fluxos E2E (§10.2) passando
- [ ] 🔴 Todos os 20 relatórios gerando e exportando
- [ ] 🔴 Os 3 PDFs (recibo de venda, recibo de entrega, prestação de contas) corretos
- [ ] 🔴 Dashboard consistente com os relatórios (§9.1)
- [ ] 🔴 Job de alertas de vencimento agendado e testado

### 12.4 Interface

- [ ] 🔴 As 38 telas testadas em desktop, tablet e celular
- [ ] 🔴 Nenhuma tela sem estado de carregamento, vazio e erro
- [ ] 🔴 Confirmação antes de toda exclusão e cancelamento
- [ ] 🟡 Contraste e navegação por teclado verificados
- [ ] 🟡 Impressão testada nos principais documentos

### 12.5 Performance

- [ ] 🔴 Dashboard abaixo de 1,5 s com dados reais
- [ ] 🔴 Nenhuma consulta acima de 500 ms
- [ ] 🔴 Teste de concorrência sem estoque negativo
- [ ] 🟡 Lighthouse acima de 90 em Performance e Acessibilidade

### 12.6 Operação

- [ ] 🔴 Usuário administrador criado com senha forte
- [ ] 🔴 Dados da empresa preenchidos em `parametros` (nome, documento, contato, logotipo)
- [ ] 🔴 Formas de pagamento revisadas com as taxas reais praticadas
- [ ] 🔴 Manual do usuário entregue (pelo menos os 5 fluxos principais)
- [ ] 🟡 Carga inicial de produtos, clientes e revendedores concluída
- [ ] 🟡 Saldo inicial de estoque lançado via inventário com motivo "Saldo inicial"
- [ ] 🟡 Monitoramento de erros configurado (ex.: Sentry)
- [ ] 🟢 Domínio próprio configurado

### 12.7 Critério final de liberação

> O sistema só entra em produção quando **100% dos itens 🔴 estiverem aprovados com evidência registrada**. Itens 🟡 pendentes precisam de um responsável e prazo. Itens 🟢 entram no backlog.

---

## 13. OPERAÇÃO PÓS-PRODUÇÃO

### 13.1 Rotina de acompanhamento

| Frequência | Atividade |
|---|---|
| **Diária** | Conferir alertas de vencimento; revisar erros registrados |
| **Semanal** | Rodar as 7 consultas de reconciliação; conferir backup; revisar log de auditoria |
| **Mensal** | Revisar índices não utilizados; conferir consultas lentas; atualizar dependências menores |
| **Trimestral** | Revisar performance com o volume atual; avaliar gatilhos da §5.4 |
| **Semestral** | **Testar restauração completa do backup**; revisar permissões; auditoria de segurança |

### 13.2 Indicadores de saúde do sistema

| Indicador | Meta | Ação se fora da meta |
|---|---|---|
| Divergências de reconciliação | 0 | Investigar imediatamente — é falha de integridade |
| Erros por semana | < 5 | Analisar padrão e corrigir a causa |
| Tempo médio do dashboard | < 1,5 s | Aplicar OPT-11 |
| Tamanho do banco | Acompanhar tendência | Arquivar logs antigos |
| Backups com sucesso | 100% | Investigar no mesmo dia |

### 13.3 Roteiro de resposta a incidente

1. **Identificar** — o que exatamente está errado e desde quando
2. **Conter** — se houver risco de corromper dados, restringir o acesso à operação afetada
3. **Diagnosticar** — usar o log de auditoria e o livro-razão para reconstituir o que aconteceu
4. **Corrigir** — nunca por `UPDATE` direto em tabela de fato; sempre por lançamento de estorno ou ajuste com motivo
5. **Verificar** — rodar as 7 consultas de reconciliação
6. **Registrar** — documentar causa e correção, e adicionar um teste que impeça a repetição

> A arquitetura foi desenhada para que qualquer erro seja **reconstituível**: o livro-razão e o log de auditoria juntos permitem responder *"como este número chegou aqui"* em qualquer momento do passado. Essa é a propriedade que mais importa em um sistema financeiro.

---

## FIM DA DOCUMENTAÇÃO

| Documento | Conteúdo |
|---|---|
| **01** | Arquitetura, tecnologias, estrutura de pastas, fluxogramas, telas, navegação, regras de negócio, motor de cálculo, segurança, plano de desenvolvimento, riscos |
| **02** | Modelagem completa: 25 tabelas, DER, relacionamentos, DDL executável, funções, triggers, views, índices, RLS, seed, invariantes, backup |
| **03** | Especificação funcional dos 12 módulos: telas, campos, validações, fórmulas, fluxos e mensagens |
| **04** | Este documento: protocolo de auditoria e checklist de produção |
