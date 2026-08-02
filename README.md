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
