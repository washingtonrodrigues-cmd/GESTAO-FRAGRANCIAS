# SISTEMA DE GESTÃO DE FRAGRÂNCIAS
## Documento 3 — Especificação Funcional dos Módulos

**Versão:** 1.0
**Cobertura:** Prompts 3 a 14
**Referências:** ADR-01 a ADR-07 e regras RN-* do Documento 1; tabelas, funções e views do Documento 2.

---

## SUMÁRIO

| Módulo | Prompt | Seção |
|---|:---:|---|
| Dashboard | 3 | [§1](#1-módulo-dashboard) |
| Controle de Compras | 4 | [§2](#2-módulo-controle-de-compras) |
| Produtos | 5 | [§3](#3-módulo-produtos) |
| Estoque | 6 | [§4](#4-módulo-estoque) |
| Clientes | 7 | [§5](#5-módulo-clientes) |
| Revendedores | 8 | [§6](#6-módulo-revendedores) |
| Mostruários / Consignação | 9 | [§7](#7-módulo-mostruários-e-consignação) |
| Vendas | 10 | [§8](#8-módulo-vendas) |
| Contas a Receber | 11 | [§9](#9-módulo-contas-a-receber) |
| Recibos e Documentos | 12 | [§10](#10-módulo-recibos-e-documentos-pdf) |
| Relatórios | 13 | [§11](#11-módulo-relatórios) |
| Financeiro | 14 | [§12](#12-módulo-financeiro) |
| Sistema: usuários, auditoria, backup | 15 | [§13](#13-módulo-sistema) |
| Padrões transversais de UI | — | [§14](#14-padrões-transversais-de-interface) |

---

# 1. MÓDULO: DASHBOARD
### *Prompt 3*

## 1.1 Objetivo

Painel único que responde, em menos de cinco segundos de leitura: **quanto entrou, quanto saiu, quanto está parado, quanto ainda vou receber e o que precisa da minha atenção hoje.**

## 1.2 Fonte de dados

Todos os cartões consomem `vw_dashboard`, `vw_produtos_mais_vendidos`, `vw_produtos_parados`, `vw_ranking_revendedores`, `vw_ranking_clientes`, `vw_evolucao_vendas` e `vw_itens_em_posse`. **Nenhum cálculo é feito no navegador** (ADR-06).

## 1.3 Atualização automática

| Mecanismo | Aplicação |
|---|---|
| Revalidação por foco | TanStack Query com `refetchOnWindowFocus` — ao voltar para a aba, os números se atualizam |
| Intervalo | `refetchInterval` de 60 s enquanto a aba está visível |
| Invalidação por evento | Toda Server Action de venda, compra, remessa ou recebimento invalida a chave `['dashboard']` — o painel reflete a operação imediatamente |
| Realtime (opcional) | Canal Supabase Realtime nas tabelas `vendas`, `recebimentos` e `movimentacoes_estoque` |

## 1.4 Estrutura visual

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Dashboard                          [Período: Este mês ▾]   🔄 há 12 s    │
├──────────────────────────────────────────────────────────────────────────┤
│ ⚠ 3 parcelas vencidas (R$ 1.240,00)  ·  2 mostruários há mais de 60 dias │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌ INVESTIMENTO ─────────────────────────────────────────────────────────┐│
│ │ Compras       Custo produtos   Frete        Taxa cartão   Mostruários ││
│ │ R$ 48.320,00  R$ 44.100,00     R$ 2.180,00  R$ 2.040,00   R$ 6.840,00 ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ ESTOQUE ──────────────────────────────────────────────────────────────┐│
│ │ Disponível    Qtd. produtos    Mostruário   Com revend.  Potencial    ││
│ │ R$ 31.450,00  412 un · 87 SKU  R$ 4.120,00  R$ 2.720,00  R$ 92.300,00 ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ VENDAS ───────────────────────────────────────────────────────────────┐│
│ │ Total vendido  Consumidor      Revendedor   Ticket médio  Nº vendas   ││
│ │ R$ 27.890,00   R$ 18.240,00    R$ 9.650,00  R$ 189,73     147         ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ RESULTADO ────────────────────────────────────────────────────────────┐│
│ │ Lucro bruto    Lucro líquido   Lucro receb.  Lucro a receber  Margem  ││
│ │ R$ 11.240,00   R$ 9.870,00     R$ 7.310,00   R$ 3.930,00      40,3%   ││
│ └───────────────────────────────────────────────────────────────────────┘│
│ ┌ CONTAS A RECEBER ─────────────────────────────────────────────────────┐│
│ │ A receber      Vencido         Vence em 7d   Já recebido   Inadimpl.  ││
│ │ R$ 8.420,00    R$ 1.240,00 🔴  R$ 2.180,00 🟡 R$ 19.470,00  14,7%     ││
│ └───────────────────────────────────────────────────────────────────────┘│
├───────────────────────────────────┬──────────────────────────────────────┤
│ Evolução de vendas e lucro        │ Composição do investimento           │
│ (linha, 12 meses)                 │ (rosca: produtos/frete/taxa)         │
├───────────────────────────────────┼──────────────────────────────────────┤
│ 🏆 Produtos mais vendidos (top 10)│ 🏆 Revendedores que mais vendem      │
├───────────────────────────────────┼──────────────────────────────────────┤
│ 🐌 Produtos parados (>60 dias)    │ ⏳ Mostruários há mais tempo          │
├───────────────────────────────────┴──────────────────────────────────────┤
│ 👥 Clientes que mais compram (top 10)                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

## 1.5 Catálogo de indicadores

| Cartão | Fórmula / origem | Formato | Cor |
|---|---|---|---|
| Valor investido em compras | `SUM(compras.custo_total)` confirmadas | R$ | Neutro |
| Custo dos produtos | `SUM(subtotal_produtos)` | R$ | Neutro |
| Total em frete | `SUM(valor_frete)` | R$ | Neutro |
| Total em taxa de cartão | `SUM(valor_taxa_cartao)` | R$ | Neutro |
| Investido em mostruários | `SUM(qtd_mostruario × custo_medio)` | R$ | Neutro |
| Valor do estoque | `SUM(qtd_disponivel × custo_medio)` | R$ | Azul |
| Qtd. produtos disponíveis | `SUM(qtd_disponivel)` e `COUNT(SKU)` | nº | Azul |
| Valor com revendedores | `SUM(qtd_consignado × custo_medio)` | R$ | Azul |
| Potencial de venda | `SUM(qtd_total × preco_consumidor)` | R$ | Azul |
| Valor vendido | `SUM(vendas.valor_total)` confirmadas | R$ | Verde |
| Vendido a consumidor | filtro `tipo='CONSUMIDOR'` | R$ | Verde |
| Vendido a revendedor | venda direta **+** consignação vendida no acerto. No exemplo acima: R$ 6.420,00 direto + R$ 3.230,00 de consignação = R$ 9.650,00 | R$ | Verde |
| Ticket médio | `valor_total ÷ nº de operações` (vendas + acertos de consignação) | R$ | Verde |
| **Lucro bruto** | `Receita Líquida − CMV` | R$ | Verde |
| **Lucro líquido** | `Lucro Bruto − Despesas` | R$ | Verde |
| **Lucro recebido** | `Σ (lucro × % recebido)` | R$ | Verde |
| **Lucro a receber** | `Lucro Bruto − Lucro Recebido` | R$ | Âmbar |
| Margem bruta % | `Lucro Bruto ÷ Receita Líquida` | % | Verde |
| Total a receber | `SUM(saldo)` títulos abertos | R$ | Âmbar |
| **Contas vencidas** | saldo com vencimento < hoje | R$ | **Vermelho** |
| Contas a vencer (7d) | vencimento entre hoje e +7 | R$ | Âmbar |
| Total já recebido | `SUM(recebimentos)` não estornados | R$ | Verde |
| Inadimplência % | `Vencido ÷ Total a receber` | % | Vermelho se > 10% |

## 1.6 Gráficos

| Gráfico | Tipo | Séries | View |
|---|---|---|---|
| Evolução de vendas | Linha + área | Receita, CMV, Lucro bruto (12 meses) | `vw_evolucao_vendas` |
| Composição do investimento | Rosca | Produtos, Frete, Taxa, Outros | `vw_dashboard` |
| Distribuição do estoque | Barra empilhada | Disponível, Mostruário, Consignado, Reservado | `vw_produtos` |
| Recebido × A receber | Barra agrupada por mês | Realizado vs. projetado | `vw_fluxo_caixa` |
| Vendas por canal | Rosca | Consumidor, Revendedor direto, Consignação | `vw_dashboard` |

## 1.7 Listas de atenção

| Lista | Critério | Ação de um clique |
|---|---|---|
| Parcelas vencidas | `situacao_real = 'VENCIDO'` | Abre contas a receber já filtrado |
| Mostruários antigos | `dias_em_posse > parâmetro` (60) | Abre prestação de contas do revendedor |
| Produtos parados | sem venda há mais de 60 dias e com saldo | Abre ficha do produto |
| Estoque baixo | `qtd_disponivel ≤ estoque_minimo` | Abre nova compra já com o produto |
| Preço abaixo do custo | `preco_consumidor < custo_medio` | Abre edição de preço |

## 1.8 Filtro de período

Opções: Hoje · Últimos 7 dias · Este mês · Mês anterior · Últimos 90 dias · Este ano · Personalizado.
**Comportamento:** cartões de fluxo (compras, vendas, lucro, recebimentos) respeitam o período. Cartões de posição (estoque, contas a receber em aberto) são **sempre a posição atual** — e trazem o rótulo "posição atual" para não confundir.

---

# 2. MÓDULO: CONTROLE DE COMPRAS
### *Prompt 4*

## 2.1 Objetivo

Registrar a entrada de mercadoria calculando o **custo unitário real** de cada produto, incluindo frete e taxa de cartão rateados proporcionalmente.

## 2.2 Tela — Lista de compras (`/compras`)

**Cartões:** Total comprado no período · Total em frete · Total em taxas · Nº de compras · Ticket médio da compra.

**Colunas:** Nº · Data · Fornecedor · Itens (qtd) · Subtotal · Frete · Taxa · **Custo total** · Status · Ações.

**Filtros:** período, fornecedor, status, faixa de valor.
**Ações por linha:** Ver detalhe · Duplicar · Cancelar (só se confirmada) · Excluir (só rascunho) · Imprimir.

## 2.3 Tela — Nova compra (`/compras/nova`)

### Bloco 1 — Cabeçalho

| Campo | Tipo | Obrigatório | Validação |
|---|---|:---:|---|
| Fornecedor | Autocomplete + criar inline | ✅ | Deve existir e estar ativo |
| Data da compra | Data | ✅ | Não pode ser futura |
| Nº do documento | Texto | ❌ | Livre (NF, pedido) |
| Critério de rateio | Seleção | ✅ | `VALOR` (padrão) ou `QUANTIDADE` |

### Bloco 2 — Itens

| Campo | Tipo | Obrigatório | Validação |
|---|---|:---:|---|
| Produto | Autocomplete com foto + criar inline | ✅ | Não repetir na mesma compra (I-05) |
| Quantidade | Numérico | ✅ | > 0 |
| Valor unitário | Moeda | ✅ | ≥ 0 |
| Subtotal | Calculado | — | `qtd × unitário`, somente leitura |

> **Cadastro inline de produto:** o formulário permite criar o produto sem sair da compra (modal com nome, categoria, preços). Isso elimina o atrito de "preciso sair para cadastrar e perco o que digitei".

### Bloco 3 — Custos acessórios

| Campo | Tipo | Obrigatório | Validação |
|---|---|:---:|---|
| Valor do frete | Moeda | ❌ | ≥ 0 (padrão 0) |
| Taxa do cartão | Moeda | ❌ | ≥ 0 |
| Outros custos | Moeda | ❌ | ≥ 0 |
| Observações | Texto longo | ❌ | — |

> **Auxílio da taxa de cartão:** ao lado do campo, um botão "calcular" abre um mini-cálculo — informe o percentual da maquininha (ex.: 3,49%) e o sistema preenche o valor em reais sobre o subtotal. O usuário nunca precisa fazer a conta (RN-S06).

### Bloco 4 — Painel de resumo (fixo à direita, tempo real)

```
Subtotal dos produtos       R$ 4.200,00
Frete                       R$   180,00
Taxa do cartão              R$   146,60
Outros                      R$     0,00
═══════════════════════════════════════
CUSTO TOTAL DA COMPRA       R$ 4.526,60

CUSTO UNITÁRIO APÓS RATEIO
 Perfume A  10 un   R$ 130,00 → R$ 140,11   (+7,78%)
 Perfume B   5 un   R$ 300,00 → R$ 323,33   (+7,78%)
 Perfume C  20 un   R$  70,00 → R$  75,44   (+7,78%)
                                (rateio total R$ 326,60)

Margem projetada (preço consumidor atual)
 Perfume A   R$ 249,00 → margem 43,7%
 Perfume B   R$ 590,00 → margem 45,2%
 Perfume C   R$ 149,00 → margem 49,4%
```

Esta prévia é o coração do módulo: **o comprador vê a margem real antes de confirmar a compra**.

## 2.4 Cálculos (RN-C01 a RN-C05)

```
Subtotal do item      = quantidade × valor_unitario
Subtotal da compra    = Σ subtotais
Custo acessório       = frete + taxa_cartao + outros_custos
Custo total           = Subtotal da compra + Custo acessório

Rateio do item (VALOR)      = Custo acessório × (subtotal_item ÷ Subtotal da compra)
Rateio do item (QUANTIDADE) = Custo acessório × (qtd_item ÷ Σ qtd)

Custo unitário final  = (subtotal_item + rateio_item) ÷ quantidade_item

AJUSTE OBRIGATÓRIO: Σ rateios deve ser EXATAMENTE igual ao custo acessório.
O resíduo de centavos é somado ao item de MAIOR valor (RN-C03).
```

### Exemplo verificado

Custo acessório = 180,00 + 146,60 = **R$ 326,60**. Subtotal dos produtos = **R$ 4.200,00**.

| Item | Qtd | Unit. | Subtotal | % | Rateio bruto | Rateio final | Custo total | Custo unit. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Perfume A | 10 | 130,00 | 1.300,00 | 30,9524% | 101,0952 → 101,10 | 101,10 | 1.401,10 | 140,1100 |
| Perfume B | 5 | 300,00 | 1.500,00 | 35,7143% | 116,6429 → 116,64 | **116,63** | 1.616,63 | 323,3260 |
| Perfume C | 20 | 70,00 | 1.400,00 | 33,3333% | 108,8667 → 108,87 | 108,87 | 1.508,87 | 75,4435 |
| **Total** | | | **4.200,00** | 100% | **326,61** | **326,60** | **4.526,60** | |

O rateio bruto somou **326,61** — um centavo a mais, por arredondamento. O resíduo de **−0,01**
é aplicado ao item de maior valor (Perfume B, R$ 1.500,00), fechando a soma em **326,60** ✔

Conferência final: 1.401,10 + 1.616,63 + 1.508,87 = **4.526,60** = 4.200,00 + 326,60 ✔

> **Desempate:** quando dois itens têm o mesmo subtotal, o resíduo vai para o de menor `id` —
> critério determinístico, para que a mesma compra produza sempre o mesmo resultado
> (`ORDER BY subtotal DESC, id ASC LIMIT 1` na função `fn_ratear_custos_compra`).

## 2.5 Confirmação da compra

Ao clicar em **Confirmar compra**, dentro de uma única transação (`fn_confirmar_compra`):

1. Valida cabeçalho e ao menos um item
2. Executa o rateio e grava `rateio_acessorio` e `custo_unitario_final` (imutáveis a partir daqui — RN-C04)
3. Para cada item: recalcula o **custo médio ponderado** do produto
4. Lança a **entrada no livro-razão** (`+qtd` em DISPONIVEL)
5. Marca a compra como `CONFIRMADO`
6. Invalida os caches do dashboard e dos relatórios

Se qualquer passo falhar, **nada é gravado** (transação atômica).

## 2.6 Cancelamento (RN-C06, RN-C07)

Compra confirmada não pode ser editada. O cancelamento:

1. Verifica se há saldo disponível suficiente para estornar cada item
   → se não houver, erro claro: *"Não é possível cancelar: 4 das 10 unidades de Perfume A já foram vendidas"*
2. Lança movimentações de estorno (`ESTORNO`, com `estorno_de_id`)
3. **Recalcula o custo médio** removendo a influência daquela entrada
4. Marca `status = CANCELADO`, exige motivo
5. Registra no log de auditoria

## 2.7 Tela — Fornecedores (`/compras/fornecedores`)

CRUD simples, no mesmo padrão de listagem do sistema.

| Campo | Tipo | Obrig. | Validação |
|---|---|:---:|---|
| Nome / Razão social | Texto | ✅ | 2–150 caracteres |
| CPF / CNPJ | Texto com máscara | ❌ | Dígito verificador validado; único entre ativos |
| Telefone · WhatsApp | Máscara | ❌ | 10 ou 11 dígitos |
| E-mail | Texto | ❌ | Formato válido |
| Endereço · Cidade · Estado | Texto / UF | ❌ | — |
| Observações | Texto longo | ❌ | Prazo de entrega, condições, contato |

**Colunas da lista:** Nome · Documento · Telefone · Cidade/UF · Nº de compras · Total comprado · Última compra.
**Regras:** fornecedor com compras não pode ser excluído, apenas inativado. Pode ser criado
diretamente do formulário de compra, sem sair da tela.

---

## 2.8 Mensagens de erro

| Situação | Mensagem |
|---|---|
| Sem itens | "Adicione ao menos um produto à compra." |
| Produto repetido | "Perfume A já está na lista. Ajuste a quantidade da linha existente." |
| Data futura | "A data da compra não pode ser posterior a hoje." |
| Cancelar com item vendido | "Não é possível cancelar: 4 das 10 unidades de Perfume A já saíram do estoque." |

---

# 3. MÓDULO: PRODUTOS
### *Prompt 5*

## 3.1 Tela — Catálogo (`/produtos`)

Alterna entre **grade** (cards com foto — ideal para fragrâncias) e **tabela** (densa, para conferência).

**Cartões:** Total de SKUs · Valor do estoque · Produtos esgotados · Estoque baixo · Margem média.

**Colunas da tabela:** Foto · Código · Nome · Categoria · Marca · Tamanho · Custo médio · Preço consumidor · Preço revendedor · **Margem %** · Disponível · Mostruário · Consignado · Situação.

**Filtros:** categoria, marca, situação, faixa de preço, faixa de margem, estoque baixo, produtos parados, preço abaixo do custo.

## 3.2 Formulário de cadastro

### Identificação
| Campo | Tipo | Obrig. | Regra |
|---|---|:---:|---|
| Código | Texto | Auto | Gerado (`P1000`, `P1001`…), editável, único (RN-P01) |
| Nome | Texto | ✅ | 2–200 caracteres |
| Descrição | Texto longo | ❌ | Notas olfativas, família, fixação |
| Categoria | Seleção + criar inline | ❌ | — |
| Marca | Seleção + criar inline | ❌ | — |
| Cor | Texto | ❌ | — |
| Tamanho | Texto | ❌ | "100 ml", "50 ml", "Único" |
| Código de barras | Texto | ❌ | Único quando informado |
| Foto | Upload (arrastar e soltar) | ❌ | JPG/PNG/WebP, máx. 5 MB, comprimida e redimensionada para 1200 px + thumb 300 px |

### Preços e custo
| Campo | Tipo | Obrig. | Regra |
|---|---|:---:|---|
| Custo médio | Calculado | — | **Somente leitura.** Vem das compras (ADR-02) |
| Último custo | Calculado | — | Somente leitura |
| Preço consumidor | Moeda | ✅ | ≥ 0 |
| Preço revendedor | Moeda | ✅ | ≥ 0; aviso se > preço consumidor (RN-P06) |

> **Assistente de precificação:** o formulário oferece "sugerir preço" a partir do markup padrão (parâmetro do sistema). Digitando o markup, o preço é preenchido; digitando o preço, a margem é exibida. Nos dois sentidos, sem conta manual.

### Estoque
| Campo | Regra |
|---|---|
| Qtd. disponível / mostruário / consignado / reservado | **Somente leitura** — vêm do livro-razão (RN-E02) |
| Estoque mínimo | Editável; alimenta o alerta de estoque baixo |

> O saldo inicial de um produto **nunca é digitado no cadastro**. Ele entra por uma compra ou por um ajuste de inventário com motivo. Essa é a diferença entre um estoque auditável e um estoque que "some".

### Painel de rentabilidade (lateral, tempo real)

```
Custo médio                R$ 129,33
─────────────────────────────────────
CONSUMIDOR FINAL
  Preço                    R$ 249,00
  Lucro por unidade        R$ 119,67
  Margem                       48,06%
  Markup                       92,53%
─────────────────────────────────────
REVENDEDOR
  Preço                    R$ 179,00
  Lucro por unidade        R$  49,67
  Margem                       27,75%
  Markup                       38,41%
─────────────────────────────────────
Em estoque: 10 un
Lucro potencial:           R$ 1.196,70
```

## 3.3 Fórmulas (RN-P02 a RN-P04)

```
Lucro consumidor   = preco_consumidor − custo_medio
Lucro revendedor   = preco_revendedor − custo_medio
Margem %           = (preço − custo) ÷ preço × 100      ← margem sobre a venda
Markup %           = (preço − custo) ÷ custo × 100      ← acréscimo sobre o custo
Lucro potencial    = qtd_total × lucro_consumidor
```

`Lucro consumidor`, `Lucro revendedor` e as duas margens são colunas `GENERATED` na tabela
`produtos`; `Markup` e `Lucro potencial` são colunas calculadas na view `vw_produtos`
(Documento 2, §9 e §18). Em nenhum dos dois casos o cálculo é feito no navegador — por isso
é impossível divergirem entre telas.

## 3.4 Ficha do produto (`/produtos/[id]`)

Abas:
1. **Resumo** — foto, dados, painel de rentabilidade, saldos por bolso
2. **Movimentações (Kardex)** — histórico completo: data, tipo, documento, entrada, saída, saldo, custo unitário
3. **Compras** — todas as compras deste produto com custo de cada uma
4. **Vendas** — todas as vendas, com preço e lucro de cada
5. **Em poder de terceiros** — quem está com o produto, desde quando

## 3.5 Tela — Categorias e marcas (`/configuracoes/categorias`)

Duas abas no mesmo formato: Categorias e Marcas.

| Campo | Tipo | Obrig. | Validação |
|---|---|:---:|---|
| Nome | Texto | ✅ | 2–80 caracteres; **único ignorando acento e caixa** (evita "Feminino" e "feminíno") |
| Descrição (só categoria) | Texto | ❌ | — |
| Ativo | Sim/Não | ✅ | Inativa some dos seletores, permanece nos históricos |

**Colunas:** Nome · Nº de produtos · Valor em estoque · Situação.
**Regras:** categoria ou marca com produtos vinculados não pode ser excluída — apenas inativada.
Ambas podem ser criadas direto do cadastro de produto.

---

## 3.6 Regras especiais

| Situação | Comportamento |
|---|---|
| Preço abaixo do custo (RN-P05) | Faixa vermelha no cadastro, ícone de alerta na listagem e confirmação extra na venda |
| Preço revendedor > consumidor | Aviso amarelo, não bloqueia |
| Exclusão com saldo | Bloqueada (I-16). Oferece "Inativar" como alternativa |
| Produto inativo | Não aparece em nova venda/compra; continua em relatórios históricos |
| Alteração de preço | Registrada no log de auditoria; **não altera vendas anteriores** (RN-V08) |

---

# 4. MÓDULO: ESTOQUE
### *Prompt 6*

## 4.1 Conceito

O estoque é um **livro-razão de partida dobrada** (ADR-01). Nenhuma tela altera saldo diretamente: toda operação lança movimentos e os saldos se atualizam sozinhos.

## 4.2 Tela — Posição atual (`/estoque`)

```
┌────────────────────────────────────────────────────────────────────┐
│ Posição de Estoque                        [Exportar ▾] [🖨]        │
├──────────────┬──────────────┬──────────────┬──────────────────────┤
│ DISPONÍVEL   │ MOSTRUÁRIO   │ CONSIGNADO   │ RESERVADO            │
│ 412 un       │  38 un       │  22 un       │  4 un                │
│ R$ 31.450,00 │ R$ 4.120,00  │ R$ 2.720,00  │ R$ 480,00            │
├──────────────┴──────────────┴──────────────┴──────────────────────┤
│ INVESTIMENTO TOTAL EM MERCADORIA          R$ 38.770,00            │
│ POTENCIAL DE VENDA                        R$ 92.300,00            │
│ LUCRO POTENCIAL                           R$ 53.530,00  (58,0%)   │
├────────────────────────────────────────────────────────────────────┤
│ 🔍 Buscar   [Categoria ▾][Situação ▾][Só estoque baixo ☐]         │
├────────────────────────────────────────────────────────────────────┤
│ Cód │ Produto │ Disp │ Most │ Cons │ Res │ Total │ Custo │ Valor  │
└────────────────────────────────────────────────────────────────────┘
```

## 4.3 Tela — Kardex / Movimentações (`/estoque/movimentacoes`)

**Colunas:** Data · Produto · Tipo · Bolso · Documento (link) · Entrada · Saída · Saldo após · Custo unit. · Valor · Usuário · Motivo.

**Filtros:** período, produto, tipo de movimento, bolso, documento de origem, usuário.

Movimentações de **estorno** aparecem em itálico com ícone ↩ e link para o lançamento original.

## 4.4 Tabela de operações

| Operação | Origem | Lançamentos |
|---|---|---|
| Entrada por compra | Confirmar compra | `+qtd` DISPONIVEL |
| Saída por venda | Confirmar venda | `−qtd` DISPONIVEL |
| Envio a mostruário | Confirmar remessa | `−qtd` DISPONIVEL **e** `+qtd` MOSTRUARIO |
| Envio em consignação | Confirmar remessa | `−qtd` DISPONIVEL **e** `+qtd` CONSIGNADO |
| Revendedor vendeu | Prestação de contas | `−qtd` MOSTRUARIO/CONSIGNADO |
| Devolução | Prestação de contas | `−qtd` do bolso **e** `+qtd` DISPONIVEL |
| Perda | Prestação de contas / ajuste | `−qtd` do bolso + despesa |
| Reserva | Venda em rascunho (opcional) | `−qtd` DISPONIVEL **e** `+qtd` RESERVADO |
| Ajuste positivo | Inventário | `+qtd` DISPONIVEL, motivo obrigatório |
| Ajuste negativo | Inventário | `−qtd` DISPONIVEL, motivo obrigatório |
| Estorno | Cancelamento | lançamento inverso vinculado ao original |

## 4.5 Tela — Ajuste / Inventário (`/estoque/ajuste`)

Dois modos:

**Ajuste pontual:** produto, bolso, quantidade (±), motivo obrigatório (mín. 5 caracteres), observações.

**Inventário em lote:** lista os produtos com o saldo do sistema e um campo "quantidade contada". Ao salvar, o sistema gera automaticamente um ajuste para cada divergência, com o motivo *"Inventário de dd/mm/aaaa"*, e apresenta um resumo antes de confirmar:

```
DIVERGÊNCIAS ENCONTRADAS: 7 produtos
  Sobras:  3 produtos, +8 un,  R$   642,00
  Faltas:  4 produtos, −5 un,  R$   890,00
  Impacto líquido no estoque:  −R$ 248,00

⚠ As faltas gerarão despesa da categoria PERDA_ESTOQUE.
[Cancelar]  [Confirmar inventário]
```

## 4.6 Garantias

| Garantia | Implementação |
|---|---|
| Estoque nunca negativo (RN-E01) | `CHECK` + validação com `FOR UPDATE` em `fn_lancar_movimento` |
| Histórico completo | Toda linha do livro-razão guarda documento, usuário e data |
| Movimentação imutável | Trigger bloqueia UPDATE/DELETE |
| Saldo sempre reconstituível | Consulta de reconciliação (Documento 2, §22.1) |
| Concorrência | Trava de linha no produto impede duas vendas do último item |

## 4.7 Alertas gerados

| Alerta | Condição | Severidade |
|---|---|---|
| Estoque baixo | `qtd_disponivel ≤ estoque_minimo` | ATENÇÃO |
| Produto esgotado | `qtd_total = 0` e teve venda nos últimos 30 dias | ATENÇÃO |
| Produto parado | Sem saída há mais de 60 dias com saldo | INFO |
| Divergência de saldo | Reconciliação encontrou diferença | CRÍTICO |

---

# 5. MÓDULO: CLIENTES
### *Prompt 7*

## 5.1 Tela — Lista (`/clientes`)

**Cartões:** Total de clientes · Novos no mês · Com saldo devedor · Ticket médio.

**Colunas:** Código · Nome · CPF · WhatsApp · Cidade/UF · Nº compras · Total comprado · **Saldo devedor** · Última compra.

**Busca instantânea** por nome, CPF, telefone ou código, com tolerância a acento e digitação parcial (índice trigram).

## 5.2 Formulário

| Campo | Tipo | Obrig. | Validação |
|---|---|:---:|---|
| Nome | Texto | ✅ | 2–150 caracteres |
| CPF | Texto com máscara | ❌ | **Dígito verificador validado**; único entre ativos (I-19) |
| Telefone | Máscara `(00) 0000-0000` | ❌ | 10 ou 11 dígitos |
| WhatsApp | Máscara | ❌ | Botão "copiar do telefone" |
| E-mail | Texto | ❌ | Formato válido |
| Data de nascimento | Data | ❌ | Passada (permite campanha de aniversário) |
| CEP | Máscara `00000-000` | ❌ | **Preenche endereço automaticamente** via ViaCEP |
| Endereço, Nº, Complemento, Bairro | Texto | ❌ | — |
| Cidade | Texto | ❌ | — |
| Estado | Seleção de UF | ❌ | 2 letras |
| Observações | Texto longo | ❌ | Preferências olfativas, alergias, histórico |

> **Detecção de duplicidade (R7):** ao digitar um nome parecido com um cadastro existente, o sistema mostra *"Cliente parecido encontrado: Maria Silva Santos — (31) 9xxxx. Deseja usar este cadastro?"* antes de permitir criar outro.

## 5.3 Ficha do cliente (`/clientes/[id]`)

**Cabeçalho:** nome, contato, botão **WhatsApp** (abre `wa.me` com mensagem pré-formatada), cidade.

**Cartões:** Total comprado · Nº de compras · Ticket médio · **Saldo devedor** · Parcelas vencidas · Última compra.

**Abas:**
1. Dados cadastrais
2. Histórico de compras (todas as vendas com valor, situação de pagamento e link para o recibo)
3. Financeiro (títulos abertos, vencidos e pagos; histórico de recebimentos)
4. Produtos preferidos (o que este cliente mais compra)

## 5.4 Regras

- Venda **sem cliente cadastrado** é permitida ("Consumidor não identificado") — mas apenas à vista. Venda parcelada exige cliente identificado, pela natureza da cobrança.
- Cliente com títulos em aberto não pode ser excluído; apenas inativado.
- Exclusão sempre pede confirmação nomeando o cliente (RN-S02).

---

# 6. MÓDULO: REVENDEDORES
### *Prompt 8*

## 6.1 Objetivo

Manter o **extrato completo** de cada revendedor: o que recebeu, o que vendeu, o que devolveu, o que ainda está com ele, o que já pagou e o que deve.

## 6.2 Tela — Lista (`/revendedores`)

**Cartões:** Total de revendedores ativos · Valor em poder de terceiros · Total a receber · Total vencido · Revendedores com acerto atrasado.

**Colunas:** Código · Nome · Cidade/UF · WhatsApp · **Itens em posse** · **Valor em posse (custo)** · Total vendido · **Saldo em aberto** · **Vencido** · Dias desde o último acerto.

**Destaques visuais:** linha em âmbar se há item em posse há mais de 60 dias; em vermelho se há saldo vencido.

## 6.3 Formulário

Mesmos campos do cliente, mais:

| Campo | Tipo | Obrig. | Uso |
|---|---|:---:|---|
| Data de cadastro | Data | ✅ | Padrão: hoje |
| Limite de crédito | Moeda | ❌ | 0 = sem limite. Se > 0, o sistema avisa ao ultrapassar |
| Prazo de acerto (dias) | Numérico | ✅ | Padrão 30. Define a data prevista de acerto das remessas |

## 6.4 Ficha do revendedor (`/revendedores/[id]`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 👤 Ana Paula Ferreira            Belo Horizonte/MG   [WhatsApp] [✎] │
│    Cadastro: 12/03/2026  ·  Prazo de acerto: 30 dias                │
├─────────────────────────────────────────────────────────────────────┤
│ EM PODER DELA          VENDAS                 FINANCEIRO            │
│ 12 itens               Recebeu:      48 un    Total devido: 4.180,00│
│ Custo:   R$ 1.560,00   Vendeu:       31 un    Já pagou:     2.940,00│
│ Revenda: R$ 2.980,00   Devolveu:      5 un    Em aberto:    1.240,00│
│ Há: 34 dias ⏳          Perdeu:        0 un    Vencido:        380,00│
│                        Valor vendido: R$ 5.870,00                   │
├─────────────────────────────────────────────────────────────────────┤
│ [Nova remessa]  [Prestação de contas]  [Registrar recebimento]      │
├─────────────────────────────────────────────────────────────────────┤
│ Resumo │ Em posse │ Remessas │ Extrato financeiro │ Histórico       │
└─────────────────────────────────────────────────────────────────────┘
```

Fonte: `vw_extrato_revendedor` (Documento 2, §18).

### Aba "Em posse"
Lista item a item: foto, produto, quantidade, valor de custo, valor de revenda, remessa de origem, data de envio, **dias em posse** (com semáforo).

### Aba "Extrato financeiro"
Extrato em ordem cronológica, com saldo corrido:

| Data | Documento | Histórico | Débito | Crédito | Saldo |
|---|---|---|---:|---:|---:|
| 12/05 | Prestação nº 8 | 12 itens vendidos | 2.180,00 | | 2.180,00 |
| 20/05 | Recebimento nº 34 | PIX | | 1.000,00 | 1.180,00 |
| 05/06 | Prestação nº 11 | 9 itens vendidos | 2.000,00 | | 3.180,00 |
| 18/06 | Recebimento nº 41 | Dinheiro | | 1.940,00 | 1.240,00 |
| | | **Saldo devedor atual** | | | **1.240,00** |

Exportável em PDF e Excel — é o documento que o revendedor recebe.

## 6.5 Os dois modelos de relacionamento

O sistema suporta ambos simultaneamente para o mesmo revendedor:

| Modelo | Como registrar | Quando vira dívida | Estoque |
|---|---|---|---|
| **Venda firme** | Módulo Vendas, tipo REVENDEDOR | Na hora da venda | Sai definitivamente |
| **Consignação** | Módulo Mostruários | Só na prestação de contas | Fica no bolso CONSIGNADO |

A ficha do revendedor consolida os dois no mesmo saldo devedor.

---

# 7. MÓDULO: MOSTRUÁRIOS E CONSIGNAÇÃO
### *Prompt 9*

> **Este é o módulo que diferencia o sistema.** Errar aqui infla a receita e destrói a confiança nos números (Risco R1).

## 7.1 Regra fundamental

**Enviar não é vender.** A remessa apenas transfere o produto do bolso DISPONIVEL para MOSTRUARIO/CONSIGNADO. Nenhuma receita, nenhum título, nenhum lucro é registrado no envio (RN-M01).

## 7.2 Tela — Remessas (`/mostruarios`)

**Cartões:** Itens em poder de terceiros · Valor de custo investido · Valor de revenda potencial · Remessas com acerto atrasado · Tempo médio em posse.

**Duas visões:**

**Por remessa:** Nº · Revendedor · Tipo · Data de envio · Itens enviados · Em posse · Valor custo · Valor revenda · Dias · Previsão de acerto · Status.

**Por item (`vw_itens_em_posse`):** Foto · Produto · Revendedor · Qtd em posse · Custo · Revenda · Data de envio · **Dias em posse** com semáforo (🟢 <30 · 🟡 30–60 · 🔴 >60).

## 7.3 Tela — Nova remessa (`/mostruarios/nova`)

| Campo | Tipo | Obrig. | Regra |
|---|---|:---:|---|
| Revendedor | Autocomplete | ✅ | Ativo |
| Tipo | MOSTRUÁRIO / CONSIGNAÇÃO | ✅ | Mostruário = amostra para demonstração; Consignação = para vender |
| Data de envio | Data | ✅ | Não futura |
| Previsão de acerto | Data | ❌ | Auto: envio + prazo do revendedor |
| Produto | Autocomplete | ✅ | Só produtos com saldo disponível |
| Quantidade | Numérico | ✅ | > 0 e ≤ disponível |
| Valor de custo unit. | Auto | — | Custo médio atual, **congelado** (RN-M02) |
| Valor de revenda unit. | Moeda | ✅ | Sugere `preco_revendedor`, editável |
| Observações | Texto | ❌ | — |

**Painel de resumo:**
```
Itens enviados          15 un (6 produtos)
Valor de custo          R$ 1.940,00   ← o que a empresa arrisca
Valor de revenda        R$ 3.720,00   ← o que o revendedor deve se vender tudo
Lucro potencial         R$ 1.780,00   (47,8%)
Previsão de acerto      15/09/2026
```

**Ao confirmar:** transferência entre bolsos + geração do **recibo de entrega em PDF** para assinatura.

## 7.4 Tela — Detalhe da remessa (`/mostruarios/[id]`)

Mostra cada item com o saldo por situação e permite **baixa individual** sem esperar o acerto completo (útil quando o revendedor avisa uma venda pelo WhatsApp):

```
Perfume A · 5 enviadas
  Em posse: 2 · Vendidas: 2 · Devolvidas: 1 · Perdidas: 0
  [Registrar venda] [Registrar devolução] [Registrar perda]
```

## 7.5 Assistente de prestação de contas

O fluxo mais importante do módulo. Acessível pela ficha do revendedor ou pela remessa.

**Passo 1 — Levantamento.** O sistema lista **todos** os itens em posse do revendedor, de todas as remessas abertas, com dias em posse e valores.

**Passo 2 — Classificação.** Para cada item o operador informa as quantidades:

```
┌────────────────────────────────────────────────────────────────────┐
│ Perfume A  (Remessa nº 12 · enviado 34 dias atrás)                 │
│ Em posse: 5 un   Custo un. R$ 129,33   Revenda un. R$ 179,00       │
│                                                                     │
│  Vendidas [ 3 ]   Devolvidas [ 1 ]   Perdidas [ 0 ]   Continua: 1  │
│                                                                     │
│  → Gera a receber: R$ 537,00   → Volta ao estoque: 1 un            │
└────────────────────────────────────────────────────────────────────┘
```
Validação: `vendidas + devolvidas + perdidas ≤ em posse` (I-11).

**Passo 3 — Resumo do acerto.**
```
RESUMO DA PRESTAÇÃO DE CONTAS — Ana Paula Ferreira — 01/08/2026
22 unidades em posse · 3 remessas abertas

VENDIDOS         14 un   Revenda R$ 2.509,00   Custo R$ 1.847,64
DEVOLVIDOS        4 un   Volta ao estoque: R$ 244,83 de custo
PERDIDOS          1 un   Custo R$ 323,33
CONTINUA EM POSSE 3 un   Custo R$ 387,99  ·  Revenda R$ 537,00

════════════════════════════════════════════════════════════
Produtos vendidos                         R$ 2.509,00
(+) Produto perdido cobrado               R$   323,33
VALOR DEVIDO PELO REVENDEDOR              R$ 2.832,33
────────────────────────────────────────────────────────────
Lucro bruto do acerto                     R$   661,36  (26,4%)
Perda absorvida pela empresa              R$     0,00
Resultado líquido do acerto               R$   661,36
════════════════════════════════════════════════════════════

Condição de pagamento: [Parcelado ▾]  Parcelas: [2 ▾]
☑ Cobrar do revendedor o item perdido (R$ 323,33)
```

> **A caixa de cobrança altera os números em tempo real.** Marcada, a perda entra no valor devido
> e a empresa não absorve nada. Desmarcada, o valor devido cai para R$ 2.509,00, a perda de
> R$ 323,33 vira despesa da categoria `PERDA_ESTOQUE` e o resultado líquido do acerto cai para
> R$ 338,03. As duas linhas ficam sempre visíveis para que a consequência da escolha seja explícita.

**Passo 4 — Confirmação.** Em uma única transação:
1. Grava os eventos em `remessa_item_eventos` (fato imutável)
2. Vendidos → baixa do bolso MOSTRUARIO/CONSIGNADO
3. Devolvidos → volta ao bolso DISPONIVEL pelo mesmo custo (RN-E06)
4. Perdidos → baixa + despesa da categoria `PERDA_ESTOQUE`
5. Gera os títulos a receber do valor devido
6. Encerra as remessas que ficaram sem itens em posse (RN-M07)
7. Atualiza dashboard e relatórios

**Passo 5 — Documento.** PDF de prestação de contas para assinatura.

## 7.6 Alertas do módulo

| Alerta | Condição | Ação sugerida |
|---|---|---|
| Mostruário antigo | Item em posse há mais de 60 dias | "Fazer prestação de contas" |
| Acerto atrasado | `data_prevista_acerto < hoje` com itens em posse | "Entrar em contato" (link WhatsApp) |
| Revendedor inativo com itens | Sem acerto há mais de 90 dias | "Cobrar devolução" |
| Limite de crédito estourado | Valor em posse + saldo devedor > limite | Bloqueia nova remessa com confirmação do administrador |

---

# 8. MÓDULO: VENDAS
### *Prompt 10*

## 8.1 Tela — Lista (`/vendas`)

**Cartões:** Total vendido no período · Nº de vendas · Ticket médio · Lucro bruto · Margem média.

**Colunas:** Nº · Data · Tipo · Cliente/Revendedor · Itens · Subtotal · Desconto · **Total** · Forma de pagamento · Parcelas · **Situação do pagamento** · Status.

**Situação do pagamento** é um resumo dos títulos: `Pago` · `Parcial (2/4)` · `Em aberto` · `Vencido` 🔴.

## 8.2 Tela — Nova venda (`/vendas/nova`)

Formulário em quatro etapas com barra de progresso, mantendo o painel de totais sempre visível.

### Etapa 1 — Tipo e destinatário
| Campo | Regra |
|---|---|
| Tipo | CONSUMIDOR FINAL ou REVENDEDOR — **define qual tabela de preço será usada** (RN-V01) |
| Cliente | Autocomplete + criar inline. Opção "Consumidor não identificado" (só à vista) |
| Revendedor | Obrigatório quando tipo = REVENDEDOR |
| Data | Padrão hoje, não futura |

Ao selecionar o destinatário, o sistema exibe um resumo: última compra, total histórico e **saldo devedor atual** — informação que muda a decisão de vender parcelado.

### Etapa 2 — Produtos
Busca por nome, código ou código de barras. Cada linha mostra foto, saldo disponível, preço da tabela aplicável e margem.

| Campo | Regra |
|---|---|
| Produto | Só com saldo disponível > 0 (RN-V07) |
| Quantidade | > 0 e ≤ disponível (validação em tempo real) |
| Preço unitário | Sugerido pela tabela do tipo de venda; **editável** e gravado como preço praticado |
| Desconto do item | Opcional |
| Subtotal | Calculado |

Alertas por linha: 🔴 preço abaixo do custo · 🟡 preço abaixo do preço de tabela · ⚠ estoque ficará zerado.

### Etapa 3 — Desconto e pagamento
| Campo | Regra |
|---|---|
| Desconto | Em R$ **ou** em % (os dois campos se sincronizam). Não pode exceder o subtotal (RN-V03). Acima do parâmetro (padrão 10%) pede confirmação |
| Forma de pagamento | Da tabela `formas_pagamento` |
| Nº de parcelas | 1 a 4; limitado por `max_parcelas` da forma escolhida |
| Data da 1ª parcela | Padrão: +30 dias (ou hoje, se à vista) |
| Intervalo | Padrão 30 dias |

**Prévia das parcelas** (editável linha a linha):
```
Total: R$ 897,00 em 3x

  1/3   R$ 299,00   venc. 31/08/2026
  2/3   R$ 299,00   venc. 30/09/2026
  3/3   R$ 299,00   venc. 30/10/2026
  ────────────────────────────────────
  Soma: R$ 897,00  ✔ confere com o total
```
A conferência é exibida sempre — o usuário nunca precisa somar (RN-V04, §10.7 do Doc. 1).

### Etapa 4 — Revisão e confirmação
```
┌────────────────────────────────────────────────────────┐
│ Subtotal                              R$ 950,00        │
│ Desconto (5,58%)                    − R$  53,00        │
│ ═══════════════════════════════════════════════        │
│ TOTAL DA VENDA                        R$ 897,00        │
│                                                         │
│ Custo dos produtos (CMV)              R$ 512,40        │
│ LUCRO BRUTO DA VENDA                  R$ 384,60        │
│ Margem                                     42,88%      │
│                                                         │
│ Cartão de Crédito · 3x                                 │
└────────────────────────────────────────────────────────┘
        [Voltar]              [Confirmar venda]
```

O **lucro da venda aparece antes de confirmar** — o operador decide com informação completa.

## 8.3 Confirmação (`fn_confirmar_venda`)

Transação única:
1. Revalida o saldo de cada item com trava de linha
2. **Congela o CMV** (`custo_unitario_praticado = custo_medio` atual) — RN-V08
3. Lança as saídas no livro-razão
4. Grava `custo_total` e calcula `lucro_bruto`
5. Gera os títulos com o lucro rateado proporcionalmente (`lucro_proporcional`)
6. Se à vista: cria o recebimento e a alocação, deixando o título como PAGO (RN-V06)
7. Atualiza `data_ultima_saida` dos produtos
8. Marca `CONFIRMADO`

**Tela de sucesso:** `[Gerar recibo PDF]` `[Imprimir]` `[Enviar por WhatsApp]` `[Nova venda]`

## 8.4 Cancelamento (RN-V09)

Confirmação em duas etapas, mostrando exatamente o que será desfeito:
```
⚠ CANCELAR VENDA Nº 147

Isto irá:
  ✓ Devolver 3 produtos ao estoque (7 unidades)
  ✓ Cancelar 2 parcelas em aberto (R$ 598,00)
  ⚠ ATENÇÃO: R$ 299,00 já foram recebidos.
     Este valor precisa ser estornado separadamente.

Motivo do cancelamento: [___________________] (obrigatório)
                                    [Voltar] [Confirmar cancelamento]
```

## 8.5 Mensagens de erro

| Situação | Mensagem |
|---|---|
| Sem saldo | "Perfume A tem apenas 2 unidades disponíveis. Ajuste a quantidade ou registre uma compra." |
| Desconto excessivo | "O desconto não pode ser maior que o valor dos produtos." |
| Parcelado sem cliente | "Vendas parceladas exigem um cliente identificado. Cadastre o cliente ou altere para pagamento à vista." |
| Revendedor sem revendedor | "Selecione o revendedor para este tipo de venda." |

---

# 9. MÓDULO: CONTAS A RECEBER
### *Prompt 11*

## 9.1 Tela principal (`/financeiro/contas-receber`)

**Cartões:** Total a receber · **Vencido** 🔴 · Vence em 7 dias 🟡 · Recebido no mês 🟢 · Inadimplência %.

**Abas de recorte:**

| Aba | Filtro | Ordenação |
|---|---|---|
| 🔴 Vencidos | `situacao_real IN ('VENCIDO','PARCIAL_VENCIDO')` | Maior atraso primeiro |
| 🟡 Vence em breve | vencimento entre hoje e +7 | Mais próximo primeiro |
| 📅 A vencer | vencimento > +7 | Cronológica |
| ✅ Pagos | `situacao = 'PAGO'` | Quitação mais recente |
| 📋 Todos | — | Vencimento |

**Recorte por devedor:** `Consumidor Final` · `Revendedores` · `Todos` — atendendo à separação exigida no Prompt 11.

**Colunas:** ☐ · Vencimento · **Dias** (atraso ou a vencer) · Devedor · Tipo · Origem (Venda nº / Prestação nº) · Parcela (2/4) · Valor · Recebido · **Saldo** · Situação · Ações (💰 Receber · 📱 WhatsApp · 📄 Recibo).

## 9.2 Registro de recebimento

Fluxo com seleção múltipla — resolve o caso real "o cliente mandou um PIX de R$ 500 que cobre duas parcelas e sobra troco na terceira".

```
┌──────────────────────────────────────────────────────────────┐
│ REGISTRAR RECEBIMENTO — Maria Silva                          │
├──────────────────────────────────────────────────────────────┤
│ Valor recebido    [R$ 500,00]                                │
│ Data              [01/08/2026]                               │
│ Forma             [PIX ▾]                                    │
│ Comprovante       [📎 anexar]                                │
├──────────────────────────────────────────────────────────────┤
│ ALOCAÇÃO AUTOMÁTICA (do mais antigo para o mais novo)        │
│                                                               │
│ ☑ Parc. 1/4 · venc. 30/06 · atraso 32d · saldo 299,00        │
│      alocar → [R$ 299,00]                        ✅ quitada   │
│ ☑ Parc. 2/4 · venc. 30/07 · atraso  2d · saldo 299,00        │
│      alocar → [R$ 201,00]                        ⚠ parcial    │
│ ☐ Parc. 3/4 · venc. 30/08 ·            · saldo 299,00        │
│                                                               │
│ Total alocado           R$ 500,00                            │
│ Saldo não alocado       R$   0,00  ✔                         │
├──────────────────────────────────────────────────────────────┤
│                              [Cancelar]  [Confirmar]         │
└──────────────────────────────────────────────────────────────┘
```

A alocação é sugerida automaticamente (mais antigo primeiro) mas **totalmente editável**. Regra: `Σ alocações ≤ valor recebido` (RN-F03).

Ao confirmar: grava `recebimentos` + `recebimento_alocacoes`; a trigger atualiza saldo, situação e o **lucro recebido** de cada título.

## 9.3 Estorno (RN-F04)

Disponível apenas para o perfil ADMIN. Marca o recebimento como estornado, marca as alocações como estornadas, e as triggers reabrem os títulos. **Nada é apagado** — o histórico permanece visível com a marca "ESTORNADO".

## 9.4 Alertas automáticos (RN-F05)

Job diário às 08:00 (`/api/cron/alertas-vencimento`):

| Alerta | Condição | Severidade |
|---|---|---|
| Vence em 3 dias | `vencimento = hoje + 3` e aberto | ATENÇÃO |
| Vence hoje | `vencimento = hoje` e aberto | ATENÇÃO |
| Venceu ontem | `vencimento = hoje − 1` e aberto | CRÍTICO |
| Atraso > 30 dias | `hoje − vencimento > 30` | CRÍTICO |

A restrição `UNIQUE` em `notificacoes` impede alerta duplicado se o job rodar duas vezes.

**Mensagem de cobrança pronta:** o botão WhatsApp abre a conversa com um texto gerado a partir de um modelo parametrizável, já com nome, valor, vencimento e chave PIX — o usuário só revisa e envia.

## 9.5 Fórmulas

```
Saldo do título     = valor_original − Σ(alocações não estornadas)
Total a receber     = Σ saldos abertos
Vencido             = Σ saldos abertos com vencimento < hoje
A vencer (7d)       = Σ saldos com hoje ≤ vencimento ≤ hoje+7
Inadimplência %     = Vencido ÷ Total a receber × 100
Prazo médio         = Σ(saldo × dias até vencimento) ÷ Σ saldo
```

---

# 10. MÓDULO: RECIBOS E DOCUMENTOS PDF
### *Prompt 12*

## 10.1 Princípios

- Gerados **no servidor** com `@react-pdf/renderer` — layout idêntico em qualquer dispositivo
- Numeração sequencial única, vinculada ao documento de origem
- Cabeçalho com dados da empresa vindos de `parametros`
- Formato A4, também utilizável em impressora térmica 80 mm (folha alternativa)
- Ações: baixar, imprimir, enviar por WhatsApp/e-mail

## 10.2 Recibo de venda ao consumidor

```
┌─────────────────────────────────────────────────────────────┐
│ [LOGO]   FRAGRÂNCIAS                    RECIBO Nº 000147    │
│          CPF/CNPJ · Telefone            Data: 01/08/2026    │
│          Endereço                                            │
├─────────────────────────────────────────────────────────────┤
│ CLIENTE                                                      │
│ Maria Silva Santos · CPF 123.456.789-00                     │
│ (31) 98765-4321 · Rua das Flores, 123 · Belo Horizonte/MG   │
├─────────────────────────────────────────────────────────────┤
│ Item │ Produto              │ Qtd │ Unitário │      Total   │
│  1   │ Perfume A 100ml      │  2  │  249,00  │     498,00   │
│  2   │ Perfume B 50ml       │  1  │  399,00  │     399,00   │
│  3   │ Body Splash C        │  1  │   53,00  │      53,00   │
├─────────────────────────────────────────────────────────────┤
│                                    Subtotal      R$ 950,00  │
│                                    Desconto    − R$  53,00  │
│                                    ══════════════════════   │
│                                    TOTAL         R$ 897,00  │
├─────────────────────────────────────────────────────────────┤
│ PAGAMENTO: Cartão de Crédito · 3x                           │
│   Parcela 1/3   R$ 299,00   venc. 31/08/2026                │
│   Parcela 2/3   R$ 299,00   venc. 30/09/2026                │
│   Parcela 3/3   R$ 299,00   venc. 30/10/2026                │
├─────────────────────────────────────────────────────────────┤
│ Observações: _______________________________________________│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ______________________        ______________________      │
│        Vendedor                       Cliente                │
├─────────────────────────────────────────────────────────────┤
│ Documento gerado em 01/08/2026 às 14:32 · Recibo nº 000147  │
└─────────────────────────────────────────────────────────────┘
```

## 10.3 Recibo de entrega ao revendedor

Mesmo cabeçalho, com as diferenças que importam:

- Título: **RECIBO DE ENTREGA — MOSTRUÁRIO/CONSIGNAÇÃO**
- Colunas: Produto · Qtd · **Valor de custo** · **Valor de revenda** · Total de revenda
- Totais: valor de custo total, valor de revenda total, **previsão de acerto**
- **Termo de responsabilidade:** *"Declaro ter recebido os produtos acima relacionados em regime de [mostruário/consignação], comprometendo-me a prestar contas até dd/mm/aaaa, devolvendo os produtos não vendidos em perfeito estado ou efetuando o pagamento dos valores correspondentes."*
- Assinatura do revendedor com CPF
- **Duas vias** (empresa e revendedor)

## 10.4 Prestação de contas do revendedor

```
PRESTAÇÃO DE CONTAS Nº 000023            Período: 01/06 a 01/08/2026
Revendedor: Ana Paula Ferreira · CPF 987.654.321-00

1. PRODUTOS RECEBIDOS
   Remessa │ Data      │ Produto        │ Qtd │ Custo un. │ Revenda un.
     12    │ 28/06/26  │ Perfume A      │  9  │   129,33  │    179,00
     12    │ 28/06/26  │ Perfume B      │  4  │   323,33  │    420,00
     15    │ 10/07/26  │ Body Splash C  │  9  │    38,50  │     59,00
   ──────────────────────────────────────────────────────────────────
   TOTAL RECEBIDO: 22 un · Custo R$ 2.803,79 · Revenda R$ 3.822,00

2. PRODUTOS VENDIDOS ...... 14 un (A 5 · B 3 · C 6) · revenda R$ 2.509,00
3. PRODUTOS DEVOLVIDOS ....  4 un (A 1 · C 3) ...... custo   R$   244,83
4. PRODUTOS PERDIDOS ......  1 un (B 1) ............ custo   R$   323,33
5. AINDA EM POSSE .........  3 un (A 3) · custo R$ 387,99 · revenda R$ 537,00
   ──────────────────────────────────────────────────────────────────
   CONFERÊNCIA: 14 + 4 + 1 + 3 = 22 un  ✔ fecha com o recebido

6. RESUMO FINANCEIRO
   Valor dos produtos vendidos ................. R$ 2.509,00
   (+) Produto perdido cobrado ................. R$   323,33
   ────────────────────────────────────────────────────────
   TOTAL DESTE ACERTO .......................... R$ 2.832,33
   (+) Saldo anterior em aberto ................ R$ 1.240,00
   ────────────────────────────────────────────────────────
   TOTAL A PAGAR ............................... R$ 4.072,33

7. HISTÓRICO DE PAGAMENTOS
   20/05/2026 · PIX ......................... R$ 1.000,00
   18/06/2026 · Dinheiro .................... R$ 1.940,00
   ──────────────────────────────────────────────────────
   Total pago até esta data ................. R$ 2.940,00

8. CONDIÇÃO DE PAGAMENTO
   Parcela 1/2  R$ 2.036,17  venc. 31/08/2026
   Parcela 2/2  R$ 2.036,16  venc. 30/09/2026
   (o centavo residual vai para a 1ª parcela — RN-V04)

   _______________________        _______________________
        Responsável                  Ana Paula Ferreira
```

## 10.5 Outros documentos

| Documento | Origem | Conteúdo |
|---|---|---|
| Comprovante de recebimento | Recebimento | Valor, data, forma, títulos quitados, saldo restante |
| Extrato do revendedor | Ficha do revendedor | Movimentação cronológica com saldo corrido |
| Extrato do cliente | Ficha do cliente | Compras e pagamentos |
| Relatório impresso | Qualquer relatório | Cabeçalho, filtros aplicados, tabela, totais, data/hora |

---

# 11. MÓDULO: RELATÓRIOS
### *Prompt 13*

## 11.1 Central de relatórios (`/relatorios`)

Catálogo em cards agrupados por área, cada um com nome, descrição e botão "Gerar".

## 11.2 Catálogo completo

| # | Relatório | Filtros | Colunas principais | Totais |
|---|---|---|---|---|
| 1 | **Compras** | Período, fornecedor, produto, status | Nº, data, fornecedor, itens, subtotal, frete, taxa, outros, custo total | Somas de todas as colunas de valor |
| 2 | **Compras por produto** | Período, produto, categoria | Produto, qtd comprada, custo médio do período, custo mín/máx, total | Qtd e valor |
| 3 | **Produtos / Catálogo** | Categoria, marca, situação, margem | Código, nome, categoria, custo, preços, margens, saldos | Valor de estoque e margem média |
| 4 | **Posição de estoque** | Categoria, situação | Produto, disponível, mostruário, consignado, reservado, total, custo, valor | Valor por bolso |
| 5 | **Movimentação de estoque (Kardex)** | Período, produto, tipo | Data, produto, tipo, documento, entrada, saída, saldo, custo | Entradas e saídas |
| 6 | **Produtos parados** | Dias sem venda, categoria | Produto, saldo, valor, última saída, dias parados | Capital imobilizado |
| 7 | **Clientes** | Cidade, período de cadastro | Nome, CPF, contato, cidade, nº compras, total, saldo devedor | Total e saldo |
| 8 | **Vendas** | Período, tipo, cliente, revendedor, forma | Nº, data, tipo, comprador, total, desconto, CMV, lucro, margem | Receita, CMV, lucro |
| 9 | **Vendas por produto** | Período, categoria | Produto, qtd vendida, receita, CMV, lucro, margem | Totais e ranking |
| 10 | **Revendedores** | Cidade, situação | Nome, recebidos, vendidos, devolvidos, em posse, devido, pago, saldo | Saldos consolidados |
| 11 | **Mostruários** | Período, revendedor, status | Revendedor, produto, qtd, custo, revenda, data de envio, **data de devolução**, dias em posse, situação | Valor investido |
| 12 | **Prestações de contas** | Período, revendedor | Nº, data, revendedor, vendido, devolvido, perdido, devido, lucro | Totais |
| 13 | **Contas a receber** | Período, situação, devedor | Vencimento, devedor, origem, parcela, valor, recebido, saldo, dias | Aberto, vencido, a vencer |
| 14 | **Recebimentos** | Período, forma, devedor | Data, devedor, valor, forma, títulos quitados | Total recebido |
| 15 | **Produtos pagos** | Período, devedor | Produto, comprador, valor, data de recebimento, forma | Total |
| 16 | **Financeiro / DRE** | Período | Receita, descontos, receita líquida, CMV, lucro bruto, despesas, lucro líquido | Estrutura de DRE |
| 17 | **Fluxo de caixa** | Período, projeção | Data, entradas, saídas, saldo do dia, saldo acumulado | Saldo final |
| 18 | **Lucratividade por produto** | Período, categoria | Produto, qtd, receita, custo, lucro, margem, participação % | Ranking |
| 19 | **Despesas** | Período, categoria | Data, categoria, descrição, valor, forma | Total por categoria |
| 20 | **Auditoria** | Período, usuário, tabela, ação | Data/hora, usuário, ação, tabela, registro, campos alterados | Nº de eventos |

## 11.3 Estrutura padrão de todo relatório

```
┌───────────────────────────────────────────────────────────────┐
│ ← Relatórios    Relatório de Vendas                           │
├───────────────────────────────────────────────────────────────┤
│ FILTROS                                                        │
│ Período [01/07/2026] a [01/08/2026]  [Este mês ▾]             │
│ Tipo [Todos ▾]  Cliente [Todos ▾]  Forma [Todas ▾]            │
│ 🔍 Buscar…                              [Limpar] [Aplicar]     │
├───────────────────────────────────────────────────────────────┤
│ [📊 Excel] [📄 PDF] [🖨 Imprimir]        130 registros         │
├───────────────────────────────────────────────────────────────┤
│ (tabela com ordenação por coluna e paginação)                 │
├───────────────────────────────────────────────────────────────┤
│ TOTAIS: Receita R$ 27.890,00 · CMV R$ 16.650,00 ·             │
│         Lucro R$ 11.240,00 · Margem 40,3%                     │
└───────────────────────────────────────────────────────────────┘
```

## 11.4 Exportação

| Formato | Implementação | Conteúdo |
|---|---|---|
| **Excel** | ExcelJS | Aba "Dados" com a tabela formatada (moeda, data, %), aba "Resumo" com os totais, aba "Filtros" registrando os parâmetros usados. Congelamento de cabeçalho e autofiltro |
| **PDF** | React-PDF | Cabeçalho da empresa, título, filtros aplicados, tabela paginada, totais, rodapé com data/hora e paginação |
| **Impressão** | CSS `@media print` | Sem menu, sem botões, quebra de página inteligente, cabeçalho repetido |

Toda exportação é registrada no log de auditoria (ação `EXPORT`) — importante para rastrear saída de dados de clientes.

---

# 12. MÓDULO: FINANCEIRO
### *Prompt 14*

## 12.1 Tela — DRE gerencial (`/financeiro`)

```
┌─────────────────────────────────────────────────────────────┐
│ Demonstrativo de Resultado          [Período: Este mês ▾]   │
├─────────────────────────────────────────────────────────────┤
│ RECEITAS                                                     │
│   Vendas a consumidor final                    R$ 18.240,00 │
│   Vendas a revendedor (direta)                 R$  6.420,00 │
│   Vendas por consignação                       R$  3.230,00 │
│   ─────────────────────────────────────────────────────────│
│   Receita líquida (soma acima)                 R$ 27.890,00 │
│   Descontos já concedidos nas vendas             R$   980,00 │
│   (receita bruta equivalente: R$ 28.870,00)                 │
│                                                              │
│ CUSTO DA MERCADORIA VENDIDA                                 │
│   CMV                                        − R$ 16.650,00 │
│   ═════════════════════════════════════════════════════════│
│   LUCRO BRUTO                                  R$ 11.240,00 │
│   Margem bruta                                       40,30% │
│                                                              │
│ DESPESAS OPERACIONAIS                                       │
│   Perdas de estoque                          − R$    340,00 │
│   Frete de envio                             − R$    280,00 │
│   Taxas de pagamento                         − R$    620,00 │
│   Embalagem                                  − R$    130,00 │
│   Marketing                                  − R$      0,00 │
│   Outras                                     − R$      0,00 │
│   ─────────────────────────────────────────────────────────│
│   Total de despesas                          − R$  1.370,00 │
│   ═════════════════════════════════════════════════════════│
│   LUCRO LÍQUIDO                                R$  9.870,00 │
│   Margem líquida                                     35,39% │
├─────────────────────────────────────────────────────────────┤
│ REGIME DE CAIXA                                             │
│   Lucro já recebido                            R$  7.310,00 │
│   Lucro ainda a receber                        R$  3.930,00 │
│   Conferência: 7.310 + 3.930 = 11.240 = Lucro bruto  ✔      │
└─────────────────────────────────────────────────────────────┘
```

A linha de conferência é exibida propositalmente: é a garantia visível de que os números fecham (marco M5).

> **Cuidado que o DRE precisa ter.** `vendas.valor_total` **já é líquido de desconto**
> (`valor_total = subtotal − desconto`). Subtrair os descontos outra vez do total vendido é o erro
> mais fácil de cometer aqui — ele reduz a receita líquida sem reduzir o lucro bruto, e as duas
> margens saem erradas. Por isso a função `fn_dre` (Documento 2, §18) **soma** os descontos de
> volta para reconstituir a receita bruta, em vez de subtraí-los. Todas as linhas acima vêm dela.

> **Fonte dos números.** O DRE consome `vw_resultado_consolidado`, que une venda direta e
> consignação. Usar apenas `vw_resultado_vendas` deixaria a receita da consignação aparecer sem
> o lucro correspondente, e a identidade do regime de caixa deixaria de fechar.

## 12.2 Tela — Fluxo de caixa (`/financeiro/fluxo-caixa`)

**Realizado:** entradas (recebimentos não estornados) menos saídas (compras confirmadas + despesas pagas), por dia, com saldo acumulado.

**Projetado:** títulos a receber pelas datas de vencimento menos despesas recorrentes previstas.

```
┌──────────────────────────────────────────────────────────┐
│ Fluxo de Caixa            [Realizado ▾] [Próx. 90 dias]  │
├──────────────────────────────────────────────────────────┤
│ (gráfico de barras: entradas verdes, saídas vermelhas,   │
│  linha de saldo acumulado)                               │
├──────────────────────────────────────────────────────────┤
│ Data     │ Entradas  │ Saídas    │ Saldo dia │ Acumulado │
│ 01/08    │ 1.240,00  │   380,00  │   860,00  │  8.420,00 │
│ 02/08    │   890,00  │ 4.526,60  │−3.636,60  │  4.783,40 │
├──────────────────────────────────────────────────────────┤
│ Saldo inicial 7.560,00 · Entradas 12.340,00 ·            │
│ Saídas 8.900,00 · SALDO FINAL 11.000,00                  │
└──────────────────────────────────────────────────────────┘
```

Alerta automático quando a projeção indica saldo negativo em algum dia futuro.

## 12.3 Tela — Despesas (`/financeiro/despesas`)

| Campo | Tipo | Obrig. |
|---|---|:---:|
| Categoria | Seleção (enum) | ✅ |
| Descrição | Texto | ✅ |
| Valor | Moeda | ✅ (> 0) |
| Data da despesa | Data | ✅ |
| Data do pagamento | Data | ❌ |
| Forma de pagamento | Seleção | ❌ |
| Produto relacionado | Autocomplete | ❌ |
| Comprovante | Upload | ❌ |
| Recorrente | Sim/Não | ❌ |

**Despesas automáticas:** perdas de estoque e perdas em prestação de contas geram despesa automaticamente na categoria `PERDA_ESTOQUE`, vinculadas ao documento de origem. Essas linhas não são editáveis manualmente — só desaparecem se o documento de origem for cancelado.

## 12.4 Indicadores financeiros

| Indicador | Fórmula |
|---|---|
| Receita líquida | Receita bruta − descontos |
| CMV | Σ custo praticado dos itens vendidos |
| Lucro bruto | Receita líquida − CMV |
| Lucro líquido | Lucro bruto − despesas |
| Margem bruta % | Lucro bruto ÷ Receita líquida × 100 |
| Margem líquida % | Lucro líquido ÷ Receita líquida × 100 |
| Lucro recebido | Σ (lucro da venda × % recebido) |
| Lucro a receber | Lucro bruto − lucro recebido |
| Investimento total | Estoque + mostruário + consignado (a custo) |
| Giro de estoque | CMV do período ÷ estoque médio a custo — exige a view `vw_saldo_estoque_por_data`, que reconstitui o saldo histórico a partir do livro-razão |
| Prazo médio de recebimento | Σ(saldo × dias) ÷ Σ saldo |
| Retorno sobre o investimento | Lucro líquido ÷ Investimento total × 100 |
| Ponto de equilíbrio | Despesas fixas ÷ margem bruta % — usa `despesas.natureza = 'FIXA'` |

## 12.5 Comparativo entre períodos

Todo indicador exibe a variação contra o período anterior equivalente:
```
Lucro líquido    R$ 9.870,00    ▲ 18,4% vs. julho
Margem líquida        35,39%    ▼ 2,1 p.p. vs. julho
```
Variação percentual para valores; variação em pontos percentuais para percentuais — distinção que evita interpretação errada.

---

# 13. MÓDULO: SISTEMA
### *Prompt 15 — usuários, permissões, auditoria e backup*

## 13.1 Tela — Parâmetros do sistema (`/configuracoes`)

Edita a tabela `parametros`, agrupada por seção. Nenhum destes valores fica escrito no código —
mudar a política do negócio não exige alterar o sistema.

| Grupo | Parâmetro | Padrão | Efeito |
|---|---|---|---|
| Empresa | Nome, CPF/CNPJ, telefone, endereço, logotipo | — | Cabeçalho de todos os recibos e relatórios |
| Vendas | Máximo de parcelas | 4 | Limite do parcelamento (RN-V04) |
| Vendas | Intervalo entre parcelas | 30 dias | Vencimento padrão |
| Vendas | Desconto sem confirmação | 10% | Acima disso, pede confirmação (RN-V03) |
| Financeiro | Antecedência do alerta | 3 dias | Alerta de parcela a vencer (RN-F05) |
| Mostruário | Dias para alerta | 60 | Destaque de item em posse há muito tempo (RN-M06) |
| Estoque | Dias para "produto parado" | 60 | Lista de atenção do dashboard |
| Compras | Critério de rateio padrão | VALOR | Pré-seleção no formulário (ADR-03) |
| Produtos | Markup sugerido consumidor / revendedor | 100% / 50% | Assistente de precificação |

**Regras:** parâmetro com `editavel = false` aparece bloqueado. Toda alteração é registrada na
auditoria com valor anterior e novo. Alterar um parâmetro **nunca** recalcula documentos passados.

## 13.2 Tela — Usuários e permissões (`/configuracoes/usuarios`)

Nesta versão existe **um único usuário administrador**, mas a estrutura já está pronta para
mais — adicionar o segundo usuário não exige mudança de modelo nem de política de segurança.

| Campo | Tipo | Obrig. | Validação |
|---|---|:---:|---|
| Nome | Texto | ✅ | 2–120 caracteres |
| E-mail | Texto | ✅ | Único; é o login |
| Perfil | ADMIN · GERENTE · VENDEDOR · FINANCEIRO | ✅ | Define a matriz de permissões |
| Telefone | Máscara | ❌ | — |
| Ativo | Sim/Não | ✅ | Inativo não consegue entrar |

**Aba Permissões:** grade recurso × ação com as caixas de seleção, carregada de `permissoes`.
O perfil ADMIN é sempre total e não pode ser editado — evita que o administrador se tranque para fora.

**Regras:**
- Criar usuário dispara convite por e-mail com definição de senha
- **Não é possível inativar nem rebaixar o último ADMIN ativo** — validação explícita
- Usuário nunca é excluído fisicamente: apenas inativado, para preservar a trilha de auditoria
- Alteração de perfil ou permissão é registrada como evento crítico na auditoria

## 13.3 Tela — Log de auditoria (`/configuracoes/auditoria`)

Somente leitura. Nenhum perfil pode editar ou apagar — nem o ADMIN (RN-S01).

**Colunas:** Data/hora · Usuário · Ação · Tabela · Registro · Campos alterados · IP.

**Filtros:** período, usuário, tabela, ação, busca livre no conteúdo.

Ao expandir uma linha, o sistema mostra o **comparativo antes × depois** campo a campo, com os
valores alterados destacados:

```
Venda nº 147 · alterada por Administrador em 01/08/2026 14:32

  Campo              Antes          Depois
  desconto_valor     R$   0,00      R$  53,00   ●
  valor_total        R$ 950,00      R$ 897,00   ●
  observacoes        (vazio)        "Cliente fiel"
```

**Eventos registrados:** criação, alteração, exclusão lógica, cancelamento, estorno, login,
logout e exportação de dados. A exportação entra no log porque é a única forma de rastrear
saída de dados pessoais de clientes.

**Retenção:** 24 meses em linha; acima disso, arquivamento anual (ver Documento 4, §5.4).

## 13.4 Tela — Backup e exportação (`/configuracoes/backup`)

```
┌────────────────────────────────────────────────────────────┐
│ Backup e Exportação                                        │
├────────────────────────────────────────────────────────────┤
│ BACKUP AUTOMÁTICO                                          │
│   Status ......... 🟢 Ativo                                │
│   Último backup .. 01/08/2026 03:00 (há 11 horas)          │
│   Retenção ....... 7 dias + PITR contínuo                  │
│   Último teste de restauração ... 15/02/2026  ⚠ há 5 meses │
├────────────────────────────────────────────────────────────┤
│ EXPORTAÇÃO COMPLETA                                        │
│   Gera um arquivo .xlsx com uma aba por entidade:          │
│   produtos · clientes · revendedores · compras · vendas ·  │
│   títulos · recebimentos · movimentações de estoque        │
│                          [Exportar tudo em Excel]          │
├────────────────────────────────────────────────────────────┤
│ VERIFICAÇÃO DE INTEGRIDADE                                 │
│   Executa as 7 consultas de reconciliação do Documento 2   │
│   Última execução: 28/07/2026 · 0 divergências  ✅         │
│                          [Verificar agora]                 │
└────────────────────────────────────────────────────────────┘
```

**Regras:**
- O botão de verificação de integridade roda as consultas de reconciliação e exibe o resultado
  em linguagem de negócio. Qualquer divergência aparece como alerta CRÍTICO no dashboard.
- O sistema **avisa quando a última restauração testada passou de 6 meses**. Backup que nunca foi
  restaurado não é backup — é uma suposição.
- A exportação completa é registrada na auditoria.

---

# 14. PADRÕES TRANSVERSAIS DE INTERFACE

## 14.1 Layout

- **Menu lateral fixo** (240 px), recolhível para 64 px; em telas pequenas vira menu deslizante
- **Topbar:** breadcrumb · busca global (Ctrl+K) · sino de notificações com contador · menu do usuário
- **Tema claro**, tipografia Inter, densidade média
- **Área de conteúdo** com largura máxima de 1440 px, centralizada

## 14.2 Paleta semântica

| Uso | Cor | Aplicação |
|---|---|---|
| Primária | Índigo | Ações principais, links, elementos ativos |
| Sucesso | Verde | Receitas, lucro, valores recebidos, confirmações |
| Atenção | Âmbar | A vencer, mostruário antigo, avisos |
| Erro | Vermelho | Vencido, prejuízo, exclusões, erros |
| Investimento | Azul | Estoque, custos, capital imobilizado |
| Neutro | Cinza | Texto secundário, bordas, fundos |

## 14.3 Componentes obrigatórios

| Componente | Comportamento |
|---|---|
| `DataTable` | Ordenação por coluna, filtros, paginação server-side (25/50/100), seleção múltipla, colunas configuráveis, estado vazio ilustrado |
| `CampoMoeda` | Máscara R$, alinhado à direita, aceita vírgula e ponto, sem perder precisão |
| `CampoCPF` | Máscara + validação de dígito verificador |
| `FiltroPeriodo` | Presets + intervalo personalizado; guarda a última escolha |
| `ConfirmarExclusao` | Diálogo nomeando o registro e listando as consequências |
| `Toast` | Verde para sucesso, vermelho para erro, com ação de desfazer quando aplicável |
| `EstadoVazio` | Ilustração + explicação + botão da ação principal |
| `BuscaGlobal` | Ctrl+K, busca em produtos, clientes, revendedores, vendas e compras |

## 14.4 Estados obrigatórios de toda tela

| Estado | Tratamento |
|---|---|
| Carregando | Esqueleto (skeleton), nunca spinner de tela cheia |
| Vazio | Ilustração, explicação e ação sugerida |
| Erro | Mensagem em linguagem de negócio + botão "tentar novamente" |
| Sem permissão | Mensagem clara, sem tela em branco |
| Salvando | Botão com carregamento e desabilitado (evita duplo envio) |
| Sucesso | Toast + atualização otimista da lista |

## 14.5 Responsividade

| Faixa | Comportamento |
|---|---|
| ≥ 1280 px | Layout completo, menu expandido, tabelas com todas as colunas |
| 768–1279 px | Menu recolhido, tabelas com colunas prioritárias, cards em 2 colunas |
| < 768 px | Menu deslizante, tabelas viram cards empilhados, formulários em coluna única, ações principais em barra inferior fixa |

O uso mais provável em celular é **consultar** (saldo do revendedor, contas vencidas) e **registrar uma venda rápida** — essas duas jornadas são otimizadas primeiro.

## 14.6 Acessibilidade

Contraste mínimo AA (4.5:1) · navegação completa por teclado · foco visível · rótulos associados aos campos · mensagens de erro vinculadas por `aria-describedby` · `aria-live` para toasts · área de toque mínima de 44 px.

---

## PRÓXIMO DOCUMENTO

**Documento 4 — Auditoria, Segurança, Performance e Checklist de Produção** (Prompt 15).

---

# 15. Adendo — Vencimento editável na interface

Aplicado em 02/08/2026. O vencimento deixou de ser calculado às escondidas: passa a ser um
campo visível, sugerido pelo sistema e alterável pelo usuário — antes e depois de gerar a parcela.

## 15.1 Nova venda · bloco "3 · Desconto e pagamento"

Dois campos novos abaixo de forma de pagamento e parcelas:

| Campo | Comportamento |
|---|---|
| **Vencimento** / **1º vencimento** | O rótulo muda conforme o parcelamento. Sugere a data da venda quando é à vista e data + intervalo quando é parcelado. Trava datas anteriores à venda pelo atributo `min`. |
| **Parcelas a cada … dias** | Só aparece com parcelamento. Aceita de 1 a 365 dias, padrão 30. |

**A sugestão só vale enquanto o usuário não mexer.** Assim que ele escolhe uma data, ela é
marcada como escolhida e nunca mais é sobrescrita — nem ao trocar o número de parcelas, nem ao
mudar o intervalo. Se digitar uma data anterior à venda, o campo volta para a data da venda e a
dica ao lado avisa em vermelho.

A dica ao lado dos campos diz, em português, o que vai acontecer:

- parcelado → *"3 parcelas a cada 30 dias a partir de 01/09/2026."*
- à vista no dia → *"✓ Recebimento no ato: a parcela já nasce quitada."*
- à vista com data futura → *"⏳ Pagamento único a prazo — entra em contas a receber, sem baixa automática."*

A prévia das parcelas logo abaixo recalcula ao vivo e muda o título para **PAGAMENTO ÚNICO A
PRAZO** quando é o caso. O painel "Falta:" passou a cobrar cliente identificado também na venda
a prazo — é ele quem vai constar em contas a receber.

## 15.2 Prestação de contas do revendedor

Os mesmos dois campos entraram no assistente, logo abaixo da condição de pagamento, com a mesma
lógica de sugestão e a mesma trava contra datas anteriores ao acerto.

## 15.3 Alterar vencimento de parcela já gerada

Botão **📅** ao lado do botão de receber, disponível em quatro lugares:

- Contas a receber (lista principal)
- Ficha da venda, na tabela de parcelas
- Ficha do cliente, aba financeiro
- Ficha do revendedor, aba financeiro

Abre um modal com o resumo da parcela (devedor, valor, saldo, vencimento atual), o campo de nova
data, um atalho **"Adiar em 7 / 15 / 30 / 60 dias"** e um campo de motivo opcional. Aparece só em
parcelas em aberto — parcela quitada ou cancelada não mostra o botão, e o banco recusa a operação
mesmo que alguém tente por fora.

A alteração muda **apenas a data de cobrança**. Valor, lucro proporcional e recebimentos já
lançados ficam intactos. O histórico da mudança fica registrado na própria parcela e no log de
auditoria.

## 15.4 Recibo

A linha "Condição" do recibo de venda passou a distinguir três casos: `N parcelas`, `À vista` e
`A prazo · venc. DD/MM/AAAA`.
