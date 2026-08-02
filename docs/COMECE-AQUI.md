# Sistema de Gestão de Fragrâncias — comece por aqui

## 1. Abrir o sistema

Baixe o arquivo **`GESTAO-FRAGRANCIAS.html`** e dê **duplo clique**. Ele abre no navegador.
Não precisa instalar nada, não precisa de servidor.

**Guarde o arquivo em um lugar fixo** (ex.: uma pasta "Sistema" no computador) e crie um atalho
na área de trabalho. Você vai abrir por ele todos os dias.

## 2. Entrar

| | |
|---|---|
| **E-mail** | o endereço cadastrado no painel do Supabase |
| **Senha** | a senha definida na criação do usuário |

> As credenciais não ficam neste repositório nem dentro do arquivo do sistema.
> Quem cria e altera o acesso é o painel do Supabase, em Authentication → Users.

> **Troque a senha no primeiro acesso:** Configurações → Usuários → *Alterar minha senha*.

## 3. Onde os dados ficam

Num banco PostgreSQL na nuvem (Supabase, projeto `gestao-fragrancias`, servidor em São Paulo).
O arquivo HTML é só a tela — **todos os dados vivem no servidor**, com backup automático diário.

Isso significa que:

- Você pode abrir o mesmo arquivo no computador, no notebook e no celular — os dados são os mesmos.
- Se o arquivo sumir, é só baixar de novo. Nada se perde.
- Precisa de internet para funcionar.

Para usar no celular: envie o arquivo para você mesmo (WhatsApp, e-mail ou Drive) e abra pelo navegador.
Se quiser acesso por um endereço na web, dá para publicar o arquivo de graça — me avise que eu configuro.

---

## 4. Os primeiros 15 minutos

**Passo 1 — Preencha os dados da empresa.**
Configurações → Parâmetros → nome, CPF/CNPJ, telefone, endereço e **chave PIX**.
Esses dados aparecem nos recibos e nas mensagens de cobrança do WhatsApp.

**Passo 2 — Confira as taxas das maquininhas.**
Configurações → Formas de pagamento. A taxa cadastrada é usada no cálculo automático
da taxa de cartão nas compras.

**Passo 3 — Cadastre um fornecedor e registre a primeira compra.**
Compras → Nova compra. Informe os produtos (dá para criar o produto na hora),
o frete e a taxa do cartão. **O sistema mostra o custo real de cada unidade antes de você confirmar.**

**Passo 4 — Já tem estoque de antes?**
Não cadastre o saldo "na mão". Use Estoque → Ajustar estoque, com o motivo
*"Saldo inicial em dd/mm/aaaa"*. Assim o estoque continua auditável — você sempre saberá
de onde veio cada unidade.

**Passo 5 — Faça uma venda de teste** e gere o recibo, só para ver o fluxo completo.

---

## 5. O que o sistema faz por você

| Você faz | O sistema faz sozinho |
|---|---|
| Registra a compra com frete e taxa | Rateia os custos e calcula o **custo real por unidade** |
| Compra o mesmo produto por outro preço | Recalcula o **custo médio ponderado** |
| Vende | Baixa o estoque, congela o custo e calcula o lucro daquela venda |
| Vende parcelado | Gera as parcelas com datas — a soma **sempre** bate com o total |
| Envia mostruário | Transfere o estoque **sem** registrar receita (porque ainda não é venda) |
| Faz a prestação de contas | Baixa o vendido, devolve o não vendido, lança a perda e gera a cobrança |
| Recebe um pagamento | Baixa as parcelas, atualiza o caixa e o lucro recebido |

**Você nunca precisa fazer uma conta.**

---

## 6. A regra mais importante do sistema

> **Enviar mostruário não é vender.**

Quando você manda produtos para uma revendedora, eles saem do seu estoque disponível mas
**continuam sendo seus**. Nenhuma receita é registrada nesse momento.

A venda só existe quando ela presta contas e diz o que vendeu.

É por isso que existe o botão **Prestação de contas** na ficha de cada revendedora — é o
coração do sistema. Nele você informa, para cada produto, quantas unidades foram vendidas,
devolvidas ou perdidas. O sistema faz o resto: estoque, dívida, lucro e o PDF para assinar.

---

## 7. As telas do dia a dia

| Tela | Para quê |
|---|---|
| **Dashboard** | Como o negócio está agora. Comece o dia por aqui. |
| **Contas a Receber** | Quem te deve. As vencidas ficam em vermelho, com botão de cobrança no WhatsApp. |
| **Mostruários** | O que está com quem e há quantos dias. |
| **Vendas → Nova venda** | Vender. O lucro aparece antes de você confirmar. |
| **Compras → Nova compra** | Comprar. O custo real aparece antes de você confirmar. |
| **Relatórios** | 19 relatórios, todos com filtro de período, Excel, PDF e impressão. |

**Atalhos:** `Ctrl + K` abre a busca global (produto, cliente, revendedora).

---

## 8. Recibos e documentos

Todos saem em PDF pelo próprio navegador — clique em imprimir e escolha
**"Salvar como PDF"** como impressora.

- **Recibo de venda** — na lista de vendas ou na ficha da venda (ícone 🧾)
- **Recibo de entrega ao revendedor** — na ficha da remessa, para assinar na entrega
- **Prestação de contas** — gerado automaticamente ao fechar o acerto
- **Comprovante de recebimento** — na tela de Recebimentos
- **Extrato do revendedor** — na ficha, aba Extrato financeiro

---

## 9. Segurança e rotina

**Uma vez por semana**, entre em Configurações → Backup e integridade e clique em
**Verificar agora**. São cinco conferências automáticas; todas devem dar "íntegro".

**Uma vez por mês**, clique em **Exportar tudo** e guarde o arquivo Excel em outro lugar
(Drive, pen drive). É sua cópia de segurança independente.

O banco já tem backup automático diário no Supabase, com recuperação ponto-a-ponto.

---

## 10. Coisas que o sistema **não** deixa você fazer (de propósito)

- Vender mais do que tem em estoque
- Deixar o estoque negativo
- Editar uma compra ou venda já confirmada — só **cancelar**, o que reverte tudo de forma rastreável
- Cancelar uma compra cujos produtos já foram vendidos
- Cancelar uma venda que já foi paga sem antes estornar o recebimento
- Excluir um produto que ainda tem saldo
- Ajustar estoque sem informar o motivo
- Parcelar uma venda sem identificar o cliente

Isso não é rigidez — é o que garante que os números continuem confiáveis daqui a dois anos.

---

## 11. Se algo der errado

**"Sessão expirada"** → recarregue a página e entre de novo.

**Uma tela não carrega** → clique em "Tentar novamente". Se persistir, verifique sua internet.

**Um número parece errado** → rode a verificação de integridade (Configurações → Backup).
Se acusar divergência, me chame com o print.

**Esqueceu a senha** → dá para redefinir pelo painel do Supabase, ou me avise.

---

## 12. Ficha técnica

| | |
|---|---|
| Projeto Supabase | `gestao-fragrancias` · região São Paulo · US$ 10/mês |
| Banco | PostgreSQL 17 · 25 tabelas · 16 views · 30 funções e gatilhos |
| Segurança | RLS em todas as tabelas · visitante não autenticado bloqueado · log de auditoria completo |
| Aplicativo | Arquivo HTML único de ~400 KB, com a biblioteca do Supabase embutida |
| Testes | Roteiro financeiro fecha ao centavo · 10 testes de integridade bloqueiam corretamente · 25 telas e 19 relatórios sem erro |

A documentação técnica completa (arquitetura, modelagem, regras de negócio e protocolo de
auditoria) está nos quatro documentos entregues anteriormente e salva no projeto.
