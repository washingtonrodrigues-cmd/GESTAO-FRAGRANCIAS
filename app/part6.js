/* ═══════════════ VENDAS (Prompt 10) ═══════════════ */
ROTAS.vendas = async (v, id) => {
  if (id === 'nova') return formVenda(v);
  if (id) return fichaVenda(v, id);
  crumb('Vendas');
  const [vs, tits] = await Promise.all([
    q(sb.from('vendas').select('*,clientes(nome),revendedores(nome),formas_pagamento(nome),venda_itens(id)').order('data_venda', { ascending:false }).order('numero', { ascending:false })),
    q(sb.from('vw_titulos_receber').select('venda_id,saldo,situacao,situacao_real').not('venda_id','is',null))
  ]);
  const pag = {}; tits.forEach(t => { const o = pag[t.venda_id] = pag[t.venda_id] || { ab:0, venc:0, n:0, pg:0 };
    if (t.situacao === 'ABERTO') { o.ab += N(t.saldo); o.n++; if (/VENCIDO/.test(t.situacao_real)) o.venc++; }
    if (t.situacao === 'PAGO') o.pg++; });
  const conf = vs.filter(x => x.status === 'CONFIRMADO');
  const tot = conf.reduce((a, x) => a + N(x.valor_total), 0);
  const luc = conf.reduce((a, x) => a + N(x.lucro_bruto), 0);

  v.innerHTML = `
  <div class="page-head"><h1>Vendas<small>${vs.length} registro(s)</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <a class="btn btn-p" href="#vendas/nova">+ Nova venda</a></div></div>
  <div class="kpis k5">
    <div class="kpi green"><div class="lab">Total vendido</div><div class="val">${BRL(tot)}</div></div>
    <div class="kpi"><div class="lab">Vendas</div><div class="val">${conf.length}</div></div>
    <div class="kpi"><div class="lab">Ticket médio</div><div class="val">${BRL(conf.length ? tot / conf.length : 0)}</div></div>
    <div class="kpi green"><div class="lab">Lucro bruto</div><div class="val">${BRL(luc)}</div></div>
    <div class="kpi"><div class="lab">Margem</div><div class="val">${PCT(tot ? luc / tot * 100 : 0)}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por cliente, revendedor ou nº…">
      <select class="inp" id="ftipo"><option value="">Todos os canais</option>
        <option value="CONSUMIDOR">Consumidor final</option><option value="REVENDEDOR">Revendedor</option></select>
      <select class="inp" id="fst"><option value="">Todas as situações</option>
        <option value="CONFIRMADO">Confirmada</option><option value="CANCELADO">Cancelada</option></select>
      <input class="inp" type="date" id="fd1"><input class="inp" type="date" id="fd2"></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Nº</th><th>Data</th><th>Canal</th><th>Comprador</th><th class="c">Itens</th>
      <th class="r">Total</th><th class="r">Lucro</th><th>Pagamento</th><th class="c">Situação</th><th></th></tr></thead>
      <tbody id="tb"></tbody></table></div><div class="pager"><span id="cnt"></span></div></div>`;

  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), tp = $('#ftipo').value, st = $('#fst').value,
          d1 = $('#fd1').value, d2 = $('#fd2').value;
    const f = vs.filter(x => {
      const nome = x.clientes?.nome || x.revendedores?.nome || 'consumidor não identificado';
      return (!t || (nome + ' ' + x.numero).toLowerCase().includes(t)) && (!tp || x.tipo === tp) &&
        (!st || x.status === st) && (!d1 || x.data_venda >= d1) && (!d2 || x.data_venda <= d2); });
    $('#cnt').textContent = `${f.length} de ${vs.length} venda(s) · ${BRL(f.filter(x => x.status === 'CONFIRMADO').reduce((a, x) => a + N(x.valor_total), 0))}`;
    $('#tb').innerHTML = f.length ? f.map(x => { const p = pag[x.id] || { ab:0, venc:0, n:0, pg:0 };
      const sit = x.status !== 'CONFIRMADO' ? '' : p.ab <= 0 ? '<span class="tag g">Pago</span>'
        : p.venc > 0 ? `<span class="tag r">Vencido</span>` : p.pg > 0 ? `<span class="tag a">Parcial</span>` : '<span class="tag b">Em aberto</span>';
      return `<tr style="cursor:pointer" data-go="${x.id}">
      <td class="num"><b>${x.numero}</b></td><td class="nw">${dBR(x.data_venda)}</td>
      <td><span class="tag ${x.tipo === 'CONSUMIDOR' ? 'b' : 'v'}">${x.tipo === 'CONSUMIDOR' ? 'Consumidor' : 'Revendedor'}</span></td>
      <td>${esc(x.clientes?.nome || x.revendedores?.nome || 'Consumidor não identificado')}</td>
      <td class="c">${x.venda_itens?.length || 0}</td>
      <td class="r money"><b>${BRL(x.valor_total)}</b></td>
      <td class="r money ${N(x.lucro_bruto) >= 0 ? 'pos' : 'neg'}">${x.status === 'CONFIRMADO' ? BRL(x.lucro_bruto) : '—'}</td>
      <td style="font-size:12.5px">${esc(x.formas_pagamento?.nome || '')}${x.qtd_parcelas > 1 ? ` ${x.qtd_parcelas}×` : ''}</td>
      <td class="c">${x.status === 'CANCELADO' ? '<span class="tag r">Cancelada</span>' :
        x.status === 'RASCUNHO' ? '<span class="tag a">Rascunho</span>' : sit}</td>
      <td><button class="btn btn-ghost btn-sm" data-rec="${x.id}" title="Recibo">🧾</button></td></tr>`; }).join('')
      : `<tr><td colspan="10">${vazio('🛒','Nenhuma venda','Registre a primeira venda.','<a class="btn btn-p" href="#vendas/nova">+ Nova venda</a>')}</td></tr>`;
    $$('[data-go]').forEach(r => r.onclick = (e) => { if (!e.target.closest('[data-rec]')) location.hash = `#vendas/${r.dataset.go}`; });
    $$('[data-rec]').forEach(b => b.onclick = (e) => { e.stopPropagation(); reciboVenda(b.dataset.rec); });
  };
  ['#fq','#ftipo','#fst','#fd1','#fd2'].forEach(s => $(s).addEventListener('input', pintar));
  $('#expBtn').onclick = () => exportarExcel('vendas', [
    { t:'Nº', v:x => x.numero }, { t:'Data', v:x => dBR(x.data_venda) }, { t:'Canal', v:x => x.tipo },
    { t:'Comprador', v:x => x.clientes?.nome || x.revendedores?.nome || 'Não identificado' },
    { t:'Subtotal', v:x => N(x.subtotal) }, { t:'Desconto', v:x => N(x.desconto_valor) },
    { t:'Total', v:x => N(x.valor_total) }, { t:'CMV', v:x => N(x.custo_total) },
    { t:'Lucro', v:x => N(x.lucro_bruto) }, { t:'Parcelas', v:x => x.qtd_parcelas },
    { t:'Forma', v:x => x.formas_pagamento?.nome || '' }, { t:'Situação', v:x => x.status }], vs);
  pintar();
};

async function formVenda(v) {
  crumb('Vendas › Nova venda');
  const itens = [];
  v.innerHTML = `
  <div class="page-head"><h1>Nova venda<small>O sistema mostra o lucro antes de você confirmar</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#vendas">← Cancelar</a></div></div>
  <div style="display:grid;grid-template-columns:1fr 336px;gap:16px;align-items:start" class="g-cmp">
    <div>
      <div class="card"><div class="card-h"><h3>1 · Quem está comprando</h3></div><div class="card-b">
        <div class="grid-f f3">
          <div><label>Canal <span style="color:var(--red)">*</span></label><select class="inp" id="v_tipo">
            <option value="CONSUMIDOR">Consumidor final</option><option value="REVENDEDOR">Revendedor</option></select>
            <div class="hint" id="h_tipo">Usa a tabela de preço ao consumidor</div></div>
          <div style="grid-column:span 2;position:relative"><label id="l_comp">Cliente</label>
            <input class="inp" id="v_comp" placeholder="Digite para buscar…" autocomplete="off">
            <input type="hidden" id="v_comp_id">
            <div class="hint" id="h_comp">Deixe em branco para venda balcão à vista · <a href="#" id="novoComp">cadastrar</a></div></div>
        </div>
        <div class="grid-f f2" style="margin-top:14px">
          <div><label>Data</label><input class="inp" type="date" id="v_data" value="${hoje()}" max="${hoje()}"></div>
          <div id="box_saldo"></div>
        </div></div></div>

      <div class="card"><div class="card-h"><h3>2 · Produtos</h3>
        <button class="btn btn-s btn-sm" id="addItem">+ Adicionar produto</button></div>
        <div class="card-b flush"><div class="tw"><table class="itens-tb" id="itb"><thead><tr>
          <th style="width:36%">Produto</th><th style="width:13%">Qtd</th><th style="width:17%">Preço unit.</th>
          <th style="width:18%" class="r">Subtotal</th><th style="width:10%" class="r">Lucro</th><th style="width:6%"></th>
        </tr></thead><tbody></tbody></table></div>
        <div id="semItens">${vazio('🌸','Nenhum produto','Adicione os produtos vendidos.')}</div></div></div>

      <div class="card"><div class="card-h"><h3>3 · Desconto e pagamento</h3></div><div class="card-b">
        <div class="grid-f f4">
          <div><label>Desconto em R$</label><input class="inp num" type="number" step="0.01" min="0" id="v_desc" value="0.00"></div>
          <div><label>Desconto em %</label><input class="inp num" type="number" step="0.01" min="0" max="100" id="v_descp" value="0.00"></div>
          <div><label>Forma de pagamento <span style="color:var(--red)">*</span></label>
            <select class="inp" id="v_forma">${selectOpts(S.formas)}</select></div>
          <div><label>Parcelas</label><select class="inp" id="v_parc"></select></div>
        </div>
        <div class="grid-f f4" style="margin-top:12px">
          <div><label id="lb_venc1">1º vencimento</label>
            <input class="inp" type="date" id="v_venc1"></div>
          <div id="box_intv"><label>Parcelas a cada</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input class="inp num" type="number" id="v_intv" min="1" max="365" step="1" value="30" style="flex:1">
              <span style="font-size:12.5px;color:var(--mute)">dias</span></div></div>
          <div style="grid-column:span 2;display:flex;align-items:flex-end">
            <div class="hint" id="dica_venc" style="margin:0"></div></div>
        </div>
        <div id="previa_parc" style="margin-top:15px"></div>
        <div style="margin-top:14px"><label>Observações</label><textarea class="inp" id="v_obs"></textarea></div>
      </div></div>
    </div>

    <div style="position:sticky;top:72px"><div class="card"><div class="card-h"><h3>Resumo</h3></div><div class="card-b">
      <div class="sumbox">
        <div class="sumrow"><span class="l">Subtotal</span><span class="money" id="s_sub">R$ 0,00</span></div>
        <div class="sumrow"><span class="l">Desconto</span><span class="money" id="s_desc">R$ 0,00</span></div>
        <div class="sumrow tot"><span class="l">Total da venda</span><span class="money" id="s_tot">R$ 0,00</span></div>
      </div>
      <div class="sumbox" style="margin-top:12px">
        <div class="sumrow"><span class="l">Custo dos produtos</span><span class="money" id="s_cmv">R$ 0,00</span></div>
        <div class="sumrow tot" style="font-size:14px"><span class="l">Lucro bruto</span>
          <span class="money pos" id="s_luc">R$ 0,00</span></div>
        <div class="sumrow"><span class="l">Margem</span><span class="money" id="s_mg">0,0%</span></div>
      </div>
      <div id="pend" style="margin-top:14px"></div>
      <button class="btn btn-p btn-block" id="confirmar" style="margin-top:12px">Confirmar venda</button>
      <div class="hint" style="text-align:center;margin-top:8px">Baixa o estoque e gera as parcelas</div>
    </div></div></div>
  </div>
  <style>@media(max-width:1080px){.g-cmp{grid-template-columns:1fr !important}}</style>`;

  let comprador = null;
  const tipoEl = $('#v_tipo');

  const atualizarParcelas = () => {
    const f = S.formas.find(x => x.id === $('#v_forma').value);
    const max = f ? f.max_parcelas : 1;
    $('#v_parc').innerHTML = Array.from({ length:max }, (_, i) =>
      `<option value="${i + 1}">${i + 1 === 1 ? 'À vista' : (i + 1) + '×'}</option>`).join('');
    recalc();
  };

  const buscarComp = () => tipoEl.value === 'CONSUMIDOR' ? buscaCliente : buscaRevendedor;
  const escolherComp = async (c) => {
    comprador = c; $('#v_comp').value = c.nome; $('#v_comp_id').value = c.id;
    const tit = await q(sb.from('vw_titulos_receber').select('saldo,situacao_real')
      .eq(tipoEl.value === 'CONSUMIDOR' ? 'cliente_id' : 'revendedor_id', c.id).eq('situacao','ABERTO'));
    const sal = tit.reduce((a, t) => a + N(t.saldo), 0);
    const venc = tit.filter(t => /VENCIDO/.test(t.situacao_real)).reduce((a, t) => a + N(t.saldo), 0);
    $('#box_saldo').innerHTML = sal > 0
      ? `<div class="alert ${venc > 0 ? 'bad' : 'warn'}" style="margin:0"><span>${venc > 0 ? '⚠' : 'ℹ'}</span><div>
         Saldo devedor atual: <b>${BRL(sal)}</b>${venc > 0 ? ` · <b>${BRL(venc)} vencido</b>` : ''}</div></div>`
      : `<div class="alert ok" style="margin:0"><span>✓</span><div>Sem pendências financeiras.</div></div>`;
    itens.forEach((it, i) => { if (it.produto_id) it.preco = tipoEl.value === 'CONSUMIDOR' ? it.pc : it.pr; });
    render();
  };
  const ligarBuscaComp = () => autocomplete($('#v_comp'), (t) => buscarComp()(t), escolherComp, fmtPessoa,
    { aoCriar: (termo) => formPessoa(tipoEl.value === 'CONSUMIDOR' ? 'clientes' : 'revendedores',
        null, escolherComp, { nome: termo }) });
  ligarBuscaComp();

  tipoEl.onchange = () => {
    const cons = tipoEl.value === 'CONSUMIDOR';
    $('#l_comp').textContent = cons ? 'Cliente' : 'Revendedor';
    $('#h_tipo').textContent = cons ? 'Usa a tabela de preço ao consumidor' : 'Usa a tabela de preço ao revendedor';
    $('#h_comp').innerHTML = cons ? 'Deixe em branco para venda balcão à vista · <a href="#" id="novoComp">cadastrar</a>'
                                  : 'Obrigatório para venda a revendedor · <a href="#" id="novoComp">cadastrar</a>';
    comprador = null; $('#v_comp').value = ''; $('#v_comp_id').value = ''; $('#box_saldo').innerHTML = '';
    itens.forEach(it => { if (it.produto_id) it.preco = cons ? it.pc : it.pr; });
    ligarNovoComp(); ligarBuscaComp(); render();
  };
  const ligarNovoComp = () => { const a = $('#novoComp'); if (a) a.onclick = (e) => { e.preventDefault();
    formPessoa(tipoEl.value === 'CONSUMIDOR' ? 'clientes' : 'revendedores', null, (n) => {
      comprador = n; $('#v_comp').value = n.nome; $('#v_comp_id').value = n.id; recalc(); }); }; };
  ligarNovoComp();

  /* Vencimento: sugere a data automática enquanto o usuário não mexer no campo.
     Depois que ele escolhe uma data, a escolha é respeitada e nunca sobrescrita. */
  const sincronizarVencimento = () => {
    const np = +$('#v_parc').value || 1;
    const dt = $('#v_data').value || hoje();
    const intv = Math.min(365, Math.max(1, +$('#v_intv').value || 30));
    const el = $('#v_venc1');
    el.min = dt;
    if (!el.dataset.tocado) el.value = np === 1 ? dt : addDias(dt, intv);
    if (el.value && el.value < dt) { el.value = dt; el.dataset.ajustado = '1'; }
    const ajustou = el.dataset.ajustado === '1';
    $('#lb_venc1').textContent = np === 1 ? 'Vencimento' : '1º vencimento';
    $('#box_intv').style.visibility = np === 1 ? 'hidden' : '';
    const aPrazo = np === 1 && el.value > dt;
    $('#dica_venc').innerHTML = ajustou
      ? `<span style="color:var(--red)">⚠ O vencimento não pode ser anterior à venda — ajustado para ${dBR(dt)}.</span>`
      : np > 1
      ? `${np} parcelas a cada ${intv} dias a partir de ${dBR(el.value)}.`
      : aPrazo ? '⏳ Pagamento único <b>a prazo</b> — entra em contas a receber, sem baixa automática.'
               : '✓ Recebimento no ato: a parcela já nasce quitada.';
  };

  const recalc = () => {
    const sub = itens.reduce((a, i) => a + Math.round(N(i.qtd) * N(i.preco) * 100) / 100, 0);
    let desc = N($('#v_desc').value);
    if (desc > sub) { desc = sub; $('#v_desc').value = sub.toFixed(2); }
    const tot = sub - desc, cmv = itens.reduce((a, i) => a + N(i.qtd) * N(i.custo), 0);
    const luc = tot - cmv;
    $('#s_sub').textContent = BRL(sub); $('#s_desc').textContent = BRL(desc);
    $('#s_tot').textContent = BRL(tot); $('#s_cmv').textContent = BRL(cmv);
    $('#s_luc').textContent = BRL(luc); $('#s_luc').className = 'money ' + (luc >= 0 ? 'pos' : 'neg');
    $('#s_mg').textContent = PCT(tot ? luc / tot * 100 : 0);
    $('#semItens').style.display = itens.length ? 'none' : '';

    const np = +$('#v_parc').value || 1;
    sincronizarVencimento();
    if (tot > 0 && np >= 1) {
      const base = Math.floor(tot / np * 100) / 100, res = Math.round((tot - base * np) * 100) / 100;
      const avista = np === 1;
      const v1 = $('#v_venc1').value || $('#v_data').value;
      const intv = Math.min(365, Math.max(1, +$('#v_intv').value || 30));
      const aPrazo = avista && v1 > $('#v_data').value;
      let ps = [];
      for (let i = 1; i <= np; i++) ps.push({ i, val: base + (i === 1 ? res : 0), venc: addDias(v1, (i - 1) * intv) });
      $('#previa_parc').innerHTML = `<div class="sumbox">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--mute);margin-bottom:8px">
          ${avista ? (aPrazo ? 'PAGAMENTO ÚNICO A PRAZO' : 'PAGAMENTO À VISTA') : 'PARCELAS'}</div>
        ${ps.map(p => `<div class="sumrow"><span class="l">${avista ? 'Vencimento' : `Parcela ${p.i}/${np}`}</span>
          <span><span class="money">${BRL(p.val)}</span> <span style="color:var(--mute)">· venc. ${dBR(p.venc)}</span></span></div>`).join('')}
        <div class="sumrow tot" style="font-size:13px"><span class="l">Soma</span>
          <span class="money">${BRL(ps.reduce((a, p) => a + p.val, 0))} ✓ confere com o total</span></div></div>`;
    } else $('#previa_parc').innerHTML = '';

    const semComp = !$('#v_comp_id').value;
    const falta = [];
    if (tipoEl.value === 'REVENDEDOR' && semComp) falta.push('Escolher o revendedor na lista de sugestões');
    if (np > 1 && semComp) falta.push('Identificar o cliente — venda parcelada exige cadastro');
    if (np === 1 && semComp && $('#v_venc1').value > $('#v_data').value)
      falta.push('Identificar o cliente — venda a prazo exige cadastro');
    if (!$('#v_venc1').value) falta.push('Informar a data de vencimento');
    else if ($('#v_venc1').value < $('#v_data').value) falta.push('Corrigir o vencimento — está antes da data da venda');
    if (!itens.length) falta.push('Adicionar ao menos um produto');
    if (itens.some(i => !i.produto_id)) falta.push('Escolher o produto na lista de sugestões em todas as linhas');
    if (itens.some(i => i.produto_id && N(i.qtd) <= 0)) falta.push('Informar a quantidade de todos os produtos');
    if (itens.some(i => i.produto_id && N(i.qtd) > N(i.disp))) falta.push('Reduzir a quantidade — passou do estoque disponível');
    const pend = $('#pend');
    if (pend) pend.innerHTML = falta.length
      ? `<div class="alert warn" style="margin:0;font-size:12.5px"><span>⚠</span><div><b>Falta:</b><br>${
          falta.map(f => '· ' + esc(f)).join('<br>')}</div></div>`
      : '<div class="alert ok" style="margin:0;font-size:12.5px"><span>✓</span><div>Tudo pronto para confirmar.</div></div>';
  };

  const render = () => {
    $('#itb tbody').innerHTML = itens.map((it, i) => {
      const lucro = (N(it.preco) - N(it.custo)) * N(it.qtd);
      const abaixo = it.produto_id && N(it.preco) < N(it.custo);
      const pend = !it.produto_id;
      return `<tr data-i="${i}" style="${abaixo ? 'background:var(--red-bg)' : pend ? 'background:#fffdf5' : ''}">
        <td><div style="position:relative"><input class="inp p-busca" placeholder="Digite o nome ou o código…"
          value="${esc(it.nome || '')}" autocomplete="off" style="${pend ? 'border-color:var(--amber)' : ''}"></div>
          ${pend ? '<span style="font-size:11px;color:var(--amber);font-weight:600">⚠ escolha o produto na lista que aparece</span>'
                 : it.disp != null ? `<span style="font-size:11px;color:${N(it.qtd) > N(it.disp) ? 'var(--red)' : 'var(--mute)'}">disponível: ${QTD(it.disp)}</span>` : ''}</td>
        <td><input class="inp num q" type="number" step="1" min="0" value="${it.qtd || ''}"></td>
        <td><input class="inp num pu" type="number" step="0.01" min="0" value="${it.preco || ''}"></td>
        <td class="r money sub">${BRL(N(it.qtd) * N(it.preco))}</td>
        <td class="r money lu ${lucro >= 0 ? 'pos' : 'neg'}">${it.produto_id ? BRL(lucro) : ''}</td>
        <td><button class="btn btn-ghost btn-sm rm">✕</button></td></tr>`;
    }).join('');
    $$('#itb tbody tr').forEach(tr => {
      const i = +tr.dataset.i;
      autocomplete($('.p-busca', tr), buscaProduto, (p) => {
        if (N(p.qtd_disponivel) <= 0) return bad('Sem estoque',
          `${p.nome} está com 0 unidade disponível. Registre uma compra antes de vender.`);
        if (itens.some((x, j) => j !== i && x.produto_id === p.id)) return bad('Produto repetido', 'Ajuste a quantidade da linha existente.');
        itens[i] = { produto_id:p.id, nome:p.nome, disp:N(p.qtd_disponivel), custo:N(p.custo_medio),
          pc:N(p.preco_consumidor), pr:N(p.preco_revendedor),
          preco: tipoEl.value === 'CONSUMIDOR' ? N(p.preco_consumidor) : N(p.preco_revendedor),
          qtd: itens[i].qtd || 1 };
        render(); recalc();
      }, fmtProd);
      // Atualiza a linha SEM re-renderizar a tabela — re-renderizar tira o foco do campo
      const atualizaLinha = () => {
        const it2 = itens[i], lu = (N(it2.preco) - N(it2.custo)) * N(it2.qtd);
        $('.sub', tr).textContent = BRL(N(it2.qtd) * N(it2.preco));
        const cl = $('.lu', tr);
        if (cl) { cl.textContent = it2.produto_id ? BRL(lu) : ''; cl.className = 'r money lu ' + (lu >= 0 ? 'pos' : 'neg'); }
        tr.style.background = it2.produto_id && N(it2.preco) < N(it2.custo) ? 'var(--red-bg)' : '';
      };
      $('.q', tr).oninput = e => {
        const max = N(itens[i].disp);
        if (max && N(e.target.value) > max) { e.target.value = max; warn('Estoque insuficiente', `Só há ${QTD(max)} unidade(s) de ${itens[i].nome}.`); }
        itens[i].qtd = e.target.value; atualizaLinha(); recalc(); };
      $('.pu', tr).oninput = e => { itens[i].preco = e.target.value; atualizaLinha(); recalc(); };
      $('.rm', tr).onclick = () => { itens.splice(i, 1); render(); recalc(); };
    });
    recalc();
  };

  $('#addItem').onclick = () => { itens.push({ qtd:1 }); render();
    setTimeout(() => { const l = $$('#itb tbody .p-busca').pop(); if (l) l.focus(); }, 40); };
  $('#v_desc').oninput = () => { const sub = itens.reduce((a, i) => a + N(i.qtd) * N(i.preco), 0);
    $('#v_descp').value = sub ? (N($('#v_desc').value) / sub * 100).toFixed(2) : '0.00'; recalc(); };
  $('#v_descp').oninput = () => { const sub = itens.reduce((a, i) => a + N(i.qtd) * N(i.preco), 0);
    $('#v_desc').value = (sub * N($('#v_descp').value) / 100).toFixed(2); recalc(); };
  $('#v_forma').onchange = atualizarParcelas;
  $('#v_parc').onchange = recalc;
  $('#v_data').onchange = recalc;
  $('#v_venc1').onchange = (e) => {
    e.target.dataset.tocado = '1';
    if (e.target.value >= ($('#v_data').value || hoje())) delete e.target.dataset.ajustado;
    recalc();
  };
  $('#v_intv').oninput = recalc;
  $('#v_comp').addEventListener('input', () => { if (!$('#v_comp').value.trim()) { $('#v_comp_id').value = ''; $('#box_saldo').innerHTML = ''; } recalc(); });

  $('#confirmar').onclick = async (ev) => {
    const b = ev.target;
    if (!itens.length) return bad('Sem produtos', 'Clique em "Adicionar produto".');
    if (itens.some(i => !i.produto_id)) return bad('Produto não selecionado',
      'Em cada linha, digite o nome e clique no produto na lista que aparece.');
    if (itens.some(i => N(i.qtd) <= 0)) return bad('Quantidade inválida', 'Informe a quantidade de todos os produtos.');
    if (tipoEl.value === 'REVENDEDOR' && !$('#v_comp_id').value)
      return bad('Revendedor não selecionado', 'Escolha o revendedor na lista de sugestões.');
    if (+$('#v_parc').value > 1 && !$('#v_comp_id').value)
      return bad('Cliente obrigatório', 'Vendas parceladas exigem um cliente identificado. Cadastre o cliente ou mude para pagamento à vista.');
    if (!$('#v_venc1').value)
      return bad('Vencimento em branco', 'Informe a data de vencimento da primeira parcela.');
    if ($('#v_venc1').value < $('#v_data').value)
      return bad('Vencimento inválido', 'O vencimento não pode ser anterior à data da venda.');
    if (+$('#v_parc').value === 1 && $('#v_venc1').value > $('#v_data').value && !$('#v_comp_id').value)
      return bad('Cliente obrigatório', 'Venda a prazo exige um cliente identificado — é ele quem vai constar em contas a receber.');
    const sub = itens.reduce((a, i) => a + N(i.qtd) * N(i.preco), 0);
    const desc = N($('#v_desc').value);
    const limite = N(S.params.desconto_max_sem_aprovacao) || 10;
    if (sub > 0 && desc / sub * 100 > limite) {
      if (!await confirmar({ titulo:'Desconto acima do limite', perigo:false, textoBotao:'Aplicar mesmo assim',
        mensagem:`O desconto de <b>${PCT(desc / sub * 100)}</b> passa do limite configurado de ${limite}%.`,
        detalhes:`Valor do desconto: ${BRL(desc)}` })) return;
    }
    const abaixo = itens.filter(i => N(i.preco) < N(i.custo));
    if (abaixo.length) {
      if (!await confirmar({ titulo:'Venda abaixo do custo', textoBotao:'Vender mesmo assim',
        mensagem:`${abaixo.length} produto(s) estão sendo vendidos <b>abaixo do custo</b>.`,
        detalhes: abaixo.map(i => `${esc(i.nome)}: preço ${BRL(i.preco)} · custo ${BRL(i.custo)}`).join('<br>') })) return;
    }
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Confirmando…';
    let vendaId = null;
    try {
      const dados = { tipo: tipoEl.value, data_venda: $('#v_data').value,
        forma_pagamento_id: $('#v_forma').value, qtd_parcelas: +$('#v_parc').value,
        primeiro_vencimento: $('#v_venc1').value || null,
        intervalo_parcelas_dias: Math.min(365, Math.max(1, +$('#v_intv').value || 30)),
        desconto_valor: desc, desconto_percentual: sub ? Math.round(desc / sub * 10000) / 100 : 0,
        observacoes: $('#v_obs').value.trim() || null };
      if (tipoEl.value === 'CONSUMIDOR') dados.cliente_id = $('#v_comp_id').value || null;
      else dados.revendedor_id = $('#v_comp_id').value;
      const vd = await q(sb.from('vendas').insert(dados).select().single());
      vendaId = vd.id;
      await q(sb.from('venda_itens').insert(itens.map(i => ({
        venda_id: vd.id, produto_id: i.produto_id, quantidade: N(i.qtd), preco_unitario: N(i.preco),
        subtotal: Math.round(N(i.qtd) * N(i.preco) * 100) / 100 }))));
      await rpc('fn_confirmar_venda', { p_venda_id: vd.id });
      ok('Venda confirmada', $('#v_venc1').value > $('#v_data').value
        ? 'Estoque baixado. As parcelas entraram em contas a receber.'
        : 'Estoque baixado e recebimento registrado.');
      location.hash = `#vendas/${vd.id}`;
    } catch (e) {
      if (vendaId) { try { await sb.from('vendas').delete().eq('id', vendaId); } catch (_) {} }
      bad('Não foi possível confirmar', erroAmigavel(e));
      b.disabled = false; b.textContent = 'Confirmar venda';
    }
  };
  atualizarParcelas(); render();
}

async function fichaVenda(v, id) {
  const [vd, tits] = await Promise.all([
    q(sb.from('vendas').select('*,clientes(*),revendedores(*),formas_pagamento(nome),venda_itens(*,produtos(codigo,nome,tamanho))').eq('id', id).single()),
    q(sb.from('vw_titulos_receber').select('*').eq('venda_id', id).order('numero_parcela'))
  ]);
  crumb(`Vendas › nº ${vd.numero}`);
  const comp = vd.clientes || vd.revendedores;
  const badge = { RASCUNHO:['a','Rascunho'], CONFIRMADO:['g','Confirmada'], CANCELADO:['r','Cancelada'] }[vd.status];
  const recebido = tits.reduce((a, t) => a + N(t.valor_recebido), 0);
  const aberto = tits.filter(t => t.situacao === 'ABERTO').reduce((a, t) => a + N(t.saldo), 0);

  v.innerHTML = `
  <div class="page-head"><h1>Venda nº ${vd.numero} <span class="tag ${badge[0]}">${badge[1]}</span>
    <small>${dBR(vd.data_venda)} · ${esc(comp?.nome || 'Consumidor não identificado')} ·
      ${esc(vd.formas_pagamento?.nome)}${vd.qtd_parcelas > 1 ? ` em ${vd.qtd_parcelas}×` : ' à vista'}</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#vendas">← Voltar</a>
      <button class="btn btn-s btn-sm" id="recBtn">🧾 Recibo</button>
      ${comp?.whatsapp ? `<a class="btn btn-g btn-sm" target="_blank" href="https://wa.me/55${comp.whatsapp}">WhatsApp</a>` : ''}
      ${vd.status === 'CONFIRMADO' ? '<button class="btn btn-d btn-sm" id="canBtn">Cancelar venda</button>' : ''}</div></div>
  ${vd.status === 'CANCELADO' ? `<div class="alert bad"><span>⛔</span><div><b>Venda cancelada</b> em ${dBR(vd.data_cancelamento)}.<br>Motivo: ${esc(vd.motivo_cancelamento || '')}</div></div>` : ''}
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Subtotal</div><div class="val">${BRL(vd.subtotal)}</div></div>
    <div class="kpi"><div class="lab">Desconto</div><div class="val">${BRL(vd.desconto_valor)}</div></div>
    <div class="kpi green"><div class="lab">Total</div><div class="val">${BRL(vd.valor_total)}</div></div>
    <div class="kpi"><div class="lab">Custo (CMV)</div><div class="val">${BRL(vd.custo_total)}</div></div>
    <div class="kpi green"><div class="lab">Lucro bruto</div><div class="val">${BRL(vd.lucro_bruto)}</div>
      <div class="sub">margem ${PCT(N(vd.valor_total) ? N(vd.lucro_bruto) / N(vd.valor_total) * 100 : 0)}</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Itens</h3></div><div class="tw"><table class="dt"><thead><tr>
    <th>Produto</th><th class="r">Qtd</th><th class="r">Preço unit.</th><th class="r">Subtotal</th>
    <th class="r">Custo unit.</th><th class="r">Lucro</th></tr></thead><tbody>
    ${vd.venda_itens.map(i => `<tr>
      <td><a href="#produtos/${i.produto_id}"><b>${esc(i.produtos?.nome)}</b></a>
        <span style="display:block;font-size:11.5px;color:var(--mute)" class="num">${esc(i.produtos?.codigo)}</span></td>
      <td class="r">${QTD(i.quantidade)}</td><td class="r money">${BRL(i.preco_unitario)}</td>
      <td class="r money">${BRL(i.subtotal)}</td><td class="r money">${BRL(i.custo_unitario_praticado)}</td>
      <td class="r money ${N(i.lucro_item) >= 0 ? 'pos' : 'neg'}">${BRL(i.lucro_item)}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><div class="card-h"><h3>Parcelas</h3>
    <span class="tag ${aberto <= 0 ? 'g' : 'a'}">${aberto <= 0 ? 'Quitada' : BRL(aberto) + ' em aberto'}</span></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th class="c">Parcela</th><th>Vencimento</th><th class="r">Valor</th><th class="r">Recebido</th>
      <th class="r">Saldo</th><th class="c">Situação</th><th></th></tr></thead><tbody>
    ${tits.length ? tits.map(t => `<tr>
      <td class="c"><b>${t.numero_parcela}/${t.total_parcelas}</b></td>
      <td class="nw">${dBR(t.data_vencimento)}</td><td class="r money">${BRL(t.valor_original)}</td>
      <td class="r money pos">${BRL(t.valor_recebido)}</td><td class="r money"><b>${BRL(t.saldo)}</b></td>
      <td class="c">${tagSituacao(t.situacao_real, t.dias_atraso)}</td>
      <td class="nw">${t.situacao === 'ABERTO' || t.situacao === 'PARCIAL'
        ? `<button class="btn btn-g btn-sm" data-rc="${t.id}">💰 Receber</button>
           <button class="btn btn-s btn-sm" data-vc="${t.id}" title="Alterar vencimento">📅</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('💰','Sem parcelas','Esta venda não gerou títulos.')}</td></tr>`}
  </tbody><tfoot><tr style="background:#fbfcfe;font-weight:700">
    <td colspan="2">Total</td><td class="r money">${BRL(vd.valor_total)}</td>
    <td class="r money pos">${BRL(recebido)}</td><td class="r money">${BRL(aberto)}</td><td colspan="2"></td></tr></tfoot>
  </table></div></div>
  ${vd.observacoes ? `<div class="card"><div class="card-b"><b style="font-size:12px;color:var(--mute)">OBSERVAÇÕES</b>
    <p style="margin-top:6px">${esc(vd.observacoes)}</p></div></div>` : ''}`;

  $('#recBtn').onclick = () => reciboVenda(id);
  $$('[data-rc]').forEach(b => b.onclick = async () => {
    const t = tits.find(x => x.id === b.dataset.rc);
    formRecebimento(vd.tipo === 'CONSUMIDOR' ? 'CLIENTE' : 'REVENDEDOR', comp, [t]);
  });
  $$('[data-vc]').forEach(b => b.onclick = () => {
    const t = tits.find(x => x.id === b.dataset.vc);
    formVencimento({ ...t, devedor_nome: comp?.nome }, () => navegar());
  });
  const cb = $('#canBtn');
  if (cb) cb.onclick = async () => {
    const motivo = await confirmar({ titulo:`Cancelar venda nº ${vd.numero}`, pedirMotivo:true, textoBotao:'Cancelar venda',
      mensagem:'Esta operação vai <b>devolver os produtos ao estoque</b> e cancelar as parcelas em aberto.',
      detalhes: recebido > 0
        ? `<b>Atenção:</b> ${BRL(recebido)} já foram recebidos desta venda. Estorne o recebimento antes de cancelar.`
        : `${vd.venda_itens.length} produto(s) voltam ao estoque · ${tits.filter(t => t.situacao === 'ABERTO').length} parcela(s) serão canceladas.` });
    if (!motivo) return;
    try { await rpc('fn_cancelar_venda', { p_venda_id: vd.id, p_motivo: motivo });
          ok('Venda cancelada', 'Estoque devolvido.'); navegar(); }
    catch (e) { bad('Não foi possível cancelar', erroAmigavel(e)); }
  };
}

/* ═══════════════ CONTAS A RECEBER (Prompt 11) ═══════════════ */
ROTAS.receber = async (v, filtro) => {
  crumb('Contas a receber');
  const tits = await q(sb.from('vw_titulos_receber').select('*').neq('situacao','CANCELADO').order('data_vencimento'));
  const ab = tits.filter(t => t.situacao === 'ABERTO');
  const venc = ab.filter(t => /VENCIDO/.test(t.situacao_real));
  const breve = ab.filter(t => t.situacao_real === 'VENCE_EM_BREVE');
  const fut = ab.filter(t => t.situacao_real === 'A_VENCER');
  const pagos = tits.filter(t => t.situacao === 'PAGO');
  const s = (l) => l.reduce((a, t) => a + N(t.saldo), 0);

  v.innerHTML = `
  <div class="page-head"><h1>Contas a receber<small>Posição em ${agoraBR()}</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-g" id="recBtn">💰 Registrar recebimento</button></div></div>
  <div class="kpis k5">
    <div class="kpi amber"><div class="lab">Total a receber</div><div class="val">${BRL(s(ab))}</div>
      <div class="sub">${ab.length} parcela(s)</div></div>
    <div class="kpi red"><div class="lab">Vencido</div><div class="val">${BRL(s(venc))}</div>
      <div class="sub">${venc.length} parcela(s)</div></div>
    <div class="kpi amber"><div class="lab">Vence em breve</div><div class="val">${BRL(s(breve))}</div></div>
    <div class="kpi blue"><div class="lab">A vencer</div><div class="val">${BRL(s(fut))}</div></div>
    <div class="kpi ${s(ab) && s(venc) / s(ab) * 100 > 10 ? 'red' : ''}"><div class="lab">Inadimplência</div>
      <div class="val">${PCT(s(ab) ? s(venc) / s(ab) * 100 : 0)}</div></div>
  </div>
  <div class="card">
    <div class="tabs" style="margin:0;padding:0 13px">
      <button data-f="venc">🔴 Vencidos (${venc.length})</button>
      <button data-f="breve">🟡 Vence em breve (${breve.length})</button>
      <button data-f="fut">📅 A vencer (${fut.length})</button>
      <button data-f="pagos">✅ Pagos (${pagos.length})</button>
      <button data-f="todos" class="on">📋 Todos (${tits.length})</button></div>
    <div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por devedor…">
      <select class="inp" id="fdev"><option value="">Consumidores e revendedores</option>
        <option value="CLIENTE">Só consumidor final</option><option value="REVENDEDOR">Só revendedores</option></select></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th class="c"><input type="checkbox" id="ckAll"></th><th>Vencimento</th><th class="c">Dias</th>
      <th>Devedor</th><th>Origem</th><th class="c">Parcela</th><th class="r">Valor</th>
      <th class="r">Recebido</th><th class="r">Saldo</th><th class="c">Situação</th><th></th></tr></thead>
      <tbody id="tb"></tbody></table></div>
    <div class="pager"><span id="cnt"></span><span class="sp"></span>
      <button class="btn btn-g btn-sm" id="recSel" style="display:none">💰 Receber selecionadas</button></div></div>`;

  let aba = filtro || 'todos';
  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), dv = $('#fdev').value;
    const base = { venc, breve, fut, pagos, todos: tits }[aba] || tits;
    const f = base.filter(x => (!t || (x.devedor_nome || '').toLowerCase().includes(t)) && (!dv || x.tipo_devedor === dv));
    $('#cnt').textContent = `${f.length} parcela(s) · saldo ${BRL(f.reduce((a, x) => a + N(x.saldo), 0))}`;
    $('#tb').innerHTML = f.length ? f.map(x => `<tr>
      <td class="c">${x.situacao === 'ABERTO' ? `<input type="checkbox" class="ck" data-id="${x.id}"
        data-dev="${x.tipo_devedor}" data-pid="${x.cliente_id || x.revendedor_id || ''}">` : ''}</td>
      <td class="nw">${dBR(x.data_vencimento)}</td>
      <td class="c">${x.situacao === 'ABERTO' ? (N(x.dias_atraso) > 0 ? `<span class="tag r">+${x.dias_atraso}</span>`
        : `<span class="tag n">${x.dias_para_vencer}</span>`) : '—'}</td>
      <td><a href="#${x.tipo_devedor === 'CLIENTE' ? 'clientes' : 'revendedores'}/${x.cliente_id || x.revendedor_id}">
        ${esc(x.devedor_nome)}</a>
        <span class="tag ${x.tipo_devedor === 'CLIENTE' ? 'b' : 'v'}" style="font-size:10px">${x.tipo_devedor === 'CLIENTE' ? 'Consumidor' : 'Revendedor'}</span></td>
      <td style="font-size:12.5px">${x.venda_numero ? `<a href="#vendas/${x.venda_id}">Venda ${x.venda_numero}</a>`
        : x.prestacao_numero ? `Prestação ${x.prestacao_numero}` : 'Avulso'}</td>
      <td class="c">${x.numero_parcela}/${x.total_parcelas}</td>
      <td class="r money">${BRL(x.valor_original)}</td>
      <td class="r money pos">${N(x.valor_recebido) ? BRL(x.valor_recebido) : '—'}</td>
      <td class="r money"><b>${BRL(x.saldo)}</b></td>
      <td class="c">${tagSituacao(x.situacao_real, x.dias_atraso)}</td>
      <td class="nw">${x.situacao === 'ABERTO' ? `<button class="btn btn-g btn-sm" data-rc="${x.id}" title="Receber">💰</button>
          <button class="btn btn-s btn-sm" data-vc="${x.id}" title="Alterar vencimento">📅</button>` : ''}
        ${x.devedor_whatsapp && /VENCIDO/.test(x.situacao_real)
          ? `<a class="btn btn-ghost btn-sm" target="_blank" title="Cobrar no WhatsApp"
             href="https://wa.me/55${x.devedor_whatsapp}?text=${encodeURIComponent(msgParcela(x))}">💬</a>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="11">${vazio('💰','Nenhuma parcela','Nada encontrado com estes filtros.')}</td></tr>`;

    $$('.ck').forEach(c => c.onchange = atualizarSel);
    $$('[data-rc]').forEach(b => b.onclick = () => {
      const x = tits.find(y => y.id === b.dataset.rc);
      formRecebimento(x.tipo_devedor, { id:x.cliente_id || x.revendedor_id, nome:x.devedor_nome }, [x]); });
    $$('[data-vc]').forEach(b => b.onclick = () => {
      formVencimento(tits.find(y => y.id === b.dataset.vc), () => navegar()); });
    atualizarSel();
  };
  const atualizarSel = () => {
    const sel = $$('.ck:checked');
    const btn = $('#recSel');
    btn.style.display = sel.length ? '' : 'none';
    btn.textContent = `💰 Receber ${sel.length} parcela(s)`;
    btn.onclick = () => {
      const ids = sel.map(c => c.dataset.id);
      const escolhidos = tits.filter(t => ids.includes(t.id));
      const devs = new Set(escolhidos.map(t => t.cliente_id || t.revendedor_id));
      if (devs.size > 1) return bad('Devedores diferentes', 'Selecione parcelas de um único devedor por recebimento.');
      const p = escolhidos[0];
      formRecebimento(p.tipo_devedor, { id:p.cliente_id || p.revendedor_id, nome:p.devedor_nome }, escolhidos);
    };
  };
  $('#ckAll').onchange = (e) => { $$('.ck').forEach(c => c.checked = e.target.checked); atualizarSel(); };
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); aba = b.dataset.f; pintar(); });
  ['#fq','#fdev'].forEach(s2 => $(s2).addEventListener('input', pintar));
  if (filtro) { const b = $(`.tabs button[data-f="${filtro}"]`); if (b) { $$('.tabs button').forEach(x => x.classList.remove('on')); b.classList.add('on'); } }
  $('#recBtn').onclick = () => escolherDevedor();
  $('#expBtn').onclick = () => exportarExcel('contas-a-receber', [
    { t:'Vencimento', v:x => dBR(x.data_vencimento) }, { t:'Devedor', v:x => x.devedor_nome },
    { t:'Tipo', v:x => x.tipo_devedor }, { t:'Origem', v:x => x.venda_numero ? 'Venda ' + x.venda_numero : x.prestacao_numero ? 'Prestação ' + x.prestacao_numero : 'Avulso' },
    { t:'Parcela', v:x => `${x.numero_parcela}/${x.total_parcelas}` }, { t:'Valor', v:x => N(x.valor_original) },
    { t:'Recebido', v:x => N(x.valor_recebido) }, { t:'Saldo', v:x => N(x.saldo) },
    { t:'Situação', v:x => x.situacao_real }, { t:'Dias de atraso', v:x => N(x.dias_atraso) > 0 ? x.dias_atraso : 0 }], tits);
  pintar();
};

function msgParcela(t) {
  const pix = S.params.empresa_pix;
  return `Olá, ${(t.devedor_nome || '').split(' ')[0]}! Tudo bem?\n\nPassando para lembrar da parcela ${t.numero_parcela}/${t.total_parcelas} no valor de ${BRL(t.saldo)}, com vencimento em ${dBR(t.data_vencimento)}.${pix ? `\n\nChave PIX: ${pix}` : ''}\n\nQualquer dúvida é só me chamar!`;
}

function escolherDevedor() {
  const m = modal({ titulo:'Registrar recebimento', largura:'narrow',
    corpo:`<div class="field"><label>Tipo</label><select class="inp" id="e_tipo">
      <option value="CLIENTE">Consumidor final</option><option value="REVENDEDOR">Revendedor</option></select></div>
      <div class="field" style="position:relative"><label>Quem está pagando</label>
      <input class="inp" id="e_pes" placeholder="Digite para buscar…" autocomplete="off">
      <input type="hidden" id="e_pes_id"></div>`,
    rodape:`<button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-ok>Continuar</button>` });
  let pes = null, ac;
  const ligar = () => { $('#e_pes', m.body).value = ''; $('#e_pes_id', m.body).value = ''; pes = null;
    ac = autocomplete($('#e_pes', m.body),
      (t) => $('#e_tipo', m.body).value === 'CLIENTE' ? buscaCliente(t) : buscaRevendedor(t),
      (c) => { pes = c; $('#e_pes', m.body).value = c.nome; $('#e_pes_id', m.body).value = c.id; }, fmtPessoa); };
  ligar();
  $('#e_tipo', m.body).onchange = ligar;
  $('[data-x]', m.foot).onclick = m.fechar;
  $('[data-ok]', m.foot).onclick = async () => {
    if (!pes) return bad('Selecione quem está pagando', 'Busque o cliente ou revendedor.');
    const tipo = $('#e_tipo', m.body).value;
    const ts = await q(sb.from('vw_titulos_receber').select('*')
      .eq(tipo === 'CLIENTE' ? 'cliente_id' : 'revendedor_id', pes.id).eq('situacao','ABERTO').order('data_vencimento'));
    if (!ts.length) { m.fechar(); return warn('Sem parcelas em aberto', `${pes.nome} não tem nada a pagar.`); }
    m.fechar(); formRecebimento(tipo, pes, ts);
  };
}

/* ── Alterar o vencimento de uma parcela já gerada ──────────────────
   Vale para parcelas em aberto ou parcialmente pagas. O banco recusa
   parcelas quitadas ou canceladas e guarda o histórico da mudança. */
function formVencimento(t, aoSalvar) {
  const emissao = (t.data_emissao || '').slice(0, 10);
  const atual = (t.data_vencimento || '').slice(0, 10);
  const m = modal({
    titulo: `Alterar vencimento — parcela ${t.numero_parcela}/${t.total_parcelas}`,
    largura: 'narrow',
    corpo: `<div class="sumbox" style="margin-bottom:14px">
        <div class="sumrow"><span class="l">Devedor</span><span>${esc(t.devedor_nome || '—')}</span></div>
        <div class="sumrow"><span class="l">Valor da parcela</span><span class="money">${BRL(t.valor_original)}</span></div>
        <div class="sumrow"><span class="l">Saldo em aberto</span><span class="money">${BRL(t.saldo)}</span></div>
        <div class="sumrow"><span class="l">Vencimento atual</span><span>${dBR(atual)}</span></div>
      </div>
      <div class="grid-f f2">
        <div><label>Novo vencimento <span style="color:var(--red)">*</span></label>
          <input class="inp" type="date" id="nv_data" value="${atual}" min="${emissao}"></div>
        <div><label>Adiar em</label>
          <select class="inp" id="nv_atalho">
            <option value="">— escolher —</option>
            <option value="7">7 dias</option><option value="15">15 dias</option>
            <option value="30">30 dias</option><option value="60">60 dias</option>
          </select></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Motivo</label>
        <input class="inp" id="nv_motivo" placeholder="Ex.: cliente pediu prazo maior" maxlength="120"></div>
      <div class="hint" style="margin-top:10px">A alteração fica registrada na parcela e no log de auditoria.
        Não muda o valor nem o lucro — só a data de cobrança.</div>`,
    rodape: `<button class="btn btn-s" data-x>Voltar</button>
             <button class="btn btn-p" data-ok>Salvar vencimento</button>`
  });
  $('#nv_atalho', m.body).onchange = (e) => {
    if (!e.target.value) return;
    $('#nv_data', m.body).value = addDias(atual, +e.target.value);
    e.target.value = '';
  };
  $('[data-x]', m.foot).onclick = m.fechar;
  $('[data-ok]', m.foot).onclick = async (ev) => {
    const nova = $('#nv_data', m.body).value;
    if (!nova) return bad('Data em branco', 'Escolha a nova data de vencimento.');
    if (nova < emissao) return bad('Data inválida',
      `O vencimento não pode ser anterior à emissão (${dBR(emissao)}).`);
    if (nova === atual) { m.fechar(); return; }
    const b = ev.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      await rpc('fn_alterar_vencimento', { p_titulo_id: t.id, p_nova_data: nova,
        p_motivo: $('#nv_motivo', m.body).value.trim() || null });
      m.fechar();
      ok('Vencimento alterado', `Parcela ${t.numero_parcela}/${t.total_parcelas} agora vence em ${dBR(nova)}.`);
      if (aoSalvar) aoSalvar(nova);
    } catch (e) {
      bad('Não foi possível alterar', erroAmigavel(e));
      b.disabled = false; b.textContent = 'Salvar vencimento';
    }
  };
}

async function formRecebimento(tipoDevedor, pessoa, titulosIniciais) {
  const todos = await q(sb.from('vw_titulos_receber').select('*')
    .eq(tipoDevedor === 'CLIENTE' ? 'cliente_id' : 'revendedor_id', pessoa.id)
    .eq('situacao','ABERTO').order('data_vencimento'));
  const preSel = new Set((titulosIniciais || []).map(t => t.id));
  const aloc = {};
  todos.forEach(t => aloc[t.id] = preSel.has(t.id) ? N(t.saldo) : 0);
  const totalPre = Object.values(aloc).reduce((a, b) => a + b, 0);

  /* Revendedor costuma pagar por peça ("hoje te acerto 3 frascos"), não por
     parcela. Para ele o padrão é receber por produto; o modo por valor
     continua disponível na aba ao lado. */
  const ehRev = tipoDevedor === 'REVENDEDOR';
  const pecas = ehRev
    ? await q(sb.from('vw_itens_a_pagar_revendedor').select('*')
        .eq('revendedor_id', pessoa.id).order('origem_data').order('produto_nome'))
    : [];
  const qtdPagar = {};                       // chave do item → quantidade a pagar agora
  const chave = (i) => i.venda_item_id || i.remessa_item_evento_id;
  let modo = ehRev && pecas.length ? 'peca' : 'valor';

  const m = modal({ titulo:`Registrar recebimento · ${pessoa.nome}`, largura:'wide',
    corpo:`${ehRev && pecas.length ? `<div class="tabs" id="rc_tabs" style="margin-bottom:16px">
        <button data-modo="peca" class="on">Por produto e quantidade</button>
        <button data-modo="valor">Por valor total</button></div>` : ''}

      <div id="rc_peca" style="display:${modo === 'peca' ? '' : 'none'}">
        <div class="alert info"><span>ℹ</span><div>Informe quantas unidades de cada produto o
          revendedor está pagando agora. O sistema calcula o valor e abate as parcelas daquele
          documento, da mais antiga para a mais nova.</div></div>
        <div class="grid-f f3" style="margin:14px 0">
          <div><label>Data</label><input class="inp" type="date" id="rp_data" value="${hoje()}" max="${hoje()}"></div>
          <div><label>Forma de pagamento</label><select class="inp" id="rp_forma">${selectOpts(S.formas)}</select></div>
          <div style="display:flex;align-items:flex-end;gap:8px">
            <button class="btn btn-s btn-sm" id="rp_tudo">Marcar tudo</button>
            <button class="btn btn-s btn-sm" id="rp_zerar">Limpar</button></div>
        </div>
        <div class="tw" style="max-height:320px;overflow-y:auto;border:1px solid var(--line);border-radius:9px">
          <table class="itens-tb" id="rptb"><thead><tr>
            <th style="width:30%">Produto</th><th>Origem</th>
            <th class="c">Devidas</th><th class="c">Já pagas</th><th class="c">A pagar</th>
            <th style="width:13%">Pagar agora</th>
            <th class="r">Valor un.</th><th class="r">Subtotal</th>
          </tr></thead><tbody></tbody></table></div>
        <div id="rp_res" style="margin-top:14px"></div>
        <div style="margin-top:12px"><label>Observações</label><textarea class="inp" id="rp_obs"></textarea></div>
      </div>

      <div id="rc_valorbox" style="display:${modo === 'valor' ? '' : 'none'}">
      <div class="grid-f f3" style="margin-bottom:16px">
      <div><label>Valor recebido <span style="color:var(--red)">*</span></label>
        <input class="inp num" type="number" step="0.01" min="0.01" id="rc_valor" value="${totalPre.toFixed(2)}"></div>
      <div><label>Data</label><input class="inp" type="date" id="rc_data" value="${hoje()}" max="${hoje()}"></div>
      <div><label>Forma de pagamento</label><select class="inp" id="rc_forma">${selectOpts(S.formas)}</select></div>
    </div>
    <div style="display:flex;gap:9px;margin-bottom:10px">
      <button class="btn btn-s btn-sm" id="rc_auto">Alocar automaticamente (mais antiga primeiro)</button>
      <button class="btn btn-s btn-sm" id="rc_zerar">Limpar alocação</button></div>
    <div class="tw" style="max-height:300px;overflow-y:auto;border:1px solid var(--line);border-radius:9px">
      <table class="itens-tb" id="rctb"><thead><tr>
        <th>Parcela</th><th>Vencimento</th><th class="r">Saldo</th><th style="width:22%">Alocar</th>
        <th class="c">Resultado</th></tr></thead><tbody></tbody></table></div>
    <div id="rc_res" style="margin-top:14px"></div>
    <div style="margin-top:12px"><label>Observações</label><textarea class="inp" id="rc_obs"></textarea></div>
      </div>`,
    rodape:`<button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-g" data-ok>Confirmar recebimento</button>` });

  const render = () => {
    $('#rctb tbody', m.body).innerHTML = todos.map(t => {
      const al = N(aloc[t.id]), rest = N(t.saldo) - al;
      return `<tr data-id="${t.id}">
        <td><b>${t.numero_parcela}/${t.total_parcelas}</b>
          <span style="display:block;font-size:11px;color:var(--mute)">${t.venda_numero ? 'Venda ' + t.venda_numero : t.prestacao_numero ? 'Prestação ' + t.prestacao_numero : 'Avulso'}</span></td>
        <td class="nw">${dBR(t.data_vencimento)} ${tagSituacao(t.situacao_real, t.dias_atraso)}</td>
        <td class="r money">${BRL(t.saldo)}</td>
        <td><input class="inp num al" type="number" step="0.01" min="0" max="${N(t.saldo)}" value="${al ? al.toFixed(2) : ''}" placeholder="0,00"></td>
        <td class="c">${!al ? '<span class="tag n">—</span>' : rest <= 0 ? '<span class="tag g">✓ quitada</span>' : '<span class="tag a">parcial</span>'}</td></tr>`;
    }).join('');
    $$('#rctb tbody .al', m.body).forEach(inp => inp.oninput = (e) => {
      const id = e.target.closest('tr').dataset.id, t = todos.find(x => x.id === id);
      let val = N(e.target.value);
      if (val > N(t.saldo)) { val = N(t.saldo); e.target.value = val.toFixed(2); }
      aloc[id] = val; resumo(); render2();
    });
    resumo();
  };
  const render2 = () => {
    $$('#rctb tbody tr', m.body).forEach(tr => {
      const t = todos.find(x => x.id === tr.dataset.id), al = N(aloc[t.id]), rest = N(t.saldo) - al;
      tr.children[4].innerHTML = !al ? '<span class="tag n">—</span>' : rest <= 0 ? '<span class="tag g">✓ quitada</span>' : '<span class="tag a">parcial</span>';
    });
  };
  const resumo = () => {
    const val = N($('#rc_valor', m.body).value);
    const soma = Object.values(aloc).reduce((a, b) => a + N(b), 0);
    const sobra = Math.round((val - soma) * 100) / 100;
    $('#rc_res', m.body).innerHTML = `<div class="sumbox">
      <div class="sumrow"><span class="l">Valor recebido</span><span class="money">${BRL(val)}</span></div>
      <div class="sumrow"><span class="l">Total alocado</span><span class="money">${BRL(soma)}</span></div>
      <div class="sumrow tot"><span class="l">Não alocado</span>
        <span class="money ${sobra < 0 ? 'neg' : sobra > 0 ? '' : 'pos'}">${BRL(sobra)}${sobra < 0 ? ' ⚠ excede o recebido' : sobra === 0 ? ' ✓' : ''}</span></div>
      ${sobra > 0 ? '<div class="hint" style="margin-top:6px">O valor não alocado fica registrado como crédito do recebimento, sem baixar nenhuma parcela.</div>' : ''}
    </div>`;
    $('[data-ok]', m.foot).disabled = sobra < 0 || val <= 0;
  };
  const auto = () => {
    let resta = N($('#rc_valor', m.body).value);
    todos.forEach(t => { const usa = Math.min(resta, N(t.saldo)); aloc[t.id] = Math.round(usa * 100) / 100; resta -= usa; });
    render();
  };
  /* ───────── modo por produto e quantidade ───────── */
  const somaPecas = () => pecas.reduce((a, i) =>
    a + Math.round(N(qtdPagar[chave(i)]) * N(i.valor_unitario) * 100) / 100, 0);

  const renderPecas = () => {
    if (!pecas.length) return;
    $('#rptb tbody', m.body).innerHTML = pecas.map((i, n) => {
      const k = chave(i), q = N(qtdPagar[k]);
      const sub = Math.round(q * N(i.valor_unitario) * 100) / 100;
      return `<tr data-k="${k}" data-i="${n}">
        <td><b style="font-size:12.5px">${esc(i.produto_nome)}</b>
          <span style="display:block;font-size:11px;color:var(--mute)">${esc(i.produto_codigo || '')}</span></td>
        <td style="font-size:12px">${i.origem === 'VENDA' ? 'Venda' : 'Prestação'} nº ${i.origem_numero}
          <span style="display:block;font-size:11px;color:var(--mute)">${dBR(i.origem_data)}</span></td>
        <td class="c">${QTD(i.qtd_devida)}</td>
        <td class="c" style="color:var(--mute)">${QTD(i.qtd_paga)}</td>
        <td class="c"><b>${QTD(i.qtd_em_aberto)}</b></td>
        <td><input class="inp num qtdp" type="number" min="0" step="1" max="${N(i.qtd_em_aberto)}"
              value="${q || ''}" placeholder="0"></td>
        <td class="r money">${BRL(i.valor_unitario)}</td>
        <td class="r money"><b>${sub ? BRL(sub) : '—'}</b></td></tr>`;
    }).join('');
    $$('#rptb tbody .qtdp', m.body).forEach(inp => inp.oninput = (e) => {
      const tr = e.target.closest('tr'), i = pecas[+tr.dataset.i];
      let v = N(e.target.value);
      if (v > N(i.qtd_em_aberto)) { v = N(i.qtd_em_aberto); e.target.value = v; }
      if (v < 0) { v = 0; e.target.value = ''; }
      qtdPagar[chave(i)] = v;
      tr.children[7].innerHTML = `<b>${v ? BRL(Math.round(v * N(i.valor_unitario) * 100) / 100) : '—'}</b>`;
      resumoPecas();
    });
    resumoPecas();
  };

  const resumoPecas = () => {
    const total = somaPecas();
    const un = pecas.reduce((a, i) => a + N(qtdPagar[chave(i)]), 0);
    const devidoTotal = pecas.reduce((a, i) => a + N(i.valor_em_aberto), 0);
    $('#rp_res', m.body).innerHTML = `<div class="sumbox">
      <div class="sumrow"><span class="l">Peças informadas</span><span>${QTD(un)} un</span></div>
      <div class="sumrow"><span class="l">Total em aberto do revendedor</span><span class="money">${BRL(devidoTotal)}</span></div>
      <div class="sumrow tot" style="font-size:15px"><span class="l">Valor deste recebimento</span>
        <span class="money pos">${BRL(total)}</span></div>
      <div class="sumrow"><span class="l">Fica devendo depois</span>
        <span class="money">${BRL(Math.max(0, Math.round((devidoTotal - total) * 100) / 100))}</span></div>
    </div>`;
    if (modo === 'peca') $('[data-ok]', m.foot).disabled = total <= 0;
  };

  const trocarModo = (novo) => {
    modo = novo;
    $('#rc_peca', m.body).style.display = novo === 'peca' ? '' : 'none';
    $('#rc_valorbox', m.body).style.display = novo === 'valor' ? '' : 'none';
    $$('#rc_tabs button', m.body).forEach(b2 => b2.classList.toggle('on', b2.dataset.modo === novo));
    if (novo === 'peca') resumoPecas(); else resumo();
  };

  const abas = $('#rc_tabs', m.body);
  if (abas) $$('#rc_tabs button', m.body).forEach(b2 => b2.onclick = () => trocarModo(b2.dataset.modo));
  const btnTudo = $('#rp_tudo', m.body);
  if (btnTudo) btnTudo.onclick = () => { pecas.forEach(i => qtdPagar[chave(i)] = N(i.qtd_em_aberto)); renderPecas(); };
  const btnZerar = $('#rp_zerar', m.body);
  if (btnZerar) btnZerar.onclick = () => { pecas.forEach(i => qtdPagar[chave(i)] = 0); renderPecas(); };

  $('#rc_valor', m.body).oninput = resumo;
  $('#rc_auto', m.body).onclick = auto;
  $('#rc_zerar', m.body).onclick = () => { todos.forEach(t => aloc[t.id] = 0); render(); };
  $('[data-x]', m.foot).onclick = m.fechar;
  $('[data-ok]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Registrando…';

    if (modo === 'peca') {
      const itens = pecas.filter(i => N(qtdPagar[chave(i)]) > 0).map(i => ({
        venda_item_id: i.venda_item_id || null,
        remessa_item_evento_id: i.remessa_item_evento_id || null,
        quantidade: N(qtdPagar[chave(i)]) }));
      if (!itens.length) { bad('Nada informado', 'Preencha a quantidade de ao menos um produto.');
        b.disabled = false; b.textContent = 'Confirmar recebimento'; return; }
      const total = somaPecas();
      try {
        await rpc('fn_receber_por_item', {
          p_revendedor_id: pessoa.id,
          p_data: $('#rp_data', m.body).value,
          p_itens: itens,
          p_forma_pagamento_id: $('#rp_forma', m.body).value,
          p_observacoes: $('#rp_obs', m.body).value.trim() || null });
        m.fechar();
        const un = itens.reduce((a, i) => a + i.quantidade, 0);
        ok('Recebimento registrado', `${QTD(un)} peça(s) · ${BRL(total)} de ${pessoa.nome}.`);
        navegar(); atualizarBadges();
      } catch (e) { bad('Não foi possível registrar', erroAmigavel(e));
        b.disabled = false; b.textContent = 'Confirmar recebimento'; }
      return;
    }

    const val = N($('#rc_valor', m.body).value);
    const lista = Object.entries(aloc).filter(([, v]) => N(v) > 0).map(([titulo_id, valor]) => ({ titulo_id, valor:N(valor) }));
    try {
      await rpc('fn_registrar_recebimento', {
        p_tipo_devedor: tipoDevedor,
        p_cliente_id: tipoDevedor === 'CLIENTE' ? pessoa.id : null,
        p_revendedor_id: tipoDevedor === 'REVENDEDOR' ? pessoa.id : null,
        p_data: $('#rc_data', m.body).value, p_valor: val,
        p_forma_pagamento_id: $('#rc_forma', m.body).value,
        p_alocacoes: lista, p_observacoes: $('#rc_obs', m.body).value.trim() || null });
      m.fechar(); ok('Recebimento registrado', `${BRL(val)} de ${pessoa.nome}.`); navegar(); atualizarBadges();
    } catch (e) { bad('Não foi possível registrar', erroAmigavel(e)); b.disabled = false; b.textContent = 'Confirmar recebimento'; }
  };
  render();
  renderPecas();
}

/* ── Recebimentos ── */
ROTAS.recebimentos = async (v) => {
  crumb('Recebimentos');
  const recs = await q(sb.from('recebimentos').select('*,clientes(nome),revendedores(nome),formas_pagamento(nome),recebimento_alocacoes(valor,estornada,titulos_receber(numero_parcela,total_parcelas))')
    .order('data_recebimento', { ascending:false }).order('numero', { ascending:false }));
  const ativos = recs.filter(r => !r.estornado);
  v.innerHTML = `
  <div class="page-head"><h1>Recebimentos<small>${recs.length} lançamento(s)</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-g" id="novoBtn">💰 Registrar recebimento</button></div></div>
  <div class="kpis k4">
    <div class="kpi green"><div class="lab">Total recebido</div>
      <div class="val">${BRL(ativos.reduce((a, r) => a + N(r.valor_total), 0))}</div></div>
    <div class="kpi"><div class="lab">Lançamentos</div><div class="val">${ativos.length}</div></div>
    <div class="kpi"><div class="lab">Recebido no mês</div>
      <div class="val">${BRL(ativos.filter(r => r.data_recebimento.slice(0,7) === hoje().slice(0,7)).reduce((a, r) => a + N(r.valor_total), 0))}</div></div>
    <div class="kpi red"><div class="lab">Estornados</div><div class="val">${recs.filter(r => r.estornado).length}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por pagador…">
      <input class="inp" type="date" id="fd1"><input class="inp" type="date" id="fd2"></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Nº</th><th>Data</th><th>Pagador</th><th>Forma</th><th class="c">Parcelas quitadas</th>
      <th class="r">Valor</th><th class="c">Situação</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="pager"><span id="cnt"></span></div></div>`;
  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), d1 = $('#fd1').value, d2 = $('#fd2').value;
    const f = recs.filter(r => { const n = r.clientes?.nome || r.revendedores?.nome || '';
      return (!t || n.toLowerCase().includes(t)) && (!d1 || r.data_recebimento >= d1) && (!d2 || r.data_recebimento <= d2); });
    $('#cnt').textContent = `${f.length} lançamento(s) · ${BRL(f.filter(r => !r.estornado).reduce((a, r) => a + N(r.valor_total), 0))}`;
    $('#tb').innerHTML = f.length ? f.map(r => `<tr style="${r.estornado ? 'opacity:.55;text-decoration:line-through' : ''}">
      <td class="num"><b>${r.numero}</b></td><td class="nw">${dBR(r.data_recebimento)}</td>
      <td>${esc(r.clientes?.nome || r.revendedores?.nome || '—')}</td>
      <td>${esc(r.formas_pagamento?.nome || '')}</td>
      <td class="c">${r.recebimento_alocacoes.filter(a => !a.estornada).length}</td>
      <td class="r money"><b>${BRL(r.valor_total)}</b></td>
      <td class="c">${r.estornado ? '<span class="tag r">Estornado</span>' : '<span class="tag g">Confirmado</span>'}</td>
      <td class="nw">${!r.estornado && S.perfil?.perfil === 'ADMIN' ? `<button class="btn btn-ghost btn-sm" data-es="${r.id}" title="Estornar">↩</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-cp="${r.id}" title="Comprovante">🧾</button></td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('🧾','Nenhum recebimento','Registre a entrada de dinheiro.')}</td></tr>`;
    $$('[data-es]').forEach(b => b.onclick = async () => {
      const r = recs.find(x => x.id === b.dataset.es);
      const motivo = await confirmar({ titulo:`Estornar recebimento nº ${r.numero}`, pedirMotivo:true, textoBotao:'Estornar',
        mensagem:`Estornar <b>${BRL(r.valor_total)}</b> recebido em ${dBR(r.data_recebimento)}?`,
        detalhes:'As parcelas quitadas voltam a ficar em aberto. Nada é apagado — o histórico fica marcado como estornado.' });
      if (!motivo) return;
      try { await rpc('fn_estornar_recebimento', { p_recebimento_id: r.id, p_motivo: motivo });
            ok('Recebimento estornado'); navegar(); atualizarBadges(); }
      catch (e) { bad('Não foi possível estornar', erroAmigavel(e)); }
    });
    $$('[data-cp]').forEach(b => b.onclick = () => comprovanteRecebimento(b.dataset.cp));
  };
  ['#fq','#fd1','#fd2'].forEach(s => $(s).addEventListener('input', pintar));
  $('#novoBtn').onclick = () => escolherDevedor();
  $('#expBtn').onclick = () => exportarExcel('recebimentos', [
    { t:'Nº', v:r => r.numero }, { t:'Data', v:r => dBR(r.data_recebimento) },
    { t:'Pagador', v:r => r.clientes?.nome || r.revendedores?.nome || '' },
    { t:'Forma', v:r => r.formas_pagamento?.nome || '' }, { t:'Valor', v:r => N(r.valor_total) },
    { t:'Estornado', v:r => r.estornado ? 'Sim' : 'Não' }], recs);
  pintar();
};

/* ── Despesas ── */
ROTAS.despesas = async (v) => {
  crumb('Despesas');
  const ds = await q(sb.from('despesas').select('*,produtos(nome),formas_pagamento(nome)').is('deleted_at', null).order('data_despesa', { ascending:false }));
  const CAT = { PERDA_ESTOQUE:'Perda de estoque', BAIXA_MOSTRUARIO:'Baixa de mostruário', FRETE_ENVIO:'Frete de envio', TAXA_PAGAMENTO:'Taxa de pagamento',
    EMBALAGEM:'Embalagem', MARKETING:'Marketing', COMISSAO:'Comissão', OPERACIONAL:'Operacional', OUTRAS:'Outras' };
  const porCat = {}; ds.forEach(d => porCat[d.categoria] = (porCat[d.categoria] || 0) + N(d.valor));

  v.innerHTML = `
  <div class="page-head"><h1>Despesas<small>${ds.length} lançamento(s)</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-p" id="novoBtn">+ Nova despesa</button></div></div>
  <div class="kpis k4">
    <div class="kpi red"><div class="lab">Total de despesas</div><div class="val">${BRL(ds.reduce((a, d) => a + N(d.valor), 0))}</div></div>
    <div class="kpi"><div class="lab">Fixas</div><div class="val">${BRL(ds.filter(d => d.natureza === 'FIXA').reduce((a, d) => a + N(d.valor), 0))}</div></div>
    <div class="kpi"><div class="lab">Variáveis</div><div class="val">${BRL(ds.filter(d => d.natureza === 'VARIAVEL').reduce((a, d) => a + N(d.valor), 0))}</div></div>
    <div class="kpi amber"><div class="lab">Perdas de estoque</div><div class="val">${BRL(porCat.PERDA_ESTOQUE || 0)}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar…">
      <select class="inp" id="fcat"><option value="">Todas as categorias</option>
        ${Object.entries(CAT).map(([k, x]) => `<option value="${k}">${x}</option>`).join('')}</select>
      <input class="inp" type="date" id="fd1"><input class="inp" type="date" id="fd2"></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Nº</th><th>Data</th><th>Categoria</th><th>Descrição</th><th class="c">Natureza</th>
      <th class="r">Valor</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="pager"><span id="cnt"></span></div></div>`;
  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), c = $('#fcat').value, d1 = $('#fd1').value, d2 = $('#fd2').value;
    const f = ds.filter(d => (!t || d.descricao.toLowerCase().includes(t)) && (!c || d.categoria === c) &&
      (!d1 || d.data_despesa >= d1) && (!d2 || d.data_despesa <= d2));
    $('#cnt').textContent = `${f.length} despesa(s) · ${BRL(f.reduce((a, d) => a + N(d.valor), 0))}`;
    $('#tb').innerHTML = f.length ? f.map(d => `<tr>
      <td class="num">${d.numero}</td><td class="nw">${dBR(d.data_despesa)}</td>
      <td><span class="tag n">${esc(CAT[d.categoria] || d.categoria)}</span></td>
      <td>${esc(d.descricao)}${d.origem_tabela ? '<span style="font-size:11px;color:var(--mute)"> · automática</span>' : ''}</td>
      <td class="c"><span class="tag ${d.natureza === 'FIXA' ? 'b' : 'n'}">${d.natureza === 'FIXA' ? 'Fixa' : 'Variável'}</span></td>
      <td class="r money"><b>${BRL(d.valor)}</b></td>
      <td>${!d.origem_tabela ? `<button class="btn btn-ghost btn-sm" data-ed="${d.id}">✎</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('📉','Nenhuma despesa','Lance frete de envio, embalagem, marketing e outros custos.')}</td></tr>`;
    $$('[data-ed]').forEach(b => b.onclick = () => formDespesa(ds.find(x => x.id === b.dataset.ed), CAT));
  };
  ['#fq','#fcat','#fd1','#fd2'].forEach(s => $(s).addEventListener('input', pintar));
  $('#novoBtn').onclick = () => formDespesa(null, CAT);
  $('#expBtn').onclick = () => exportarExcel('despesas', [
    { t:'Nº', v:d => d.numero }, { t:'Data', v:d => dBR(d.data_despesa) },
    { t:'Categoria', v:d => CAT[d.categoria] || d.categoria }, { t:'Natureza', v:d => d.natureza },
    { t:'Descrição', v:d => d.descricao }, { t:'Valor', v:d => N(d.valor) }], ds);
  pintar();
};

function formDespesa(d, CAT) {
  const novo = !d;
  const m = modal({ titulo: novo ? 'Nova despesa' : `Editar despesa nº ${d.numero}`,
    corpo:`<div class="grid-f f2">
      <div><label>Categoria <span style="color:var(--red)">*</span></label><select class="inp" id="d_cat">
        ${Object.entries(CAT).map(([k, x]) => `<option value="${k}" ${d?.categoria === k ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><label>Natureza</label><select class="inp" id="d_nat">
        <option value="VARIAVEL" ${d?.natureza === 'VARIAVEL' ? 'selected' : ''}>Variável — muda com o volume</option>
        <option value="FIXA" ${d?.natureza === 'FIXA' ? 'selected' : ''}>Fixa — todo mês igual</option></select>
        <div class="hint">Fixas entram no cálculo do ponto de equilíbrio</div></div></div>
    <div style="margin-top:14px"><label>Descrição <span style="color:var(--red)">*</span></label>
      <input class="inp" id="d_desc" value="${esc(d?.descricao || '')}"></div>
    <div class="grid-f f3" style="margin-top:14px">
      <div><label>Valor <span style="color:var(--red)">*</span></label>
        <input class="inp num" type="number" step="0.01" min="0.01" id="d_val" value="${N(d?.valor).toFixed(2)}"></div>
      <div><label>Data</label><input class="inp" type="date" id="d_data" value="${dISO(d?.data_despesa) || hoje()}"></div>
      <div><label>Forma de pagamento</label><select class="inp" id="d_forma">
        <option value="">—</option>${selectOpts(S.formas, d?.forma_pagamento_id)}</select></div></div>
    <label class="chk" style="margin-top:14px"><input type="checkbox" id="d_rec" ${d?.recorrente ? 'checked' : ''}>
      Despesa recorrente (entra na projeção de caixa)</label>`,
    rodape:`${!novo ? '<button class="btn btn-d btn-sm" data-del>Excluir</button>' : ''}<div class="sp"></div>
      <button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-save>Salvar</button>` });
  $('[data-x]', m.foot).onclick = m.fechar;
  if (!novo) $('[data-del]', m.foot).onclick = async () => {
    if (!await confirmar({ titulo:'Excluir despesa', mensagem:`Excluir <b>${esc(d.descricao)}</b> de ${BRL(d.valor)}?`, textoBotao:'Excluir' })) return;
    try { await q(sb.from('despesas').update({ deleted_at:new Date().toISOString() }).eq('id', d.id));
          m.fechar(); ok('Despesa excluída'); navegar(); } catch (e) { bad('Erro', erroAmigavel(e)); }
  };
  $('[data-save]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    const desc = $('#d_desc', m.body).value.trim(), val = N($('#d_val', m.body).value);
    if (desc.length < 3) return bad('Descrição obrigatória', 'Descreva a despesa.');
    if (val <= 0) return bad('Valor inválido', 'Informe um valor maior que zero.');
    const dados = { categoria:$('#d_cat', m.body).value, natureza:$('#d_nat', m.body).value, descricao:desc,
      valor:val, data_despesa:$('#d_data', m.body).value, forma_pagamento_id:$('#d_forma', m.body).value || null,
      recorrente:$('#d_rec', m.body).checked };
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try { novo ? await q(sb.from('despesas').insert(dados)) : await q(sb.from('despesas').update(dados).eq('id', d.id));
          m.fechar(); ok(novo ? 'Despesa lançada' : 'Despesa atualizada'); navegar(); }
    catch (e) { bad('Não foi possível salvar', erroAmigavel(e)); b.disabled = false; b.textContent = 'Salvar'; }
  };
}
