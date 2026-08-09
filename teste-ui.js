/* Teste da interface com respostas simuladas do banco.
   O sandbox bloqueia a rede do navegador, então as chamadas à API são
   interceptadas e respondidas com dados realistas. O objetivo é exercitar
   TODAS as telas e caminhos de renderização em busca de erros de execução. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const log = [];
const P = (s) => { console.log(s); log.push(s); };

const UID = '11111111-1111-1111-1111-111111111111';
const PID = '22222222-2222-2222-2222-222222222222';
const CID = '33333333-3333-3333-3333-333333333333';
const RID = '44444444-4444-4444-4444-444444444444';
const REM = '55555555-5555-5555-5555-555555555555';
const RIT = '66666666-6666-6666-6666-666666666666';
const VID = '77777777-7777-7777-7777-777777777777';
const COM = '88888888-8888-8888-8888-888888888888';
const TIT = '99999999-9999-9999-9999-999999999999';

const produto = { id:PID, codigo:'336', nome:'MY WAY INTENSE', descricao:'Amadeirado', categoria_id:'c1',
  marca_id:'m1', categoria_nome:'Perfume Masculino', marca_nome:'Aroma', cor:null, tamanho:'100 ml', unidade:'UN',
  codigo_barras:null, foto_url:null, foto_thumb_url:null, custo_medio:108, ultimo_custo:120,
  preco_consumidor:249, preco_revendedor:179, qtd_disponivel:11, qtd_reservado:0, qtd_mostruario:0,
  qtd_consignado:6, qtd_total:17, estoque_minimo:2, lucro_consumidor:141, lucro_revendedor:71,
  margem_consumidor:56.63, margem_revendedor:39.66, markup_consumidor:130.5, markup_revendedor:65.7,
  data_ultima_entrada:'2026-07-20', data_ultima_saida:'2026-07-28', ativo:true, situacao:'DISPONIVEL',
  valor_estoque_disponivel:1188, valor_reservado:0, valor_mostruario:0, valor_consignado:648,
  valor_total_custo:1836, valor_potencial_venda:4233, lucro_potencial:2397,
  dias_sem_venda:5, estoque_baixo:false, preco_abaixo_custo:false, deleted_at:null,
  created_at:'2026-07-01T10:00:00Z', updated_at:'2026-07-01T10:00:00Z' };

const dash = { total_compras:2280, total_custo_produtos:2200, total_frete:50, total_taxa_cartao:30,
  total_outros_custos:0, valor_estoque_disponivel:1188, qtd_estoque_disponivel:11, produtos_disponiveis:1,
  valor_mostruario:0, valor_com_revendedores:648, investimento_total_mercadoria:1836, potencial_venda_estoque:4233,
  total_vendido:2970, total_vendido_consumidor:2250, total_vendido_revendedor_direto:0, total_vendido_consignacao:720,
  qtd_vendas:3, total_descontos:0, ticket_medio:990, lucro_bruto:1488, lucro_recebido:816, lucro_a_receber:672,
  total_despesas:114, lucro_liquido:1374, margem_bruta_percentual:50.1, total_a_receber:1470, total_vencido:250,
  total_a_vencer_7d:250, qtd_titulos_vencidos:1, total_recebido_caixa:1500, inadimplencia_percentual:17,
  qtd_mostruarios_antigos:1, qtd_produtos_parados:0, total_custo_mostruario:216 };

const titulo = { id:TIT, numero:1, origem:'VENDA', venda_id:VID, prestacao_id:null, tipo_devedor:'CLIENTE',
  cliente_id:CID, revendedor_id:null, numero_parcela:1, total_parcelas:4, valor_original:250, valor_recebido:0,
  saldo:250, data_emissao:'2026-07-01', data_vencimento:'2026-07-15', data_quitacao:null, situacao:'ABERTO',
  lucro_proporcional:136, devedor_nome:'Maria Silva Santos', devedor_whatsapp:'31999998888',
  venda_numero:1, prestacao_numero:null, situacao_real:'VENCIDO', dias_atraso:18, dias_para_vencer:-18,
  lucro_recebido:0, lucro_a_receber:136, observacoes:null };

const posse = { remessa_id:REM, remessa_numero:1, tipo_remessa:'CONSIGNACAO', data_envio:'2026-05-20',
  data_prevista_acerto:'2026-06-19', revendedor_id:RID, revendedor_nome:'Ana Paula Ferreira',
  revendedor_whatsapp:'31977776666', remessa_item_id:RIT, produto_id:PID, produto_codigo:'336',
  produto_nome:'MY WAY INTENSE', foto_thumb_url:null, qtd_em_posse:6, valor_custo_unitario:108,
  valor_revenda_unitario:180, valor_custo_total:648, valor_revenda_total:1080, dias_em_posse:74, acerto_atrasado:true };

const DADOS = {
  usuarios: [{ id:UID, nome:'Naiara Almeida', email:'w@t.com', perfil:'ADMIN', ativo:true, ultimo_acesso:'2026-08-01T10:00:00Z' }],
  parametros: [
    { chave:'empresa_nome', valor:'ESSENZA AURA', tipo:'texto', descricao:'Nome da empresa', grupo:'empresa', editavel:true },
    { chave:'empresa_slogan', valor:'Fragrâncias que transformam pessoas e ambientes', tipo:'texto', descricao:'Slogan', grupo:'empresa', editavel:true },
    { chave:'empresa_telefone', valor:'31999998888', tipo:'texto', descricao:'Telefone', grupo:'empresa', editavel:true },
    { chave:'empresa_endereco', valor:'Belo Horizonte / MG', tipo:'texto', descricao:'Endereço', grupo:'empresa', editavel:true },
    { chave:'empresa_pix', valor:'11144477735', tipo:'texto', descricao:'Chave PIX', grupo:'empresa', editavel:true },
    { chave:'desconto_max_sem_aprovacao', valor:'10', tipo:'numero', descricao:'Desconto máximo', grupo:'vendas', editavel:true }],
  formas_pagamento: [
    { id:'f1', nome:'PIX', permite_parcelar:false, max_parcelas:1, taxa_percentual:0, prazo_compensacao_dias:0, ativo:true },
    { id:'f2', nome:'Cartão de Crédito', permite_parcelar:true, max_parcelas:4, taxa_percentual:3.49, prazo_compensacao_dias:30, ativo:true }],
  categorias: [{ id:'c1', nome:'Perfume Masculino', descricao:'Fragrâncias masculinas', ativo:true, deleted_at:null }],
  marcas: [{ id:'m1', nome:'Aroma', ativo:true, deleted_at:null }],
  fornecedores: [{ id:'fo1', nome:'AMERICAN', documento:'12345678000199', telefone:'3133334444',
    whatsapp:null, email:null, cidade:'Belo Horizonte', estado:'MG', endereco:null, observacoes:null, ativo:true, deleted_at:null }],
  clientes: [{ id:CID, codigo:1, nome:'Maria Silva Santos', cpf:'11144477735', telefone:'31999998888',
    whatsapp:'31999998888', email:'maria@ex.com', data_nascimento:'1990-03-12', cep:'30110000',
    endereco:'Rua das Flores', numero:'123', complemento:null, bairro:'Centro', cidade:'Belo Horizonte',
    estado:'MG', observacoes:'Prefere amadeirados', ativo:true, deleted_at:null }],
  revendedores: [{ id:RID, codigo:1, nome:'Ana Paula Ferreira', cpf:'52998224725', telefone:'31977776666',
    whatsapp:'31977776666', email:null, cep:null, endereco:null, numero:null, complemento:null, bairro:null,
    cidade:'Contagem', estado:'MG', data_cadastro:'2026-03-12', limite_credito:0, prazo_acerto_dias:30,
    observacoes:null, ativo:true, deleted_at:null }],
  produtos: [produto],
  vw_produtos: [produto],
  vw_dashboard: dash,
  vw_evolucao_vendas: [
    { mes:'2026-05-01', qtd_operacoes:2, receita:1200, cmv:640, lucro_bruto:560 },
    { mes:'2026-06-01', qtd_operacoes:3, receita:1800, cmv:900, lucro_bruto:900 },
    { mes:'2026-07-01', qtd_operacoes:3, receita:2970, cmv:1482, lucro_bruto:1488 }],
  vw_produtos_mais_vendidos: [{ id:PID, codigo:'336', nome:'MY WAY INTENSE', foto_thumb_url:null,
    qtd_vendida:9, valor_vendido:2250, lucro_gerado:1224 }],
  vw_produtos_parados: [],
  vw_ranking_revendedores: [{ id:RID, nome:'Ana Paula Ferreira', cidade:'Contagem', estado:'MG',
    whatsapp:'31977776666', valor_vendido_total:720, qtd_em_posse:6, valor_custo_em_posse:648,
    saldo_aberto:720, saldo_vencido:0 }],
  vw_ranking_clientes: [{ id:CID, nome:'Maria Silva Santos', whatsapp:'31999998888', qtd_compras:2,
    valor_total_comprado:2250, ultima_compra:'2026-07-28' }],
  vw_itens_a_pagar_revendedor: [
    { origem:'VENDA', origem_id:VID, origem_numero:1, origem_data:'2026-07-10', revendedor_id:RID,
      venda_item_id:'vi9', remessa_item_evento_id:null, produto_id:PID, produto_codigo:'336',
      produto_nome:'MY WAY INTENSE', qtd_devida:10, qtd_paga:3, qtd_em_aberto:7,
      valor_unitario:150, valor_em_aberto:1050 },
    { origem:'PRESTACAO', origem_id:'pc1', origem_numero:1, origem_data:'2026-07-30', revendedor_id:RID,
      venda_item_id:null, remessa_item_evento_id:'ev1', produto_id:PID, produto_codigo:'336',
      produto_nome:'MY WAY INTENSE', qtd_devida:4, qtd_paga:0, qtd_em_aberto:4,
      valor_unitario:180, valor_em_aberto:720 }],
  vw_itens_em_posse: [posse,
    { ...posse, remessa_id:'r2', remessa_numero:2, tipo_remessa:'MOSTRUARIO',
      remessa_item_id:'ri2', qtd_em_posse:2, valor_custo_total:216, valor_revenda_total:360 }],
  venda_devolucoes: [],
  creditos: [], credito_usos: [],
  vw_creditos: [{ id:'cr1', numero:1, tipo_devedor:'REVENDEDOR', cliente_id:null, revendedor_id:RID,
    devedor_nome:'Ana Paula Ferreira', devedor_whatsapp:'31977776666', origem_tabela:'vendas', origem_id:VID,
    valor:300, valor_utilizado:0, saldo:300, data_credito:'2026-08-01',
    motivo:'Devolução de produto já pago — venda nº 1', observacoes:null, created_at:'2026-08-01T10:00:00Z' }],
  vw_compras_a_pagar: [{ id:COM, numero:1, data_compra:'2026-07-01', data_pagamento:'2026-08-20', pago:false,
    fornecedor_nome:'AMERICAN', forma_pagamento:null, subtotal_produtos:1000, valor_frete:50,
    valor_taxa_cartao:30, outros_custos:0, custo_total:1080, numero_documento:'NF 123', observacoes:null,
    situacao:'A_VENCER', dias_para_pagar:12 }],
  vw_itens_revendedor: [
    { revendedor_id:RID, revendedor_nome:'Ana Paula Ferreira', revendedor_whatsapp:'31977776666',
      origem:'VENDA', origem_id:VID, origem_numero:1, data:'2026-07-10', documento:'Venda nº 1',
      produto_id:PID, produto_codigo:'336', produto_nome:'MY WAY INTENSE', produto_tamanho:'100 ml',
      situacao:'PAGO', situacao_label:'Pago', quantidade:3, valor_unitario:150, valor_total:450,
      cobravel:true, valor_cobravel:450 },
    { revendedor_id:RID, revendedor_nome:'Ana Paula Ferreira', revendedor_whatsapp:'31977776666',
      origem:'VENDA', origem_id:VID, origem_numero:1, data:'2026-07-10', documento:'Venda nº 1',
      produto_id:PID, produto_codigo:'336', produto_nome:'MY WAY INTENSE', produto_tamanho:'100 ml',
      situacao:'A_PAGAR', situacao_label:'A pagar', quantidade:5, valor_unitario:150, valor_total:750,
      cobravel:true, valor_cobravel:750 },
    { revendedor_id:RID, revendedor_nome:'Ana Paula Ferreira', revendedor_whatsapp:'31977776666',
      origem:'VENDA', origem_id:VID, origem_numero:1, data:'2026-07-12', documento:'Venda nº 1',
      produto_id:PID, produto_codigo:'336', produto_nome:'MY WAY INTENSE', produto_tamanho:'100 ml',
      situacao:'DEVOLVIDO', situacao_label:'Devolvido', quantidade:2, valor_unitario:150, valor_total:300,
      cobravel:false, valor_cobravel:0 },
    { revendedor_id:RID, revendedor_nome:'Ana Paula Ferreira', revendedor_whatsapp:'31977776666',
      origem:'CONSIGNACAO', origem_id:null, origem_numero:1, data:'2026-05-20', documento:'Remessa nº 1',
      produto_id:PID, produto_codigo:'336', produto_nome:'MY WAY INTENSE', produto_tamanho:'100 ml',
      situacao:'EM_POSSE', situacao_label:'Em posse', quantidade:6, valor_unitario:180, valor_total:1080,
      cobravel:false, valor_cobravel:0 },
    { revendedor_id:RID, revendedor_nome:'Ana Paula Ferreira', revendedor_whatsapp:'31977776666',
      origem:'MOSTRUARIO', origem_id:null, origem_numero:2, data:'2026-06-01', documento:'Remessa nº 2',
      produto_id:PID, produto_codigo:'336', produto_nome:'MY WAY INTENSE', produto_tamanho:'100 ml',
      situacao:'AMOSTRA', situacao_label:'Mostruário', quantidade:2, valor_unitario:180, valor_total:360,
      cobravel:false, valor_cobravel:0 }],
  vw_titulos_receber: [titulo,
    { ...titulo, id:'tr1', numero:4, origem:'VENDA', tipo_devedor:'REVENDEDOR', cliente_id:null,
      revendedor_id:RID, devedor_nome:'Ana Paula Ferreira', devedor_whatsapp:'31977776666',
      numero_parcela:1, total_parcelas:1, valor_original:400, valor_recebido:0, saldo:400,
      data_vencimento:'2026-08-20', situacao:'ABERTO', situacao_real:'A_VENCER',
      dias_atraso:-12, dias_para_vencer:12 },
    { ...titulo, id:'t2', numero:2, numero_parcela:2, data_vencimento:'2026-08-15', situacao_real:'A_VENCER', dias_atraso:-13, dias_para_vencer:13 },
    { ...titulo, id:'t3', numero:3, numero_parcela:3, valor_recebido:250, saldo:0, situacao:'PAGO',
      situacao_real:'PAGO', data_quitacao:'2026-07-20', lucro_recebido:136, lucro_a_receber:0 }],
  titulos_receber: [titulo],
  __titRev: null,
  vw_extrato_revendedor: [{ id:RID, codigo:1, nome:'Ana Paula Ferreira', whatsapp:'31977776666',
    telefone:'31977776666', cidade:'Contagem', estado:'MG', limite_credito:0, qtd_em_posse:6,
    valor_custo_em_posse:648, valor_revenda_em_posse:1080, dias_max_em_posse:74, qtd_total_recebida:10,
    qtd_vendida:4, qtd_devolvida:0, qtd_perdida:0, valor_vendido_consignacao:720, valor_vendido_direto:0,
    valor_vendido_total:720, total_devido:720, total_pago:0, saldo_aberto:720, saldo_vencido:0,
    ultimo_pagamento:null, ultimo_acerto:'2026-07-30', dias_desde_ultimo_acerto:3, saldo_credito:300 }],
  vw_resultado_consolidado: [
    { id:VID, numero:1, data_venda:'2026-07-10', tipo:'CONSUMIDOR', comprador:'Maria Silva Santos',
      subtotal:1250, desconto_valor:0, receita_liquida:1250, cmv:570, lucro_bruto:680, margem_percentual:54.4,
      valor_recebido:1250, valor_em_aberto:0, lucro_recebido:680, lucro_a_receber:0 },
    { id:'v2', numero:2, data_venda:'2026-07-20', tipo:'CONSUMIDOR', comprador:'Maria Silva Santos',
      subtotal:1000, desconto_valor:0, receita_liquida:1000, cmv:456, lucro_bruto:544, margem_percentual:54.4,
      valor_recebido:250, valor_em_aberto:750, lucro_recebido:136, lucro_a_receber:408 },
    { id:'pc1', numero:1, data_venda:'2026-07-30', tipo:'CONSIGNACAO', comprador:'Ana Paula Ferreira',
      subtotal:720, desconto_valor:0, receita_liquida:720, cmv:456, lucro_bruto:264, margem_percentual:36.7,
      valor_recebido:0, valor_em_aberto:720, lucro_recebido:0, lucro_a_receber:264 }],
  vendas: [{ id:VID, numero:1, tipo:'CONSUMIDOR', cliente_id:CID, revendedor_id:null, data_venda:'2026-07-10',
    subtotal:1250, desconto_valor:0, desconto_percentual:0, valor_total:1250, custo_total:570, lucro_bruto:680,
    valor_devolvido:0, custo_devolvido:0,
    forma_pagamento_id:'f1', qtd_parcelas:1, status:'CONFIRMADO', observacoes:null,
    clientes:{ id:CID, nome:'Maria Silva Santos', cpf:'11144477735', whatsapp:'31999998888', telefone:'31999998888', endereco:'Rua das Flores', numero:'123', bairro:'Centro', cidade:'Belo Horizonte', estado:'MG' },
    revendedores:null, formas_pagamento:{ nome:'PIX' },
    venda_itens:[{ id:'vi1', venda_id:VID, produto_id:PID, quantidade:5, preco_unitario:250, desconto_item:0,
      subtotal:1250, custo_unitario_praticado:114, custo_total_item:570, lucro_item:680, qtd_devolvida:0,
      produtos:{ codigo:'336', nome:'MY WAY INTENSE', tamanho:'100 ml' } }] }],
  compras: [{ id:COM, numero:1, fornecedor_id:'fo1', data_compra:'2026-07-01', numero_documento:'NF 123',
    subtotal_produtos:1000, valor_frete:50, valor_taxa_cartao:30, outros_custos:0, custo_acessorio:80,
    custo_total:1080, criterio_rateio:'VALOR', status:'CONFIRMADO', observacoes:null,
    data_pagamento:'2026-08-20', pago:false, forma_pagamento_id:null, formas_pagamento:null,
    fornecedores:{ id:'fo1', nome:'AMERICAN', documento:'12345678000199' },
    compra_itens:[{ id:'ci1', compra_id:COM, produto_id:PID, quantidade:10, valor_unitario:100, subtotal:1000,
      rateio_acessorio:80, custo_total_item:1080, custo_unitario_final:108,
      produtos:{ codigo:'336', nome:'MY WAY INTENSE', tamanho:'100 ml' },
      compras:{ numero:1, data_compra:'2026-07-01', status:'CONFIRMADO', fornecedores:{ nome:'AMERICAN' } } }] }],
  compra_itens: [], venda_itens: [],
  remessas: [{ id:REM, numero:1, revendedor_id:RID, tipo:'CONSIGNACAO', data_envio:'2026-05-20',
    data_prevista_acerto:'2026-06-19', data_encerramento:null, valor_custo_total:1080, valor_revenda_total:1800,
    qtd_total_enviada:10, qtd_em_posse:6, status:'CONFIRMADO', encerrada:false, observacoes:null,
    revendedores:{ id:RID, nome:'Ana Paula Ferreira', cpf:'52998224725', telefone:'31977776666', cidade:'Contagem', estado:'MG' },
    remessa_itens:[{ id:RIT, remessa_id:REM, produto_id:PID, quantidade:10, valor_custo_unitario:108,
      valor_revenda_unitario:180, qtd_em_posse:6, qtd_vendida:4, qtd_devolvida:0, qtd_perdida:0, qtd_baixada:0,
      produtos:{ codigo:'336', nome:'MY WAY INTENSE', tamanho:'100 ml' } }] },
    { id:'r2', numero:2, revendedor_id:RID, tipo:'MOSTRUARIO', data_envio:'2026-06-01',
      data_prevista_acerto:null, data_encerramento:null, valor_custo_total:216, valor_revenda_total:360,
      qtd_total_enviada:2, qtd_em_posse:2, status:'CONFIRMADO', encerrada:false, observacoes:null,
      revendedores:{ id:RID, nome:'Ana Paula Ferreira', cpf:'52998224725', telefone:'31977776666', cidade:'Contagem', estado:'MG' },
      remessa_itens:[{ id:'ri2', remessa_id:'r2', produto_id:PID, quantidade:2, valor_custo_unitario:108,
        valor_revenda_unitario:180, qtd_em_posse:2, qtd_vendida:0, qtd_devolvida:0, qtd_perdida:0, qtd_baixada:0,
        produtos:{ codigo:'336', nome:'MY WAY INTENSE', tamanho:'100 ml' } }] }],
  remessa_itens: [], prestacoes_contas: [{ id:'pc1', numero:1, revendedor_id:RID, data_acerto:'2026-07-30',
    qtd_vendida:4, qtd_devolvida:0, qtd_perdida:0, valor_vendido:720, custo_vendido:456, valor_devolvido:0,
    valor_perdas:0, cobrar_perdas:true, valor_devido:720, lucro_bruto:264, qtd_parcelas:1, status:'CONFIRMADO',
    observacoes:null, revendedores:{ nome:'Ana Paula Ferreira', cpf:'52998224725' } }],
  recebimentos: [{ id:'r1', numero:1, tipo_devedor:'CLIENTE', cliente_id:CID, revendedor_id:null,
    data_recebimento:'2026-07-20', valor_total:250, valor_alocado:250, forma_pagamento_id:'f1',
    estornado:false, observacoes:null, clientes:{ id:CID, nome:'Maria Silva Santos', cpf:'11144477735' },
    revendedores:null, formas_pagamento:{ nome:'PIX' },
    recebimento_alocacoes:[{ id:'a1', valor:250, estornada:false,
      titulos_receber:{ numero_parcela:3, total_parcelas:4, data_vencimento:'2026-07-15', valor_original:250, saldo:0 } }] }],
  despesas: [{ id:'d1', numero:1, categoria:'PERDA_ESTOQUE', natureza:'VARIAVEL', descricao:'Frasco danificado',
    valor:114, data_despesa:'2026-07-30', data_pagamento:null, produto_id:PID, origem_tabela:'prestacoes_contas',
    origem_id:'pc1', recorrente:false, deleted_at:null, produtos:{ nome:'MY WAY INTENSE' }, formas_pagamento:null }],
  vw_kardex: [{ id:'k1', produto_id:PID, produto_codigo:'336', produto_nome:'MY WAY INTENSE',
    bucket:'DISPONIVEL', tipo:'ENTRADA_COMPRA', quantidade:10, custo_unitario:108, valor_total:1080,
    origem_tabela:'compras', origem_id:COM, data_movimento:'2026-07-01', motivo:null, e_estorno:false,
    foi_estornado:false, created_at:'2026-07-01T10:00:00Z' }],
  movimentacoes_estoque: [],
  vw_fluxo_caixa: [{ data:'2026-07-20', entradas:250, saidas:0, saldo_dia:250, saldo_acumulado:250 }],
  vw_fluxo_caixa_projetado: [{ data:'2026-08-15', entradas_previstas:250, saidas_previstas:0, saldo_dia:250, saldo_acumulado:250 }],
  vw_resultado_vendas: [], vw_resultado_consignacao: [], remessa_item_eventos: [],
  logs_auditoria: [{ id:1, usuario_id:UID, usuario_nome:'Naiara Almeida', acao:'INSERT',
    tabela:'produtos', registro_id:PID, campos_alterados:null, created_at:'2026-07-01T10:00:00Z' }],
  permissoes: [], notificacoes: []
};

const DRE = [{ receita_bruta:2970, descontos:0, receita_liquida:2970, cmv:1482, lucro_bruto:1488,
  despesas_fixas:0, despesas_variaveis:114, despesas_total:114, lucro_liquido:1374,
  margem_bruta:50.1, margem_liquida:46.26, lucro_recebido:816, lucro_a_receber:672 }];

(async () => {
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const page = await browser.newPage({ viewport:{ width:1500, height:950 } });
  const erros = [];
  page.on('pageerror', e => erros.push('ERRO: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|publicPath/.test(m.text())) erros.push('CONSOLE: ' + m.text().slice(0, 160)); });

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    if (url.includes('/auth/v1/token')) return route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ access_token:'tok', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600,
        refresh_token:'ref', user:{ id:UID, email:'naiara.almeida@inclitop.com.br', aud:'authenticated', role:'authenticated',
          app_metadata:{}, user_metadata:{}, created_at:'2026-01-01T00:00:00Z' } }) });
    if (url.includes('/auth/v1/user')) return route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ id:UID, email:'naiara.almeida@inclitop.com.br', aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{} }) });
    if (url.includes('/rest/v1/rpc/fn_dre')) return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(DRE) });
    if (url.includes('/rest/v1/rpc/')) return route.fulfill({ status:200, contentType:'application/json', body:'null' });
    const m = url.match(/\/rest\/v1\/([a-z_]+)/);
    if (m) {
      const t = m[1];
      let d = DADOS[t] !== undefined ? DADOS[t] : [];
      /* Honra os filtros `?coluna=eq.valor`: sem isso qualquer ficha abriria
         sempre o primeiro registro e um relatório filtrado mostraria tudo —
         o teste passaria por engano. */
      const qs = decodeURIComponent(url).split('?')[1] || '';
      if (Array.isArray(d)) {
        for (const par of qs.split('&')) {
          const mm = par.match(/^([a-z_]+)=eq\.(.+)$/);
          if (!mm || ['select','order','limit','offset'].includes(mm[1])) continue;
          const sel = d.filter(x => String(x[mm[1]]) === mm[2]);
          if (sel.length || mm[1] !== 'id') d = sel;
        }
      }
      const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
      if (single && Array.isArray(d)) d = d[0] || {};
      if (single && !Array.isArray(d)) { /* objeto direto */ }
      const met = route.request().method();
      if (met === 'POST' || met === 'PATCH') {
        const body = route.request().postData();
        let obj = {}; try { obj = JSON.parse(body); } catch (e) {}
        const r = Array.isArray(obj) ? obj[0] : obj;
        return route.fulfill({ status:201, contentType:'application/json',
          body: JSON.stringify(single ? { id:'novo-'+t, ...r } : [{ id:'novo-'+t, ...r }]) });
      }
      if (met === 'DELETE') return route.fulfill({ status:204, body:'' });
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(d) });
    }
    return route.fulfill({ status:200, body:'' });
  });

  await page.goto('file://' + path.resolve('GESTAO-FRAGRANCIAS.html'));
  await page.waitForTimeout(1500);
  await page.fill('#lemail', 'naiara.almeida@inclitop.com.br');
  await page.fill('#lsenha', 'x');
  await page.click('#lbtn');
  await page.waitForSelector('#app.on', { timeout:20000 });
  await page.waitForTimeout(2000);
  P('✓ Login e carga inicial');
  P('  usuário exibido: ' + await page.textContent('#unome'));

  const telas = [
    ['dashboard','Dashboard'], ['produtos','Produtos'], [`produtos/${PID}`,'Ficha do produto'],
    ['clientes','Clientes'], [`clientes/${CID}`,'Ficha do cliente'],
    ['revendedores','Revendedores'], [`revendedores/${RID}`,'Ficha do revendedor'],
    ['fornecedores','Fornecedores'], ['compras','Compras'], ['compras/nova','Nova compra'],
    [`compras/${COM}`,'Ficha da compra'], ['vendas','Vendas'], ['vendas/nova','Nova venda'],
    [`vendas/${VID}`,'Ficha da venda'], ['mostruarios','Mostruários'], ['mostruarios/nova','Nova remessa'],
    [`mostruarios/${REM}`,'Ficha da remessa'], ['estoque','Estoque'], ['receber','Contas a receber'],
    ['receber/venc','Contas a receber (vencidos)'], ['recebimentos','Recebimentos'], ['despesas','Despesas'],
    ['financeiro','Financeiro'], ['relatorios','Relatórios'], ['configuracoes','Configurações']
  ];
  let falhas = 0;
  for (const [rota, nome] of telas) {
    const antes = erros.length;
    await page.evaluate(h => location.hash = '#' + h, rota);
    await page.waitForTimeout(1100);
    const bad = await page.$$eval('.alert.bad', els => els.map(e => e.textContent).join(' ')).catch(() => '');
    const novosErros = erros.slice(antes);
    if (bad.includes('Não foi possível carregar') || novosErros.length) {
      falhas++; P(`✗ ${nome}: ${(bad || novosErros[0] || '').slice(0, 150)}`);
    } else P(`✓ ${nome}`);
  }

  P('\n── Todos os 19 relatórios ──');
  const rels = await page.evaluate(() => RELATORIOS.map(r => r.id));
  for (const r of rels) {
    const antes = erros.length;
    await page.evaluate(h => location.hash = '#relatorios/' + h, r);
    await page.waitForTimeout(950);
    const novos = erros.slice(antes);
    const linhas = await page.textContent('.pager span').catch(() => '');
    if (novos.length) { falhas++; P(`✗ ${r}: ${novos[0].slice(0, 140)}`); }
    else P(`✓ ${r} → ${linhas.trim()}`);
  }

  P('\n── Abas internas e modais ──');
  const testar = async (nome, fn) => {
    const antes = erros.length;
    try { await fn(); await page.waitForTimeout(700); } catch (e) { P(`✗ ${nome}: ${e.message.slice(0, 90)}`); falhas++; return; }
    const novos = erros.slice(antes);
    if (novos.length) { falhas++; P(`✗ ${nome}: ${novos[0].slice(0, 140)}`); } else P(`✓ ${nome}`);
  };
  await page.evaluate(() => location.hash = '#produtos'); await page.waitForTimeout(1100);
  await testar('Modal de novo produto', async () => { await page.click('#novoBtn'); await page.waitForSelector('.modal');
    await page.fill('#p_pc', '300'); await page.waitForTimeout(300); await page.click('.modal-h .x'); });
  await testar('Modal de novo cliente', async () => { await page.evaluate(() => location.hash = '#clientes');
    await page.waitForTimeout(1000); await page.click('#novoBtn'); await page.waitForSelector('.modal');
    await page.fill('#x_cpf', '11144477735'); await page.waitForTimeout(300);
    const h = await page.textContent('#h_cpf'); if (!h.includes('válido')) throw new Error('validação de CPF não sinalizou: ' + h);
    await page.click('.modal-h .x'); });
  await testar('Assistente de prestação de contas', async () => {
    await page.evaluate(h => location.hash = '#revendedores/' + h, RID); await page.waitForTimeout(1600);
    await page.click('#pcBtn'); await page.waitForSelector('.modal.wide');
    await page.fill('#pctb tbody .qv', '4'); await page.waitForTimeout(600);
    const res = await page.textContent('#pc_resumo');
    if (!res.includes('Valor devido')) throw new Error('resumo não calculou');
    P('    resumo: ' + res.replace(/\s+/g, ' ').match(/Valor devido[^V]*/)?.[0].slice(0, 60));
    await page.click('.modal-h .x'); });
  await testar('Abas da ficha do revendedor', async () => {
    for (const t of ['ext','rem','pc','fin']) { await page.click(`.tabs button[data-t="${t}"]`); await page.waitForTimeout(320); } });
  await testar('Modal de recebimento', async () => {
    await page.evaluate(() => location.hash = '#receber'); await page.waitForTimeout(1300);
    await page.click('[data-rc]'); await page.waitForSelector('.modal.wide'); await page.waitForTimeout(700);
    const r = await page.textContent('#rc_res'); if (!r.includes('alocado')) throw new Error('alocação não montou');
    await page.click('#rc_auto'); await page.waitForTimeout(500); await page.click('.modal-h .x'); });
  await testar('Ajuste de estoque', async () => {
    await page.evaluate(() => location.hash = '#estoque'); await page.waitForTimeout(1300);
    await page.click('#ajBtn'); await page.waitForSelector('.modal'); await page.click('.modal-h .x'); });
  await testar('Verificação de integridade', async () => {
    await page.evaluate(() => location.hash = '#configuracoes'); await page.waitForTimeout(1300);
    await page.click('.tabs button[data-t="bk"]'); await page.waitForTimeout(400);
    await page.click('#intBtn'); await page.waitForTimeout(1800);
    const r = await page.textContent('#intRes'); if (!r.includes('íntegro') && !r.includes('divergência')) throw new Error('não retornou resultado');
    P('    ' + r.replace(/\s+/g, ' ').slice(0, 70)); });


  P('\n── Lista de sugestões dentro da tabela de itens ──');
  await page.evaluate(() => location.hash = '#compras/nova'); await page.waitForTimeout(1500);
  await page.click('#addItem'); await page.waitForTimeout(400);
  await page.evaluate(() => { const i = document.querySelector('#itb tbody .p-busca');
    i.focus(); i.value = 'MY'; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(1100);
  const vis = await page.evaluate(() => {
    const b = document.querySelector('body > .gres.flut.on');
    if (!b) return { ok:false, motivo:'lista não abriu' };
    const r = b.getBoundingClientRect();
    const centro = document.elementFromPoint(r.left + r.width/2, r.top + 12);
    return { ok:true, largura:Math.round(r.width), altura:Math.round(r.height),
             noBody: b.parentElement === document.body,
             clicavel: !!(centro && b.contains(centro)),
             itens: b.querySelectorAll('a[data-i]').length,
             temCriar: !!b.querySelector('[data-criar]'),
             texto: b.textContent.replace(/\s+/g,' ').slice(0,70) };
  });
  P('  ' + JSON.stringify(vis));
  if (!vis.ok || !vis.clicavel || !vis.noBody) { P('  ✗ lista de sugestões não está visível/clicável'); falhas++; }
  else P('  ✓ lista visível, presa ao body e clicável (não é mais recortada pela tabela)');
  await page.click('body > .gres.flut.on a[data-i="0"]');
  await page.waitForTimeout(700);
  const nomeSel = await page.inputValue('#itb tbody .p-busca');
  P('  produto selecionado: "' + nomeSel + '"');
  if (!nomeSel) { P('  ✗ clique na sugestão não preencheu o produto'); falhas++; }
  else P('  ✓ clique preenche o produto');

  P('\n── Termo sem resultado oferece cadastrar ──');
  await page.click('#addItem'); await page.waitForTimeout(400);
  await page.evaluate(() => { const l = [...document.querySelectorAll('#itb tbody .p-busca')].pop();
    l.focus(); l.value = 'PRODUTO INEXISTENTE XYZ'; l.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(1100);
  const criar = await page.evaluate(() => {
    const b = document.querySelector('body > .gres.flut.on');
    return b ? { texto:b.textContent.replace(/\s+/g,' ').slice(0,80), temCriar:!!b.querySelector('[data-criar]') } : null; });
  P('  ' + JSON.stringify(criar));
  if (!criar?.temCriar) { P('  ✗ não oferece cadastrar produto novo'); falhas++; }
  else P('  ✓ oferece "Cadastrar … agora"');
  await page.evaluate(() => { const l = [...document.querySelectorAll('#itb tbody .rm')].pop(); l.click(); });
  await page.waitForTimeout(500);

  P('\n── Painel "o que falta" ──');
  const pend1 = await page.textContent('#pend');
  P('  sem fornecedor: ' + pend1.replace(/\s+/g,' ').slice(0,120));
  await page.evaluate(() => { const i = document.querySelector('#c_forn');
    i.focus(); i.value = 'AMER'; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(1000);
  await page.click('body > .gres.flut.on a[data-i="0"]');
  await page.waitForTimeout(500);
  await page.fill('#itb tbody .q', '10'); await page.fill('#itb tbody .vu', '100');
  await page.fill('#c_frete', '50'); await page.fill('#c_taxa', '30');
  await page.waitForTimeout(700);
  const pend2 = await page.textContent('#pend');
  P('  completo: ' + pend2.replace(/\s+/g,' ').slice(0,90));
  if (!pend2.includes('Tudo pronto')) { P('  ✗ painel não reconheceu formulário completo'); falhas++; }
  else P('  ✓ painel indica que está pronto');
  const btnAtivo = await page.evaluate(() => !document.getElementById('confirmar').disabled);
  P('  botão Confirmar habilitado: ' + btnAtivo);

  P('\n── Formulário de compra: cálculo do rateio ──');
  await page.evaluate(() => location.hash = '#compras/nova'); await page.waitForTimeout(1400);
  await page.click('#addItem'); await page.waitForTimeout(400);
  await page.evaluate(() => { const i = document.querySelector('#itb tbody .p-busca');
    i.value = 'MY'; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(900);
  await page.click('#itb .gres a').catch(() => {});
  await page.waitForTimeout(500);
  await page.fill('#itb tbody .q', '10'); await page.fill('#itb tbody .vu', '100');
  await page.fill('#c_frete', '50'); await page.fill('#c_taxa', '30');
  await page.waitForTimeout(800);
  const prev = (await page.textContent('#previa')).replace(/\s+/g, ' ');
  const tot = await page.textContent('#s_tot');
  P('  total: ' + tot + '  |  ' + prev.slice(0, 110));
  if (!prev.includes('108,00')) { P('  ✗ custo unitário esperado R$ 108,00 não apareceu'); falhas++; }
  else P('  ✓ rateio calculado corretamente: R$ 108,00 por unidade');

  P('\n── Formulário de venda: parcelas e lucro ──');
  await page.evaluate(() => location.hash = '#vendas/nova'); await page.waitForTimeout(1400);
  await page.click('#addItem'); await page.waitForTimeout(400);
  await page.evaluate(() => { const i = document.querySelector('#itb tbody .p-busca');
    i.focus(); i.value = 'MY'; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(1000);
  await page.click('body > .gres.flut.on a[data-i="0"]');
  await page.waitForTimeout(600);
  // a quantidade não pode perder o foco ao digitar
  await page.click('#itb tbody .q');
  await page.fill('#itb tbody .q', '3');
  await page.waitForTimeout(300);
  const focoOk = await page.evaluate(() => document.activeElement?.classList.contains('q'));
  P('  foco mantido ao digitar a quantidade: ' + focoOk);
  if (!focoOk) { P('  ✗ o campo perde o foco enquanto se digita'); falhas++; }
  await page.waitForTimeout(400);
  await page.selectOption('#v_forma', { label:'Cartão de Crédito' }); await page.waitForTimeout(400);
  await page.selectOption('#v_parc', '3'); await page.waitForTimeout(700);
  const parc = (await page.textContent('#previa_parc')).replace(/\s+/g, ' ');
  P('  ' + parc.slice(0, 190));
  const lucroTxt = await page.textContent('#s_luc');
  P('  lucro exibido: ' + lucroTxt + ' (3 × (249 − 108) = R$ 423,00)');
  if (!lucroTxt.includes('423,00')) { P('  ✗ lucro divergente'); falhas++; } else P('  ✓ lucro correto');
  // R$ 747,00 em 3x → 249,00 cada
  if (!parc.includes('249,00')) { P('  ✗ parcelas divergentes'); falhas++; } else P('  ✓ parcelas corretas');

  P('\n── Autenticação ──');
  const auth = await page.evaluate(() => ({
    loginVisivel: getComputedStyle(document.getElementById('login')).display !== 'none',
    appLigado: document.getElementById('app').classList.contains('on'),
    sairTopo: !!document.getElementById('sairTopo'),
    sairLateral: !!document.getElementById('sairBtn'),
    nomeNoTopo: document.getElementById('tbNome')?.textContent,
    temSignIn: /signInWithPassword/.test(document.documentElement.innerHTML),
    temSignOut: /signOut/.test(document.documentElement.innerHTML),
    temGetSession: /getSession/.test(document.documentElement.innerHTML),
    // nenhuma senha ou e-mail fixo no código
    senhaNoCodigo: /Fragrancias@2026|Essenza@2026Aura|inclitop\.com\.br/.test(document.documentElement.innerHTML)
  }));
  P('  ' + JSON.stringify(auth));
  for (const [rot, ok2] of [
    ['login escondido depois de autenticar', !auth.loginVisivel],
    ['sistema liberado só com sessão', auth.appLigado],
    ['botão Sair no cabeçalho', auth.sairTopo],
    ['botão Sair no rodapé do menu', auth.sairLateral],
    ['nome do usuário no cabeçalho', auth.nomeNoTopo && auth.nomeNoTopo !== '—'],
    ['usa signInWithPassword', auth.temSignIn],
    ['usa signOut', auth.temSignOut],
    ['verifica sessão ao abrir (getSession)', auth.temGetSession],
    ['nenhuma credencial gravada no arquivo', !auth.senhaNoCodigo]
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

  // sem sessão, o sistema não aparece
  const semSessao = await page.evaluate(async () => {
    const orig = window.sb.auth.getSession;
    window.sb.auth.getSession = async () => ({ data:{ session:null } });
    await iniciar();
    const r = { loginVisivel: getComputedStyle(document.getElementById('login')).display !== 'none',
                appLigado: document.getElementById('app').classList.contains('on') };
    window.sb.auth.getSession = orig;
    await iniciar();
    return r;
  });
  P('  sem sessão → ' + JSON.stringify(semSessao));
  if (semSessao.loginVisivel && !semSessao.appLigado) P('  ✓ sem sessão o sistema não abre, cai no login');
  else { P('  ✗ o sistema apareceu sem sessão válida'); falhas++; }

  // sessão expirada no meio do uso derruba para o login
  // signOut fica pendente de propósito, para o reload não destruir o contexto do teste
  await page.evaluate(() => {
    window.__saiu = false;
    window.sb.auth.signOut = () => { window.__saiu = true; return new Promise(() => {}); };
    q(Promise.resolve({ data:null, error:{ message:'JWT expired', code:'PGRST301', status:401 } })).catch(() => {});
    q(Promise.resolve({ data:null, error:{ message:'JWT expired', code:'PGRST301', status:401 } })).catch(() => {});
  });
  await page.waitForTimeout(400);
  const avisou = await page.evaluate(() => document.getElementById('toasts').textContent);
  const umAviso = (avisou.match(/Sess.o expirada/g) || []).length;
  await page.waitForTimeout(2200);
  const saiu = await page.evaluate(() => window.__saiu);
  P(`  token expirado → avisos exibidos: ${umAviso} · encerrou a sessão: ${saiu}`);
  if (umAviso === 1 && saiu) P('  ✓ avisa uma única vez e encerra a sessão (sem enxurrada de erros)');
  else { P('  ✗ tratamento do token expirado divergente'); falhas++; }

  await page.reload(); await page.waitForTimeout(1500);
  await page.waitForSelector('#app.on', { timeout:20000 }); await page.waitForTimeout(1200);
  P('  ✓ com sessão válida, ao reabrir vai direto para o sistema (sem pedir login de novo)');

  P('\n── Vencimento editável na venda ──');
  // o reload acima voltou para o dashboard: refaz o formulário de venda
  await page.evaluate(() => location.hash = '#vendas/nova'); await page.waitForTimeout(1500);
  await page.click('#addItem'); await page.waitForTimeout(400);
  await page.evaluate(() => { const i = document.querySelector('#itb tbody .p-busca');
    i.focus(); i.value = 'MY'; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(900);
  await page.click('body > .gres.flut.on a[data-i="0"]'); await page.waitForTimeout(500);
  await page.fill('#itb tbody .q', '3'); await page.waitForTimeout(400);
  await page.selectOption('#v_forma', { label:'Cartão de Crédito' }); await page.waitForTimeout(400);
  await page.selectOption('#v_parc', '3'); await page.waitForTimeout(800);
  const hoje = await page.$eval('#v_data', e => e.value);
  const add = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.toLocaleDateString('sv-SE'); };
  // 3 parcelas: 1º vencimento sugerido = data + 30, demais de 30 em 30
  let v1 = await page.$eval('#v_venc1', e => e.value);
  P(`  1º vencimento sugerido para 3x: ${v1} (esperado ${add(hoje, 30)})`);
  if (v1 !== add(hoje, 30)) { P('  ✗ sugestão automática errada'); falhas++; }
  else P('  ✓ sugestão automática correta');

  // muda o intervalo para 15 dias — enquanto ninguém tocou no campo, a sugestão acompanha
  await page.fill('#v_intv', '15'); await page.waitForTimeout(600);
  let pv = (await page.textContent('#previa_parc')).replace(/\s+/g, ' ');
  const v15 = await page.$eval('#v_venc1', e => e.value);
  P('  intervalo 15 dias → ' + pv.slice(0, 170));
  const brl = (iso) => iso.split('-').reverse().join('/');
  const esperado15 = [0, 15, 30].map(d => add(v15, d));
  if (v15 === add(hoje, 15) && esperado15.every(d => pv.includes(brl(d))))
    P('  ✓ parcelas recalculadas de 15 em 15 dias');
  else { P('  ✗ datas não seguiram o intervalo de 15 dias — esperado ' + esperado15.map(brl).join(', ')); falhas++; }

  // escolhe uma data manual: a partir daí o sistema não pode sobrescrever
  const manual = add(hoje, 45);
  await page.fill('#v_venc1', manual);
  await page.dispatchEvent('#v_venc1', 'change'); await page.waitForTimeout(600);
  await page.selectOption('#v_parc', '2'); await page.waitForTimeout(600);
  v1 = await page.$eval('#v_venc1', e => e.value);
  P(`  após escolher ${manual} e trocar para 2x, o campo ficou em ${v1}`);
  if (v1 !== manual) { P('  ✗ a escolha do usuário foi sobrescrita'); falhas++; }
  else P('  ✓ a data escolhida é respeitada');

  // à vista com vencimento no mesmo dia = quitação automática
  await page.selectOption('#v_parc', '1'); await page.waitForTimeout(600);
  await page.fill('#v_venc1', hoje);
  await page.dispatchEvent('#v_venc1', 'change'); await page.waitForTimeout(600);
  let dica = await page.textContent('#dica_venc');
  P('  à vista no dia: ' + dica.trim().slice(0, 90));
  if (!/nasce quitada/.test(dica)) { P('  ✗ dica de à vista não apareceu'); falhas++; }

  // à vista com vencimento futuro = venda a prazo
  await page.fill('#v_venc1', add(hoje, 20));
  await page.dispatchEvent('#v_venc1', 'change'); await page.waitForTimeout(600);
  dica = await page.textContent('#dica_venc');
  pv = (await page.textContent('#previa_parc')).replace(/\s+/g, ' ');
  P('  vencimento adiado: ' + dica.trim().slice(0, 100));
  if (!/a prazo/i.test(dica) || !/A PRAZO/.test(pv)) { P('  ✗ não identificou a venda a prazo'); falhas++; }
  else P('  ✓ identifica venda a prazo e avisa que entra em contas a receber');

  // vencimento retroativo é corrigido na hora, com aviso
  await page.fill('#v_venc1', add(hoje, -10)); await page.waitForTimeout(600);
  const corrigido = await page.$eval('#v_venc1', e => e.value);
  const aviso = await page.textContent('#dica_venc');
  P(`  vencimento retroativo: campo voltou para ${corrigido} — "${aviso.trim().slice(0, 80)}"`);
  if (corrigido !== hoje || !/não pode ser anterior/.test(aviso)) {
    P('  ✗ vencimento retroativo não foi corrigido nem avisado'); falhas++;
  } else P('  ✓ corrige o vencimento retroativo e avisa o usuário');
  const minAttr = await page.$eval('#v_venc1', e => e.min);
  if (minAttr !== hoje) { P('  ✗ o campo não trava datas anteriores (min ausente)'); falhas++; }
  else P('  ✓ o seletor de data trava datas anteriores à venda');

  P('\n── Alterar vencimento de parcela já gerada ──');
  await page.evaluate(() => location.hash = '#receber'); await page.waitForTimeout(1600);
  const temBtn = await page.$('[data-vc]');
  if (!temBtn) { P('  ✗ botão de alterar vencimento não apareceu em Contas a Receber'); falhas++; }
  else {
    await temBtn.click(); await page.waitForTimeout(700);
    const tit = await page.textContent('.modal-h h3');
    P('  modal aberto: ' + tit.trim());
    const antes = await page.$eval('#nv_data', e => e.value);
    await page.selectOption('#nv_atalho', '30'); await page.waitForTimeout(400);
    const depois = await page.$eval('#nv_data', e => e.value);
    P(`  atalho "30 dias": ${antes} → ${depois} (esperado ${add(antes, 30)})`);
    if (depois !== add(antes, 30)) { P('  ✗ atalho de adiamento calculou errado'); falhas++; }
    else P('  ✓ atalho de adiamento correto');
    const chamada = await page.evaluate(async () => {
      let capturado = null;
      const orig = window.rpc;
      window.rpc = async (fn, args) => { capturado = { fn, args }; return null; };
      document.querySelector('.modal-f [data-ok]').click();
      await new Promise(r => setTimeout(r, 500));
      window.rpc = orig;
      return capturado;
    });
    P('  RPC disparada: ' + JSON.stringify(chamada));
    if (!chamada || chamada.fn !== 'fn_alterar_vencimento' || !chamada.args.p_nova_data) {
      P('  ✗ não chamou fn_alterar_vencimento com a nova data'); falhas++;
    } else P('  ✓ chama fn_alterar_vencimento com a data escolhida');
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Recebimento por produto e quantidade ──');
  await page.evaluate(() => location.hash = '#receber'); await page.waitForTimeout(1600);
  await page.evaluate(() => {
    // abre o recebimento de um revendedor
    formRecebimento('REVENDEDOR', { id:'44444444-4444-4444-4444-444444444444', nome:'Ana Paula Ferreira' }, []);
  });
  await page.waitForTimeout(1400);
  const rp = await page.evaluate(() => ({
    temAbas: !!document.getElementById('rc_tabs'),
    abaAtiva: document.querySelector('#rc_tabs button.on')?.dataset.modo,
    linhas: [...document.querySelectorAll('#rptb tbody tr')].map(tr => ({
      produto: tr.children[0].querySelector('b')?.textContent,
      origem: tr.children[1].textContent.trim().split('\n')[0],
      aberto: tr.children[4].textContent.trim() }))
  }));
  P('  ' + JSON.stringify(rp));
  for (const [rot, ok2] of [
    ['abre no modo por produto', rp.temAbas && rp.abaAtiva === 'peca'],
    ['lista peça de venda direta e de prestação', rp.linhas.length === 2],
    ['mostra o que falta pagar de cada uma', rp.linhas[0]?.aberto === '7' && rp.linhas[1]?.aberto === '4']
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

  // preenche 3 peças da venda e confere o cálculo
  await page.evaluate(() => {
    const inp = document.querySelectorAll('#rptb tbody .qtdp')[0];
    inp.value = '3'; inp.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(500);
  let res = (await page.textContent('#rp_res')).replace(/\s+/g, ' ');
  P('  resumo: ' + res.slice(0, 190));
  if (/450,00/.test(res)) P('  ✓ calcula 3 × R$ 150,00 = R$ 450,00');
  else { P('  ✗ cálculo do valor divergente'); falhas++; }
  if (/1\.320,00/.test(res)) P('  ✓ mostra quanto fica devendo depois (1.770 − 450)');
  else { P('  ✗ saldo restante divergente'); falhas++; }

  // não deixa passar do que falta
  await page.evaluate(() => {
    const inp = document.querySelectorAll('#rptb tbody .qtdp')[0];
    inp.value = '99'; inp.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(400);
  const limitado = await page.$eval('#rptb tbody .qtdp', e => e.value);
  if (limitado === '7') P('  ✓ trava na quantidade que ainda falta (7)');
  else { P('  ✗ deixou informar mais do que falta: ' + limitado); falhas++; }

  // "Marcar tudo" e o payload enviado
  await page.click('#rp_tudo'); await page.waitForTimeout(500);
  res = (await page.textContent('#rp_res')).replace(/\s+/g, ' ');
  if (/1\.770,00/.test(res)) P('  ✓ "Marcar tudo" soma as duas origens (1.050 + 720)');
  else { P('  ✗ "Marcar tudo" divergente: ' + res.slice(0, 120)); falhas++; }

  const envio = await page.evaluate(async () => {
    let cap = null; const orig = window.rpc;
    window.rpc = async (fn, args) => { cap = { fn, args }; throw new Error('parar'); };
    document.querySelector('.modal-f [data-ok]').click();
    await new Promise(r => setTimeout(r, 600));
    window.rpc = orig; return cap;
  });
  P('  payload: ' + JSON.stringify(envio?.args?.p_itens));
  const okVenda = envio?.args?.p_itens?.some(i => i.venda_item_id === 'vi9' && i.quantidade === 7);
  const okPrest = envio?.args?.p_itens?.some(i => i.remessa_item_evento_id === 'ev1' && i.quantidade === 4);
  if (envio?.fn === 'fn_receber_por_item' && okVenda && okPrest)
    P('  ✓ envia as peças das duas origens para fn_receber_por_item');
  else { P('  ✗ payload incorreto'); falhas++; }

  // a aba por valor continua funcionando
  await page.click('#rc_tabs button[data-modo="valor"]'); await page.waitForTimeout(500);
  const modoValor = await page.evaluate(() => ({
    valorVisivel: getComputedStyle(document.getElementById('rc_valorbox')).display !== 'none',
    pecaEscondido: getComputedStyle(document.getElementById('rc_peca')).display === 'none' }));
  if (modoValor.valorVisivel && modoValor.pecaEscondido) P('  ✓ a aba "Por valor total" continua disponível');
  else { P('  ✗ troca de aba não funcionou'); falhas++; }
  await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));

  P('\n── Mostruário: finalizar em vez de baixar ──');
  await page.evaluate(() => location.hash = '#revendedores/44444444-4444-4444-4444-444444444444');
  await page.waitForTimeout(1600);
  const btnPc = await page.$('#pcBtn') || await page.$('[data-pc]');
  if (!btnPc) { P('  ✗ botão de prestação de contas não encontrado'); falhas++; }
  else {
    await btnPc.click(); await page.waitForTimeout(1200);
    const linhas = await page.evaluate(() => [...document.querySelectorAll('#pctb tbody tr')].map(tr => ({
      rotulo: tr.querySelector('.tag')?.textContent.trim(),
      vendaTravada: tr.querySelector('.qv')?.disabled,
      perdaTravada: tr.querySelector('.qp')?.disabled,
      baixaTravada: tr.querySelector('.qb')?.disabled })));
    P('  ' + JSON.stringify(linhas));
    const cons = linhas.find(l => l.rotulo === 'Consignação');
    const most = linhas.find(l => l.rotulo === 'Mostruário');
    for (const [rot, ok2] of [
      ['consignação: pode vender', cons && cons.vendaTravada === false],
      ['consignação: pode registrar perda', cons && cons.perdaTravada === false],
      ['consignação: não pode finalizar', cons && cons.baixaTravada === true],
      ['mostruário: NÃO pode vender', most && most.vendaTravada === true],
      ['mostruário: NÃO pode registrar perda', most && most.perdaTravada === true],
      ['mostruário: pode finalizar', most && most.baixaTravada === false]
    ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

    // finaliza 2 amostras e confere o resumo e o payload
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('#pctb tbody tr')]
        .find(t => t.querySelector('.tag')?.textContent.trim() === 'Mostruário');
      const b = tr.querySelector('.qb'); b.value = '2'; b.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(600);
    const resumo = (await page.textContent('#pc_resumo')).replace(/\s+/g, ' ');
    P('  resumo: ' + resumo.slice(0, 260));
    if (/finalizad/i.test(resumo) && /216,00/.test(resumo))
      P('  ✓ resumo mostra as 2 amostras finalizadas (2 × R$ 108,00 = R$ 216,00)');
    else { P('  ✗ resumo não refletiu a finalização'); falhas++; }
    if (/já foi lançado|já foi lancado/i.test(resumo))
      P('  ✓ deixa claro que o custo já foi lançado no envio, sem despesa nova');
    else { P('  ✗ falta dizer que o custo já foi lançado no envio'); falhas++; }
    if (/não é cobrado|não cobrado/i.test(resumo)) P('  ✓ deixa claro que o revendedor não paga');
    else { P('  ✗ falta dizer que não é cobrado do revendedor'); falhas++; }
    if (!/Resultado líquido do acerto/i.test(resumo))
      P('  ✓ finalização não mexe no resultado do acerto');
    else { P('  ✗ finalização não deveria entrar no resultado do acerto'); falhas++; }

    const envio = await page.evaluate(async () => {
      let cap = null; const orig = window.rpc;
      window.rpc = async (fn, args) => { cap = { fn, args }; throw new Error('parar aqui'); };
      document.querySelector('.modal-f [data-ok]').click();
      await new Promise(r => setTimeout(r, 600));
      window.rpc = orig; return cap;
    });
    const item = envio?.args?.p_itens?.find(i => Number(i.finalizada) > 0);
    P('  payload: ' + JSON.stringify(envio?.args?.p_itens));
    if (envio?.fn === 'fn_prestar_contas' && item && item.finalizada === 2 && item.vendida === 0)
      P('  ✓ envia finalizada=2 e vendida=0 para o banco');
    else { P('  ✗ payload da finalização incorreto'); falhas++; }
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Ações diretas na remessa de mostruário ──');
  await page.evaluate(() => location.hash = '#mostruarios/r2');
  await page.waitForTimeout(1500);
  const ficha = await page.evaluate(() => ({
    texto: document.querySelector('#view')?.textContent.replace(/\s+/g, ' ') || '',
    finalizar: !!document.querySelector('[data-fin]'),
    devolver: !!document.querySelector('[data-dev]') }));
  for (const [rot, ok2] of [
    ['tem botão Finalizar', ficha.finalizar],
    ['tem botão Devolver', ficha.devolver],
    ['avisa que o custo já entrou como despesa no envio', /já entrou como despesa/i.test(ficha.texto)],
    ['avisa que a devolução estorna', /estornad/i.test(ficha.texto)],
    ['coluna Finalizado no lugar de Perdido', /Finalizado/.test(ficha.texto) && !/Perdido/.test(ficha.texto)]
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

  for (const [rot, sel, fnEsperada, campo] of [
    ['Finalizar', '[data-fin]', 'fn_finalizar_mostruario', 'finalizar'],
    ['Devolver',  '[data-dev]', 'fn_devolver_mostruario',  'devolver']
  ]) {
    const b = await page.$(sel);
    if (!b) { P(`  ✗ botão ${rot} ausente`); falhas++; continue; }
    await b.click(); await page.waitForTimeout(700);
    const qtdPadrao = await page.evaluate(() => document.querySelector('#bm_q')?.value);
    const chamada = await page.evaluate(async () => {
      let cap = null; const orig = window.rpc;
      window.rpc = async (fn, args) => { cap = { fn, args }; throw new Error('parar aqui'); };
      document.querySelector('.modal-f [data-ok]').click();
      await new Promise(r => setTimeout(r, 600));
      window.rpc = orig; return cap;
    });
    P(`  ${rot}: qtd padrão=${qtdPadrao} · ` + JSON.stringify(chamada));
    if (chamada?.fn === fnEsperada && chamada.args.p_remessa_item_id === 'ri2'
        && Number(chamada.args.p_quantidade) === 2)
      P(`  ✓ ${rot} chama ${fnEsperada} com as 2 un em posse`);
    else { P(`  ✗ ${rot} não chamou ${fnEsperada} corretamente`); falhas++; }
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Devolução de produto vendido ──');
  await page.evaluate(id => location.hash = '#vendas/' + id, VID);
  await page.waitForTimeout(1500);
  const topo = await page.evaluate(() => !!document.querySelector('#devBtn'));
  if (topo) P('  ✓ atalho "Devolver produto" no topo da venda');
  else { P('  ✗ falta o atalho no topo da venda'); falhas++; }
  const temDev = await page.$('[data-dv]');
  if (!temDev) { P('  ✗ botão Devolver não aparece na ficha da venda'); falhas++; }
  else {
    await temDev.click(); await page.waitForTimeout(700);
    const cx = await page.evaluate(() => ({
      qtd: document.querySelector('#dv_q')?.value,
      resumo: (document.querySelector('#dv_resumo')?.textContent || '').replace(/\s+/g,' ') }));
    P('  ' + JSON.stringify(cx));
    for (const [rot, ok2] of [
      ['abre com as 5 unidades da venda', cx.qtd === '5'],
      ['mostra o valor da devolução (5 × R$ 250,00)', /1\.250,00/.test(cx.resumo)],
      ['mostra quanto abate do que ele deve', /Abate do que ele deve/.test(cx.resumo)],
      ['mostra quanto vira crédito', /crédito/i.test(cx.resumo)]
    ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

    await page.evaluate(() => { const e = document.querySelector('#dv_q'); e.value = '2'; e.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(400);
    const r2 = (await page.textContent('#dv_resumo')).replace(/\s+/g,' ');
    P('  2 un: ' + r2.slice(0, 180));
    if (/500,00/.test(r2)) P('  ✓ recalcula para 2 × R$ 250,00 = R$ 500,00');
    else { P('  ✗ não recalculou o valor'); falhas++; }

    const chamada = await page.evaluate(async () => {
      let cap = null; const orig = window.rpc;
      window.rpc = async (fn, args) => { cap = { fn, args }; throw new Error('parar aqui'); };
      document.querySelector('.modal-f [data-ok]').click();
      await new Promise(r => setTimeout(r, 600));
      window.rpc = orig; return cap;
    });
    P('  RPC: ' + JSON.stringify(chamada));
    if (chamada?.fn === 'fn_devolver_item_venda' && Number(chamada.args.p_quantidade) === 2)
      P('  ✓ chama fn_devolver_item_venda com 2 unidades');
    else { P('  ✗ RPC da devolução incorreta'); falhas++; }
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Extrato geral do revendedor, em blocos ──');
  await page.evaluate(() => location.hash = '#relatorios/rev-geral');
  await page.waitForTimeout(1600);
  const temSel = await page.evaluate(() => !!document.querySelector('#rrev'));
  if (temSel) P('  ✓ tem seletor de revendedor');
  else { P('  ✗ falta o seletor de revendedor'); falhas++; }
  if (temSel) {
    await page.selectOption('#rrev', { index: 1 });
    await page.waitForTimeout(1500);
    const ex = await page.evaluate(() => ({
      txt: (document.querySelector('#rConteudo').textContent || '').replace(/\s+/g,' '),
      tabelas: document.querySelectorAll('#rConteudo table').length,
      kpis: document.querySelectorAll('#rConteudo .kpi').length }));
    P('  ' + ex.txt.slice(0, 190));
    for (const [rot, ok2] of [
      ['4 indicadores no topo', ex.kpis === 4],
      ['um bloco por situação', ex.tabelas >= 3],
      ['bloco A pagar com total', /A pagar 5 un · R\$ 750,00/.test(ex.txt)],
      ['bloco Pagos com total', /Pagos 3 un · R\$ 450,00/.test(ex.txt)],
      ['bloco Devolvidos com total', /Devolvidos 2 un · R\$ 300,00/.test(ex.txt)],
      ['diz que devolvido não entra na conta', /não entra na conta/.test(ex.txt)],
      ['total movimentado = pago + a pagar', /1\.200,00/.test(ex.txt)]
    ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }
  }

  P('\n── Relatórios do revendedor ──');
  for (const [id, esperado] of [
    ['rev-geral', /Pago/],
    ['rev-pagos', /450,00/],
    ['rev-pagar', /750,00/]
  ]) {
    await page.evaluate(r => location.hash = '#relatorios/' + r, id);
    await page.waitForTimeout(1400);
    const txt = (await page.textContent('#view')).replace(/\s+/g,' ');
    const linhas = await page.evaluate(() => document.querySelectorAll('#rConteudo tbody tr').length);
    P(`  ${id}: ${linhas} linha(s) · ${txt.slice(txt.indexOf('Total') >= 0 ? 0 : 0, 150)}`);
    if (linhas > 0 && esperado.test(txt)) P('  ✓ ' + id + ' carrega com preço unitário e total');
    else { P('  ✗ ' + id + ' não trouxe o esperado'); falhas++; }
  }
  {
    const geral = await page.evaluate(async () => { location.hash = '#relatorios/rev-geral';
      await new Promise(r => setTimeout(r, 1400));
      return (document.querySelector('#view').textContent || '').replace(/\s+/g,' '); });
    for (const [rot, ok2] of [
      ['mostra pago', /Pago/.test(geral)],
      ['mostra a pagar', /A pagar/.test(geral)],
      ['mostra devolvido', /Devolvido/.test(geral)],
      ['mostra em posse', /Em posse/.test(geral)],
      ['mostra mostruário', /Mostruário/.test(geral)],
      ['avisa que amostra nunca se cobra', /nunca se cobra/i.test(geral)]
    ]) { if (ok2) P('  ✓ geral ' + rot); else { P('  ✗ geral ' + rot); falhas++; } }
  }

  P('\n── Compras: incluir, excluir e data de pagamento ──');
  await page.evaluate(id => location.hash = '#compras/' + id, COM);
  await page.waitForTimeout(1500);
  const fc = await page.evaluate(() => ({
    editar: !!document.querySelector('#edItens'),
    pagar: !!document.querySelector('#pagBtn'),
    texto: (document.querySelector('#view').textContent || '').replace(/\s+/g,' ') }));
  for (const [rot, ok2] of [
    ['tem botão de editar produtos', fc.editar],
    ['tem botão de marcar paga', fc.pagar],
    ['mostra o bloco de pagamento ao fornecedor', /Pagamento ao fornecedor/.test(fc.texto)],
    ['explica que compra não é despesa', /não entra como despesa/i.test(fc.texto)]
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

  if (fc.editar) {
    await page.click('#edItens'); await page.waitForTimeout(800);
    const ed = await page.evaluate(() => ({
      linhas: document.querySelectorAll('#ectb tbody tr').length,
      aviso: (document.querySelector('.modal-b')?.textContent || '').replace(/\s+/g,' '),
      frete: document.querySelector('#ec_frete')?.value }));
    P('  ' + JSON.stringify(ed).slice(0, 260));
    for (const [rot, ok2] of [
      ['carrega o item existente', ed.linhas === 1],
      ['traz o frete atual', ed.frete === '50.00'],
      ['avisa que o custo de todos os produtos muda', /custo unitário de todos/i.test(ed.aviso)]
    ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

    // remove a única linha → botão salvar precisa travar
    await page.evaluate(() => document.querySelector('#ectb tbody .rm').click());
    await page.waitForTimeout(300);
    const travado = await page.evaluate(() => document.querySelector('.modal-f [data-ok]').disabled);
    if (travado) P('  ✓ sem produto nenhum, não deixa salvar');
    else { P('  ✗ deixou salvar compra sem produto'); falhas++; }

    await page.evaluate(() => document.querySelector('#ecAdd').click());
    await page.waitForTimeout(300);
    const voltou = await page.evaluate(() => document.querySelectorAll('#ectb tbody tr').length);
    if (voltou === 1) P('  ✓ "Adicionar produto" cria a linha de volta');
    else { P('  ✗ não adicionou linha'); falhas++; }
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Contas a pagar: tela própria ──');
  const noMenu = await page.evaluate(() => !!document.querySelector('a[data-h="pagar"]'));
  if (noMenu) P('  ✓ item "Contas a Pagar" no menu lateral');
  else { P('  ✗ falta o item no menu'); falhas++; }
  await page.evaluate(() => location.hash = '#pagar');
  await page.waitForTimeout(1600);
  const cp = await page.evaluate(() => ({
    texto: (document.querySelector('#view').textContent || '').replace(/\s+/g,' '),
    linhas: document.querySelectorAll('#tb tr').length,
    kpis: document.querySelectorAll('.kpi').length,
    abas: document.querySelectorAll('[data-f]').length,
    pagar: !!document.querySelector('[data-pg]') }));
  P('  ' + JSON.stringify({ linhas:cp.linhas, kpis:cp.kpis, abas:cp.abas, pagar:cp.pagar }));
  for (const [rot, ok2] of [
    ['abre a tela', /Contas a pagar/i.test(cp.texto)],
    ['5 indicadores', cp.kpis === 5],
    ['abas de situação', cp.abas === 5],
    ['lista a compra', cp.linhas >= 1],
    ['tem botão Pagar', cp.pagar],
    ['explica que não é despesa', /Isto não é despesa/i.test(cp.texto)],
    ['mostra o total a pagar', /1\.080,00/.test(cp.texto)]
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

  if (cp.pagar) {
    await page.click('[data-pg]'); await page.waitForTimeout(700);
    const mp = await page.evaluate(() => ({ data: document.querySelector('#pc_dt')?.value,
      texto: (document.querySelector('.modal-b')?.textContent || '').replace(/\s+/g,' ') }));
    if (mp.data === '2026-08-20') P('  ✓ modal de pagamento traz a data prevista');
    else { P('  ✗ data prevista errada no modal: ' + mp.data); falhas++; }
    const ch = await page.evaluate(async () => {
      let cap = null; const orig = window.rpc;
      window.rpc = async (fn, args) => { cap = { fn, args }; throw new Error('parar'); };
      document.querySelector('.modal-f [data-ok]').click();
      await new Promise(r => setTimeout(r, 600));
      window.rpc = orig; return cap;
    });
    if (ch?.fn === 'fn_marcar_compra_paga') P('  ✓ chama fn_marcar_compra_paga');
    else { P('  ✗ RPC de pagamento incorreta: ' + JSON.stringify(ch)); falhas++; }
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Despesas aponta para Contas a pagar ──');
  await page.evaluate(() => location.hash = '#despesas');
  await page.waitForTimeout(1500);
  const dsp = await page.evaluate(() => ({
    texto: (document.querySelector('#view').textContent || '').replace(/\s+/g,' '),
    semAba: !document.querySelector('[data-t="comp"]'),
    link: !!document.querySelector('a[href="#pagar"]') }));
  for (const [rot, ok2] of [
    ['aba de compras saiu de Despesas', dsp.semAba],
    ['avisa que há compras não pagas', /compra\(s\)/.test(dsp.texto)],
    ['tem link para Contas a Pagar', dsp.link]
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }

  P('\n── Crédito de devolução ──');
  await page.evaluate(() => location.hash = '#receber');
  await page.waitForTimeout(1500);
  const cr = await page.evaluate(() => ({
    botao: !!document.querySelector('[data-cr]'),
    kpi: (document.querySelector('#view').textContent || '').replace(/\s+/g,' ') }));
  for (const [rot, ok2] of [
    ['mostra o total em crédito', /em crédito de devolução/.test(cr.kpi)],
    ['oferece usar o crédito numa parcela', cr.botao]
  ]) { if (ok2) P('  ✓ ' + rot); else { P('  ✗ ' + rot); falhas++; } }
  if (cr.botao) {
    await page.click('[data-cr]'); await page.waitForTimeout(800);
    const uc = await page.evaluate(() => ({
      valor: document.querySelector('#cr_v')?.value,
      texto: (document.querySelector('.modal-b')?.textContent || '').replace(/\s+/g,' ') }));
    P('  ' + JSON.stringify(uc).slice(0, 220));
    if (uc.valor === '300.00') P('  ✓ propõe usar R$ 300,00 (todo o crédito, que cabe na parcela de R$ 400,00)');
    else { P('  ✗ valor proposto errado: ' + uc.valor); falhas++; }
    if (/não é entrada de dinheiro/i.test(uc.texto)) P('  ✓ deixa claro que não é entrada de caixa');
    else { P('  ✗ falta dizer que não entra no caixa'); falhas++; }
    await page.evaluate(() => document.querySelectorAll('.ov').forEach(o => o.remove()));
  }

  P('\n── Custo não aparece nos documentos do revendedor ──');
  await page.evaluate(() => { window.print = () => {}; });
  for (const [nome, fn] of [
    ['Recibo de entrega', () => page.evaluate(async id => {
        const r = await q(sb.from('remessas').select('*').eq('id', id).single());
        $('#printarea').innerHTML = docRemessa(r); }, REM)],
    ['Prestação de contas', () => page.evaluate(() => imprimirPrestacao('pc1'))]
  ]) {
    await fn(); await page.waitForTimeout(900);
    const txt = (await page.textContent('#printarea')).replace(/\s+/g, ' ');
    const temCusto = /Custo un\.|Valor de custo|>Custo</i.test(await page.innerHTML('#printarea'));
    const temValorCusto = /108,00|648,00|1\.080,00 .*custo/i.test(txt) && /custo/i.test(txt);
    if (!temCusto && !/custo/i.test(txt.replace(/custo da empresa/gi, ''))) P(`  ✓ ${nome}: nenhuma menção a custo`);
    else if (!temCusto) P(`  ✓ ${nome}: sem coluna de custo`);
    else { P(`  ✗ ${nome}: ainda mostra custo`); falhas++; }
  }

  P('\n── Documentos em PDF ──');
  for (const [nome, fn] of [
    ['Recibo de venda', () => page.evaluate(id => reciboVenda(id), VID)],
    ['Recibo de entrega', () => page.evaluate(async id => { const r = await q(sb.from('remessas').select('*').eq('id', id).single()); $('#printarea').innerHTML = docRemessa(r); }, REM)],
    ['Prestação de contas', () => page.evaluate(() => imprimirPrestacao('pc1'))],
    ['Comprovante de recebimento', () => page.evaluate(() => comprovanteRecebimento('r1'))]
  ]) {
    const antes = erros.length;
    await page.evaluate(() => { window.print = () => {}; });
    await fn().catch(e => erros.push('ERRO doc: ' + e.message));
    await page.waitForTimeout(900);
    const html = await page.innerHTML('#printarea');
    const novos = erros.slice(antes);
    if (novos.length || html.length < 300) { falhas++; P(`✗ ${nome}: ${(novos[0] || 'documento vazio').slice(0, 120)}`); }
    else P(`✓ ${nome} (${html.length} caracteres)`);
  }
  await page.evaluate(() => { document.querySelectorAll('#app,#login').forEach(e => e.style.display = 'none');
    document.getElementById('printarea').style.display = 'block'; document.body.style.background = '#fff'; });
  await page.screenshot({ path:'shot-recibo.png', fullPage:true });
  await page.evaluate(() => { document.getElementById('app').style.display = '';
    document.getElementById('printarea').style.display = 'none'; document.body.style.background = ''; });

  P('\n── Capturas de tela ──');
  for (const [h, f] of [['dashboard','shot-dashboard.png'], ['produtos','shot-produtos.png'],
      [`revendedores/${RID}`,'shot-revendedor.png'], ['receber','shot-receber.png'],
      ['financeiro','shot-financeiro.png'], ['compras/nova','shot-compra.png']]) {
    await page.evaluate(x => location.hash = '#' + x, h);
    await page.waitForTimeout(1600);
    await page.screenshot({ path:f });
  }
  await page.setViewportSize({ width:390, height:844 });
  await page.evaluate(() => location.hash = '#dashboard'); await page.waitForTimeout(1800);
  await page.screenshot({ path:'shot-mobile.png' });
  P('✓ 7 capturas geradas (incluindo celular 390px)');

  P('\n════════════════════════════════════════');
  P(falhas === 0 ? '✓ TODOS OS TESTES PASSARAM' : `✗ ${falhas} FALHA(S)`);
  const rel = erros.filter(e => !/publicPath|Failed to load resource/.test(e));
  P(`Erros de execução: ${rel.length}`);
  if (rel.length) P(rel.slice(0, 10).join('\n'));

  await browser.close();
  fs.writeFileSync('teste-resultado.txt', log.join('\n'));
})().catch(e => { console.error('FALHA:', e.message, e.stack?.slice(0, 400)); process.exit(1); });
