/* ═══════════════ GRÁFICOS (SVG puro, sem dependência) ═══════════════ */
function grafLinha(series, labels, cores, alt = 220) {
  const W = 700, H = alt, P = { t:14, r:14, b:26, l:60 };
  const todos = series.flat().map(N);
  const max = Math.max(...todos, 1) * 1.12, min = Math.min(...todos, 0);
  const n = labels.length;
  const x = i => P.l + (n <= 1 ? 0 : i * (W - P.l - P.r) / (n - 1));
  const y = v => H - P.b - ((N(v) - min) / (max - min || 1)) * (H - P.t - P.b);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const yy = P.t + i * (H - P.t - P.b) / 4, val = max - i * (max - min) / 4;
    g += `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="#eef2f7"/>
          <text x="${P.l - 7}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#94a3b8" font-family="IBM Plex Mono">${
            Math.abs(val) >= 1000 ? (val/1000).toFixed(1).replace('.',',') + 'k' : val.toFixed(0)}</text>`;
  }
  labels.forEach((l, i) => { if (n <= 8 || i % Math.ceil(n / 7) === 0)
    g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#94a3b8">${esc(l)}</text>`; });
  series.forEach((s, si) => {
    const pts = s.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${cores[si]}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (si === 0) g += `<polygon points="${P.l},${H - P.b} ${pts} ${x(n - 1)},${H - P.b}" fill="${cores[si]}" opacity=".07"/>`;
    s.forEach((v, i) => { if (n <= 14) g += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#fff" stroke="${cores[si]}" stroke-width="2"/>`; });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}

function grafRosca(dados, alt = 220) {
  const tot = dados.reduce((a, d) => a + N(d.v), 0);
  if (tot <= 0) return `<div class="empty" style="padding:36px"><p>Sem dados no período.</p></div>`;
  const R = 78, r = 50, cx = 110, cy = 110;
  let ang = -Math.PI / 2, g = '';
  dados.forEach(d => {
    const frac = N(d.v) / tot; if (frac <= 0) return;
    const a2 = ang + frac * Math.PI * 2, grande = frac > .5 ? 1 : 0;
    const p = (a, rr) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    g += `<path d="M ${p(ang,R)} A ${R} ${R} 0 ${grande} 1 ${p(a2,R)} L ${p(a2,r)} A ${r} ${r} 0 ${grande} 0 ${p(ang,r)} Z"
           fill="${d.c}" stroke="#fff" stroke-width="1.5"/>`;
    ang = a2;
  });
  g += `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="10" fill="#94a3b8">TOTAL</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a"
          font-family="IBM Plex Mono">${BRLn(tot)}</text>`;
  return `<svg class="chart" style="height:${alt}px" viewBox="0 0 220 220" preserveAspectRatio="xMidYMid meet">${g}</svg>
    <div class="lgd">${dados.filter(d => N(d.v) > 0).map(d =>
      `<span><i style="background:${d.c}"></i>${esc(d.t)} · ${BRL(d.v)}</span>`).join('')}</div>`;
}

/* ═══════════════ DASHBOARD (Prompt 3) ═══════════════ */
ROTAS.dashboard = async (v) => {
  crumb('Dashboard');
  const [d, evol, topProd, parados, rkRev, rkCli, posse] = await Promise.all([
    q(sb.from('vw_dashboard').select('*').single()),
    q(sb.from('vw_evolucao_vendas').select('*').order('mes')),
    q(sb.from('vw_produtos_mais_vendidos').select('*').limit(8)),
    q(sb.from('vw_produtos_parados').select('*').limit(8)),
    q(sb.from('vw_ranking_revendedores').select('*').limit(8)),
    q(sb.from('vw_ranking_clientes').select('*').gt('qtd_compras', 0).limit(8)),
    q(sb.from('vw_itens_em_posse').select('*').order('dias_em_posse', { ascending:false }).limit(8))
  ]);
  S.dash = d;
  const ev = evol.slice(-12);
  const labels = ev.map(e => { const [a, m] = e.mes.split('-'); return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+m - 1] + '/' + a.slice(2); });

  const alertas = [];
  if (N(d.qtd_titulos_vencidos) > 0) alertas.push(`<a href="#receber/vencidos" style="color:inherit"><b>${d.qtd_titulos_vencidos} parcela(s) vencida(s)</b> somando ${BRL(d.total_vencido)}</a>`);
  if (N(d.qtd_mostruarios_antigos) > 0) alertas.push(`<a href="#mostruarios" style="color:inherit"><b>${d.qtd_mostruarios_antigos} item(ns)</b> em mostruário há mais de 60 dias</a>`);
  if (N(d.qtd_produtos_parados) > 0) alertas.push(`<a href="#estoque" style="color:inherit"><b>${d.qtd_produtos_parados} produto(s)</b> sem venda há mais de 60 dias</a>`);

  v.innerHTML = `
  <div class="page-head"><h1>Dashboard<small>Posição em ${agoraBR()}</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" onclick="navegar()">↻ Atualizar</button></div></div>

  ${alertas.length ? `<div class="alert warn"><span>⚠</span><div>${alertas.join(' &nbsp;·&nbsp; ')}</div></div>` : ''}

  <div class="sec-t">Investimento</div>
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Total em compras</div><div class="val">${BRL(d.total_compras)}</div></div>
    <div class="kpi"><div class="lab">Custo dos produtos</div><div class="val">${BRL(d.total_custo_produtos)}</div></div>
    <div class="kpi"><div class="lab">Frete</div><div class="val">${BRL(d.total_frete)}</div></div>
    <div class="kpi"><div class="lab">Taxa de cartão</div><div class="val">${BRL(d.total_taxa_cartao)}</div></div>
    <div class="kpi violet"><div class="lab">Em mostruário</div><div class="val">${BRL(d.valor_mostruario)}</div></div>
  </div>

  <div class="sec-t">Estoque · posição atual</div>
  <div class="kpis k5">
    <div class="kpi blue"><div class="lab">Estoque disponível</div><div class="val">${BRL(d.valor_estoque_disponivel)}</div>
      <div class="sub">${QTD(d.qtd_estoque_disponivel)} un · ${d.produtos_disponiveis} produtos</div></div>
    <div class="kpi violet"><div class="lab">Com revendedores</div><div class="val">${BRL(d.valor_com_revendedores)}</div></div>
    <div class="kpi blue"><div class="lab">Investimento total</div><div class="val">${BRL(d.investimento_total_mercadoria)}</div></div>
    <div class="kpi"><div class="lab">Potencial de venda</div><div class="val">${BRL(d.potencial_venda_estoque)}</div></div>
    <div class="kpi green"><div class="lab">Lucro potencial</div>
      <div class="val">${BRL(N(d.potencial_venda_estoque) - N(d.investimento_total_mercadoria))}</div></div>
  </div>

  <div class="sec-t">Vendas</div>
  <div class="kpis k5">
    <div class="kpi green"><div class="lab">Total vendido</div><div class="val">${BRL(d.total_vendido)}</div>
      <div class="sub">${d.qtd_vendas} operações</div></div>
    <div class="kpi"><div class="lab">Consumidor final</div><div class="val">${BRL(d.total_vendido_consumidor)}</div></div>
    <div class="kpi"><div class="lab">Revendedor (direto)</div><div class="val">${BRL(d.total_vendido_revendedor_direto)}</div></div>
    <div class="kpi"><div class="lab">Consignação</div><div class="val">${BRL(d.total_vendido_consignacao)}</div></div>
    <div class="kpi"><div class="lab">Ticket médio</div><div class="val">${BRL(d.ticket_medio)}</div></div>
  </div>

  <div class="sec-t">Resultado</div>
  <div class="kpis k5">
    <div class="kpi green"><div class="lab">Lucro bruto</div><div class="val">${BRL(d.lucro_bruto)}</div>
      <div class="sub">margem ${PCT(d.margem_bruta_percentual)}</div></div>
    <div class="kpi green"><div class="lab">Lucro líquido</div><div class="val">${BRL(d.lucro_liquido)}</div>
      <div class="sub">após ${BRL(d.total_despesas)} de despesas</div></div>
    <div class="kpi green"><div class="lab">Lucro recebido</div><div class="val">${BRL(d.lucro_recebido)}</div>
      <div class="sub">já entrou no caixa</div></div>
    <div class="kpi amber"><div class="lab">Lucro a receber</div><div class="val">${BRL(d.lucro_a_receber)}</div>
      <div class="sub">ainda a entrar</div></div>
    <div class="kpi"><div class="lab">Conferência</div>
      <div class="val" style="font-size:15px;color:${Math.abs(N(d.lucro_recebido)+N(d.lucro_a_receber)-N(d.lucro_bruto))<0.05?'var(--green)':'var(--red)'}">
        ${Math.abs(N(d.lucro_recebido)+N(d.lucro_a_receber)-N(d.lucro_bruto))<0.05?'✓ fecha':'✗ divergente'}</div>
      <div class="sub">recebido + a receber = bruto</div></div>
  </div>

  <div class="sec-t">Contas a receber · posição atual</div>
  <div class="kpis k5">
    <div class="kpi amber"><div class="lab">Total a receber</div><div class="val">${BRL(d.total_a_receber)}</div></div>
    <div class="kpi red"><div class="lab">Vencido</div><div class="val">${BRL(d.total_vencido)}</div>
      <div class="sub">${d.qtd_titulos_vencidos} parcela(s)</div></div>
    <div class="kpi amber"><div class="lab">Vence em 7 dias</div><div class="val">${BRL(d.total_a_vencer_7d)}</div></div>
    <div class="kpi green"><div class="lab">Já recebido</div><div class="val">${BRL(d.total_recebido_caixa)}</div></div>
    <div class="kpi ${N(d.inadimplencia_percentual)>10?'red':''}"><div class="lab">Inadimplência</div>
      <div class="val">${PCT(d.inadimplencia_percentual)}</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start" class="g-graf">
    <div class="card"><div class="card-h"><h3>Evolução de vendas e lucro</h3>
      <span class="lgd" style="margin:0"><span><i style="background:#4338ca"></i>Receita</span>
      <span><i style="background:#94a3b8"></i>Custo</span><span><i style="background:#059669"></i>Lucro</span></span></div>
      <div class="card-b">${ev.length ? grafLinha(
        [ev.map(e => e.receita), ev.map(e => e.cmv), ev.map(e => e.lucro_bruto)],
        labels, ['#4338ca','#94a3b8','#059669']) : vazio('📈','Ainda sem vendas','O gráfico aparece após a primeira venda confirmada.')}</div></div>
    <div class="card"><div class="card-h"><h3>Composição do investimento</h3></div>
      <div class="card-b">${grafRosca([
        { t:'Produtos', v:d.total_custo_produtos, c:'#4338ca' },
        { t:'Frete', v:d.total_frete, c:'#7c3aed' },
        { t:'Taxa de cartão', v:d.total_taxa_cartao, c:'#0284c7' },
        { t:'Outros', v:d.total_outros_custos, c:'#94a3b8' }])}</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start" class="g-graf">
    <div class="card"><div class="card-h"><h3>🏆 Produtos mais vendidos</h3></div><div class="card-b">
      ${topProd.length ? topProd.map((p, i) => `<div class="rank">
        <div class="pos-n ${i === 0 ? 'top' : ''}">${i + 1}</div>
        <div class="info"><b>${esc(p.nome)}</b><span>${QTD(p.qtd_vendida)} un · lucro ${BRL(p.lucro_gerado)}</span></div>
        <div class="money" style="font-weight:600">${BRL(p.valor_vendido)}</div></div>`).join('')
        : vazio('📦','Nenhuma venda ainda','O ranking aparece após a primeira venda.')}</div></div>
    <div class="card"><div class="card-h"><h3>🏆 Revendedores que mais vendem</h3></div><div class="card-b">
      ${rkRev.filter(r => N(r.valor_vendido_total) > 0).length ? rkRev.filter(r => N(r.valor_vendido_total) > 0).map((r, i) => `<div class="rank">
        <div class="pos-n ${i === 0 ? 'top' : ''}">${i + 1}</div>
        <div class="info"><b>${esc(r.nome)}</b><span>${r.cidade ? esc(r.cidade) + '/' + esc(r.estado || '') + ' · ' : ''}${QTD(r.qtd_em_posse)} un em posse</span></div>
        <div style="text-align:right"><div class="money" style="font-weight:600">${BRL(r.valor_vendido_total)}</div>
        ${N(r.saldo_vencido) > 0 ? `<span class="tag r" style="font-size:10.5px">${BRL(r.saldo_vencido)} vencido</span>` : ''}</div></div>`).join('')
        : vazio('🤝','Nenhum revendedor com vendas','Registre uma prestação de contas para ver o ranking.')}</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start" class="g-graf">
    <div class="card"><div class="card-h"><h3>🐌 Produtos parados</h3>
      <span class="tag n">sem venda há +60 dias</span></div><div class="card-b">
      ${parados.length ? parados.map(p => `<div class="rank">
        <div class="info"><b>${esc(p.nome)}</b><span>${QTD(p.qtd_disponivel)} un paradas · ${p.dias_sem_venda >= 9999 ? 'nunca vendido' : p.dias_sem_venda + ' dias'}</span></div>
        <div class="money">${BRL(p.valor_estoque_disponivel)}</div></div>`).join('')
        : `<div class="alert ok"><span>✓</span><div>Nenhum produto parado. Todo o estoque tem giro.</div></div>`}</div></div>
    <div class="card"><div class="card-h"><h3>⏳ Mostruários há mais tempo</h3></div><div class="card-b">
      ${posse.length ? posse.map(p => `<div class="rank">
        <div class="info"><b>${esc(p.produto_nome)}</b><span>${esc(p.revendedor_nome)} · ${QTD(p.qtd_em_posse)} un</span></div>
        <div style="text-align:right"><span class="tag ${p.dias_em_posse > 60 ? 'r' : p.dias_em_posse > 30 ? 'a' : 'g'}">${p.dias_em_posse} dias</span>
        <div class="money" style="font-size:12px;color:var(--mute)">${BRL(p.valor_custo_total)}</div></div></div>`).join('')
        : `<div class="alert info"><span>ℹ</span><div>Nenhum produto em poder de revendedores.</div></div>`}</div></div>
  </div>

  <div class="card"><div class="card-h"><h3>👥 Clientes que mais compram</h3></div><div class="card-b">
    ${rkCli.length ? rkCli.map((c, i) => `<div class="rank">
      <div class="pos-n ${i === 0 ? 'top' : ''}">${i + 1}</div>
      <div class="info"><b>${esc(c.nome)}</b><span>${c.qtd_compras} compra(s) · última em ${dBR(c.ultima_compra)}</span></div>
      <div class="money" style="font-weight:600">${BRL(c.valor_total_comprado)}</div></div>`).join('')
      : vazio('👤','Nenhum cliente com compras','O ranking aparece após a primeira venda a um cliente cadastrado.')}</div></div>

  <style>@media(max-width:900px){.g-graf{grid-template-columns:1fr !important}}</style>`;
};

/* ═══════════════ PRODUTOS (Prompt 5) ═══════════════ */
ROTAS.produtos = async (v, id) => {
  if (id) return fichaProduto(v, id);
  crumb('Produtos');
  const prods = await q(sb.from('vw_produtos').select('*').order('nome'));
  const totEst = prods.reduce((a, p) => a + N(p.valor_estoque_disponivel), 0);
  const margens = prods.filter(p => N(p.preco_consumidor) > 0).map(p => N(p.margem_consumidor));
  const margemMedia = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

  v.innerHTML = `
  <div class="page-head"><h1>Produtos<small>${prods.length} cadastrado(s)</small></h1>
    <div class="acts">
      <button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-p" id="novoBtn">+ Novo produto</button></div></div>
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Produtos</div><div class="val">${prods.length}</div></div>
    <div class="kpi blue"><div class="lab">Valor do estoque</div><div class="val">${BRL(totEst)}</div></div>
    <div class="kpi"><div class="lab">Esgotados</div><div class="val">${prods.filter(p => N(p.qtd_total) === 0).length}</div></div>
    <div class="kpi amber"><div class="lab">Estoque baixo</div><div class="val">${prods.filter(p => p.estoque_baixo && N(p.qtd_total) > 0).length}</div></div>
    <div class="kpi green"><div class="lab">Margem média</div><div class="val">${PCT(margemMedia)}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por nome ou código…">
      <select class="inp" id="fcat"><option value="">Todas as categorias</option>${selectOpts(S.categorias)}</select>
      <select class="inp" id="fsit"><option value="">Todas as situações</option>
        <option value="DISPONIVEL">Disponível</option><option value="ESGOTADO">Esgotado</option>
        <option value="EM_MOSTRUARIO">Em mostruário</option><option value="COM_REVENDEDOR">Com revendedor</option></select>
      <label class="chk"><input type="checkbox" id="fbaixo"> Só estoque baixo</label>
    </div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Produto</th><th>Categoria</th><th class="r">Custo médio</th><th class="r">Consumidor</th>
      <th class="r">Revendedor</th><th class="r">Margem</th><th class="c">Disp.</th><th class="c">Most.</th>
      <th class="c">Consig.</th><th class="c">Situação</th><th></th></tr></thead>
      <tbody id="tb"></tbody></table></div>
    <div class="pager"><span id="cnt"></span></div></div>`;

  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), cat = $('#fcat').value, sit = $('#fsit').value, baixo = $('#fbaixo').checked;
    const f = prods.filter(p =>
      (!t || (p.nome + ' ' + p.codigo).toLowerCase().includes(t)) &&
      (!cat || p.categoria_id === cat) && (!sit || p.situacao === sit) &&
      (!baixo || (p.estoque_baixo && N(p.qtd_total) > 0)));
    $('#cnt').textContent = `${f.length} de ${prods.length} produto(s)`;
    $('#tb').innerHTML = f.length ? f.map(p => `<tr>
      <td><a href="#produtos/${p.id}" class="pnome"><div class="ph">🌸</div><div style="min-width:0">
        <b>${esc(p.nome)}</b><span>${esc(p.codigo)}${p.tamanho ? ' · ' + esc(p.tamanho) : ''}</span></div></a></td>
      <td>${esc(p.categoria_nome || '—')}</td>
      <td class="r money">${BRL(p.custo_medio)}</td>
      <td class="r money ${p.preco_abaixo_custo ? 'neg' : ''}">${BRL(p.preco_consumidor)}${p.preco_abaixo_custo ? ' ⚠' : ''}</td>
      <td class="r money">${BRL(p.preco_revendedor)}</td>
      <td class="r"><span class="tag ${N(p.margem_consumidor) >= 40 ? 'g' : N(p.margem_consumidor) >= 20 ? 'a' : 'r'}">${PCT(p.margem_consumidor)}</span></td>
      <td class="c ${p.estoque_baixo ? 'neg' : ''}"><b>${QTD(p.qtd_disponivel)}</b></td>
      <td class="c">${N(p.qtd_mostruario) ? QTD(p.qtd_mostruario) : '—'}</td>
      <td class="c">${N(p.qtd_consignado) ? QTD(p.qtd_consignado) : '—'}</td>
      <td class="c"><span class="tag ${{DISPONIVEL:'g',ESGOTADO:'n',EM_MOSTRUARIO:'a',COM_REVENDEDOR:'v',RESERVADO:'b'}[p.situacao]}">
        ${{DISPONIVEL:'Disponível',ESGOTADO:'Esgotado',EM_MOSTRUARIO:'Mostruário',COM_REVENDEDOR:'Revendedor',RESERVADO:'Reservado'}[p.situacao]}</span></td>
      <td class="nw"><button class="btn btn-ghost btn-sm" data-ed="${p.id}">✎</button></td></tr>`).join('')
      : `<tr><td colspan="11">${vazio('🌸','Nenhum produto encontrado','Ajuste os filtros ou cadastre um novo produto.')}</td></tr>`;
    $$('[data-ed]').forEach(b => b.onclick = () => formProduto(prods.find(x => x.id === b.dataset.ed)));
  };
  ['#fq','#fcat','#fsit','#fbaixo'].forEach(s => $(s).addEventListener('input', pintar));
  $('#novoBtn').onclick = () => formProduto(null);
  $('#expBtn').onclick = () => exportarExcel('produtos', [
    { t:'Código', v:p => p.codigo }, { t:'Nome', v:p => p.nome }, { t:'Categoria', v:p => p.categoria_nome || '' },
    { t:'Marca', v:p => p.marca_nome || '' }, { t:'Tamanho', v:p => p.tamanho || '' },
    { t:'Custo médio', v:p => N(p.custo_medio) }, { t:'Preço consumidor', v:p => N(p.preco_consumidor) },
    { t:'Preço revendedor', v:p => N(p.preco_revendedor) }, { t:'Margem consumidor %', v:p => N(p.margem_consumidor) },
    { t:'Disponível', v:p => N(p.qtd_disponivel) }, { t:'Mostruário', v:p => N(p.qtd_mostruario) },
    { t:'Consignado', v:p => N(p.qtd_consignado) }, { t:'Valor em estoque', v:p => N(p.valor_estoque_disponivel) },
    { t:'Situação', v:p => p.situacao }], prods);
  pintar();
};

function formProduto(p, aoSalvar, inicial) {
  const novo = !p;
  if (novo && inicial) p = { ...inicial };
  const m = modal({
    titulo: novo ? 'Novo produto' : `Editar · ${p.nome}`,
    corpo: `
    <div class="sec-t">Identificação</div>
    <div class="grid-f f2">
      <div><label>Nome do produto <span style="color:var(--red)">*</span></label>
        <input class="inp" id="p_nome" value="${esc(p?.nome || '')}" maxlength="200"></div>
      <div><label>Código</label><input class="inp" id="p_codigo" value="${esc(p?.codigo || '')}"
        placeholder="Gerado automaticamente"></div>
    </div>
    <div class="grid-f f4" style="margin-top:14px">
      <div><label>Categoria</label><select class="inp" id="p_cat"><option value="">—</option>${selectOpts(S.categorias, p?.categoria_id)}</select></div>
      <div><label>Marca</label><select class="inp" id="p_marca"><option value="">—</option>${selectOpts(S.marcas, p?.marca_id)}</select></div>
      <div><label>Tamanho</label><input class="inp" id="p_tam" value="${esc(p?.tamanho || '')}" placeholder="100 ml"></div>
      <div><label>Cor</label><input class="inp" id="p_cor" value="${esc(p?.cor || '')}"></div>
    </div>
    <div class="grid-f f2" style="margin-top:14px">
      <div><label>Código de barras</label><input class="inp" id="p_ean" value="${esc(p?.codigo_barras || '')}"></div>
      <div><label>Foto (endereço da imagem)</label><input class="inp" id="p_foto" value="${esc(p?.foto_url || '')}" placeholder="https://…"></div>
    </div>
    <div style="margin-top:14px"><label>Descrição</label>
      <textarea class="inp" id="p_desc" placeholder="Notas olfativas, família, fixação…">${esc(p?.descricao || '')}</textarea></div>

    <div class="sec-t">Preços</div>
    <div class="grid-f f3">
      <div><label>Custo médio</label><input class="inp" value="${BRLn(p?.custo_medio || 0)}" disabled>
        <div class="hint">Calculado pelas compras — não editável</div></div>
      <div><label>Preço consumidor <span style="color:var(--red)">*</span></label>
        <input class="inp num" id="p_pc" type="number" step="0.01" min="0" value="${N(p?.preco_consumidor).toFixed(2)}">
        <div class="hint" id="h_pc"></div></div>
      <div><label>Preço revendedor <span style="color:var(--red)">*</span></label>
        <input class="inp num" id="p_pr" type="number" step="0.01" min="0" value="${N(p?.preco_revendedor).toFixed(2)}">
        <div class="hint" id="h_pr"></div></div>
    </div>
    <div class="grid-f f2" style="margin-top:14px">
      <div><label>Estoque mínimo</label><input class="inp num" id="p_min" type="number" step="1" min="0" value="${N(p?.estoque_minimo)}">
        <div class="hint">Abaixo disso o sistema avisa</div></div>
      <div><label>Situação</label><label class="chk" style="margin-top:9px">
        <input type="checkbox" id="p_ativo" ${p?.ativo !== false ? 'checked' : ''}> Produto ativo</label></div>
    </div>
    ${novo ? `<div class="alert info" style="margin-top:16px"><span>ℹ</span><div>
      O saldo inicial <b>não</b> é digitado aqui. Ele entra por uma compra ou por um ajuste de estoque com motivo —
      é isso que mantém o estoque auditável.</div></div>` : ''}`,
    rodape: `${!novo ? '<button class="btn btn-d btn-sm" data-del>Excluir</button>' : ''}<div class="sp"></div>
      <button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-save>Salvar</button>`
  });

  const custo = N(p?.custo_medio);
  const atualizarMargens = () => {
    const pc = N($('#p_pc', m.body).value), pr = N($('#p_pr', m.body).value);
    const f = (preco, alvo) => {
      const h = $(alvo, m.body);
      if (!preco) { h.textContent = ''; h.className = 'hint'; return; }
      if (!custo) { h.textContent = 'Sem custo ainda — a margem aparece após a primeira compra.'; h.className = 'hint'; return; }
      const mg = (preco - custo) / preco * 100, mk = (preco - custo) / custo * 100;
      h.textContent = `Lucro ${BRL(preco - custo)} · margem ${PCT(mg)} · markup ${PCT(mk)}`;
      h.className = 'hint' + (preco < custo ? ' bad' : mg < 20 ? ' warn' : '');
      if (preco < custo) h.textContent = `⚠ Abaixo do custo — prejuízo de ${BRL(custo - preco)} por unidade`;
    };
    f(pc, '#h_pc'); f(pr, '#h_pr');
  };
  $('#p_pc', m.body).addEventListener('input', atualizarMargens);
  $('#p_pr', m.body).addEventListener('input', atualizarMargens);
  atualizarMargens();

  $('[data-x]', m.foot).onclick = m.fechar;
  if (!novo) $('[data-del]', m.foot).onclick = async () => {
    const c = await confirmar({ titulo:'Excluir produto',
      mensagem:`Excluir <b>${esc(p.nome)}</b>?`,
      detalhes:'O produto sai das listas, mas todo o histórico de compras e vendas é preservado.',
      textoBotao:'Excluir' });
    if (!c) return;
    try { await q(sb.from('produtos').update({ deleted_at:new Date().toISOString() }).eq('id', p.id));
          m.fechar(); ok('Produto excluído'); navegar(); }
    catch (e) { bad('Não foi possível excluir', erroAmigavel(e)); }
  };

  $('[data-save]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    const nome = $('#p_nome', m.body).value.trim();
    if (nome.length < 2) return bad('Nome obrigatório', 'Informe o nome do produto.');
    const pc = N($('#p_pc', m.body).value), pr = N($('#p_pr', m.body).value);
    if (pr > pc && pc > 0) {
      const c = await confirmar({ titulo:'Preço de revendedor maior', perigo:false, textoBotao:'Salvar assim mesmo',
        mensagem:'O preço para revendedor está <b>maior</b> que o preço para consumidor final.',
        detalhes:'Normalmente o revendedor compra mais barato. Confira se não houve troca dos campos.' });
      if (!c) return;
    }
    const dados = {
      nome, codigo: $('#p_codigo', m.body).value.trim() || undefined,
      descricao: $('#p_desc', m.body).value.trim() || null,
      categoria_id: $('#p_cat', m.body).value || null, marca_id: $('#p_marca', m.body).value || null,
      tamanho: $('#p_tam', m.body).value.trim() || null, cor: $('#p_cor', m.body).value.trim() || null,
      codigo_barras: $('#p_ean', m.body).value.trim() || null, foto_url: $('#p_foto', m.body).value.trim() || null,
      preco_consumidor: pc, preco_revendedor: pr,
      estoque_minimo: N($('#p_min', m.body).value), ativo: $('#p_ativo', m.body).checked
    };
    if (!dados.codigo) delete dados.codigo;
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      const r = novo ? await q(sb.from('produtos').insert(dados).select().single())
                     : await q(sb.from('produtos').update(dados).eq('id', p.id).select().single());
      m.fechar(); ok(novo ? 'Produto cadastrado' : 'Produto atualizado', nome);
      if (aoSalvar) {
        // Volta com os campos que o seletor de produtos usa
        const completo = await q(sb.from('vw_produtos').select('*').eq('id', r.id).single());
        aoSalvar(completo);
      } else navegar();
    } catch (e) { bad('Não foi possível salvar', erroAmigavel(e)); b.disabled = false; b.textContent = 'Salvar'; }
  };
}

async function fichaProduto(v, id) {
  const [p, movs, compras, vendas, posse] = await Promise.all([
    q(sb.from('vw_produtos').select('*').eq('id', id).single()),
    q(sb.from('vw_kardex').select('*').eq('produto_id', id).order('data_movimento', { ascending:false }).order('created_at', { ascending:false }).limit(200)),
    q(sb.from('compra_itens').select('*,compras(numero,data_compra,status,fornecedores(nome))').eq('produto_id', id).limit(100)),
    q(sb.from('venda_itens').select('*,vendas(numero,data_venda,status,tipo)').eq('produto_id', id).limit(100)),
    q(sb.from('vw_itens_em_posse').select('*').eq('produto_id', id))
  ]);
  crumb(`Produtos › ${p.nome}`);
  const TIPOS = { ENTRADA_COMPRA:'Entrada por compra', SAIDA_VENDA:'Venda', SAIDA_REMESSA:'Envio a revendedor',
    RETORNO_DEVOLUCAO:'Devolução', BAIXA_VENDA_CONSIGNADA:'Venda em consignação', BAIXA_PERDA:'Perda',
    RESERVA:'Reserva', LIBERACAO_RESERVA:'Liberação de reserva', AJUSTE_POSITIVO:'Ajuste (entrada)',
    AJUSTE_NEGATIVO:'Ajuste (saída)', ESTORNO:'Estorno' };

  v.innerHTML = `
  <div class="page-head"><h1>${esc(p.nome)}<small>${esc(p.codigo)}${p.tamanho ? ' · ' + esc(p.tamanho) : ''}${p.categoria_nome ? ' · ' + esc(p.categoria_nome) : ''}</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#produtos">← Voltar</a>
      <button class="btn btn-p btn-sm" id="edBtn">✎ Editar</button></div></div>
  ${p.preco_abaixo_custo ? `<div class="alert bad"><span>⚠</span><div><b>Preço abaixo do custo.</b>
    Cada unidade vendida ao consumidor dá prejuízo de ${BRL(N(p.custo_medio) - N(p.preco_consumidor))}.</div></div>` : ''}
  <div class="kpis k4">
    <div class="kpi blue"><div class="lab">Disponível</div><div class="val">${QTD(p.qtd_disponivel)}</div>
      <div class="sub">${BRL(p.valor_estoque_disponivel)} a custo</div></div>
    <div class="kpi"><div class="lab">Custo médio</div><div class="val">${BRL(p.custo_medio)}</div>
      <div class="sub">último: ${BRL(p.ultimo_custo)}</div></div>
    <div class="kpi green"><div class="lab">Lucro consumidor</div><div class="val">${BRL(p.lucro_consumidor)}</div>
      <div class="sub">margem ${PCT(p.margem_consumidor)} · markup ${PCT(p.markup_consumidor)}</div></div>
    <div class="kpi green"><div class="lab">Lucro revendedor</div><div class="val">${BRL(p.lucro_revendedor)}</div>
      <div class="sub">margem ${PCT(p.margem_revendedor)} · markup ${PCT(p.markup_revendedor)}</div></div>
  </div>
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Em mostruário</div><div class="val">${QTD(p.qtd_mostruario)}</div></div>
    <div class="kpi"><div class="lab">Consignado</div><div class="val">${QTD(p.qtd_consignado)}</div></div>
    <div class="kpi"><div class="lab">Total físico</div><div class="val">${QTD(p.qtd_total)}</div></div>
    <div class="kpi"><div class="lab">Potencial de venda</div><div class="val">${BRL(p.valor_potencial_venda)}</div></div>
    <div class="kpi"><div class="lab">Sem venda há</div><div class="val">${p.dias_sem_venda == null ? '—' : p.dias_sem_venda + 'd'}</div></div>
  </div>

  <div class="tabs"><button class="on" data-t="kx">Movimentações (${movs.length})</button>
    <button data-t="cp">Compras (${compras.length})</button>
    <button data-t="vd">Vendas (${vendas.length})</button>
    <button data-t="ps">Em poder de terceiros (${posse.length})</button></div>

  <div class="card" data-p="kx"><div class="tw"><table class="dt"><thead><tr>
    <th>Data</th><th>Tipo</th><th>Bolso</th><th>Documento</th><th class="r">Entrada</th><th class="r">Saída</th>
    <th class="r">Custo unit.</th><th>Motivo</th></tr></thead><tbody>
    ${movs.length ? movs.map(mv => `<tr style="${mv.e_estorno ? 'font-style:italic;color:var(--mute)' : ''}">
      <td class="nw">${dBR(mv.data_movimento)}</td>
      <td>${mv.e_estorno ? '↩ ' : ''}${esc(TIPOS[mv.tipo] || mv.tipo)}</td>
      <td><span class="tag n">${esc(mv.bucket)}</span></td>
      <td class="nw" style="font-size:12px;color:var(--mute)">${esc(mv.origem_tabela)}</td>
      <td class="r money pos">${N(mv.quantidade) > 0 ? QTD(mv.quantidade) : ''}</td>
      <td class="r money neg">${N(mv.quantidade) < 0 ? QTD(-mv.quantidade) : ''}</td>
      <td class="r money">${BRL(mv.custo_unitario)}</td>
      <td style="font-size:12px;color:var(--mute)">${esc(mv.motivo || '')}</td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('🗃️','Sem movimentações','Este produto ainda não teve entrada nem saída.')}</td></tr>`}
  </tbody></table></div></div>

  <div class="card" data-p="cp" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Compra</th><th>Data</th><th>Fornecedor</th><th class="r">Qtd</th><th class="r">Valor unit.</th>
    <th class="r">Rateio</th><th class="r">Custo final</th></tr></thead><tbody>
    ${compras.length ? compras.map(c => `<tr>
      <td><a href="#compras/${c.compra_id}">nº ${c.compras?.numero}</a></td>
      <td class="nw">${dBR(c.compras?.data_compra)}</td><td>${esc(c.compras?.fornecedores?.nome || '—')}</td>
      <td class="r">${QTD(c.quantidade)}</td><td class="r money">${BRL(c.valor_unitario)}</td>
      <td class="r money">${BRL(c.rateio_acessorio)}</td>
      <td class="r money"><b>${BRL(c.custo_unitario_final)}</b></td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('📥','Sem compras','Nenhuma compra registrada para este produto.')}</td></tr>`}
  </tbody></table></div></div>

  <div class="card" data-p="vd" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Venda</th><th>Data</th><th>Canal</th><th class="r">Qtd</th><th class="r">Preço</th>
    <th class="r">Custo</th><th class="r">Lucro</th></tr></thead><tbody>
    ${vendas.length ? vendas.map(x => `<tr>
      <td><a href="#vendas/${x.venda_id}">nº ${x.vendas?.numero}</a></td>
      <td class="nw">${dBR(x.vendas?.data_venda)}</td>
      <td><span class="tag ${x.vendas?.tipo === 'CONSUMIDOR' ? 'b' : 'v'}">${x.vendas?.tipo === 'CONSUMIDOR' ? 'Consumidor' : 'Revendedor'}</span></td>
      <td class="r">${QTD(x.quantidade)}</td><td class="r money">${BRL(x.preco_unitario)}</td>
      <td class="r money">${BRL(x.custo_unitario_praticado)}</td>
      <td class="r money ${N(x.lucro_item) >= 0 ? 'pos' : 'neg'}">${BRL(x.lucro_item)}</td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('🛒','Sem vendas','Este produto ainda não foi vendido.')}</td></tr>`}
  </tbody></table></div></div>

  <div class="card" data-p="ps" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Revendedor</th><th>Remessa</th><th>Enviado em</th><th class="r">Qtd</th>
    <th class="r">Custo</th><th class="r">Revenda</th><th class="c">Dias</th></tr></thead><tbody>
    ${posse.length ? posse.map(x => `<tr>
      <td><a href="#revendedores/${x.revendedor_id}">${esc(x.revendedor_nome)}</a></td>
      <td><a href="#mostruarios/${x.remessa_id}">nº ${x.remessa_numero}</a></td>
      <td class="nw">${dBR(x.data_envio)}</td><td class="r">${QTD(x.qtd_em_posse)}</td>
      <td class="r money">${BRL(x.valor_custo_total)}</td><td class="r money">${BRL(x.valor_revenda_total)}</td>
      <td class="c"><span class="tag ${x.dias_em_posse > 60 ? 'r' : x.dias_em_posse > 30 ? 'a' : 'g'}">${x.dias_em_posse}</span></td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('📦','Nada com terceiros','Nenhuma unidade deste produto está com revendedores.')}</td></tr>`}
  </tbody></table></div></div>`;

  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-p]').forEach(c => c.style.display = c.dataset.p === b.dataset.t ? '' : 'none');
  });
  $('#edBtn').onclick = () => formProduto(p);
}
