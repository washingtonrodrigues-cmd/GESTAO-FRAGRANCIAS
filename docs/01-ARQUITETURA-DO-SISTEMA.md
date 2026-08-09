# SISTEMA DE GESTÃO DE FRAGRÂNCIAS
## Documento 1 — Arquitetura, Tecnologias e Plano de Desenvolvimento

**Versão:** 1.0
**Data:** 01/08/2026
**Autor:** Análise de Sistemas / Arquitetura de Software
**Escopo:** Compras • Estoque • Produtos • Clientes • Revendedores • Mostruários • Vendas • Financeiro • Contas a Receber • Dashboard • Relatórios • Recibos

---

## SUMÁRIO

1. [Visão geral e premissas](#1-visão-geral-e-premissas)
2. [Decisões de arquitetura (ADRs)](#2-decisões-de-arquitetura-adrs)
3. [Arquitetura em camadas](#3-arquitetura-em-camadas)
4. [Tecnologias recomendadas](#4-tecnologias-recomendadas)
5. [Estrutura de pastas](#5-estrutura-de-pastas)
6. [Fluxograma dos módulos](#6-fluxograma-dos-módulos)
7. [Mapa de telas](#7-mapa-de-telas)
8. [Fluxo de navegação](#8-fluxo-de-navegação)
9. [Regras de negócio globais](#9-regras-de-negócio-globais)
10. [Motor de cálculo financeiro](#10-motor-de-cálculo-financeiro)
11. [Segurança](#11-segurança)
12. [Plano de desenvolvimento por etapas](#12-plano-de-desenvolvimento-por-etapas)
13. [Riscos e mitigações](#13-riscos-e-mitigações)

---

## 1. VISÃO GERAL E PREMISSAS

### 1.1 O que o sistema é

Um ERP vertical de pequeno porte para operação de **compra e revenda de fragrâncias**, com dois canais de venda (consumidor final e revendedor) e um modelo de **consignação/mostruário** — produtos que saem fisicamente do estoque mas continuam sendo patrimônio da empresa até serem vendidos pelo revendedor.

### 1.2 Premissas confirmadas

| Premissa | Definição |
|---|---|
| Usuários | **1 usuário administrador** (perfil único, com estrutura preparada para múltiplos perfis no futuro) |
| Entrega desta fase | **Documentação e arquitetura** — sem implementação de código |
| Moeda | BRL (Real), 2 casas decimais |
| Fuso horário | America/Sao_Paulo (UTC-3) |
| Idioma | Português (pt-BR) |
| Volume estimado | Baixo/médio: até ~10.000 produtos, ~50.000 movimentações/ano |
| Multiempresa | Não nesta versão, porém o modelo já prevê a coluna de tenant |

### 1.3 As três operações que definem o sistema

O modelo de dados inteiro gira em torno de distinguir corretamente estas três operações. **Confundi-las é o erro mais comum e mais caro em sistemas deste tipo.**

| # | Operação | O produto sai do estoque? | Vira dívida imediata? | A propriedade do produto muda? |
|---|---|---|---|---|
| **A** | Venda a **consumidor final** | Sim | Sim (à vista ou parcelado) | Sim |
| **B** | Venda a **revendedor** (revenda firme) | Sim | Sim (à vista ou parcelado) | Sim |
| **C** | **Consignação / Mostruário** | Sai da conta "Disponível" e entra na conta "Em poder de terceiros" | **Não.** Só vira dívida quando o revendedor reporta a venda | **Não.** O produto continua sendo da empresa |

> **Regra de ouro:** consignação **não é venda** e **não gera receita**. Ela apenas transfere o produto de um "bolso" de estoque para outro. A receita nasce no momento da **prestação de contas**, quando o revendedor informa o que vendeu, o que devolve e o que ficou.

---

## 2. DECISÕES DE ARQUITETURA (ADRs)

As decisões abaixo são as que mais impactam a robustez do sistema. Cada uma traz a alternativa descartada e o motivo.

### ADR-01 — O estoque é um livro-razão (ledger), não um número

**Decisão:** toda alteração de estoque é gravada como um **lançamento imutável** na tabela `movimentacoes_estoque`. As colunas de saldo em `produtos` (`qtd_disponivel`, `qtd_mostruario`, etc.) são um **cache** recalculado por *trigger*.

**Alternativa descartada:** guardar apenas a quantidade no cadastro do produto e somar/subtrair diretamente (`UPDATE produtos SET qtd = qtd - 1`).

**Por quê:** com um número solto, quando o saldo diverge da realidade não há como descobrir a origem do erro. Com o ledger, o saldo é sempre reconstituível (`SELECT SUM(quantidade) FROM movimentacoes_estoque WHERE produto_id = X`), toda divergência é auditável, e existe histórico completo exigido no Prompt 6.

### ADR-02 — Custo médio ponderado móvel (CMP)

**Decisão:** cada produto mantém um `custo_medio` recalculado a cada entrada:

```
custo_medio_novo = (qtd_atual × custo_medio_atual + qtd_entrada × custo_unitario_entrada)
                   ÷ (qtd_atual + qtd_entrada)
```

O CMV (Custo da Mercadoria Vendida) de cada item vendido é **congelado** no momento da venda (`custo_unitario_praticado` gravado em `venda_itens`).

**Alternativas descartadas:**
- *Usar sempre o último custo de compra:* distorce o lucro quando há compras a preços diferentes.
- *Controle por lote/FIFO:* mais preciso, porém exige rastrear cada unidade individualmente — complexidade desproporcional para o porte da operação.

**Por quê:** o CMP é o padrão contábil brasileiro para este porte, é simples de explicar, e congelar o custo na venda garante que **relatórios de meses fechados nunca mudam** quando você compra o mesmo produto mais caro no mês seguinte.

### ADR-03 — Rateio de frete e taxa proporcional ao valor, não à quantidade

**Decisão:** o custo acessório (frete + taxa de cartão + outros) é distribuído entre os itens da compra na **proporção do valor** de cada item.

```
rateio_item = custo_acessorio_total × (subtotal_item ÷ subtotal_compra)
custo_unitario_item = (subtotal_item + rateio_item) ÷ quantidade_item
```

**Alternativa descartada:** ratear pela quantidade de peças.

**Por quê:** ratear por quantidade faria um perfume de R$ 30,00 absorver o mesmo frete de um de R$ 400,00, destruindo a margem do item barato e inflando artificialmente a do caro. O rateio por valor é o método fiscalmente aceito e o único que preserva a comparabilidade das margens.

> **Exceção configurável:** se o frete for claramente proporcional ao volume/peso (caixas grandes), o sistema deve permitir alternar o critério para *rateio por quantidade* por compra. Campo `criterio_rateio` em `compras`.

### ADR-04 — Contas a receber com títulos e alocação de recebimentos

**Decisão:** três tabelas separadas:
- `titulos_receber` — **o que é devido** (uma linha por parcela)
- `recebimentos` — **o dinheiro que entrou** (um evento de caixa)
- `recebimento_alocacoes` — **como o dinheiro foi aplicado** nos títulos

**Alternativa descartada:** um campo `pago boolean` e `data_pagamento` direto na parcela.

**Por quê:** o `boolean` quebra em três situações reais e frequentes: (1) pagamento parcial de uma parcela; (2) um único PIX que quita três parcelas de uma vez; (3) um pagamento que precisa ser estornado. A alocação resolve os três casos e é o modelo usado por qualquer ERP sério.

### ADR-05 — Consignação como ciclo de vida por item

**Decisão:** cada unidade enviada em consignação tem um registro em `remessa_itens` com uma **máquina de estados**:

```
EM_POSSE → VENDIDO      (gera título a receber)
         → DEVOLVIDO    (volta ao estoque disponível)
         → PERDIDO      (baixa como perda, vira despesa)
         → TROCADO      (devolve um, envia outro)
```

**Por quê:** é o que permite responder, a qualquer momento e sem cálculo manual: *"quais produtos estão com quem, há quantos dias, valendo quanto de custo e quanto de revenda"* — exigência direta dos Prompts 8 e 9.

### ADR-06 — Toda regra financeira vive no banco, não na tela

**Decisão:** cálculos de custo, saldo de estoque, situação de título e agregações do dashboard são implementados em **funções e triggers PostgreSQL** e expostos por **VIEWs**. O front-end apenas lê e exibe.

**Alternativa descartada:** calcular no JavaScript da tela.

**Por quê:** garante que o mesmo número apareça igual no dashboard, no relatório, no PDF e na exportação Excel. Cálculo no front-end é a causa nº 1 de "o relatório não bate com a tela".

### ADR-07 — Exclusão lógica (soft delete) em tudo que tem histórico

**Decisão:** cadastros (produtos, clientes, revendedores, fornecedores) usam `deleted_at`. Documentos (compras, vendas, remessas) **nunca são excluídos** — são **cancelados** (`status = CANCELADO`), o que dispara os lançamentos de estorno.

**Por quê:** excluir uma venda paga destruiria o histórico financeiro. O cancelamento preserva a trilha de auditoria e reverte o estoque de forma rastreável.

---

## 3. ARQUITETURA EM CAMADAS

```
┌──────────────────────────────────────────────────────────────────┐
│  CAMADA 1 — APRESENTAÇÃO (Front-end)                             │
│  Next.js App Router · React · TypeScript · Tailwind · shadcn/ui  │
│  Páginas, componentes de UI, formulários, gráficos, tabelas      │
│  NÃO contém regra de negócio. NÃO faz cálculo financeiro.        │
└───────────────────────────┬──────────────────────────────────────┘
                            │ Server Actions / API tipada
┌───────────────────────────▼──────────────────────────────────────┐
│  CAMADA 2 — APLICAÇÃO (Casos de uso)                             │
│  Orquestra operações, valida entrada (Zod), controla transações  │
│  Ex.: RegistrarCompra, EfetivarVenda, PrestarContasRevendedor    │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  CAMADA 3 — DOMÍNIO (Regras de negócio puras)                    │
│  Rateio de custos · CMP · Geração de parcelas · Margens          │
│  Funções puras, sem I/O, 100% testáveis por unidade              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  CAMADA 4 — INFRAESTRUTURA / DADOS                               │
│  PostgreSQL (Supabase) · Triggers · Functions · Views · RLS      │
│  Storage (fotos de produto, PDFs) · Auth · Backup automático     │
│  Guardião final da integridade: CHECKs, FKs, UNIQUEs             │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Princípio de defesa em profundidade

A mesma regra é validada em **três níveis**, do mais barato ao mais crítico:

| Nível | Onde | Exemplo: "não permitir estoque negativo" |
|---|---|---|
| 1 — UX | Formulário | O campo de quantidade não deixa digitar mais que o disponível; botão desabilitado |
| 2 — Aplicação | Server Action | Revalida o saldo com `SELECT ... FOR UPDATE` antes de gravar |
| 3 — Banco | Constraint + Trigger | `CHECK (qtd_disponivel >= 0)` — a operação falha mesmo se o código tiver bug |

O nível 3 nunca deve ser dispensado "porque o front já valida". É ele que protege contra corridas (duas abas vendendo o último frasco ao mesmo tempo).

---

## 4. TECNOLOGIAS RECOMENDADAS

### 4.1 Stack principal

| Camada | Tecnologia | Por quê |
|---|---|---|
| **Framework** | Next.js 15 (App Router) + TypeScript | Server Components reduzem o volume de dados no cliente; Server Actions eliminam a necessidade de escrever uma API REST separada; tipagem forte previne erro de cálculo silencioso |
| **UI** | Tailwind CSS + shadcn/ui | Componentes acessíveis, tema claro, visual de ERP profissional, sem dependência de biblioteca pesada |
| **Ícones** | Lucide React | Consistente com shadcn/ui, leve |
| **Tabelas** | TanStack Table v8 | Ordenação, filtro por coluna, paginação server-side, seleção múltipla |
| **Estado do servidor** | TanStack Query | Cache, revalidação automática, atualização otimista do dashboard |
| **Formulários** | React Hook Form + Zod | Validação declarativa reaproveitada no cliente **e** no servidor a partir do mesmo schema |
| **Gráficos** | Recharts | Integra nativamente com React, suficiente para linha, barra, pizza e área |
| **Banco de dados** | PostgreSQL 15+ via **Supabase** | Transações ACID, triggers, views materializadas, RLS nativo, backup automático diário |
| **Autenticação** | Supabase Auth | E-mail/senha + MFA opcional, sessão gerenciada, integrada ao RLS |
| **Arquivos** | Supabase Storage | Fotos de produtos e PDFs de recibos, com políticas de acesso |
| **PDF** | React-PDF (`@react-pdf/renderer`) | Gera o PDF no servidor, layout declarativo, sem depender do navegador |
| **Excel** | ExcelJS | Exportação com formatação, fórmulas e múltiplas abas |
| **Datas** | date-fns + date-fns-tz | Leve, imutável, tratamento correto de fuso |
| **Dinheiro** | `NUMERIC(14,2)` no banco + `Dinero.js` na aplicação | **Nunca usar `float`/`double` para dinheiro** |
| **Testes** | Vitest (unidade) + Playwright (E2E) | Cobertura obrigatória do motor de cálculo |
| **Hospedagem** | Vercel (app) + Supabase (banco) | Deploy contínuo por Git, HTTPS automático, custo baixo |

### 4.2 Por que Supabase e não um back-end próprio

Para uma operação de 1 usuário, escrever e manter um back-end Node/Express separado adicionaria semanas de trabalho e uma superfície de ataque maior, sem ganho funcional. O Supabase entrega Postgres puro (nada de *lock-in* de modelo de dados — o schema é SQL padrão e migra para qualquer Postgres), autenticação, storage e backup prontos. **A regra de negócio fica no Postgres, que é portável.**

### 4.3 Bibliotecas de apoio

```
zod                     validação de schema
@supabase/ssr           cliente Supabase com sessão em Server Components
@tanstack/react-table   tabelas
@tanstack/react-query   cache de dados
react-hook-form         formulários
recharts                gráficos
@react-pdf/renderer     geração de PDF
exceljs                 exportação Excel
date-fns                datas
dinero.js               aritmética monetária segura
sonner                  toasts de sucesso/erro
cmdk                    paleta de busca rápida (Ctrl+K)
react-dropzone          upload de fotos
sharp                   compressão de imagem no upload
```

---

## 5. ESTRUTURA DE PASTAS

```
fragrancias-erp/
│
├── .env.local                        # variáveis de ambiente (NUNCA versionar)
├── .env.example                      # modelo de variáveis
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
│
├── supabase/                         # ─── BANCO DE DADOS ───
│   ├── migrations/                   # versionamento incremental do schema
│   │   ├── 0001_extensions.sql
│   │   ├── 0002_enums.sql
│   │   ├── 0003_cadastros.sql        # produtos, clientes, revendedores, fornecedores
│   │   ├── 0004_compras.sql
│   │   ├── 0005_estoque.sql
│   │   ├── 0006_vendas.sql
│   │   ├── 0007_consignacao.sql
│   │   ├── 0008_financeiro.sql
│   │   ├── 0009_seguranca_auditoria.sql
│   │   ├── 0010_functions.sql        # funções de cálculo
│   │   ├── 0011_triggers.sql         # gatilhos de integridade
│   │   ├── 0012_views.sql            # views de relatório e dashboard
│   │   └── 0013_rls_policies.sql     # políticas de segurança em nível de linha
│   ├── seed.sql                      # dados iniciais (categorias, formas de pagamento)
│   └── config.toml
│
├── src/
│   │
│   ├── app/                          # ─── ROTAS (Next.js App Router) ───
│   │   ├── layout.tsx                # layout raiz, providers, fontes
│   │   ├── globals.css
│   │   │
│   │   ├── (auth)/                   # grupo público
│   │   │   ├── login/page.tsx
│   │   │   └── recuperar-senha/page.tsx
│   │   │
│   │   ├── (app)/                    # grupo protegido — exige sessão
│   │   │   ├── layout.tsx            # shell: menu lateral + topbar + busca global
│   │   │   │
│   │   │   ├── dashboard/page.tsx
│   │   │   │
│   │   │   ├── compras/
│   │   │   │   ├── page.tsx                 # listagem
│   │   │   │   ├── nova/page.tsx            # formulário de nova compra
│   │   │   │   ├── fornecedores/page.tsx    # CRUD de fornecedores
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx             # detalhe
│   │   │   │       └── editar/page.tsx
│   │   │   │
│   │   │   ├── produtos/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── novo/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx             # detalhe + ficha de movimentação
│   │   │   │       └── editar/page.tsx
│   │   │   │
│   │   │   ├── estoque/
│   │   │   │   ├── page.tsx                 # posição atual por situação
│   │   │   │   ├── movimentacoes/page.tsx   # kardex / extrato
│   │   │   │   └── ajuste/page.tsx          # inventário e ajuste manual
│   │   │   │
│   │   │   ├── clientes/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── novo/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx             # ficha + histórico de compras
│   │   │   │       └── editar/page.tsx
│   │   │   │
│   │   │   ├── revendedores/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── novo/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx             # ficha
│   │   │   │       ├── editar/page.tsx
│   │   │   │       ├── extrato/page.tsx     # extrato financeiro completo
│   │   │   │       └── prestacao-contas/page.tsx
│   │   │   │
│   │   │   ├── mostruarios/
│   │   │   │   ├── page.tsx                 # remessas em aberto
│   │   │   │   ├── nova/page.tsx            # nova remessa
│   │   │   │   └── [id]/page.tsx            # detalhe + baixa de itens
│   │   │   │
│   │   │   ├── vendas/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── nova/page.tsx            # PDV / formulário de venda
│   │   │   │   └── [id]/page.tsx
│   │   │   │
│   │   │   ├── financeiro/
│   │   │   │   ├── contas-receber/page.tsx
│   │   │   │   ├── recebimentos/page.tsx
│   │   │   │   ├── despesas/page.tsx
│   │   │   │   └── fluxo-caixa/page.tsx
│   │   │   │
│   │   │   ├── relatorios/
│   │   │   │   ├── page.tsx                 # central de relatórios
│   │   │   │   └── [slug]/page.tsx          # relatório parametrizado
│   │   │   │
│   │   │   └── configuracoes/
│   │   │       ├── page.tsx                 # parâmetros do sistema
│   │   │       ├── categorias/page.tsx
│   │   │       ├── usuarios/page.tsx
│   │   │       ├── auditoria/page.tsx       # log de alterações
│   │   │       └── backup/page.tsx          # exportação e restauração
│   │   │
│   │   └── api/
│   │       ├── pdf/
│   │       │   ├── recibo-venda/[id]/route.ts
│   │       │   ├── recibo-remessa/[id]/route.ts
│   │       │   └── prestacao-contas/[id]/route.ts
│   │       ├── excel/[relatorio]/route.ts
│   │       └── cron/
│   │           └── alertas-vencimento/route.ts   # job diário
│   │
│   ├── components/                   # ─── COMPONENTES REUTILIZÁVEIS ───
│   │   ├── ui/                       # primitivos shadcn (button, dialog, input…)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── topbar.tsx
│   │   │   ├── breadcrumbs.tsx
│   │   │   └── busca-global.tsx      # Ctrl+K
│   │   ├── data/
│   │   │   ├── data-table.tsx        # tabela genérica: filtro + ordenação + paginação
│   │   │   ├── data-table-toolbar.tsx
│   │   │   ├── filtro-periodo.tsx    # seletor de período padrão do sistema
│   │   │   ├── estado-vazio.tsx
│   │   │   └── exportar-menu.tsx     # PDF · Excel · Imprimir
│   │   ├── form/
│   │   │   ├── campo-moeda.tsx       # máscara R$ com precisão decimal
│   │   │   ├── campo-cpf.tsx         # máscara + validação de dígito verificador
│   │   │   ├── campo-telefone.tsx
│   │   │   ├── campo-percentual.tsx
│   │   │   ├── seletor-produto.tsx   # autocomplete com foto e saldo
│   │   │   ├── seletor-cliente.tsx
│   │   │   └── upload-foto.tsx
│   │   ├── dashboard/
│   │   │   ├── card-indicador.tsx
│   │   │   ├── grafico-evolucao.tsx
│   │   │   ├── grafico-composicao.tsx
│   │   │   └── ranking-lista.tsx
│   │   └── feedback/
│   │       ├── confirmar-exclusao.tsx   # diálogo obrigatório antes de excluir
│   │       └── toast.tsx
│   │
│   ├── domain/                       # ─── REGRAS DE NEGÓCIO PURAS ───
│   │   ├── compras/
│   │   │   ├── ratear-custos.ts      # ADR-03
│   │   │   └── ratear-custos.test.ts
│   │   ├── estoque/
│   │   │   ├── custo-medio.ts        # ADR-02
│   │   │   └── custo-medio.test.ts
│   │   ├── vendas/
│   │   │   ├── calcular-total.ts
│   │   │   ├── gerar-parcelas.ts     # divisão exata com ajuste de centavos
│   │   │   └── gerar-parcelas.test.ts
│   │   ├── financeiro/
│   │   │   ├── situacao-titulo.ts
│   │   │   ├── alocar-recebimento.ts
│   │   │   └── indicadores.ts        # lucro bruto/líquido/recebido/a receber
│   │   ├── produtos/
│   │   │   └── margens.ts
│   │   └── shared/
│   │       ├── dinheiro.ts           # arredondamento e soma monetária
│   │       └── datas.ts
│   │
│   ├── services/                     # ─── CASOS DE USO (acesso a dados) ───
│   │   ├── compras.service.ts
│   │   ├── produtos.service.ts
│   │   ├── estoque.service.ts
│   │   ├── clientes.service.ts
│   │   ├── revendedores.service.ts
│   │   ├── mostruarios.service.ts
│   │   ├── vendas.service.ts
│   │   ├── financeiro.service.ts
│   │   ├── dashboard.service.ts
│   │   └── relatorios.service.ts
│   │
│   ├── actions/                      # ─── SERVER ACTIONS (mutações) ───
│   │   ├── compras.actions.ts
│   │   ├── vendas.actions.ts
│   │   ├── mostruarios.actions.ts
│   │   ├── financeiro.actions.ts
│   │   └── cadastros.actions.ts
│   │
│   ├── schemas/                      # ─── VALIDAÇÃO ZOD (cliente + servidor) ───
│   │   ├── compra.schema.ts
│   │   ├── produto.schema.ts
│   │   ├── cliente.schema.ts
│   │   ├── revendedor.schema.ts
│   │   ├── venda.schema.ts
│   │   ├── remessa.schema.ts
│   │   └── comuns.schema.ts          # cpf, telefone, moeda, data
│   │
│   ├── pdf/                          # ─── TEMPLATES DE DOCUMENTO ───
│   │   ├── templates/
│   │   │   ├── recibo-consumidor.tsx
│   │   │   ├── recibo-revendedor.tsx
│   │   │   ├── prestacao-contas.tsx
│   │   │   └── relatorio-generico.tsx
│   │   └── componentes/
│   │       ├── cabecalho.tsx
│   │       ├── rodape-assinatura.tsx
│   │       └── tabela-pdf.tsx
│   │
│   ├── lib/                          # ─── INFRAESTRUTURA ───
│   │   ├── supabase/
│   │   │   ├── client.ts             # cliente browser
│   │   │   ├── server.ts             # cliente server component
│   │   │   └── admin.ts              # service role — apenas em jobs
│   │   ├── auth.ts
│   │   ├── audit.ts                  # gravação do log de auditoria
│   │   ├── format.ts                 # formatadores BRL, data, CPF
│   │   └── constants.ts
│   │
│   ├── types/
│   │   ├── database.types.ts         # GERADO pelo Supabase — não editar à mão
│   │   └── app.types.ts
│   │
│   ├── hooks/
│   │   ├── use-filtro-periodo.ts
│   │   ├── use-debounce.ts
│   │   └── use-confirmar.ts
│   │
│   └── middleware.ts                 # proteção de rota e refresh de sessão
│
├── tests/
│   ├── unit/                         # domain/ — cobertura mínima 90%
│   └── e2e/                          # fluxos críticos ponta a ponta
│
└── docs/
    ├── 01-ARQUITETURA.md             # este documento
    ├── 02-BANCO-DE-DADOS.md
    ├── 03-MODULOS-FUNCIONAIS.md
    └── 04-AUDITORIA-E-QUALIDADE.md
```

### 5.1 Convenções de nomenclatura

| Item | Padrão | Exemplo |
|---|---|---|
| Tabelas | `snake_case`, plural, português | `venda_itens`, `titulos_receber` |
| Colunas | `snake_case`, singular | `custo_unitario`, `data_vencimento` |
| Chave primária | `id` (UUID v4) | `id` |
| Chave estrangeira | `<tabela_singular>_id` | `produto_id`, `revendedor_id` |
| Enum (banco) | `snake_case` + sufixo `_enum` | `situacao_titulo_enum` |
| Índice | `idx_<tabela>_<colunas>` | `idx_vendas_data_cliente` |
| Constraint | `chk_`, `fk_`, `uq_` + descrição | `chk_produtos_qtd_nao_negativa` |
| Componente React | `PascalCase` | `CardIndicador` |
| Arquivo de componente | `kebab-case.tsx` | `card-indicador.tsx` |
| Função de domínio | `verboSubstantivo` | `ratearCustosCompra()` |
| Server Action | `verboSubstantivoAction` | `registrarCompraAction()` |

---

## 6. FLUXOGRAMA DOS MÓDULOS

### 6.1 Fluxo macro — o ciclo do dinheiro e do produto

```
                        ┌─────────────────┐
                        │   FORNECEDOR    │
                        └────────┬────────┘
                                 │ nota / pedido
                                 ▼
        ╔════════════════════════════════════════════╗
        ║  ① COMPRAS                                 ║
        ║  produtos + frete + taxa cartão + outros   ║
        ║  → rateio proporcional (ADR-03)            ║
        ║  → custo unitário real de cada item        ║
        ╚═══════════════════┬════════════════════════╝
                            │ gera ENTRADA
                            ▼
        ╔════════════════════════════════════════════╗
        ║  ② ESTOQUE (livro-razão · ADR-01)          ║
        ║  atualiza custo médio ponderado (ADR-02)   ║
        ╠════════════════════════════════════════════╣
        ║  Bolsos de estoque:                        ║
        ║   • DISPONÍVEL     (pronto para vender)    ║
        ║   • RESERVADO      (venda não finalizada)  ║
        ║   • MOSTRUÁRIO     (amostra com revendedor)║
        ║   • CONSIGNADO     (em poder do revendedor)║
        ╚═══┬═══════════════════════════════┬════════╝
            │                               │
   ┌────────▼─────────┐          ┌──────────▼────────────┐
   │ ③ VENDA DIRETA   │          │ ④ CONSIGNAÇÃO /       │
   │                  │          │    MOSTRUÁRIO         │
   │ • Consumidor     │          │ (NÃO é venda,         │
   │   final          │          │  NÃO gera receita)    │
   │ • Revendedor     │          │                       │
   │   (revenda firme)│          │ Remessa → itens       │
   │                  │          │ EM_POSSE              │
   │ Baixa estoque    │          │                       │
   │ Gera receita     │          │ Baixa DISPONÍVEL      │
   └────────┬─────────┘          │ Entra CONSIGNADO      │
            │                    └──────────┬────────────┘
            │                               │
            │                    ┌──────────▼────────────┐
            │                    │ ⑤ PRESTAÇÃO DE CONTAS │
            │                    │  VENDIDO   → receita  │
            │                    │  DEVOLVIDO → estoque  │
            │                    │  PERDIDO   → despesa  │
            │                    │  EM_POSSE  → continua │
            │                    └──────────┬────────────┘
            │                               │
            └───────────────┬───────────────┘
                            │ gera títulos
                            ▼
        ╔════════════════════════════════════════════╗
        ║  ⑥ CONTAS A RECEBER                        ║
        ║  títulos (parcelas até 4x)                 ║
        ║  situações: A_VENCER · VENCIDO · PAGO      ║
        ║             PARCIAL · CANCELADO            ║
        ║  → alerta automático D-3 e D+1             ║
        ╚═══════════════════┬════════════════════════╝
                            │ recebimento + alocação
                            ▼
        ╔════════════════════════════════════════════╗
        ║  ⑦ FINANCEIRO                              ║
        ║  Receitas − CMV = Lucro Bruto              ║
        ║  Lucro Bruto − Despesas = Lucro Líquido    ║
        ║  Lucro Recebido / Lucro a Receber          ║
        ║  Fluxo de caixa realizado e projetado      ║
        ╚═══════════════════┬════════════════════════╝
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
   ╔════════════════╗ ╔══════════╗ ╔════════════════╗
   ║ ⑧ DASHBOARD    ║ ║⑨ RELATÓ- ║ ║ ⑩ RECIBOS      ║
   ║ tempo real     ║ ║  RIOS    ║ ║ PDF · Impressão║
   ╚════════════════╝ ╚══════════╝ ╚════════════════╝

   ┌──────────────────────────────────────────────────┐
   │ TRANSVERSAL: Autenticação · Auditoria · Backup   │
   └──────────────────────────────────────────────────┘
```

### 6.2 Matriz de impacto entre módulos

Quando um evento acontece, estes são **todos** os módulos que precisam refletir a mudança (aplicação direta da "Regra Final" das instruções do projeto):

| Evento | Estoque | Custo/CMP | Contas a Receber | Financeiro | Dashboard | Relatórios |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Registrar compra | ➕ Entrada | ✅ Recalcula | — | Investimento ↑ | ✅ | ✅ |
| Cancelar compra | ➖ Estorno | ✅ Recalcula | — | Investimento ↓ | ✅ | ✅ |
| Venda a consumidor | ➖ Saída | Congela CMV | ➕ Títulos | Receita ↑ | ✅ | ✅ |
| Venda a revendedor | ➖ Saída | Congela CMV | ➕ Títulos | Receita ↑ | ✅ | ✅ |
| Enviar mostruário | ↔️ Transfere bolso | — | — | Investido em mostruário ↑ | ✅ | ✅ |
| Revendedor vendeu item | ➖ Baixa consignado | Congela CMV | ➕ Título | Receita ↑ | ✅ | ✅ |
| Revendedor devolveu item | ↔️ Volta a disponível | — | — | Investido ↓ | ✅ | ✅ |
| Item perdido/danificado | ➖ Baixa por perda | — | — | Despesa ↑ | ✅ | ✅ |
| Registrar recebimento | — | — | ✅ Alocação | Caixa ↑ · Lucro recebido ↑ | ✅ | ✅ |
| Estornar recebimento | — | — | ✅ Reabre título | Caixa ↓ | ✅ | ✅ |
| Cancelar venda | ➕ Retorno | — | ✅ Cancela títulos | Receita ↓ | ✅ | ✅ |
| Ajuste de inventário | ↕️ Ajuste | ✅ se entrada | — | Perda/Sobra | ✅ | ✅ |

---

## 7. MAPA DE TELAS

### 7.1 Inventário completo

| # | Tela | Rota | Tipo | Prompt de origem |
|---|---|---|---|---|
| **AUTENTICAÇÃO** |
| 01 | Login | `/login` | Formulário | 15 |
| 02 | Recuperar senha | `/recuperar-senha` | Formulário | 15 |
| **VISÃO GERAL** |
| 03 | Dashboard | `/dashboard` | Painel | 3 |
| **COMPRAS** |
| 04 | Lista de compras | `/compras` | Tabela + filtros | 4 |
| 05 | Nova compra | `/compras/nova` | Formulário mestre-detalhe | 4 |
| 06 | Detalhe da compra | `/compras/[id]` | Ficha | 4 |
| 07 | Fornecedores | `/compras/fornecedores` | CRUD | 4 |
| **PRODUTOS** |
| 08 | Catálogo | `/produtos` | Grade/tabela com foto | 5 |
| 09 | Cadastro de produto | `/produtos/novo` · `/produtos/[id]/editar` | Formulário | 5 |
| 10 | Ficha do produto | `/produtos/[id]` | Ficha + kardex + margens | 5 |
| 11 | Categorias e marcas | `/configuracoes/categorias` | CRUD | 5 |
| **ESTOQUE** |
| 12 | Posição de estoque | `/estoque` | Painel por situação | 6 |
| 13 | Kardex / movimentações | `/estoque/movimentacoes` | Tabela + filtros | 6 |
| 14 | Ajuste / inventário | `/estoque/ajuste` | Formulário | 6 |
| **CLIENTES** |
| 15 | Lista de clientes | `/clientes` | Tabela + busca | 7 |
| 16 | Cadastro de cliente | `/clientes/novo` · `/clientes/[id]/editar` | Formulário | 7 |
| 17 | Ficha do cliente | `/clientes/[id]` | Histórico + saldo devedor | 7 |
| **REVENDEDORES** |
| 18 | Lista de revendedores | `/revendedores` | Tabela + indicadores | 8 |
| 19 | Cadastro de revendedor | `/revendedores/novo` · `/[id]/editar` | Formulário | 8 |
| 20 | Ficha do revendedor | `/revendedores/[id]` | Resumo consolidado | 8 |
| 21 | Extrato financeiro | `/revendedores/[id]/extrato` | Extrato | 8 |
| 22 | Prestação de contas | `/revendedores/[id]/prestacao-contas` | Assistente + PDF | 8, 12 |
| **MOSTRUÁRIOS** |
| 23 | Remessas em aberto | `/mostruarios` | Tabela + tempo em posse | 9 |
| 24 | Nova remessa | `/mostruarios/nova` | Formulário mestre-detalhe | 9 |
| 25 | Detalhe da remessa | `/mostruarios/[id]` | Ficha + baixa de itens | 9 |
| **VENDAS** |
| 26 | Lista de vendas | `/vendas` | Tabela + filtros | 10 |
| 27 | Nova venda (PDV) | `/vendas/nova` | Formulário em etapas | 10 |
| 28 | Detalhe da venda | `/vendas/[id]` | Ficha + parcelas + recibo | 10, 12 |
| **FINANCEIRO** |
| 29 | Contas a receber | `/financeiro/contas-receber` | Tabela com abas | 11 |
| 30 | Recebimentos | `/financeiro/recebimentos` | Tabela + baixa | 11 |
| 31 | Despesas | `/financeiro/despesas` | CRUD | 14 |
| 32 | Fluxo de caixa | `/financeiro/fluxo-caixa` | Painel + gráfico | 14 |
| **RELATÓRIOS** |
| 33 | Central de relatórios | `/relatorios` | Catálogo | 13 |
| 34 | Relatório parametrizado | `/relatorios/[slug]` | Filtros + tabela + export | 13 |
| **CONFIGURAÇÕES** |
| 35 | Parâmetros do sistema | `/configuracoes` | Formulário | 15 |
| 36 | Usuários e permissões | `/configuracoes/usuarios` | CRUD | 15 |
| 37 | Log de auditoria | `/configuracoes/auditoria` | Tabela somente leitura | 15 |
| 38 | Backup e exportação | `/configuracoes/backup` | Ações | 15 |

**Total: 38 telas.**

### 7.2 Anatomia padrão das telas

Todas as telas seguem uma de quatro anatomias, o que garante consistência visual e reaproveitamento de código:

**A) Tela de listagem**
```
┌───────────────────────────────────────────────────────────┐
│ Título da página            [Filtro período ▾] [+ Novo]   │
├───────────────────────────────────────────────────────────┤
│ [Card KPI] [Card KPI] [Card KPI] [Card KPI]               │
├───────────────────────────────────────────────────────────┤
│ 🔍 Buscar…    [Filtro ▾] [Filtro ▾]   [Exportar ▾] [🖨]   │
├───────────────────────────────────────────────────────────┤
│ ☐ │ Coluna ▲│ Coluna │ Coluna │ Valor │ Status │ ⋯        │
│ ☐ │  …      │   …    │   …    │   …   │  ●     │ ⋯        │
├───────────────────────────────────────────────────────────┤
│ 25 de 340 registros       [◀] 1 2 3 … 14 [▶]   [25 ▾]     │
└───────────────────────────────────────────────────────────┘
```

**B) Formulário mestre-detalhe** (compras, vendas, remessas)
```
┌───────────────────────────────────────────────────────────┐
│ ← Voltar   Nova Compra                    [Salvar rascunho]│
├──────────────────────────────────────┬────────────────────┤
│ DADOS DO DOCUMENTO                   │  RESUMO (fixo)     │
│  Fornecedor  [autocomplete    ▾]     │  ────────────────  │
│  Data        [__/__/____]            │  Subtotal   R$ ─── │
│  Nº doc      [__________]            │  Frete      R$ ─── │
│                                      │  Taxa       R$ ─── │
│ ITENS                        [+ Item]│  Outros     R$ ─── │
│  ┌──────────────────────────────────┐│  ════════════════  │
│  │ Produto │ Qtd │ Unit │ Subtotal ││  TOTAL      R$ ─── │
│  │  …      │  …  │  …   │    …     ││                    │
│  └──────────────────────────────────┘│  Custo unitário    │
│                                      │  após rateio:      │
│ CUSTOS ACESSÓRIOS                    │   • Prod A  R$ ─── │
│  Frete [R$ ___]  Taxa cartão [R$ ___]│   • Prod B  R$ ─── │
│  Outros [R$ ___] Critério [Valor ▾]  │                    │
│                                      │  [Confirmar compra]│
│ Observações [_______________________]│                    │
└──────────────────────────────────────┴────────────────────┘
```

**C) Ficha / detalhe** — cabeçalho com identificação e ações, abas para seções, timeline de eventos.

**D) Painel / dashboard** — grade de cards de indicador no topo, gráficos ao centro, rankings e listas de atenção na base.

---

## 8. FLUXO DE NAVEGAÇÃO

### 8.1 Menu lateral (estrutura definitiva)

```
◆ Dashboard

▾ CADASTROS
   • Produtos
   • Clientes
   • Revendedores
   • Fornecedores

▾ OPERAÇÃO
   • Compras
   • Vendas
   • Mostruários
   • Estoque
       ↳ Posição atual
       ↳ Movimentações
       ↳ Ajuste / Inventário

▾ FINANCEIRO
   • Contas a Receber        [badge: nº de vencidos]
   • Recebimentos
   • Despesas
   • Fluxo de Caixa

▾ ANÁLISE
   • Relatórios
   • Prestação de Contas

▾ SISTEMA
   • Configurações
   • Auditoria
   • Backup
```

### 8.2 Fluxos operacionais principais

**Fluxo 1 — Comprar mercadoria**
```
Dashboard → Compras → [+ Nova Compra]
  → seleciona fornecedor (ou cadastra na hora, via modal)
  → adiciona itens (produto existente ou cadastra na hora)
  → informa frete, taxa de cartão e outros custos
  → sistema exibe o custo unitário rateado de cada item EM TEMPO REAL
  → [Confirmar]
  → ⚙ entrada no estoque + recálculo do custo médio + atualização do dashboard
  → redireciona para o detalhe da compra
```

**Fluxo 2 — Vender ao consumidor final**
```
Dashboard → Vendas → [+ Nova Venda]
  → tipo: Consumidor Final
  → seleciona cliente (ou "Consumidor não identificado")
  → adiciona produtos → sistema puxa o preço de consumidor e valida o saldo
  → aplica desconto (valor ou %)
  → forma de pagamento → se parcelado, escolhe 2x/3x/4x
  → sistema gera as parcelas com vencimentos e mostra a prévia
  → [Confirmar venda]
  → ⚙ saída de estoque + títulos a receber + dashboard
  → oferece: [Gerar recibo PDF] [Imprimir] [Nova venda]
```

**Fluxo 3 — Enviar mostruário / consignação**
```
Mostruários → [+ Nova Remessa]
  → seleciona revendedor
  → adiciona produtos e quantidades
  → sistema exibe valor de custo total e valor de revenda total
  → define prazo de acerto (ex.: 30 dias)
  → [Confirmar remessa]
  → ⚙ transfere estoque DISPONÍVEL → CONSIGNADO (não gera receita)
  → [Gerar recibo de entrega PDF para assinatura]
```

**Fluxo 4 — Prestação de contas do revendedor** *(o fluxo mais importante do sistema)*
```
Revendedores → [revendedor] → Prestação de Contas
  → sistema lista TODOS os itens EM_POSSE, agrupados por remessa,
    com dias em posse e valores
  → para cada item o operador marca: VENDIDO · DEVOLVIDO · PERDIDO · CONTINUA
  → sistema calcula automaticamente:
       Total vendido    → vira título a receber
       Total devolvido  → volta ao estoque disponível
       Total perdido    → vira despesa pelo custo
       Total em posse   → permanece
  → define condição de pagamento do valor devido (à vista ou até 4x)
  → [Confirmar acerto]
  → ⚙ movimentações de estoque + títulos + despesas + dashboard
  → [Gerar PDF de prestação de contas para assinatura]
```

**Fluxo 5 — Receber um pagamento**
```
Financeiro → Contas a Receber
  → filtra por Vencidos / A vencer / Cliente / Revendedor
  → seleciona um ou vários títulos (mesmo pagador)
  → [Registrar recebimento]
  → informa valor total recebido, data e forma de pagamento
  → sistema aloca automaticamente do mais antigo para o mais novo
    (permitindo ajuste manual da alocação)
  → ⚙ títulos baixados (total ou parcialmente) + caixa + lucro recebido
  → [Gerar comprovante PDF]
```

### 8.3 Atalhos globais

| Atalho | Ação |
|---|---|
| `Ctrl/⌘ + K` | Busca global (produtos, clientes, revendedores, vendas, compras) |
| `Ctrl/⌘ + Shift + V` | Nova venda |
| `Ctrl/⌘ + Shift + C` | Nova compra |
| `Ctrl/⌘ + Shift + M` | Nova remessa de mostruário |
| `Esc` | Fechar modal / cancelar |

---

## 9. REGRAS DE NEGÓCIO GLOBAIS

Regras numeradas para referência cruzada nos demais documentos.

### 9.1 Estoque

| ID | Regra |
|---|---|
| **RN-E01** | O estoque nunca pode ficar negativo em nenhum dos bolsos. Constraint no banco + validação transacional. |
| **RN-E02** | Toda alteração de saldo gera obrigatoriamente um lançamento em `movimentacoes_estoque`. Não existe alteração direta de saldo. |
| **RN-E03** | `qtd_total = qtd_disponivel + qtd_reservado + qtd_mostruario + qtd_consignado`. Invariante verificada por trigger. |
| **RN-E04** | Movimentações são imutáveis. Correção só por lançamento de estorno, nunca por UPDATE ou DELETE. |
| **RN-E05** | Envio de mostruário/consignação **transfere** entre bolsos; não altera `qtd_total` nem gera receita. |
| **RN-E06** | Devolução de item consignado retorna ao bolso DISPONÍVEL pelo mesmo custo com que saiu. |
| **RN-E07** | Ajuste de inventário exige motivo obrigatório e fica destacado no log de auditoria. |
| **RN-E08** | Produto com saldo em qualquer bolso não pode ser excluído — apenas inativado. |

### 9.2 Compras e custo

| ID | Regra |
|---|---|
| **RN-C01** | `Custo Total da Compra = Σ(subtotais dos itens) + Frete + Taxa de Cartão + Outros Custos`. |
| **RN-C02** | Custos acessórios são rateados proporcionalmente ao **valor** de cada item (ADR-03), com critério alternável para quantidade. |
| **RN-C03** | A soma dos rateios deve ser **exatamente** igual ao custo acessório total. A diferença de arredondamento é lançada no item de maior valor. |
| **RN-C04** | O `custo_unitario` do item de compra é gravado e **nunca recalculado** depois de confirmado. |
| **RN-C05** | Confirmar uma compra recalcula o custo médio ponderado do produto (ADR-02). |
| **RN-C06** | Compra confirmada não pode ser editada — apenas cancelada, o que gera o estorno completo. |
| **RN-C07** | Cancelar compra só é permitido se houver saldo disponível suficiente para estornar a entrada. |
| **RN-C08** | Quantidade e valores devem ser sempre > 0. Frete, taxa e outros podem ser 0. |

### 9.3 Produtos e preços

| ID | Regra |
|---|---|
| **RN-P01** | Código do produto é único e não reutilizável. Geração automática sequencial ou manual. |
| **RN-P02** | `Lucro Consumidor = Preço Consumidor − Custo Médio`. |
| **RN-P03** | `Lucro Revendedor = Preço Revendedor − Custo Médio`. |
| **RN-P04** | `Margem % = (Preço − Custo) ÷ Preço × 100` (margem sobre a venda). O sistema também exibe o *markup* = `(Preço − Custo) ÷ Custo × 100`. |
| **RN-P05** | Preço de venda abaixo do custo médio é permitido, mas gera **aviso visual destacado** no cadastro e na venda. |
| **RN-P06** | `Preço Revendedor ≤ Preço Consumidor` — se violado, exibe aviso (não bloqueia). |
| **RN-P07** | Situação do produto (Disponível / Mostruário / Vendido) é **derivada dos saldos**, nunca digitada. |

### 9.4 Vendas

| ID | Regra |
|---|---|
| **RN-V01** | Venda a consumidor usa `preco_consumidor`; venda a revendedor usa `preco_revendedor`. O preço é sugerido e pode ser alterado, ficando registrado como preço praticado. |
| **RN-V02** | `Total da Venda = Σ(qtd × preço praticado) − Desconto`. |
| **RN-V03** | Desconto não pode exceder o subtotal. Desconto acima de um percentual parametrizável exige confirmação. |
| **RN-V04** | Parcelamento de 1 a 4 vezes. `Σ(parcelas) = Total da Venda` **exatamente** — a diferença de centavos vai na primeira parcela. |
| **RN-V05** | Vencimento padrão: 1ª parcela em 30 dias, demais a cada 30 dias. Datas editáveis individualmente. |
| **RN-V06** | Venda à vista gera um título com situação PAGO na data da venda e o recebimento correspondente. |
| **RN-V07** | Não é possível vender sem saldo disponível. |
| **RN-V08** | O CMV é congelado no momento da venda (`custo_unitario_praticado`). |
| **RN-V09** | Cancelar venda: retorna estoque, cancela títulos em aberto e **exige estorno explícito** dos recebimentos já feitos. |
| **RN-V10** | Número da venda é sequencial, único e sem lacunas. |

### 9.5 Consignação e mostruário

| ID | Regra |
|---|---|
| **RN-M01** | Remessa não gera receita nem título a receber. |
| **RN-M02** | Cada item da remessa carrega `valor_custo` (custo médio na data do envio, congelado) e `valor_revenda` acordado. |
| **RN-M03** | Item consignado tem um único status ativo por vez; toda transição é registrada com data e usuário. |
| **RN-M04** | Item marcado como VENDIDO gera título a receber pelo valor acordado com o revendedor. |
| **RN-M05** | Item PERDIDO gera despesa pelo valor de custo e pode, opcionalmente, gerar cobrança ao revendedor. |
| **RN-M06** | O sistema calcula `dias_em_posse = hoje − data_envio` e destaca itens acima do limite parametrizado (padrão: 60 dias). |
| **RN-M07** | Remessa só pode ser encerrada quando nenhum item estiver EM_POSSE. |
| **RN-M08** | O custo de uma remessa de **mostruário** vira despesa da empresa (`BAIXA_MOSTRUARIO`) **no ato do envio**, uma vez só. Mostruário é material de demonstração, não mercadoria à venda. |
| **RN-M09** | Devolução de item de mostruário **estorna** a despesa da RN-M08 na proporção do que voltou: o produto reentra no estoque como patrimônio, e manter a despesa contaria o mesmo dinheiro duas vezes. |
| **RN-M10** | Item de mostruário marcado como FINALIZADO (a amostra acabou) sai do bolso MOSTRUARIO **sem gerar despesa nova** — o custo já foi reconhecido na RN-M08. |
| **RN-M11** | Item de mostruário não pode ser marcado como VENDIDO nem como PERDIDO. Venda porque amostra não se vende; perda porque duplicaria o custo já lançado — o caminho é FINALIZADO. |

### 9.6 Financeiro

| ID | Regra |
|---|---|
| **RN-F01** | Situação do título é **derivada**, nunca digitada: `PAGO` se saldo = 0; `PARCIAL` se 0 < recebido < valor; `VENCIDO` se saldo > 0 e vencimento < hoje; `A_VENCER` caso contrário. |
| **RN-F02** | `Saldo do título = valor_original − Σ(alocações não estornadas)`. |
| **RN-F03** | Um recebimento pode ser alocado em vários títulos; `Σ(alocações) ≤ valor do recebimento`. |
| **RN-F04** | Estorno de recebimento reverte as alocações e reabre os títulos, sem apagar o histórico. |
| **RN-F05** | Alerta automático diário: parcelas vencendo em até 3 dias e parcelas vencidas. |
| **RN-F06** | Data de recebimento não pode ser futura nem anterior à emissão do título. |
| **RN-F07** | Todo valor monetário é `NUMERIC(14,2)` com arredondamento *half-up* na 2ª casa. |

### 9.7 Sistema

| ID | Regra |
|---|---|
| **RN-S01** | Toda operação de INSERT/UPDATE/DELETE em tabela de negócio gera registro em `logs_auditoria` com usuário, data, valores antes e depois. |
| **RN-S02** | Exclusão sempre pede confirmação explícita nomeando o registro. |
| **RN-S03** | Cadastros usam exclusão lógica; documentos usam cancelamento. |
| **RN-S04** | Toda listagem tem busca, filtro por período, ordenação, paginação e exportação (PDF/Excel/Impressão). |
| **RN-S05** | Mensagens de erro devem ser em linguagem de negócio, não técnica: *"Saldo insuficiente: restam 3 unidades de Perfume X"*, nunca *"constraint violation"*. |
| **RN-S06** | Nenhum cálculo financeiro é solicitado ao usuário. |

---

## 10. MOTOR DE CÁLCULO FINANCEIRO

Definições canônicas. **Estas fórmulas são a fonte única de verdade** — dashboard, relatórios e PDFs devem consumir exatamente estas views.

### 10.1 Custos

```
Subtotal da compra      = Σ (quantidade_item × valor_unitario_item)
Custo acessório         = frete + taxa_cartao + outros_custos
Custo total da compra   = Subtotal + Custo acessório

Rateio do item          = Custo acessório × (subtotal_item ÷ Subtotal da compra)
Custo total do item     = subtotal_item + Rateio do item
Custo unitário do item  = Custo total do item ÷ quantidade_item
```

### 10.2 Custo médio ponderado

```
Na entrada:
  custo_medio = (qtd_anterior × custo_medio_anterior + qtd_entrada × custo_unitario_entrada)
                ÷ (qtd_anterior + qtd_entrada)

Na saída:  custo_medio permanece inalterado
           CMV do item = quantidade_saída × custo_medio_no_momento (congelado)
```

### 10.3 Resultado

```
Receita Bruta       = Σ (qtd × preço praticado) de vendas não canceladas
Descontos           = Σ descontos concedidos
Receita Líquida     = Receita Bruta − Descontos

CMV                 = Σ (qtd vendida × custo_unitario_praticado)

LUCRO BRUTO         = Receita Líquida − CMV

Despesas            = despesas operacionais + perdas de estoque
                      + taxas sobre vendas + fretes de envio

LUCRO LÍQUIDO       = Lucro Bruto − Despesas

Margem Bruta %      = Lucro Bruto ÷ Receita Líquida × 100
Margem Líquida %    = Lucro Líquido ÷ Receita Líquida × 100
```

### 10.4 Regime de caixa — lucro recebido vs. lucro a receber

O reconhecimento é **proporcional ao percentual recebido de cada venda**. Este é o ponto que mais gera confusão em sistemas caseiros, por isso está definido de forma explícita:

```
Para cada venda:
  % recebido da venda = Σ(alocações dos títulos da venda) ÷ Total da venda

  Lucro da venda        = Receita Líquida da venda − CMV da venda
  Lucro recebido        = Lucro da venda × % recebido da venda
  Lucro a receber       = Lucro da venda − Lucro recebido

Consolidado:
  LUCRO RECEBIDO   = Σ (lucro recebido de todas as vendas)
  LUCRO A RECEBER  = Σ (lucro a receber de todas as vendas)
  Verificação:  Lucro Recebido + Lucro a Receber = Lucro Bruto  ✔
```

### 10.5 Posição patrimonial

```
Valor do estoque disponível  = Σ (qtd_disponivel × custo_medio)
Valor em mostruário          = Σ (itens EM_POSSE tipo MOSTRUARIO × valor_custo)
Valor com revendedores       = Σ (itens EM_POSSE tipo CONSIGNACAO × valor_custo)
Valor reservado              = Σ (qtd_reservado × custo_medio)

INVESTIMENTO TOTAL EM MERCADORIA = soma dos quatro acima

Potencial de venda (consumidor)  = Σ (qtd_total × preco_consumidor)
Lucro potencial em estoque       = Potencial de venda − Investimento total
```

### 10.6 Contas a receber

```
Total a receber   = Σ saldos de títulos com situação ≠ PAGO e ≠ CANCELADO
Vencido           = Σ saldos com data_vencimento < hoje
A vencer (7d)     = Σ saldos com hoje ≤ vencimento ≤ hoje + 7
Total recebido    = Σ recebimentos não estornados no período
Inadimplência %   = Vencido ÷ Total a receber × 100
```

### 10.7 Tratamento de arredondamento

Regra única aplicada em todo o sistema:

1. Todo valor monetário é `NUMERIC(14,2)`, arredondamento **half-up**.
2. Em qualquer rateio ou divisão (rateio de frete, geração de parcelas), calcula-se cada fatia arredondada e a **diferença residual é somada ao maior elemento** (item de maior valor / primeira parcela).
3. Isso garante matematicamente que `Σ(partes) = todo`, sem centavo perdido.

**Exemplo — R$ 100,00 em 3 parcelas:** `100,00 ÷ 3 = 33,333…` → cada fatia truncada em `33,33`,
somando `99,99`. O residual de `R$ 0,01` vai para a primeira parcela:

`33,34 + 33,33 + 33,33 = 100,00` ✔

---

## 11. SEGURANÇA

### 11.1 Camadas

| Camada | Implementação |
|---|---|
| **Autenticação** | Supabase Auth (e-mail + senha), sessão em cookie `httpOnly`, expiração configurável, MFA opcional (TOTP) |
| **Autorização** | RLS no PostgreSQL: **nenhuma tabela é acessível sem política explícita**. Estrutura de perfis pronta (ADMIN, GERENTE, VENDEDOR, FINANCEIRO) mesmo com um único usuário ativo |
| **Proteção de rota** | `middleware.ts` valida a sessão antes de renderizar qualquer rota do grupo `(app)` |
| **SQL Injection** | Eliminado por construção: cliente Supabase usa consultas parametrizadas; nenhuma concatenação de string em SQL. Funções SQL declaradas com `SECURITY INVOKER` e `search_path` fixo |
| **XSS** | React escapa por padrão; `dangerouslySetInnerHTML` proibido por regra de lint |
| **CSRF** | Server Actions do Next.js validam origem automaticamente |
| **Validação** | Schema Zod único compartilhado entre cliente e servidor; o servidor **sempre** revalida |
| **Segredos** | Apenas em variáveis de ambiente. A chave `service_role` nunca é exposta ao navegador — uso restrito a jobs no servidor |
| **Upload** | Tipo MIME e tamanho validados, imagem reprocessada por `sharp` (remove metadados e payload malicioso) |
| **Rate limit** | Limite de tentativas de login e de geração de PDF |
| **Auditoria** | Trigger genérico grava usuário, ação, tabela, registro, valores antes/depois e IP |
| **Backup** | Backup diário automático do Supabase (PITR) + exportação semanal em `.sql` e `.xlsx` para armazenamento externo |
| **Transporte** | HTTPS obrigatório, HSTS, cookies `Secure` + `SameSite=Lax` |

### 11.2 Matriz de permissões (preparada para o futuro)

| Recurso | ADMIN | GERENTE | VENDEDOR | FINANCEIRO |
|---|:---:|:---:|:---:|:---:|
| Dashboard completo | ✅ | ✅ | Parcial | Parcial |
| Compras | ✅ | ✅ | ❌ | 👁 |
| Produtos — cadastrar | ✅ | ✅ | ❌ | ❌ |
| Produtos — ver custo | ✅ | ✅ | ❌ | ✅ |
| Vendas — registrar | ✅ | ✅ | ✅ | ❌ |
| Vendas — cancelar | ✅ | ✅ | ❌ | ❌ |
| Mostruários | ✅ | ✅ | ✅ | 👁 |
| Contas a receber | ✅ | ✅ | 👁 | ✅ |
| Registrar recebimento | ✅ | ✅ | ❌ | ✅ |
| Estornar recebimento | ✅ | ❌ | ❌ | ❌ |
| Ajuste de estoque | ✅ | ✅ | ❌ | ❌ |
| Relatórios financeiros | ✅ | ✅ | ❌ | ✅ |
| Configurações e usuários | ✅ | ❌ | ❌ | ❌ |
| Log de auditoria | ✅ | 👁 | ❌ | ❌ |

Legenda: ✅ total · 👁 somente leitura · ❌ sem acesso

---

## 12. PLANO DE DESENVOLVIMENTO POR ETAPAS

Sequência **obrigatória** — cada etapa depende estruturalmente da anterior. Estimativas para um desenvolvedor em tempo integral.

### ETAPA 0 — Fundação · 3 dias
- Projeto Next.js + TypeScript + Tailwind + shadcn/ui
- Projeto Supabase, variáveis de ambiente, cliente tipado
- Layout base: menu lateral, topbar, breadcrumbs, tema claro
- Autenticação, middleware de proteção, tela de login
- Componentes base: `DataTable`, `CampoMoeda`, `CampoCPF`, `FiltroPeriodo`, `ConfirmarExclusao`, toasts
- **Entrega:** aplicação que autentica e navega, com layout final e sem funcionalidade de negócio

### ETAPA 1 — Banco de dados completo · 4 dias
- Todas as migrations: enums, tabelas, FKs, índices, constraints
- Funções de cálculo, triggers de integridade, views de relatório
- Políticas RLS
- Seed de dados iniciais
- Geração dos tipos TypeScript
- **Entrega:** banco pronto, testado com dados fictícios, invariantes validadas
- ⚠️ **Marco crítico:** nenhuma tela deve ser construída antes do banco estar estável

### ETAPA 2 — Cadastros base · 4 dias
- Fornecedores, Categorias, Marcas
- Produtos: CRUD completo, upload de foto, cálculo de margens
- Clientes: CRUD + validação de CPF
- Revendedores: CRUD
- Busca global (Ctrl+K)
- **Entrega:** todos os cadastros funcionais com busca, filtro, paginação e exportação

### ETAPA 3 — Compras e entrada de estoque · 4 dias
- Formulário mestre-detalhe de compra
- Motor de rateio com prévia em tempo real
- Confirmação → entrada no estoque + custo médio
- Cancelamento com estorno
- Kardex e tela de posição de estoque
- Ajuste de inventário
- **Entrega:** ciclo completo de entrada de mercadoria com custo correto
- ⚠️ **Testes unitários obrigatórios** do rateio e do custo médio antes de prosseguir

### ETAPA 4 — Vendas e contas a receber · 5 dias
- PDV / formulário de venda em etapas
- Validação de saldo, desconto, parcelamento até 4x
- Geração de títulos com ajuste de centavos
- Tela de contas a receber com abas (Vencidos / A vencer / Pagos)
- Registro de recebimento com alocação automática e manual
- Estorno de recebimento
- Cancelamento de venda
- **Entrega:** ciclo de venda e cobrança completo

### ETAPA 5 — Consignação e revendedores · 5 dias
- Nova remessa de mostruário/consignação
- Transferência entre bolsos de estoque
- Painel de itens em posse com tempo decorrido
- Assistente de prestação de contas
- Extrato financeiro do revendedor
- **Entrega:** o módulo que diferencia este sistema, funcionando ponta a ponta

### ETAPA 6 — Financeiro e dashboard · 4 dias
- Cadastro de despesas
- Fluxo de caixa realizado e projetado
- Todos os indicadores do Prompt 3
- Gráficos: evolução de vendas, composição de custos, ranking de produtos e revendedores
- Listas de atenção: produtos parados, mostruários antigos, títulos vencidos
- **Entrega:** dashboard completo com dados reais e atualização automática

### ETAPA 7 — Documentos e relatórios · 4 dias
- Recibo de venda ao consumidor (PDF)
- Recibo de entrega ao revendedor (PDF)
- Prestação de contas (PDF)
- Central de relatórios com todos os relatórios do Prompt 13
- Exportação Excel e impressão
- **Entrega:** toda a saída documental do sistema

### ETAPA 8 — Alertas e automações · 2 dias
- Job diário de alertas de vencimento
- Notificações no sino da topbar
- Alertas de estoque parado e mostruário antigo
- **Entrega:** sistema proativo

### ETAPA 9 — Auditoria, hardening e go-live · 4 dias
- Execução completa do Documento 4 (auditoria)
- Índices e otimização de consultas
- Testes E2E dos fluxos críticos
- Responsividade em tablet e celular
- Rotina de backup e restauração testada
- Manual do usuário
- **Entrega:** sistema em produção

**Total estimado: 39 dias úteis (~8 semanas).**

### 12.1 Marcos de validação

| Marco | Critério objetivo de aceite |
|---|---|
| M1 — fim da Etapa 1 | Todas as invariantes de estoque e financeiras passam nos testes com dados fictícios |
| M2 — fim da Etapa 3 | Uma compra com 5 itens, frete e taxa gera custos unitários cuja soma bate **ao centavo** com o total pago |
| M3 — fim da Etapa 4 | Uma venda em 3x gera 3 parcelas somando exatamente o total; recebimento parcial atualiza corretamente a situação |
| M4 — fim da Etapa 5 | Uma remessa de 10 itens com 6 vendidos, 3 devolvidos e 1 perdido fecha estoque e financeiro sem divergência |
| M5 — fim da Etapa 6 | `Lucro Recebido + Lucro a Receber = Lucro Bruto` no dashboard, sempre |
| M6 — Go-live | Checklist do Documento 4 100% aprovado |

---

## 13. RISCOS E MITIGAÇÕES

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Confundir consignação com venda, inflando a receita | **Crítico** | Separação estrutural no modelo de dados (ADR-05); consignação fisicamente incapaz de gerar título |
| R2 | Divergência de saldo de estoque | Alto | Ledger imutável (ADR-01) + trigger de invariante + rotina de reconciliação no relatório de estoque |
| R3 | Centavos perdidos em rateios e parcelamentos | Alto (quebra a confiança no sistema) | Regra única de resíduo (§10.7) + testes unitários obrigatórios |
| R4 | Cálculo duplicado entre tela e relatório gerando números diferentes | Alto | Todo cálculo vive em VIEW no banco (ADR-06); front-end apenas exibe |
| R5 | Perda de dados | **Crítico** | Backup automático diário + PITR + exportação semanal externa + restauração testada na Etapa 9 |
| R6 | Lentidão do dashboard com o crescimento da base | Médio | Índices desde a Etapa 1; migração para VIEW MATERIALIZADA com refresh incremental quando passar de ~100k movimentações |
| R7 | Cadastro duplicado de cliente/revendedor | Médio | `UNIQUE` em CPF + detecção de similaridade de nome no momento do cadastro |
| R8 | Foto de produto pesada estourando storage e deixando a listagem lenta | Baixo | Compressão e redimensionamento no upload (`sharp`), thumbnail dedicado para listagens |
| R9 | Usuário editar documento já confirmado e quebrar o histórico | Alto | Documentos imutáveis após confirmação; só cancelamento com estorno (ADR-07) |
| R10 | Fuso horário deslocando datas de vencimento em um dia | Médio | Datas de negócio como `DATE` (sem hora); timestamps sempre `TIMESTAMPTZ` |

---

## PRÓXIMO DOCUMENTO

**Documento 2 — Modelagem Completa do Banco de Dados:** todas as tabelas com chaves, índices, constraints, relacionamentos, dicionário de dados e DDL SQL pronto para execução.
