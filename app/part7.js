/* ═══════════════ FINANCEIRO · DRE E CAIXA (Prompt 14) ═══════════════ */
ROTAS.financeiro = async (v) => {
  crumb('Financeiro');
  const fim = hoje(), ini = fim.slice(0, 8) + '01';
  v.innerHTML = `
  <div class="page-head"><h1>Financeiro<small>Demonstrativo de resultado e fluxo de caixa</small></h1>
    <div class="acts">
      <select class="inp btn-sm" id="per" style="width:auto">
        <option value="mes">Este mês</option><option value="mesant">Mês anterior</option>
        <option value="90">Últimos 90 dias</option><option value="ano">Este ano</option>
        <option value="tudo">Desde o início</option><option value="custom">Personalizado</option></select>
      <input class="inp" type="date" id="d1" value="${ini}" style="display:none;width:auto">
      <input class="inp" type="date" id="d2" value="${fim}" style="display:none;width:auto">
      <button class="btn btn-s btn-sm" id="prBtn">🖨 Imprimir</button></div></div>
  <div id="conteudo">${CARREGANDO}</div>`;

  const periodo = () => {
    const p = $('#per').value, h = hoje();
    if (p === 'custom') return [$('#d1').value, $('#d2').value];
    if (p === 'mes') return [h.slice(0,8) + '01', h];
    if (p === 'mesant') { const d = new Date(h + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 1);
      const i = d.toLocaleDateString('sv-SE'); d.setMonth(d.getMonth() + 1); d.setDate(0);
      return [i, d.toLocaleDateString('sv-SE')]; }
    if (p === '90') return [addDias(h, -90), h];
    if (p === 'ano') return [h.slice(0,4) + '-01-01', h];
    return ['2000-01-01', h];
  };

  let ultimoDre = null;
  const carregar = async () => {
    const [i, f] = periodo();
    $('#conteudo').innerHTML = CARREGANDO;
    const [dreArr, caixa, proj, desp] = await Promise.all([
      rpc('fn_dre', { p_inicio:i, p_fim:f }),
      q(sb.from('vw_fluxo_caixa').select('*').gte('data', i).lte('data', f).order('data')),
      q(sb.from('vw_fluxo_caixa_projetado').select('*').order('data').limit(90)),
      q(sb.from('despesas').select('categoria,natureza,valor').is('deleted_at', null).gte('data_despesa', i).lte('data_despesa', f))
    ]);
    const d = Array.isArray(dreArr) ? dreArr[0] : dreArr;
    ultimoDre = { d, i, f };
    const CAT = { PERDA_ESTOQUE:'Perdas de estoque', BAIXA_MOSTRUARIO:'Custo de mostruário', FRETE_ENVIO:'Frete de envio', TAXA_PAGAMENTO:'Taxas de pagamento',
      EMBALAGEM:'Embalagem', MARKETING:'Marketing', COMISSAO:'Comissões', OPERACIONAL:'Operacional', OUTRAS:'Outras' };
    const porCat = {}; desp.forEach(x => porCat[x.categoria] = (porCat[x.categoria] || 0) + N(x.valor));
    const confere = Math.abs(N(d.lucro_recebido) + N(d.lucro_a_receber) - N(d.lucro_bruto)) < 0.05;
    const entradas = caixa.reduce((a, c) => a + N(c.entradas), 0);
    const saidas = caixa.reduce((a, c) => a + N(c.saidas), 0);

    $('#conteudo').innerHTML = `
    <div class="kpis k5">
      <div class="kpi green"><div class="lab">Receita líquida</div><div class="val">${BRL(d.receita_liquida)}</div></div>
      <div class="kpi"><div class="lab">CMV</div><div class="val">${BRL(d.cmv)}</div></div>
      <div class="kpi green"><div class="lab">Lucro bruto</div><div class="val">${BRL(d.lucro_bruto)}</div>
        <div class="sub">margem ${PCT(d.margem_bruta)}</div></div>
      <div class="kpi red"><div class="lab">Despesas</div><div class="val">${BRL(d.despesas_total)}</div></div>
      <div class="kpi green"><div class="lab">Lucro líquido</div><div class="val">${BRL(d.lucro_liquido)}</div>
        <div class="sub">margem ${PCT(d.margem_liquida)}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start" class="g-fin">
      <div class="card"><div class="card-h"><h3>Demonstrativo de resultado</h3>
        <span class="tag n">${dBR(i)} a ${dBR(f)}</span></div><div class="card-b">
        <div style="font-family:var(--mono);font-size:13px">
          <div class="sumrow"><span class="l">Receita bruta</span><span>${BRLn(d.receita_bruta)}</span></div>
          <div class="sumrow"><span class="l">(−) Descontos concedidos</span><span class="neg">${BRLn(d.descontos)}</span></div>
          <div class="sumrow" style="border-top:1px solid var(--line);padding-top:8px;font-weight:600">
            <span class="l" style="color:var(--ink)">Receita líquida</span><span>${BRLn(d.receita_liquida)}</span></div>
          <div class="sumrow" style="margin-top:8px"><span class="l">(−) Custo da mercadoria vendida</span>
            <span class="neg">${BRLn(d.cmv)}</span></div>
          <div class="sumrow tot" style="font-size:14.5px"><span class="l">Lucro bruto</span>
            <span class="pos">${BRLn(d.lucro_bruto)}</span></div>
          <div class="sumrow"><span class="l">Margem bruta</span><span>${PCT(d.margem_bruta)}</span></div>

          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--mute);margin:16px 0 6px">DESPESAS OPERACIONAIS</div>
          ${Object.entries(CAT).map(([k, x]) => porCat[k]
            ? `<div class="sumrow"><span class="l">${x}</span><span class="neg">${BRLn(porCat[k])}</span></div>` : '').join('')
            || '<div class="sumrow"><span class="l">Nenhuma despesa no período</span><span>0,00</span></div>'}
          <div class="sumrow" style="border-top:1px solid var(--line);padding-top:8px">
            <span class="l">Total de despesas</span><span class="neg">${BRLn(d.despesas_total)}</span></div>
          <div class="sumrow tot" style="font-size:15px"><span class="l">Lucro líquido</span>
            <span class="${N(d.lucro_liquido) >= 0 ? 'pos' : 'neg'}">${BRLn(d.lucro_liquido)}</span></div>
          <div class="sumrow"><span class="l">Margem líquida</span><span>${PCT(d.margem_liquida)}</span></div>
        </div>
        <div class="sumbox" style="margin-top:16px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--mute);margin-bottom:8px">REGIME DE CAIXA</div>
          <div class="sumrow"><span class="l">Lucro já recebido</span><span class="money pos">${BRL(d.lucro_recebido)}</span></div>
          <div class="sumrow"><span class="l">Lucro ainda a receber</span><span class="money">${BRL(d.lucro_a_receber)}</span></div>
          <div class="sumrow tot" style="font-size:12.5px"><span class="l">Conferência</span>
            <span class="${confere ? 'pos' : 'neg'}">${BRLn(d.lucro_recebido)} + ${BRLn(d.lucro_a_receber)} =
            ${BRLn(N(d.lucro_recebido) + N(d.lucro_a_receber))} ${confere ? '✓' : '✗ divergente'}</span></div>
        </div></div></div>

      <div>
        <div class="card"><div class="card-h"><h3>Composição das despesas</h3></div><div class="card-b">
          ${grafRosca(Object.entries(CAT).filter(([k]) => porCat[k]).map(([k, x], idx) =>
            ({ t:x, v:porCat[k], c:['#4338ca','#7c3aed','#0284c7','#059669','#d97706','#dc2626','#64748b','#94a3b8'][idx % 8] })), 200)}
        </div></div>
        <div class="card"><div class="card-h"><h3>Indicadores</h3></div><div class="card-b">
          <div class="sumrow"><span class="l">Despesas fixas</span><span class="money">${BRL(d.despesas_fixas)}</span></div>
          <div class="sumrow"><span class="l">Despesas variáveis</span><span class="money">${BRL(d.despesas_variaveis)}</span></div>
          <div class="sumrow"><span class="l">Ponto de equilíbrio</span>
            <span class="money">${N(d.margem_bruta) > 0 ? BRL(N(d.despesas_fixas) / (N(d.margem_bruta) / 100)) : '—'}</span></div>
          <div class="hint" style="margin-top:6px">Receita necessária no período para cobrir as despesas fixas</div>
          <div class="sumrow" style="margin-top:12px"><span class="l">Entradas de caixa</span><span class="money pos">${BRL(entradas)}</span></div>
          <div class="sumrow"><span class="l">Saídas de caixa</span><span class="money neg">${BRL(saidas)}</span></div>
          <div class="sumrow tot"><span class="l">Saldo do período</span>
            <span class="money ${entradas - saidas >= 0 ? 'pos' : 'neg'}">${BRL(entradas - saidas)}</span></div>
        </div></div></div>
    </div>

    <div class="card"><div class="card-h"><h3>Fluxo de caixa realizado</h3></div>
      <div class="tw"><table class="dt"><thead><tr>
        <th>Data</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Saldo do dia</th>
        <th class="r">Acumulado</th></tr></thead><tbody>
      ${caixa.length ? caixa.map(c => `<tr>
        <td class="nw">${dBR(c.data)}</td><td class="r money pos">${N(c.entradas) ? BRL(c.entradas) : '—'}</td>
        <td class="r money neg">${N(c.saidas) ? BRL(c.saidas) : '—'}</td>
        <td class="r money ${N(c.saldo_dia) >= 0 ? 'pos' : 'neg'}">${BRL(c.saldo_dia)}</td>
        <td class="r money"><b>${BRL(c.saldo_acumulado)}</b></td></tr>`).join('')
        : `<tr><td colspan="5">${vazio('📊','Sem movimento de caixa','Nenhuma entrada ou saída no período.')}</td></tr>`}
      </tbody></table></div></div>

    <div class="card"><div class="card-h"><h3>Fluxo de caixa projetado</h3>
      <span class="tag n">próximos 90 dias · com base nas parcelas a vencer</span></div>
      <div class="tw"><table class="dt"><thead><tr>
        <th>Data</th><th class="r">Entradas previstas</th><th class="r">Saídas previstas</th>
        <th class="r">Saldo do dia</th><th class="r">Acumulado</th></tr></thead><tbody>
      ${proj.length ? proj.map(c => `<tr style="${N(c.saldo_acumulado) < 0 ? 'background:var(--red-bg)' : ''}">
        <td class="nw">${dBR(c.data)}</td><td class="r money pos">${N(c.entradas_previstas) ? BRL(c.entradas_previstas) : '—'}</td>
        <td class="r money neg">${N(c.saidas_previstas) ? BRL(c.saidas_previstas) : '—'}</td>
        <td class="r money">${BRL(c.saldo_dia)}</td>
        <td class="r money ${N(c.saldo_acumulado) < 0 ? 'neg' : ''}"><b>${BRL(c.saldo_acumulado)}</b></td></tr>`).join('')
        : `<tr><td colspan="5">${vazio('📅','Sem projeção','Nenhuma parcela a vencer nos próximos dias.')}</td></tr>`}
      </tbody></table></div></div>
    <style>@media(max-width:960px){.g-fin{grid-template-columns:1fr !important}}</style>`;
  };

  $('#per').onchange = () => {
    const c = $('#per').value === 'custom';
    $('#d1').style.display = c ? '' : 'none'; $('#d2').style.display = c ? '' : 'none';
    carregar();
  };
  $('#d1').onchange = carregar; $('#d2').onchange = carregar;
  $('#prBtn').onclick = () => { if (ultimoDre) imprimir(docDRE(ultimoDre.d, ultimoDre.i, ultimoDre.f)); };
  await carregar();
};

/* ═══════════════ RELATÓRIOS (Prompt 13) ═══════════════ */
const RELATORIOS = [
  { id:'compras', g:'Compras', t:'Compras', d:'Todas as compras com custos, frete e taxas' },
  { id:'compras-produto', g:'Compras', t:'Compras por produto', d:'Quanto foi comprado de cada produto e a que custo' },
  { id:'produtos', g:'Produtos', t:'Catálogo de produtos', d:'Preços, custos, margens e saldos' },
  { id:'estoque', g:'Produtos', t:'Posição de estoque', d:'Saldo por bolso e valor investido' },
  { id:'kardex', g:'Produtos', t:'Movimentação de estoque', d:'Todas as entradas e saídas' },
  { id:'parados', g:'Produtos', t:'Produtos parados', d:'Capital imobilizado sem giro' },
  { id:'clientes', g:'Pessoas', t:'Clientes', d:'Cadastro, histórico e saldo devedor' },
  { id:'revendedores', g:'Pessoas', t:'Revendedores', d:'Extrato consolidado de cada revendedor' },
  { id:'rev-geral', g:'Revendedores', t:'Extrato de produtos do revendedor', d:'Pagos, devolvidos e a pagar — separados e somados', pessoa:'revendedor' },
  { id:'rev-pagos', g:'Revendedores', t:'Produtos pagos', d:'O que o revendedor já quitou, peça a peça', pessoa:'revendedor' },
  { id:'rev-pagar', g:'Revendedores', t:'Produtos a pagar', d:'O que o revendedor ainda deve, peça a peça', pessoa:'revendedor' },
  { id:'vendas', g:'Vendas', t:'Vendas', d:'Receita, custo, lucro e margem por venda' },
  { id:'vendas-produto', g:'Vendas', t:'Vendas por produto', d:'Ranking de produtos com lucro' },
  { id:'lucratividade', g:'Vendas', t:'Lucratividade por produto', d:'Participação de cada produto no lucro' },
  { id:'mostruarios', g:'Consignação', t:'Mostruários', d:'O que está com quem, há quanto tempo' },
  { id:'prestacoes', g:'Consignação', t:'Prestações de contas', d:'Acertos realizados com revendedores' },
  { id:'receber', g:'Financeiro', t:'Contas a receber', d:'Parcelas em aberto, vencidas e a vencer' },
  { id:'recebimentos', g:'Financeiro', t:'Recebimentos', d:'Entradas de caixa por período' },
  { id:'pagos', g:'Financeiro', t:'Produtos pagos', d:'O que já foi efetivamente recebido' },
  { id:'despesas', g:'Financeiro', t:'Despesas', d:'Custos operacionais por categoria' },
  { id:'fluxo', g:'Financeiro', t:'Fluxo de caixa', d:'Entradas, saídas e saldo acumulado' },
  { id:'auditoria', g:'Sistema', t:'Auditoria', d:'Quem alterou o quê e quando' }
];

ROTAS.relatorios = async (v, id) => {
  if (id) return abrirRelatorio(v, id);
  crumb('Relatórios');
  const grupos = [...new Set(RELATORIOS.map(r => r.g))];
  v.innerHTML = `
  <div class="page-head"><h1>Relatórios<small>${RELATORIOS.length} relatórios · todos com filtro por período, Excel, PDF e impressão</small></h1></div>
  ${grupos.map(g => `<div class="sec-t">${g}</div>
    <div class="kpis k3">${RELATORIOS.filter(r => r.g === g).map(r => `
      <a class="kpi" href="#relatorios/${r.id}" style="text-decoration:none;color:inherit;cursor:pointer">
        <div style="font-size:15px;font-weight:700;margin-bottom:5px">${esc(r.t)}</div>
        <div style="font-size:12.5px;color:var(--mute)">${esc(r.d)}</div></a>`).join('')}</div>`).join('')}`;
};

async function abrirRelatorio(v, id) {
  const cfg = RELATORIOS.find(r => r.id === id);
  if (!cfg) { location.hash = '#relatorios'; return; }
  crumb(`Relatórios › ${cfg.t}`);
  const fim = hoje(), ini = fim.slice(0, 4) + '-01-01';
  /* Relatórios de revendedor ganham um seletor de pessoa: sem ele, "todos os
     revendedores" numa lista só não responde a pergunta que se faz na prática,
     que é "o que ESTE revendedor tem comigo". */
  const revs = cfg.pessoa === 'revendedor'
    ? await q(sb.from('revendedores').select('id,nome').is('deleted_at', null).order('nome')) : [];

  v.innerHTML = `
  <div class="page-head"><h1>${esc(cfg.t)}<small>${esc(cfg.d)}</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#relatorios">← Relatórios</a></div></div>
  <div class="card"><div class="filters">
      ${revs.length ? `<select class="inp" id="rrev" style="min-width:210px">
        <option value="">Todos os revendedores</option>
        ${revs.map(r => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select>` : ''}
      <label style="font-size:12.5px;color:var(--mute);align-self:center">Período</label>
      <input class="inp" type="date" id="r1" value="${ini}"><input class="inp" type="date" id="r2" value="${fim}">
      <input class="inp grow" id="rq" placeholder="🔍 Buscar…">
      <button class="btn btn-s btn-sm" id="rExcel">📊 Excel</button>
      <button class="btn btn-s btn-sm" id="rPrint">🖨 Imprimir</button></div>
    <div id="rConteudo">${CARREGANDO}</div></div>`;

  let dados = [], colunas = [], totais = '', render = null, imprimirDoc = null;
  const carregar = async () => {
    const i = $('#r1').value, f = $('#r2').value, p = $('#rrev')?.value || '';
    $('#rConteudo').innerHTML = CARREGANDO;
    const r = await montarRelatorio(id, i, f, p);
    dados = r.linhas; colunas = r.colunas; totais = r.totais || '';
    render = r.render || null; imprimirDoc = r.imprimir || null;
    pintar();
  };
  const pintar = () => {
    const t = $('#rq').value.trim().toLowerCase();
    const f = t ? dados.filter(l => colunas.some(c => String(c.v(l) ?? '').toLowerCase().includes(t))) : dados;
    /* Alguns relatórios não cabem numa tabela plana e trazem o próprio
       desenho — é o caso do extrato do revendedor, dividido em blocos. */
    if (render) { $('#rConteudo').innerHTML = render(f, t); return; }
    $('#rConteudo').innerHTML = `
      <div class="tw"><table class="dt"><thead><tr>${colunas.map(c => `<th class="${c.a || ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
      <tbody>${f.length ? f.map(l => `<tr>${colunas.map(c =>
        `<td class="${c.a || ''} ${c.m ? 'money' : ''}">${c.h ? c.h(l) : esc(c.v(l) ?? '')}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${colunas.length}">${vazio('📄','Nenhum registro','Nada encontrado com estes filtros.')}</td></tr>`}
      </tbody></table></div>
      <div class="pager"><span>${f.length} registro(s)</span><span class="sp"></span><span>${totais}</span></div>`;
  };
  $('#r1').onchange = carregar; $('#r2').onchange = carregar;
  if ($('#rrev')) $('#rrev').onchange = carregar;
  $('#rq').addEventListener('input', pintar);
  $('#rExcel').onclick = () => exportarExcel(id, colunas.map(c => ({ t:c.t, v:c.v })), dados);
  $('#rPrint').onclick = () => imprimir(imprimirDoc
    ? imprimirDoc()
    : docRelatorio(cfg.t, $('#r1').value, $('#r2').value, colunas, dados, totais));
  await carregar();
}

async function montarRelatorio(id, i, f, pessoa) {
  const sm = (l, k) => l.reduce((a, x) => a + N(typeof k === 'function' ? k(x) : x[k]), 0);
  switch (id) {
    case 'compras': {
      const l = await q(sb.from('compras').select('*,fornecedores(nome)').gte('data_compra', i).lte('data_compra', f).order('data_compra', { ascending:false }));
      return { linhas:l, colunas:[
        { t:'Nº', v:x => x.numero }, { t:'Data', v:x => dBR(x.data_compra) },
        { t:'Fornecedor', v:x => x.fornecedores?.nome || '' }, { t:'Documento', v:x => x.numero_documento || '' },
        { t:'Produtos', v:x => N(x.subtotal_produtos), a:'r', m:1, h:x => BRL(x.subtotal_produtos) },
        { t:'Frete', v:x => N(x.valor_frete), a:'r', m:1, h:x => BRL(x.valor_frete) },
        { t:'Taxa', v:x => N(x.valor_taxa_cartao), a:'r', m:1, h:x => BRL(x.valor_taxa_cartao) },
        { t:'Custo total', v:x => N(x.custo_total), a:'r', m:1, h:x => `<b>${BRL(x.custo_total)}</b>` },
        { t:'Situação', v:x => x.status, a:'c' }],
        totais:`Total investido: <b>${BRL(sm(l.filter(x => x.status === 'CONFIRMADO'), 'custo_total'))}</b>` };
    }
    case 'compras-produto': {
      const l = await q(sb.from('compra_itens').select('*,produtos(codigo,nome),compras!inner(data_compra,status)')
        .gte('compras.data_compra', i).lte('compras.data_compra', f).eq('compras.status','CONFIRMADO'));
      const ag = {}; l.forEach(x => { const k = x.produto_id;
        ag[k] = ag[k] || { nome:x.produtos?.nome, cod:x.produtos?.codigo, q:0, v:0, min:Infinity, max:0 };
        ag[k].q += N(x.quantidade); ag[k].v += N(x.custo_total_item);
        ag[k].min = Math.min(ag[k].min, N(x.custo_unitario_final)); ag[k].max = Math.max(ag[k].max, N(x.custo_unitario_final)); });
      const linhas = Object.values(ag).sort((a, b) => b.v - a.v);
      return { linhas, colunas:[
        { t:'Código', v:x => x.cod }, { t:'Produto', v:x => x.nome },
        { t:'Qtd comprada', v:x => x.q, a:'r' },
        { t:'Custo médio', v:x => x.q ? x.v / x.q : 0, a:'r', m:1, h:x => BRL(x.q ? x.v / x.q : 0) },
        { t:'Custo mínimo', v:x => x.min === Infinity ? 0 : x.min, a:'r', m:1, h:x => BRL(x.min === Infinity ? 0 : x.min) },
        { t:'Custo máximo', v:x => x.max, a:'r', m:1, h:x => BRL(x.max) },
        { t:'Total', v:x => x.v, a:'r', m:1, h:x => `<b>${BRL(x.v)}</b>` }],
        totais:`Total: <b>${BRL(sm(linhas, 'v'))}</b>` };
    }
    case 'produtos': case 'estoque': case 'parados': {
      let l = await q(sb.from(id === 'parados' ? 'vw_produtos_parados' : 'vw_produtos').select('*').order('nome'));
      if (id === 'estoque') l = l.filter(x => N(x.qtd_total) > 0);
      if (id === 'parados') return { linhas:l, colunas:[
        { t:'Código', v:x => x.codigo }, { t:'Produto', v:x => x.nome },
        { t:'Qtd parada', v:x => N(x.qtd_disponivel), a:'r' },
        { t:'Valor imobilizado', v:x => N(x.valor_estoque_disponivel), a:'r', m:1, h:x => `<b>${BRL(x.valor_estoque_disponivel)}</b>` },
        { t:'Última saída', v:x => dBR(x.data_ultima_saida) },
        { t:'Dias sem venda', v:x => x.dias_sem_venda >= 9999 ? 'nunca vendido' : x.dias_sem_venda, a:'c' }],
        totais:`Capital imobilizado: <b>${BRL(sm(l, 'valor_estoque_disponivel'))}</b>` };
      if (id === 'estoque') return { linhas:l, colunas:[
        { t:'Código', v:x => x.codigo }, { t:'Produto', v:x => x.nome }, { t:'Categoria', v:x => x.categoria_nome || '' },
        { t:'Disponível', v:x => N(x.qtd_disponivel), a:'c' }, { t:'Mostruário', v:x => N(x.qtd_mostruario), a:'c' },
        { t:'Consignado', v:x => N(x.qtd_consignado), a:'c' }, { t:'Total', v:x => N(x.qtd_total), a:'c' },
        { t:'Custo médio', v:x => N(x.custo_medio), a:'r', m:1, h:x => BRL(x.custo_medio) },
        { t:'Valor total', v:x => N(x.valor_total_custo), a:'r', m:1, h:x => `<b>${BRL(x.valor_total_custo)}</b>` }],
        totais:`Investimento total: <b>${BRL(sm(l, 'valor_total_custo'))}</b> · potencial ${BRL(sm(l, 'valor_potencial_venda'))}` };
      return { linhas:l, colunas:[
        { t:'Código', v:x => x.codigo }, { t:'Produto', v:x => x.nome }, { t:'Categoria', v:x => x.categoria_nome || '' },
        { t:'Marca', v:x => x.marca_nome || '' },
        { t:'Custo médio', v:x => N(x.custo_medio), a:'r', m:1, h:x => BRL(x.custo_medio) },
        { t:'Consumidor', v:x => N(x.preco_consumidor), a:'r', m:1, h:x => BRL(x.preco_consumidor) },
        { t:'Revendedor', v:x => N(x.preco_revendedor), a:'r', m:1, h:x => BRL(x.preco_revendedor) },
        { t:'Margem %', v:x => N(x.margem_consumidor).toFixed(1), a:'r' },
        { t:'Estoque', v:x => N(x.qtd_total), a:'c' }, { t:'Situação', v:x => x.situacao, a:'c' }],
        totais:`${l.length} produtos · estoque ${BRL(sm(l, 'valor_total_custo'))}` };
    }
    case 'kardex': {
      const l = await q(sb.from('vw_kardex').select('*').gte('data_movimento', i).lte('data_movimento', f)
        .order('data_movimento', { ascending:false }).limit(3000));
      return { linhas:l, colunas:[
        { t:'Data', v:x => dBR(x.data_movimento) }, { t:'Produto', v:x => x.produto_nome },
        { t:'Tipo', v:x => x.tipo }, { t:'Bolso', v:x => x.bucket },
        { t:'Entrada', v:x => N(x.quantidade) > 0 ? N(x.quantidade) : '', a:'r' },
        { t:'Saída', v:x => N(x.quantidade) < 0 ? -N(x.quantidade) : '', a:'r' },
        { t:'Custo unit.', v:x => N(x.custo_unitario), a:'r', m:1, h:x => BRL(x.custo_unitario) },
        { t:'Motivo', v:x => x.motivo || '' }],
        totais:`${l.length} movimentação(ões)` };
    }
    case 'clientes': {
      const [cs, rk, tt] = await Promise.all([
        q(sb.from('clientes').select('*').is('deleted_at', null).order('nome')),
        q(sb.from('vw_ranking_clientes').select('*')),
        q(sb.from('vw_titulos_receber').select('cliente_id,saldo').eq('situacao','ABERTO').not('cliente_id','is',null))]);
      const mp = Object.fromEntries(rk.map(r => [r.id, r]));
      const dv = {}; tt.forEach(t => dv[t.cliente_id] = (dv[t.cliente_id] || 0) + N(t.saldo));
      const l = cs.map(c => ({ ...c, ...(mp[c.id] || {}), devedor: dv[c.id] || 0 }));
      return { linhas:l, colunas:[
        { t:'Código', v:x => x.codigo }, { t:'Nome', v:x => x.nome },
        { t:'CPF', v:x => x.cpf ? maskCPF(x.cpf) : '' },
        { t:'WhatsApp', v:x => x.whatsapp ? maskFone(x.whatsapp) : '' },
        { t:'Cidade', v:x => (x.cidade || '') + (x.estado ? '/' + x.estado : '') },
        { t:'Compras', v:x => N(x.qtd_compras), a:'c' },
        { t:'Total comprado', v:x => N(x.valor_total_comprado), a:'r', m:1, h:x => BRL(x.valor_total_comprado) },
        { t:'Saldo devedor', v:x => N(x.devedor), a:'r', m:1, h:x => N(x.devedor) ? `<b class="neg">${BRL(x.devedor)}</b>` : '—' }],
        totais:`${l.length} clientes · devedor total ${BRL(sm(l, 'devedor'))}` };
    }
    case 'revendedores': {
      const l = await q(sb.from('vw_extrato_revendedor').select('*').order('nome'));
      return { linhas:l, colunas:[
        { t:'Nome', v:x => x.nome }, { t:'Cidade', v:x => (x.cidade || '') + (x.estado ? '/' + x.estado : '') },
        { t:'Recebidos', v:x => N(x.qtd_total_recebida), a:'c' }, { t:'Vendidos', v:x => N(x.qtd_vendida), a:'c' },
        { t:'Devolvidos', v:x => N(x.qtd_devolvida), a:'c' }, { t:'Em posse', v:x => N(x.qtd_em_posse), a:'c' },
        { t:'Valor em posse', v:x => N(x.valor_custo_em_posse), a:'r', m:1, h:x => BRL(x.valor_custo_em_posse) },
        { t:'Total vendido', v:x => N(x.valor_vendido_total), a:'r', m:1, h:x => BRL(x.valor_vendido_total) },
        { t:'Pago', v:x => N(x.total_pago), a:'r', m:1, h:x => BRL(x.total_pago) },
        { t:'Em aberto', v:x => N(x.saldo_aberto), a:'r', m:1, h:x => `<b>${BRL(x.saldo_aberto)}</b>` },
        { t:'Vencido', v:x => N(x.saldo_vencido), a:'r', m:1, h:x => N(x.saldo_vencido) ? `<b class="neg">${BRL(x.saldo_vencido)}</b>` : '—' }],
        totais:`Em posse ${BRL(sm(l, 'valor_custo_em_posse'))} · em aberto ${BRL(sm(l, 'saldo_aberto'))}` };
    }
    /* Os três relatórios do revendedor são a mesma view com um filtro
       diferente. O geral tem desenho próprio: uma tabela plana com uma coluna
       "situação" não responde a pergunta que se faz na prática — quanto ele
       deve, quanto já pagou, o que devolveu. Por isso vai em blocos. */
    case 'rev-geral': case 'rev-pagos': case 'rev-pagar': {
      let cs = sb.from('vw_itens_revendedor').select('*').gte('data', i).lte('data', f);
      if (pessoa) cs = cs.eq('revendedor_id', pessoa);
      if (id === 'rev-pagos')  cs = cs.eq('situacao', 'PAGO');
      if (id === 'rev-pagar')  cs = cs.eq('situacao', 'A_PAGAR');
      const l = await q(cs.order('revendedor_nome').order('data').order('produto_nome'));

      const colsBase = [
        { t:'Revendedor', v:x => x.revendedor_nome },
        { t:'Origem', v:x => x.documento },
        { t:'Data', v:x => dBR(x.data) },
        { t:'Código', v:x => x.produto_codigo },
        { t:'Produto', v:x => x.produto_nome + (x.produto_tamanho ? ' · ' + x.produto_tamanho : '') },
        { t:'Situação', v:x => x.situacao_label, a:'c' },
        { t:'Qtd', v:x => N(x.quantidade), a:'c', h:x => QTD(x.quantidade) },
        { t:'Preço unit.', v:x => N(x.valor_unitario), a:'r', m:1, h:x => BRL(x.valor_unitario) },
        { t:'Total', v:x => N(x.valor_total), a:'r', m:1, h:x => `<b>${BRL(x.valor_total)}</b>` }];

      const som = (lst, sit) => lst.filter(x => x.situacao === sit).reduce((a, x) => a + N(x.valor_total), 0);
      const qtd = (lst, sit) => lst.filter(x => x.situacao === sit).reduce((a, x) => a + N(x.quantidade), 0);

      if (id !== 'rev-geral') {
        const sit = id === 'rev-pagos' ? 'PAGO' : 'A_PAGAR';
        return { linhas:l, colunas: colsBase.filter(c => c.t !== 'Situação'),
          totais: id === 'rev-pagos'
            ? `${QTD(qtd(l,'PAGO'))} peça(s) · <b class="pos">${BRL(som(l,'PAGO'))}</b> já recebidos`
            : `${QTD(qtd(l,'A_PAGAR'))} peça(s) · <b class="neg">${BRL(som(l,'A_PAGAR'))}</b> a receber` };
      }

      /* ── Extrato geral, em blocos ── */
      const BLOCOS = [
        { sit:'A_PAGAR',            titulo:'A pagar',                cor:'amber', nota:'O que ele ainda deve' },
        { sit:'PAGO',               titulo:'Pagos',                  cor:'green', nota:'Já quitado' },
        { sit:'DEVOLVIDO',          titulo:'Devolvidos',             cor:'blue',  nota:'Voltou para o estoque — não se cobra' },
        { sit:'EM_POSSE',           titulo:'Em posse, ainda não vendidos', cor:'', nota:'Continua com ele, em consignação' },
        { sit:'AMOSTRA',            titulo:'Mostruário',             cor:'',      nota:'Amostra de demonstração — nunca se cobra' },
        { sit:'AMOSTRA_FINALIZADA', titulo:'Mostruário finalizado',  cor:'',      nota:'Amostra que acabou — custo já foi da empresa' },
        { sit:'PERDIDO',            titulo:'Perdidos',               cor:'red',   nota:'Extraviado ou danificado' }];

      const tabela = (lst) => `<div class="tw"><table class="dt"><thead><tr>
          ${pessoa ? '' : '<th>Revendedor</th>'}
          <th>Origem</th><th>Data</th><th>Produto</th>
          <th class="c">Qtd</th><th class="r">Preço unit.</th><th class="r">Total</th></tr></thead><tbody>
          ${lst.map(x => `<tr>
            ${pessoa ? '' : `<td>${esc(x.revendedor_nome)}</td>`}
            <td class="nw">${esc(x.documento)}</td><td class="nw">${dBR(x.data)}</td>
            <td><b>${esc(x.produto_nome)}</b>
              <span style="display:block;font-size:11px;color:var(--mute)" class="num">${esc(x.produto_codigo)}</span></td>
            <td class="c">${QTD(x.quantidade)}</td>
            <td class="r money">${BRL(x.valor_unitario)}</td>
            <td class="r money"><b>${BRL(x.valor_total)}</b></td></tr>`).join('')}
        </tbody><tfoot><tr style="background:#fbfcfe;font-weight:700">
          <td colspan="${pessoa ? 3 : 4}">Subtotal</td>
          <td class="c">${QTD(lst.reduce((a, x) => a + N(x.quantidade), 0))}</td><td></td>
          <td class="r money">${BRL(lst.reduce((a, x) => a + N(x.valor_total), 0))}</td></tr></tfoot>
        </table></div>`;

      const render = (linhas) => {
        if (!linhas.length) return vazio('📄','Nenhum registro',
          'Nenhum produto deste revendedor no período escolhido.');
        const aPagar = som(linhas,'A_PAGAR'), pago = som(linhas,'PAGO'), devolvido = som(linhas,'DEVOLVIDO');
        return `
        <div class="card-b" style="padding-bottom:0">
          <div class="kpis k4">
            <div class="kpi amber"><div class="lab">A pagar</div><div class="val">${BRL(aPagar)}</div>
              <div class="sub">${QTD(qtd(linhas,'A_PAGAR'))} peça(s)</div></div>
            <div class="kpi green"><div class="lab">Já pago</div><div class="val">${BRL(pago)}</div>
              <div class="sub">${QTD(qtd(linhas,'PAGO'))} peça(s)</div></div>
            <div class="kpi blue"><div class="lab">Devolvido</div><div class="val">${BRL(devolvido)}</div>
              <div class="sub">${QTD(qtd(linhas,'DEVOLVIDO'))} peça(s) · não entra na conta</div></div>
            <div class="kpi"><div class="lab">Total movimentado</div><div class="val">${BRL(aPagar + pago)}</div>
              <div class="sub">pago + a pagar</div></div>
          </div>
        </div>
        ${BLOCOS.map(b => {
          const lst = linhas.filter(x => x.situacao === b.sit);
          if (!lst.length) return '';
          return `<div class="card-b" style="padding-top:6px">
            <div class="sec-t" style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
              <span>${b.titulo}</span>
              <span class="tag ${b.cor === 'green' ? 'g' : b.cor === 'amber' ? 'a' : b.cor === 'red' ? 'r' : b.cor === 'blue' ? 'b' : 'n'}">
                ${QTD(lst.reduce((a, x) => a + N(x.quantidade), 0))} un · ${BRL(lst.reduce((a, x) => a + N(x.valor_total), 0))}</span>
              <span style="font-weight:400;font-size:11.5px;color:var(--mute);text-transform:none;letter-spacing:0">${b.nota}</span>
            </div>
            ${tabela(lst)}</div>`;
        }).join('')}
        <div class="pager"><span>${linhas.length} linha(s)</span><span class="sp"></span>
          <span>A pagar <b class="neg">${BRL(aPagar)}</b> · pago <b class="pos">${BRL(pago)}</b>
            · devolvido ${BRL(devolvido)}</span></div>`;
      };

      return { linhas:l, colunas:colsBase, render,
        imprimir: pessoa && l.length
          ? () => docItensRevendedor({ nome:l[0].revendedor_nome, whatsapp:l[0].revendedor_whatsapp }, l)
          : null,
        totais:`A pagar ${BRL(som(l,'A_PAGAR'))} · pago ${BRL(som(l,'PAGO'))} · devolvido ${BRL(som(l,'DEVOLVIDO'))}` };
    }
    case 'vendas': {
      const l = await q(sb.from('vw_resultado_consolidado').select('*').gte('data_venda', i).lte('data_venda', f).order('data_venda', { ascending:false }));
      return { linhas:l, colunas:[
        { t:'Nº', v:x => x.numero }, { t:'Data', v:x => dBR(x.data_venda) },
        { t:'Canal', v:x => ({ CONSUMIDOR:'Consumidor', REVENDEDOR:'Revendedor', CONSIGNACAO:'Consignação' })[x.tipo] || x.tipo },
        { t:'Comprador', v:x => x.comprador },
        { t:'Receita', v:x => N(x.receita_liquida), a:'r', m:1, h:x => BRL(x.receita_liquida) },
        { t:'CMV', v:x => N(x.cmv), a:'r', m:1, h:x => BRL(x.cmv) },
        { t:'Lucro', v:x => N(x.lucro_bruto), a:'r', m:1, h:x => `<b class="pos">${BRL(x.lucro_bruto)}</b>` },
        { t:'Margem %', v:x => N(x.margem_percentual).toFixed(1), a:'r' },
        { t:'Recebido', v:x => N(x.valor_recebido), a:'r', m:1, h:x => BRL(x.valor_recebido) },
        { t:'Em aberto', v:x => N(x.valor_em_aberto), a:'r', m:1, h:x => BRL(x.valor_em_aberto) }],
        totais:`Receita ${BRL(sm(l, 'receita_liquida'))} · CMV ${BRL(sm(l, 'cmv'))} · <b>Lucro ${BRL(sm(l, 'lucro_bruto'))}</b>` };
    }
    case 'vendas-produto': case 'lucratividade': {
      const l = await q(sb.from('venda_itens').select('*,produtos(codigo,nome),vendas!inner(data_venda,status)')
        .gte('vendas.data_venda', i).lte('vendas.data_venda', f).eq('vendas.status','CONFIRMADO'));
      const ag = {}; l.forEach(x => { const k = x.produto_id;
        ag[k] = ag[k] || { cod:x.produtos?.codigo, nome:x.produtos?.nome, q:0, r:0, c:0 };
        ag[k].q += N(x.quantidade); ag[k].r += N(x.subtotal); ag[k].c += N(x.custo_total_item); });
      const linhas = Object.values(ag).map(x => ({ ...x, l:x.r - x.c, m:x.r ? (x.r - x.c) / x.r * 100 : 0 }))
        .sort((a, b) => id === 'lucratividade' ? b.l - a.l : b.q - a.q);
      const totL = sm(linhas, 'l');
      return { linhas, colunas:[
        { t:'Código', v:x => x.cod }, { t:'Produto', v:x => x.nome },
        { t:'Qtd vendida', v:x => x.q, a:'r' },
        { t:'Receita', v:x => x.r, a:'r', m:1, h:x => BRL(x.r) },
        { t:'Custo', v:x => x.c, a:'r', m:1, h:x => BRL(x.c) },
        { t:'Lucro', v:x => x.l, a:'r', m:1, h:x => `<b class="pos">${BRL(x.l)}</b>` },
        { t:'Margem %', v:x => x.m.toFixed(1), a:'r' },
        { t:'% do lucro', v:x => totL ? (x.l / totL * 100).toFixed(1) : '0', a:'r' }],
        totais:`Receita ${BRL(sm(linhas, 'r'))} · <b>Lucro ${BRL(totL)}</b>` };
    }
    case 'mostruarios': {
      const l = await q(sb.from('vw_itens_em_posse').select('*').order('dias_em_posse', { ascending:false }));
      return { linhas:l, colunas:[
        { t:'Revendedor', v:x => x.revendedor_nome }, { t:'Produto', v:x => x.produto_nome },
        { t:'Tipo', v:x => x.tipo_remessa === 'MOSTRUARIO' ? 'Mostruário' : 'Consignação' },
        { t:'Remessa', v:x => x.remessa_numero }, { t:'Envio', v:x => dBR(x.data_envio) },
        { t:'Qtd', v:x => N(x.qtd_em_posse), a:'c' },
        { t:'Custo', v:x => N(x.valor_custo_total), a:'r', m:1, h:x => BRL(x.valor_custo_total) },
        { t:'Revenda', v:x => N(x.valor_revenda_total), a:'r', m:1, h:x => BRL(x.valor_revenda_total) },
        { t:'Dias', v:x => x.dias_em_posse, a:'c', h:x => `<span class="tag ${x.dias_em_posse > 60 ? 'r' : x.dias_em_posse > 30 ? 'a' : 'g'}">${x.dias_em_posse}</span>` }],
        totais:`${sm(l, 'qtd_em_posse')} un · custo ${BRL(sm(l, 'valor_custo_total'))} · revenda ${BRL(sm(l, 'valor_revenda_total'))}` };
    }
    case 'prestacoes': {
      const l = await q(sb.from('prestacoes_contas').select('*,revendedores(nome)').gte('data_acerto', i).lte('data_acerto', f)
        .eq('status','CONFIRMADO').order('data_acerto', { ascending:false }));
      return { linhas:l, colunas:[
        { t:'Nº', v:x => x.numero }, { t:'Data', v:x => dBR(x.data_acerto) },
        { t:'Revendedor', v:x => x.revendedores?.nome || '' },
        { t:'Vendidos', v:x => N(x.qtd_vendida), a:'c' }, { t:'Devolvidos', v:x => N(x.qtd_devolvida), a:'c' },
        { t:'Perdidos', v:x => N(x.qtd_perdida), a:'c' },
        { t:'Valor vendido', v:x => N(x.valor_vendido), a:'r', m:1, h:x => BRL(x.valor_vendido) },
        { t:'Valor devido', v:x => N(x.valor_devido), a:'r', m:1, h:x => `<b>${BRL(x.valor_devido)}</b>` },
        { t:'Lucro', v:x => N(x.lucro_bruto), a:'r', m:1, h:x => `<b class="pos">${BRL(x.lucro_bruto)}</b>` }],
        totais:`Devido ${BRL(sm(l, 'valor_devido'))} · <b>Lucro ${BRL(sm(l, 'lucro_bruto'))}</b>` };
    }
    case 'receber': {
      const l = await q(sb.from('vw_titulos_receber').select('*').neq('situacao','CANCELADO').order('data_vencimento'));
      const ab = l.filter(x => x.situacao === 'ABERTO');
      return { linhas:l, colunas:[
        { t:'Vencimento', v:x => dBR(x.data_vencimento) }, { t:'Devedor', v:x => x.devedor_nome },
        { t:'Tipo', v:x => x.tipo_devedor === 'CLIENTE' ? 'Consumidor' : 'Revendedor' },
        { t:'Origem', v:x => x.venda_numero ? 'Venda ' + x.venda_numero : x.prestacao_numero ? 'Prestação ' + x.prestacao_numero : 'Avulso' },
        { t:'Parcela', v:x => `${x.numero_parcela}/${x.total_parcelas}`, a:'c' },
        { t:'Valor', v:x => N(x.valor_original), a:'r', m:1, h:x => BRL(x.valor_original) },
        { t:'Recebido', v:x => N(x.valor_recebido), a:'r', m:1, h:x => BRL(x.valor_recebido) },
        { t:'Saldo', v:x => N(x.saldo), a:'r', m:1, h:x => `<b>${BRL(x.saldo)}</b>` },
        { t:'Situação', v:x => x.situacao_real, a:'c', h:x => tagSituacao(x.situacao_real, x.dias_atraso) }],
        totais:`A receber <b>${BRL(sm(ab, 'saldo'))}</b> · vencido ${BRL(sm(ab.filter(x => /VENCIDO/.test(x.situacao_real)), 'saldo'))}` };
    }
    case 'recebimentos': case 'pagos': {
      const l = await q(sb.from('recebimentos').select('*,clientes(nome),revendedores(nome),formas_pagamento(nome)')
        .gte('data_recebimento', i).lte('data_recebimento', f).eq('estornado', false).order('data_recebimento', { ascending:false }));
      return { linhas:l, colunas:[
        { t:'Nº', v:x => x.numero }, { t:'Data', v:x => dBR(x.data_recebimento) },
        { t:'Pagador', v:x => x.clientes?.nome || x.revendedores?.nome || '' },
        { t:'Tipo', v:x => x.tipo_devedor === 'CLIENTE' ? 'Consumidor' : 'Revendedor' },
        { t:'Forma', v:x => x.formas_pagamento?.nome || '' },
        { t:'Valor', v:x => N(x.valor_total), a:'r', m:1, h:x => `<b class="pos">${BRL(x.valor_total)}</b>` }],
        totais:`Total recebido: <b>${BRL(sm(l, 'valor_total'))}</b>` };
    }
    case 'despesas': {
      const l = await q(sb.from('despesas').select('*').is('deleted_at', null).gte('data_despesa', i).lte('data_despesa', f).order('data_despesa', { ascending:false }));
      const CAT = { PERDA_ESTOQUE:'Perda de estoque', BAIXA_MOSTRUARIO:'Custo de mostruário', FRETE_ENVIO:'Frete de envio', TAXA_PAGAMENTO:'Taxa de pagamento',
        EMBALAGEM:'Embalagem', MARKETING:'Marketing', COMISSAO:'Comissão', OPERACIONAL:'Operacional', OUTRAS:'Outras' };
      return { linhas:l, colunas:[
        { t:'Nº', v:x => x.numero }, { t:'Data', v:x => dBR(x.data_despesa) },
        { t:'Categoria', v:x => CAT[x.categoria] || x.categoria }, { t:'Natureza', v:x => x.natureza },
        { t:'Descrição', v:x => x.descricao },
        { t:'Valor', v:x => N(x.valor), a:'r', m:1, h:x => `<b class="neg">${BRL(x.valor)}</b>` }],
        totais:`Total: <b>${BRL(sm(l, 'valor'))}</b>` };
    }
    case 'fluxo': {
      const l = await q(sb.from('vw_fluxo_caixa').select('*').gte('data', i).lte('data', f).order('data'));
      return { linhas:l, colunas:[
        { t:'Data', v:x => dBR(x.data) },
        { t:'Entradas', v:x => N(x.entradas), a:'r', m:1, h:x => `<span class="pos">${BRL(x.entradas)}</span>` },
        { t:'Saídas', v:x => N(x.saidas), a:'r', m:1, h:x => `<span class="neg">${BRL(x.saidas)}</span>` },
        { t:'Saldo do dia', v:x => N(x.saldo_dia), a:'r', m:1, h:x => BRL(x.saldo_dia) },
        { t:'Acumulado', v:x => N(x.saldo_acumulado), a:'r', m:1, h:x => `<b>${BRL(x.saldo_acumulado)}</b>` }],
        totais:`Entradas ${BRL(sm(l, 'entradas'))} · saídas ${BRL(sm(l, 'saidas'))} · <b>saldo ${BRL(sm(l, 'entradas') - sm(l, 'saidas'))}</b>` };
    }
    case 'auditoria': {
      const l = await q(sb.from('logs_auditoria').select('*').gte('created_at', i).lte('created_at', f + 'T23:59:59')
        .order('created_at', { ascending:false }).limit(2000));
      return { linhas:l, colunas:[
        { t:'Data/hora', v:x => new Date(x.created_at).toLocaleString('pt-BR') },
        { t:'Usuário', v:x => x.usuario_nome || '(sistema)' },
        { t:'Ação', v:x => ({ INSERT:'Criou', UPDATE:'Alterou', DELETE:'Excluiu' })[x.acao] || x.acao },
        { t:'Tabela', v:x => x.tabela },
        { t:'Campos alterados', v:x => (x.campos_alterados || []).filter(c => !['updated_at','updated_by'].includes(c)).join(', ') }],
        totais:`${l.length} evento(s)` };
    }
  }
  return { linhas:[], colunas:[{ t:'—', v:() => '' }] };
}

/* ═══════════════ CONFIGURAÇÕES (Prompt 15) ═══════════════ */
ROTAS.configuracoes = async (v) => {
  crumb('Configurações');
  const [params, cats, marcas, formas, users] = await Promise.all([
    q(sb.from('parametros').select('*').order('grupo').order('chave')),
    q(sb.from('categorias').select('*').is('deleted_at', null).order('nome')),
    q(sb.from('marcas').select('*').is('deleted_at', null).order('nome')),
    q(sb.from('formas_pagamento').select('*').order('nome')),
    q(sb.from('usuarios').select('*').order('nome'))
  ]);
  const grupos = [...new Set(params.map(p => p.grupo))];
  const GN = { empresa:'Dados da empresa', vendas:'Vendas', financeiro:'Financeiro',
    mostruario:'Mostruários', estoque:'Estoque', compras:'Compras', produtos:'Produtos', geral:'Geral' };

  v.innerHTML = `
  <div class="page-head"><h1>Configurações<small>Parâmetros, cadastros auxiliares, usuários e auditoria</small></h1></div>
  <div class="tabs">
    <button class="on" data-t="par">Parâmetros</button><button data-t="cad">Categorias e marcas</button>
    <button data-t="fp">Formas de pagamento</button><button data-t="us">Usuários</button>
    <button data-t="bk">Backup e integridade</button></div>

  <div data-p="par">${grupos.map(g => `<div class="card"><div class="card-h"><h3>${esc(GN[g] || g)}</h3></div>
    <div class="card-b"><div class="grid-f f2">
      ${params.filter(p => p.grupo === g).map(p => `<div>
        <label>${esc(p.descricao)}</label>
        <input class="inp ${p.tipo === 'numero' ? 'num' : ''}" data-par="${esc(p.chave)}"
          type="${p.tipo === 'numero' ? 'number' : 'text'}" value="${esc(p.valor)}" ${p.editavel ? '' : 'disabled'}>
        <div class="hint num">${esc(p.chave)}</div></div>`).join('')}
    </div></div></div>`).join('')}
    <button class="btn btn-p" id="salvarPar">Salvar parâmetros</button></div>

  <div data-p="cad" style="display:none">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="g-cfg">
      <div class="card"><div class="card-h"><h3>Categorias</h3>
        <button class="btn btn-s btn-sm" data-nova="categorias">+ Nova</button></div>
        <div class="tw"><table class="dt"><tbody>
        ${cats.map(c => `<tr><td><b>${esc(c.nome)}</b>${c.descricao ? `<span style="display:block;font-size:11.5px;color:var(--mute)">${esc(c.descricao)}</span>` : ''}</td>
          <td style="width:40px"><button class="btn btn-ghost btn-sm" data-ecat="${c.id}">✎</button></td></tr>`).join('')
          || `<tr><td>${vazio('🏷️','Nenhuma categoria','Crie categorias para organizar o catálogo.')}</td></tr>`}
        </tbody></table></div></div>
      <div class="card"><div class="card-h"><h3>Marcas</h3>
        <button class="btn btn-s btn-sm" data-nova="marcas">+ Nova</button></div>
        <div class="tw"><table class="dt"><tbody>
        ${marcas.map(c => `<tr><td><b>${esc(c.nome)}</b></td>
          <td style="width:40px"><button class="btn btn-ghost btn-sm" data-emarca="${c.id}">✎</button></td></tr>`).join('')
          || `<tr><td>${vazio('™️','Nenhuma marca','Cadastre as marcas que você revende.')}</td></tr>`}
        </tbody></table></div></div></div></div>

  <div data-p="fp" style="display:none"><div class="card"><div class="tw"><table class="dt"><thead><tr>
    <th>Forma</th><th class="c">Parcela?</th><th class="c">Máx. parcelas</th><th class="r">Taxa %</th>
    <th class="c">Compensação</th><th class="c">Ativa</th></tr></thead><tbody>
    ${formas.map(f => `<tr>
      <td><b>${esc(f.nome)}</b></td><td class="c">${f.permite_parcelar ? '✓' : '—'}</td>
      <td class="c">${f.max_parcelas}</td><td class="r num">${N(f.taxa_percentual).toFixed(2)}%</td>
      <td class="c">${f.prazo_compensacao_dias}d</td>
      <td class="c">${f.ativo ? '<span class="tag g">Ativa</span>' : '<span class="tag n">Inativa</span>'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="pager"><span>As taxas informadas aqui alimentam o cálculo automático da taxa de cartão nas compras.</span></div></div></div>

  <div data-p="us" style="display:none"><div class="card"><div class="tw"><table class="dt"><thead><tr>
    <th>Nome</th><th>E-mail</th><th class="c">Perfil</th><th class="c">Situação</th><th>Último acesso</th></tr></thead><tbody>
    ${users.map(u => `<tr><td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td>
      <td class="c"><span class="tag b">${esc(u.perfil)}</span></td>
      <td class="c">${u.ativo ? '<span class="tag g">Ativo</span>' : '<span class="tag n">Inativo</span>'}</td>
      <td>${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '—'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="card-b"><div class="alert info"><span>ℹ</span><div>Para adicionar outro usuário, crie o acesso no
    painel do Supabase (Authentication → Users) e depois insira o perfil correspondente. A estrutura de
    permissões por perfil já está pronta no banco.</div></div>
    <button class="btn btn-s btn-sm" id="senhaBtn">🔑 Alterar minha senha</button></div></div></div>

  <div data-p="bk" style="display:none">
    <div class="card"><div class="card-h"><h3>Verificação de integridade</h3></div><div class="card-b">
      <p style="font-size:13.5px;color:var(--mute);margin-bottom:14px">Executa as sete conferências de consistência do sistema.
        Todas devem retornar zero divergências.</p>
      <button class="btn btn-p" id="intBtn">✓ Verificar agora</button>
      <div id="intRes" style="margin-top:16px"></div></div></div>
    <div class="card"><div class="card-h"><h3>Exportação completa</h3></div><div class="card-b">
      <p style="font-size:13.5px;color:var(--mute);margin-bottom:14px">Gera um arquivo Excel com uma aba por entidade —
        sua cópia de segurança funcional, para guardar fora do sistema.</p>
      <button class="btn btn-p" id="bkBtn">📊 Exportar tudo</button></div></div>
    <div class="card"><div class="card-h"><h3>Backup do banco de dados</h3></div><div class="card-b">
      <div class="alert ok"><span>✓</span><div><b>Backup automático diário ativo</b> no Supabase, com recuperação
        ponto-a-ponto. O histórico fica disponível no painel do projeto.</div></div>
      <p style="font-size:13px;color:var(--mute)">Recomendação: teste a restauração a cada seis meses.
        Backup que nunca foi restaurado não é backup — é uma suposição.</p></div></div></div>
  <style>@media(max-width:900px){.g-cfg{grid-template-columns:1fr !important}}</style>`;

  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-p]').forEach(c => c.style.display = c.dataset.p === b.dataset.t ? '' : 'none'); });

  $('#salvarPar').onclick = async (ev) => {
    const b = ev.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      for (const inp of $$('[data-par]')) {
        const orig = params.find(p => p.chave === inp.dataset.par);
        if (orig && orig.valor !== inp.value) await q(sb.from('parametros').update({ valor:inp.value }).eq('chave', inp.dataset.par));
      }
      await carregarBase(); ok('Parâmetros salvos');
    } catch (e) { bad('Não foi possível salvar', erroAmigavel(e)); }
    b.disabled = false; b.textContent = 'Salvar parâmetros';
  };

  const formAux = (tabela, item) => {
    const m = modal({ titulo:(item ? 'Editar' : 'Nova') + (tabela === 'categorias' ? ' categoria' : ' marca'), largura:'narrow',
      corpo:`<div class="field"><label>Nome <span style="color:var(--red)">*</span></label>
        <input class="inp" id="aux_nome" value="${esc(item?.nome || '')}"></div>
        ${tabela === 'categorias' ? `<div class="field"><label>Descrição</label>
        <input class="inp" id="aux_desc" value="${esc(item?.descricao || '')}"></div>` : ''}`,
      rodape:`${item ? '<button class="btn btn-d btn-sm" data-del>Excluir</button>' : ''}<div class="sp"></div>
        <button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-save>Salvar</button>` });
    $('[data-x]', m.foot).onclick = m.fechar;
    if (item) $('[data-del]', m.foot).onclick = async () => {
      if (!await confirmar({ titulo:'Excluir', mensagem:`Excluir <b>${esc(item.nome)}</b>?`, textoBotao:'Excluir' })) return;
      try { await q(sb.from(tabela).update({ deleted_at:new Date().toISOString() }).eq('id', item.id));
            m.fechar(); await carregarBase(); ok('Excluído'); navegar(); }
      catch (e) { bad('Não foi possível excluir', 'Existem produtos usando este registro. Inative em vez de excluir.'); }
    };
    $('[data-save]', m.foot).onclick = async () => {
      const nome = $('#aux_nome', m.body).value.trim();
      if (nome.length < 2) return bad('Nome obrigatório', 'Informe o nome.');
      const dados = { nome }; if (tabela === 'categorias') dados.descricao = $('#aux_desc', m.body).value.trim() || null;
      try { item ? await q(sb.from(tabela).update(dados).eq('id', item.id)) : await q(sb.from(tabela).insert(dados));
            m.fechar(); await carregarBase(); ok('Salvo'); navegar(); }
      catch (e) { bad('Não foi possível salvar', erroAmigavel(e)); }
    };
  };
  $$('[data-nova]').forEach(b => b.onclick = () => formAux(b.dataset.nova, null));
  $$('[data-ecat]').forEach(b => b.onclick = () => formAux('categorias', cats.find(c => c.id === b.dataset.ecat)));
  $$('[data-emarca]').forEach(b => b.onclick = () => formAux('marcas', marcas.find(c => c.id === b.dataset.emarca)));

  $('#senhaBtn').onclick = () => {
    const m = modal({ titulo:'Alterar senha', largura:'narrow',
      corpo:`<div class="field"><label>Nova senha</label><input class="inp" type="password" id="s1" minlength="8"></div>
        <div class="field"><label>Repita a nova senha</label><input class="inp" type="password" id="s2"></div>
        <div class="hint">Mínimo de 8 caracteres.</div>`,
      rodape:`<button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-ok>Alterar</button>` });
    $('[data-x]', m.foot).onclick = m.fechar;
    $('[data-ok]', m.foot).onclick = async () => {
      const a = $('#s1', m.body).value, b = $('#s2', m.body).value;
      if (a.length < 8) return bad('Senha curta', 'Use ao menos 8 caracteres.');
      if (a !== b) return bad('Senhas diferentes', 'Os dois campos precisam ser iguais.');
      const { error } = await sb.auth.updateUser({ password:a });
      if (error) return bad('Não foi possível alterar', erroAmigavel(error));
      m.fechar(); ok('Senha alterada', 'Use a nova senha no próximo acesso.');
    };
  };

  $('#intBtn').onclick = async (ev) => {
    const b = ev.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> Verificando…';
    try {
      const [prods, rems, dash, res] = await Promise.all([
        q(sb.from('vw_produtos').select('qtd_disponivel,qtd_reservado,qtd_mostruario,qtd_consignado,qtd_total,nome')),
        q(sb.from('remessa_itens').select('quantidade,qtd_em_posse,qtd_vendida,qtd_devolvida,qtd_perdida')),
        q(sb.from('vw_dashboard').select('*').single()),
        q(sb.from('vw_resultado_consolidado').select('numero,lucro_bruto,lucro_recebido,lucro_a_receber'))
      ]);
      const t = [
        { n:'Nenhum saldo de estoque negativo', d:prods.filter(p => N(p.qtd_disponivel) < 0 || N(p.qtd_mostruario) < 0 || N(p.qtd_consignado) < 0).length },
        { n:'Soma dos bolsos = total físico', d:prods.filter(p => Math.abs(N(p.qtd_total) - (N(p.qtd_disponivel) + N(p.qtd_reservado) + N(p.qtd_mostruario) + N(p.qtd_consignado))) > 0.001).length },
        { n:'Itens de remessa fecham com o enviado', d:rems.filter(r => Math.abs(N(r.quantidade) - (N(r.qtd_em_posse) + N(r.qtd_vendida) + N(r.qtd_devolvida) + N(r.qtd_perdida))) > 0.001).length },
        { n:'Lucro recebido + a receber = lucro bruto', d:res.filter(r => Math.abs(N(r.lucro_bruto) - (N(r.lucro_recebido) + N(r.lucro_a_receber))) > 0.02).length },
        { n:'Conferência global do lucro', d:Math.abs(N(dash.lucro_recebido) + N(dash.lucro_a_receber) - N(dash.lucro_bruto)) > 0.05 ? 1 : 0 }
      ];
      const falhas = t.filter(x => x.d > 0);
      $('#intRes').innerHTML = `<div class="alert ${falhas.length ? 'bad' : 'ok'}"><span>${falhas.length ? '⚠' : '✓'}</span>
        <div><b>${falhas.length ? `${falhas.length} divergência(s) encontrada(s)` : 'Sistema íntegro'}</b>
        <div style="margin-top:8px">${t.map(x => `<div style="font-size:12.5px;padding:2px 0">
          ${x.d ? '✗' : '✓'} ${esc(x.n)} ${x.d ? `— <b>${x.d} problema(s)</b>` : ''}</div>`).join('')}</div>
        <div style="font-size:11.5px;margin-top:8px;opacity:.8">Verificado em ${agoraBR()}</div></div></div>`;
    } catch (e) { $('#intRes').innerHTML = `<div class="alert bad"><div>${esc(erroAmigavel(e))}</div></div>`; }
    b.disabled = false; b.innerHTML = '✓ Verificar agora';
  };

  $('#bkBtn').onclick = async (ev) => {
    const b = ev.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> Exportando…';
    try {
      const [pr, cl, rv, fo, cp, vd, tt, rc, mv, rm] = await Promise.all([
        q(sb.from('vw_produtos').select('*')), q(sb.from('clientes').select('*').is('deleted_at', null)),
        q(sb.from('vw_extrato_revendedor').select('*')), q(sb.from('fornecedores').select('*').is('deleted_at', null)),
        q(sb.from('compras').select('*,fornecedores(nome)')), q(sb.from('vendas').select('*,clientes(nome),revendedores(nome)')),
        q(sb.from('vw_titulos_receber').select('*')), q(sb.from('recebimentos').select('*')),
        q(sb.from('vw_kardex').select('*').limit(20000)), q(sb.from('vw_itens_em_posse').select('*'))
      ]);
      const wb = XLSX.utils.book_new();
      const add = (nome, arr) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(arr.length ? arr : [{}]), nome);
      add('Produtos', pr); add('Clientes', cl); add('Revendedores', rv); add('Fornecedores', fo);
      add('Compras', cp.map(x => ({ ...x, fornecedor:x.fornecedores?.nome, fornecedores:undefined })));
      add('Vendas', vd.map(x => ({ ...x, comprador:x.clientes?.nome || x.revendedores?.nome, clientes:undefined, revendedores:undefined })));
      add('Titulos', tt); add('Recebimentos', rc); add('Movimentacoes', mv); add('Em posse', rm);
      XLSX.writeFile(wb, `backup-fragrancias-${hoje()}.xlsx`);
      ok('Exportação concluída', 'Guarde este arquivo fora do sistema.');
    } catch (e) { bad('Não foi possível exportar', erroAmigavel(e)); }
    b.disabled = false; b.innerHTML = '📊 Exportar tudo';
  };
};
