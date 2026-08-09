# ESSENZA AURA — Gestão de compras, estoque, consignação e financeiro

Sistema de gestão comercial para revenda de fragrâncias: compras com rateio de custos, estoque por
bolsos, consignação com revendedores, vendas parceladas, contas a receber, DRE e 19 relatórios.

A interface é **um único arquivo HTML** que abre com duplo clique — sem instalar nada, sem servidor,
sem passo de build para quem usa. Os dados vivem num PostgreSQL no Supabase, com toda a regra de
negócio dentro do banco.

---

## Como usar

**Pelo navegador** — o site publicado na Vercel. Abre em qualquer dispositivo, inclusive celular,
sem baixar nada.

**Pelo arquivo** — baixe `GESTAO-FRAGRANCIAS.html` e abra com duplo clique. Funciona igual e serve
de plano B se o site estiver fora do ar.

Nos dois casos é preciso internet e login. Os dados são os mesmos, porque estão no servidor.

### Publicação na Vercel

O site é **estático**: nenhuma compilação, nenhuma dependência instalada no deploy. O `vercel.json`
manda servir a pasta `public/`, que contém um único `index.html` — cópia byte a byte do
`GESTAO-FRAGRANCIAS.html`, mantida em dia pelo `scripts/build.sh`.

Deixar o endereço público não expõe dados: a página em si não contém nada sensível, e sem login o
Supabase recusa qualquer leitura (RLS ativo nas 25 tabelas, nada liberado para visitante não
autenticado).

---

## Estrutura

```
GESTAO-FRAGRANCIAS.html      o sistema pronto para uso (gerado por scripts/build.sh)
public/index.html            o mesmo arquivo, é o que a Vercel publica
vercel.json                  configuração do deploy: estático, sem build
app/                         o código-fonte, dividido em 8 partes
  part1.html                 estrutura da página, CSS, biblioteca do Supabase embutida
  part2.js                   utilidades, autenticação, navegação, componentes
  part3.js                   gráficos, dashboard, produtos
  part4.js                   compras, estoque, clientes, fornecedores
  part5.js                   revendedores, mostruários, prestação de contas
  part6.js                   vendas, contas a receber, recebimentos, despesas
  part7.js                   DRE, fluxo de caixa, 19 relatórios, configurações
  part8.js                   documentos em PDF (recibos, extratos, prestação)
  logo_*.txt                 a logo da marca em três resoluções, já em data URI
supabase/migrations/         o banco inteiro, em 19 migrações versionadas
docs/                        arquitetura, modelagem, especificação funcional, auditoria
scripts/build.sh             concatena app/ → GESTAO-FRAGRANCIAS.html
teste-ui.js                  suíte de testes de interface (Playwright, com banco simulado)
```

### Por que um arquivo só, e por que dividido em partes

Um arquivo único é o que torna o sistema utilizável por quem não é técnico: não há deploy, não há
`npm install`, não há "o site caiu". Mas 500 KB num arquivo só é impossível de manter — então o
código fica em oito partes e `scripts/build.sh` concatena. **Edite `app/`, nunca o HTML gerado.**

```bash
./scripts/build.sh
```

O script gera os dois arquivos (`GESTAO-FRAGRANCIAS.html` e `public/index.html`), confere a
sintaxe do JavaScript e recusa publicar se encontrar qualquer credencial no arquivo gerado.
Depois é só `git push` — a Vercel publica sozinha a cada commit na `main`.

---

## Banco de dados

25 tabelas, 16 views, ~30 funções e gatilhos. Para subir do zero num projeto Supabase novo:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

As migrações são cumulativas e devem rodar em ordem. As quatro últimas são posteriores à entrega
inicial:

| Migração | O que faz |
|---|---|
| `0015` | vencimento das parcelas passa a ser editável no ato da venda |
| `0016` | o mesmo na prestação de contas do revendedor |
| `0017` | fecha as funções internas — só as 14 que a interface usa continuam expostas na API |
| `0018` | corrige gatilho que impedia qualquer alteração na tabela de usuários |
| `0019` | usuário criado pelo painel do Supabase ganha perfil automaticamente |
| `0020` | corrige a `0017`, que revogou permissão de uma função usada em índices |
| `0021` | fecha para visitante a view de diagnóstico criada na `0020` |
| `0022`–`0024` | mostruário se baixa como custo da empresa e nunca pode ser vendido |
| `0025`–`0028` | recebimento do revendedor por produto e quantidade, não só por valor |
| `0029`–`0030` | o custo do mostruário vira despesa no envio, uma vez só; devolução estorna |
| `0031`–`0034` | devolução de produto vendido, crédito por devolução, relatórios do revendedor, edição de itens da compra e data de pagamento da compra |
| `0035` | compra e venda editáveis depois de salvas, com estorno explícito do recebimento |

### Decisões de modelagem

Sete decisões estão registradas em `docs/01-ARQUITETURA-DO-SISTEMA.md` com as alternativas que
foram descartadas e o porquê. As três que mais moldam o resto:

- **Estoque é um livro-razão imutável.** `movimentacoes_estoque` só recebe inserções; os saldos por
  bolso (disponível, reservado, mostruário, consignado) são cache mantido por gatilho. Estorno é
  lançamento novo, nunca `UPDATE` ou `DELETE`.
- **Custo médio ponderado**, congelado no momento da venda. O CMV de uma venda antiga não muda
  quando chega mercadoria nova mais cara.
- **Consignação não é venda.** Produto com revendedor continua sendo patrimônio da empresa; a
  receita nasce na prestação de contas, não na remessa.
- **Mostruário não é consignação.** Amostra de demonstração não se vende. O custo dela vira despesa
  da empresa **no dia do envio**, uma vez só; se a amostra voltar ao estoque a despesa é estornada na
  proporção do que voltou, e quando acaba basta marcá-la como finalizada — sem custo novo. O banco
  recusa marcar item de mostruário como vendido ou perdido.

### Como o revendedor paga

Revendedor acerta por peça — "hoje te pago 3 frascos" — não por parcela. O recebimento tem dois
modos: **por produto e quantidade** (padrão para revendedor) e **por valor total** (o de sempre).
No modo por peça o sistema calcula o valor, grava quais unidades foram pagas em
`recebimento_itens` e abate as parcelas do documento de origem, da mais antiga para a mais nova.
Vale nas duas origens em que o revendedor deve: venda direta e prestação de contas.

### Mostruário: o custo é seu, e entra uma vez só

Amostra de mostruário é material de demonstração, não mercadoria à venda. Por isso ela sai do
patrimônio no instante em que sai da sua mão:

| Momento | O que o sistema faz |
|---|---|
| envio da remessa | lança o custo como despesa (categoria "Custo de mostruário") |
| revendedor devolve | devolve ao estoque e **estorna** a despesa, na medida do que voltou |
| a amostra acaba | marca como **finalizada** — sai do estoque, **sem despesa nova** |
| tentar vender | recusado |
| tentar lançar como perda | recusado — em amostra, perda e finalização são a mesma coisa |

Finalizar e devolver estão na própria tela da remessa, sem precisar abrir prestação de contas —
mostruário nunca gera cobrança, então não há acerto a fazer. Também continuam disponíveis dentro da
prestação de contas, para quem prefere resolver tudo num documento só.

No dashboard, o mostruário deixou de contar em "Investimento total": esse dinheiro já foi para a
despesa, e somá-lo de novo como estoque contaria o mesmo valor duas vezes.

### Devolução de produto vendido

Item de venda pode ser devolvido peça a peça, pela própria ficha da venda. O produto volta ao
estoque disponível pelo custo congelado na venda — CMV de venda antiga não muda —, e o valor sai do
que o comprador ainda deve, começando pela parcela mais antiga.

Se ele já tinha pago, o que sobra vira **crédito** a favor dele: aparece na ficha, aparece em contas
a receber e abate qualquer parcela em aberto. Crédito não é entrada de caixa e não conta como
recebimento. Vale para revendedor e para consumidor final.

Receita, CMV e lucro passam a ser líquidos de devolução; o documento da venda continua mostrando o
que saiu, com um bloco separado listando o que voltou.

### Os três relatórios do revendedor

Uma view só, `vw_itens_revendedor`, com **uma linha por situação**: um item de 10 unidades com 3
pagas, 2 devolvidas e 5 em aberto vira três linhas. Os três relatórios são a mesma consulta com um
filtro diferente:

- **Extrato de produtos do revendedor** — escolhe-se o revendedor e o relatório sai em blocos
  separados e somados: *a pagar*, *pagos*, *devolvidos*, *em posse*, *mostruário*, *perdidos*.
  No topo, quatro números: a pagar, já pago, devolvido e total movimentado. Imprime como
  documento para entregar a ele.
- **Produtos pagos** — só o que ele já quitou.
- **Produtos a pagar** — só o que ainda deve.

Funciona nos dois modos de pagamento: quando ele paga por peça, a unidade fica amarrada em
`recebimento_itens`; quando paga por valor total, o dinheiro é distribuído pelos itens em aberto do
mesmo documento, na ordem. Nos dois casos os totais fecham com o que entrou.

### Compras

Produtos podem ser **incluídos e excluídos**, inclusive numa compra já confirmada: o banco desfaz a
entrada de estoque, refaz o rateio de frete e taxa e dá entrada de novo — então o custo unitário de
todos os produtos da nota é recalculado. Se alguma unidade daquela compra já saiu do estoque, a
alteração é recusada.

A compra também registra **quando será paga**, e alimenta a tela **Contas a Pagar**, no menu
Financeiro ao lado de Contas a Receber: total a pagar, vencido, vence em 7 dias, a vencer e já pago,
com abas por situação e o botão de dar baixa. Compra vencida acende o aviso no menu.

Ela **não é despesa**: a mercadoria vira estoque e o custo entra no resultado como CMV quando o
produto é vendido — frete e taxa de cartão já vão embutidos nesse custo. Por isso a tela vive fora
de Despesas e não soma no lucro; serve para saber quando sai o dinheiro.

### Alterar compra e venda depois de salvas

Documento confirmado não é alterado no lugar: o banco **desfaz o que ele produziu, volta para
rascunho, regrava e confirma de novo** pelo caminho normal. Estoque, custo médio, títulos e quitação
automática passam pelas mesmas funções já testadas — nada é recalculado à mão.

Duas consequências que a tela avisa antes de salvar:

- **O CMV da venda é recalculado** pelo custo médio do momento da alteração, porque a mercadoria
  voltou ao estoque e saiu de novo.
- **O custo unitário de todos os itens da compra muda**, porque o rateio de frete e taxa é refeito.

**Venda com recebimento** exige estorno. A tela lista quais recebimentos serão estornados — por
inteiro, inclusive a parte que pagou outra venda — e só prossegue com confirmação. Venda com
**devolução registrada** não pode ser alterada: apagaria o histórico da devolução e o crédito que
ela gerou.

Parcela cancelada deixa de reservar o número: o índice único passou a valer só para parcela não
cancelada, senão a nova parcela 1 colidiria com a antiga.

### O que o revendedor vê

Os documentos que vão para a mão do revendedor — recibo de entrega e prestação de contas — mostram
**apenas o valor de revenda**. O custo de aquisição não aparece em nenhum deles; fica só nas telas
internas e nos relatórios gerenciais.

---

## Segurança

- **RLS habilitado nas 25 tabelas**, sem nenhuma política liberada para visitante não autenticado.
- As políticas checam permissão por perfil (`fn_tem_permissao`), não apenas "está logado".
- A chave que vai no HTML é a **publicável** — pública por natureza e inútil sem sessão. A
  `service_role` não existe neste repositório nem no arquivo do sistema.
- **Nenhuma credencial em código.** Usuários se criam pelo painel do Supabase; um gatilho cria o
  perfil correspondente.
- Log de auditoria em todas as tabelas de movimento.

Roteiro para reconferir o bloqueio de visitante não autenticado: `docs/02-BANCO-DE-DADOS.md`, §18.

**Cuidado ao revogar permissões de função.** Função usada em índice, constraint, coluna gerada ou
view é avaliada com a permissão de **quem faz a operação** — revogar o `EXECUTE` quebra a gravação
inteira. A view `vw_permissoes_faltando` existe para acusar isso e **deve estar sempre vazia**:

```sql
select * from vw_permissoes_faltando;   -- 0 linhas = tudo certo
```

---

## Testes

```bash
npm install
npm test
```

`teste-ui.js` sobe o Chromium via Playwright, intercepta as chamadas à API e responde com dados
realistas — dá para exercitar as 25 telas, os 19 relatórios, os modais e os 4 documentos em PDF sem
tocar em banco nenhum. Cobre também autenticação, o cálculo de rateio, a geração de parcelas e o
vencimento editável, conferindo os valores ao centavo.

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| `docs/COMECE-AQUI.md` | guia de uso, em português claro, para quem vai operar |
| `docs/01-ARQUITETURA-DO-SISTEMA.md` | decisões de arquitetura, 52 regras de negócio, telas |
| `docs/02-BANCO-DE-DADOS.md` | modelagem completa, DDL, invariantes, consultas de reconciliação |
| `docs/03-MODULOS-FUNCIONAIS.md` | especificação de cada módulo e de cada tela |
| `docs/04-AUDITORIA-E-QUALIDADE.md` | protocolo de auditoria e casos de teste de cálculo |
| `docs/mapa-visual-sistema.html` | mapa visual navegável do sistema |
