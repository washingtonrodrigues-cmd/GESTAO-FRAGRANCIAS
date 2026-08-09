/* ═══════════════ COMPRAS (Prompt 4) ═══════════════ */
ROTAS.compras = async (v, id) => {
  if (id === 'nova') return formCompra(v);
  if (id) return fichaCompra(v, id);
  crumb('Compras');
  const cs = await q(sb.from('compras').select('*,fornecedores(nome),compra_itens(id)').order('data_compra', { ascending:false }).order('numero', { ascending:false }));
  const conf = cs.filter(c => c.status === 'CONFIRMADO');
  const sum = (f) => conf.reduce((a, c) => a + N(c[f]), 0);

  v.innerHTML = `
  <div class="page-head"><h1>Compras<small>${cs.length} registro(s)</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <a class="btn btn-p" href="#compras/nova">+ Nova compra</a></div></div>
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Total investido</div><div class="val">${BRL(sum('custo_total'))}</div></div>
    <div class="kpi"><div class="lab">Custo dos produtos</div><div class="val">${BRL(sum('subtotal_produtos'))}</div></div>
    <div class="kpi"><div class="lab">Frete</div><div class="val">${BRL(sum('valor_frete'))}</div></div>
    <div class="kpi"><div class="lab">Taxa de cartão</div><div class="val">${BRL(sum('valor_taxa_cartao'))}</div></div>
    <div class="kpi"><div class="lab">Compras confirmadas</div><div class="val">${conf.length}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por fornecedor ou nº…">
      <select class="inp" id="fst"><option value="">Todas as situações</option>
        <option value="RASCUNHO">Rascunho</option><option value="CONFIRMADO">Confirmada</option>
        <option value="CANCELADO">Cancelada</option></select>
      <input class="inp" type="date" id="fd1"><input class="inp" type="date" id="fd2"></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Nº</th><th>Data</th><th>Fornecedor</th><th class="c">Itens</th><th class="r">Produtos</th>
      <th class="r">Frete</th><th class="r">Taxa</th><th class="r">Custo total</th><th class="c">Situação</th></tr></thead>
      <tbody id="tb"></tbody></table></div><div class="pager"><span id="cnt"></span></div></div>`;

  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), st = $('#fst').value, d1 = $('#fd1').value, d2 = $('#fd2').value;
    const f = cs.filter(c =>
      (!t || ((c.fornecedores?.nome || '') + ' ' + c.numero).toLowerCase().includes(t)) &&
      (!st || c.status === st) && (!d1 || c.data_compra >= d1) && (!d2 || c.data_compra <= d2));
    $('#cnt').textContent = `${f.length} de ${cs.length} compra(s)`;
    $('#tb').innerHTML = f.length ? f.map(c => `<tr style="cursor:pointer" data-go="${c.id}">
      <td class="num"><b>${c.numero}</b></td><td class="nw">${dBR(c.data_compra)}</td>
      <td>${esc(c.fornecedores?.nome || '—')}</td><td class="c">${c.compra_itens?.length || 0}</td>
      <td class="r money">${BRL(c.subtotal_produtos)}</td><td class="r money">${BRL(c.valor_frete)}</td>
      <td class="r money">${BRL(c.valor_taxa_cartao)}</td>
      <td class="r money"><b>${BRL(c.custo_total)}</b></td>
      <td class="c"><span class="tag ${c.status === 'CONFIRMADO' ? 'g' : c.status === 'CANCELADO' ? 'r' : 'a'}">
        ${{RASCUNHO:'Rascunho',CONFIRMADO:'Confirmada',CANCELADO:'Cancelada'}[c.status]}</span></td></tr>`).join('')
      : `<tr><td colspan="9">${vazio('📥','Nenhuma compra','Registre a primeira compra para o estoque começar a existir.',
          '<a class="btn btn-p" href="#compras/nova">+ Nova compra</a>')}</td></tr>`;
    $$('[data-go]').forEach(r => r.onclick = () => location.hash = `#compras/${r.dataset.go}`);
  };
  ['#fq','#fst','#fd1','#fd2'].forEach(s => $(s).addEventListener('input', pintar));
  $('#expBtn').onclick = () => exportarExcel('compras', [
    { t:'Nº', v:c => c.numero }, { t:'Data', v:c => dBR(c.data_compra) },
    { t:'Fornecedor', v:c => c.fornecedores?.nome || '' }, { t:'Documento', v:c => c.numero_documento || '' },
    { t:'Produtos', v:c => N(c.subtotal_produtos) }, { t:'Frete', v:c => N(c.valor_frete) },
    { t:'Taxa cartão', v:c => N(c.valor_taxa_cartao) }, { t:'Outros', v:c => N(c.outros_custos) },
    { t:'Custo total', v:c => N(c.custo_total) }, { t:'Situação', v:c => c.status }], cs);
  pintar();
};

async function formCompra(v) {
  crumb('Compras › Nova compra');
  const itens = [];
  v.innerHTML = `
  <div class="page-head"><h1>Nova compra<small>O sistema calcula o custo real de cada produto com frete e taxa rateados</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#compras">← Cancelar</a></div></div>
  <div style="display:grid;grid-template-columns:1fr 336px;gap:16px;align-items:start" class="g-cmp">
    <div>
      <div class="card"><div class="card-h"><h3>Dados da compra</h3></div><div class="card-b">
        <div class="grid-f f2">
          <div style="position:relative"><label>Fornecedor <span style="color:var(--red)">*</span></label>
            <input class="inp" id="c_forn" placeholder="Digite para buscar…" autocomplete="off">
            <input type="hidden" id="c_forn_id">
            <div class="hint">Não achou? <a href="#" id="novoForn">Cadastrar fornecedor</a></div></div>
          <div><label>Data da compra <span style="color:var(--red)">*</span></label>
            <input class="inp" type="date" id="c_data" value="${hoje()}" max="${hoje()}"></div>
        </div>
        <div class="grid-f f2" style="margin-top:14px">
          <div><label>Nº do documento / nota</label><input class="inp" id="c_doc"></div>
          <div><label>Critério de rateio</label><select class="inp" id="c_crit">
            <option value="VALOR">Proporcional ao valor (recomendado)</option>
            <option value="QUANTIDADE">Proporcional à quantidade</option></select>
            <div class="hint">Por valor evita que o item barato absorva o frete do caro</div></div>
        </div>
        <div class="grid-f f3" style="margin-top:14px">
          <div><label>Data do pagamento</label>
            <input class="inp" type="date" id="c_dtpag" value="${hoje()}">
            <div class="hint">Quando o dinheiro sai — aparece em Contas a Pagar</div></div>
          <div><label>Forma de pagamento</label><select class="inp" id="c_fpag">
            <option value="">—</option>${selectOpts(S.formas)}</select></div>
          <div style="display:flex;align-items:flex-end;padding-bottom:9px">
            <label class="chk" style="margin:0"><input type="checkbox" id="c_pago" checked> Já está paga</label></div>
        </div></div></div>

      <div class="card"><div class="card-h"><h3>Produtos</h3>
        <button class="btn btn-s btn-sm" id="addItem">+ Adicionar produto</button></div>
        <div class="card-b flush"><div class="tw"><table class="itens-tb" id="itb"><thead><tr>
          <th style="width:38%">Produto</th><th style="width:14%">Quantidade</th><th style="width:18%">Valor unitário</th>
          <th style="width:18%" class="r">Subtotal</th><th style="width:6%"></th></tr></thead>
          <tbody></tbody></table></div>
          <div id="semItens">${vazio('🌸','Nenhum produto adicionado','Clique em “Adicionar produto” para começar.')}</div>
        </div></div>

      <div class="card"><div class="card-h"><h3>Custos acessórios</h3></div><div class="card-b">
        <div class="grid-f f3">
          <div><label>Frete</label><input class="inp num" type="number" step="0.01" min="0" id="c_frete" value="0.00"></div>
          <div><label>Taxa do cartão</label>
            <div style="display:flex;gap:6px"><input class="inp num" type="number" step="0.01" min="0" id="c_taxa" value="0.00" style="flex:1">
            <button class="btn btn-s btn-sm" id="calcTaxa" title="Calcular a partir do percentual">%</button></div>
            <div class="hint">Informe em reais ou clique em % para converter</div></div>
          <div><label>Outros custos</label><input class="inp num" type="number" step="0.01" min="0" id="c_outros" value="0.00"></div>
        </div>
        <div style="margin-top:14px"><label>Observações</label><textarea class="inp" id="c_obs"></textarea></div>
      </div></div>
    </div>

    <div style="position:sticky;top:72px">
      <div class="card"><div class="card-h"><h3>Resumo</h3></div><div class="card-b">
        <div class="sumbox">
          <div class="sumrow"><span class="l">Produtos</span><span class="money" id="s_sub">R$ 0,00</span></div>
          <div class="sumrow"><span class="l">Frete</span><span class="money" id="s_fre">R$ 0,00</span></div>
          <div class="sumrow"><span class="l">Taxa do cartão</span><span class="money" id="s_tax">R$ 0,00</span></div>
          <div class="sumrow"><span class="l">Outros</span><span class="money" id="s_out">R$ 0,00</span></div>
          <div class="sumrow tot"><span class="l">Custo total</span><span class="money" id="s_tot">R$ 0,00</span></div>
        </div>
        <div id="previa" style="margin-top:15px"></div>
        <div id="pend" style="margin-top:14px"></div>
        <button class="btn btn-p btn-block" id="confirmar" style="margin-top:12px">Confirmar compra</button>
        <div class="hint" style="text-align:center;margin-top:8px">Ao confirmar, o estoque e o custo médio são atualizados</div>
      </div></div></div>
  </div>
  <style>@media(max-width:1080px){.g-cmp{grid-template-columns:1fr !important}}</style>`;

  const escolherForn = (f) => { $('#c_forn').value = f.nome; $('#c_forn_id').value = f.id;
    $('#c_forn').style.borderColor = ''; recalc(); };
  autocomplete($('#c_forn'), buscaFornecedor, escolherForn, fmtPessoa,
    { aoCriar: (termo) => formPessoa('fornecedores', null, escolherForn, { nome: termo }) });
  $('#novoForn').onclick = (e) => { e.preventDefault(); formPessoa('fornecedores', null, escolherForn); };

  const linha = (i) => {
    const it = itens[i];
    const pend = !it.produto_id;
    return `<tr data-i="${i}" style="${pend ? 'background:#fffdf5' : ''}">
      <td><div style="position:relative"><input class="inp p-busca" placeholder="Digite o nome ou o código…"
        value="${esc(it.nome || '')}" autocomplete="off" style="${pend ? 'border-color:var(--amber)' : ''}"></div>
        ${pend ? '<span style="font-size:11px;color:var(--amber);font-weight:600">⚠ escolha o produto na lista que aparece</span>' : ''}</td>
      <td><input class="inp num q" type="number" step="0.001" min="0.001" value="${it.qtd || ''}"></td>
      <td><input class="inp num vu" type="number" step="0.0001" min="0" value="${it.vu || ''}"></td>
      <td class="r money sub">${BRL(N(it.qtd) * N(it.vu))}</td>
      <td><button class="btn btn-ghost btn-sm rm" title="Remover">✕</button></td></tr>`;
  };

  const recalc = () => {
    const sub = itens.reduce((a, i) => a + Math.round(N(i.qtd) * N(i.vu) * 100) / 100, 0);
    const fre = N($('#c_frete').value), tax = N($('#c_taxa').value), out = N($('#c_outros').value);
    const ac = fre + tax + out, tot = sub + ac;
    $('#s_sub').textContent = BRL(sub); $('#s_fre').textContent = BRL(fre);
    $('#s_tax').textContent = BRL(tax); $('#s_out').textContent = BRL(out); $('#s_tot').textContent = BRL(tot);
    $('#semItens').style.display = itens.length ? 'none' : '';

    // O que ainda falta — visível, em vez de um botão desabilitado sem explicação
    const falta = [];
    if (!$('#c_forn_id').value) falta.push($('#c_forn').value.trim()
      ? 'Escolher o fornecedor na lista de sugestões (digitar o nome não basta)'
      : 'Informar o fornecedor');
    if (!itens.length) falta.push('Adicionar ao menos um produto');
    if (itens.some(i => !i.produto_id)) falta.push('Escolher o produto na lista de sugestões em todas as linhas');
    if (itens.some(i => i.produto_id && N(i.qtd) <= 0)) falta.push('Informar a quantidade de todos os produtos');
    $('#pend').innerHTML = falta.length
      ? `<div class="alert warn" style="margin:0;font-size:12.5px"><span>⚠</span><div><b>Falta:</b><br>${
          falta.map(f => '· ' + esc(f)).join('<br>')}</div></div>`
      : '<div class="alert ok" style="margin:0;font-size:12.5px"><span>✓</span><div>Tudo pronto para confirmar.</div></div>';

    // Prévia do rateio — o mesmo cálculo que a função do banco fará (RN-C02/C03)
    const crit = $('#c_crit').value;
    const base = crit === 'VALOR' ? sub : itens.reduce((a, i) => a + N(i.qtd), 0);
    if (!itens.length || !base) { $('#previa').innerHTML = ''; return; }
    let soma = 0;
    const calc = itens.map(i => {
      const s = Math.round(N(i.qtd) * N(i.vu) * 100) / 100;
      const r = Math.round(ac * (crit === 'VALOR' ? s : N(i.qtd)) / base * 100) / 100;
      soma += r; return { ...i, s, r };
    });
    if (ac > 0 && calc.length) {
      const res = Math.round((ac - soma) * 100) / 100;
      let iMaior = 0, maior = -1;
      calc.forEach((c, idx) => { const p = crit === 'VALOR' ? c.s : N(c.qtd); if (p > maior) { maior = p; iMaior = idx; } });
      calc[iMaior].r = Math.round((calc[iMaior].r + res) * 100) / 100;
    }
    $('#previa').innerHTML = `<div class="sec-t" style="margin:0 0 9px">Custo unitário após o rateio</div>
      ${calc.map(c => { const cu = (c.s + c.r) / (N(c.qtd) || 1); const up = N(c.vu) ? (cu / N(c.vu) - 1) * 100 : 0;
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:4px 0;border-bottom:1px solid #f1f5f9">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nome || '—')}</span>
        <b class="money">${BRL(cu)}${up ? ` <span style="color:var(--amber);font-weight:500">+${up.toFixed(1)}%</span>` : ''}</b></div>`; }).join('')}
      <div style="font-size:11.5px;color:var(--mute);margin-top:8px">Rateio total: ${BRL(calc.reduce((a, c) => a + c.r, 0))} — confere com os custos acessórios ✓</div>`;
  };

  const render = () => {
    const tb = $('#itb tbody');
    tb.innerHTML = itens.map((_, i) => linha(i)).join('');
    $$('#itb tbody tr').forEach(tr => {
      const i = +tr.dataset.i;
      const inp = $('.p-busca', tr);
      const escolher = (p) => {
        if (itens.some((x, j) => j !== i && x.produto_id === p.id)) {
          bad('Produto repetido', `${p.nome} já está na lista. Ajuste a quantidade da linha existente.`); return; }
        itens[i] = { ...itens[i], produto_id:p.id, nome:p.nome, vu: itens[i].vu || N(p.ultimo_custo) || '' };
        render(); recalc();
      };
      autocomplete(inp, buscaProduto, escolher, fmtProd,
        { aoCriar: (termo) => formProduto(null, escolher, { nome: termo }) });
      $('.q', tr).oninput = (e) => { itens[i].qtd = e.target.value; $('.sub', tr).textContent = BRL(N(itens[i].qtd) * N(itens[i].vu)); recalc(); };
      $('.vu', tr).oninput = (e) => { itens[i].vu = e.target.value; $('.sub', tr).textContent = BRL(N(itens[i].qtd) * N(itens[i].vu)); recalc(); };
      $('.rm', tr).onclick = () => { itens.splice(i, 1); render(); recalc(); };
    });
    recalc();
  };

  $('#addItem').onclick = () => { itens.push({ qtd:'', vu:'' }); render();
    setTimeout(() => { const l = $$('#itb tbody .p-busca').pop(); if (l) l.focus(); }, 40); };
  ['#c_frete','#c_taxa','#c_outros','#c_crit'].forEach(s => $(s).addEventListener('input', recalc));
  $('#c_forn').addEventListener('input', () => { if (!$('#c_forn').value.trim()) $('#c_forn_id').value = ''; recalc(); });

  $('#calcTaxa').onclick = () => {
    const sub = itens.reduce((a, i) => a + N(i.qtd) * N(i.vu), 0);
    if (!sub) return warn('Adicione os produtos primeiro', 'A taxa é calculada sobre o valor dos produtos.');
    const m = modal({ titulo:'Calcular taxa do cartão', largura:'narrow',
      corpo:`<p style="margin-bottom:14px;font-size:13.5px">Valor dos produtos: <b>${BRL(sub)}</b></p>
        <div class="field"><label>Percentual da maquininha</label>
        <input class="inp num" type="number" step="0.01" id="tx_p" value="3.49" autofocus></div>
        <div class="sumbox" style="margin-top:12px"><div class="sumrow tot" style="margin:0;border:none;padding:0">
        <span class="l">Taxa em reais</span><span class="money" id="tx_r">${BRL(sub * 0.0349)}</span></div></div>`,
      rodape:`<button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-ok>Usar este valor</button>` });
    const upd = () => $('#tx_r', m.body).textContent = BRL(sub * N($('#tx_p', m.body).value) / 100);
    $('#tx_p', m.body).oninput = upd;
    $('[data-x]', m.foot).onclick = m.fechar;
    $('[data-ok]', m.foot).onclick = () => {
      $('#c_taxa').value = (sub * N($('#tx_p', m.body).value) / 100).toFixed(2); m.fechar(); recalc(); };
  };

  $('#confirmar').onclick = async (ev) => {
    const b = ev.target;
    if (!$('#c_forn_id').value) return bad('Fornecedor não selecionado',
      $('#c_forn').value.trim()
        ? 'Digite o nome e clique no fornecedor na lista que aparece abaixo do campo. Se ele ainda não existe, use "Cadastrar fornecedor".'
        : 'Informe o fornecedor da compra.');
    if (!itens.length) return bad('Sem produtos', 'Clique em "Adicionar produto".');
    for (const i of itens) {
      if (!i.produto_id) return bad('Produto não selecionado',
        'Em cada linha, digite o nome e clique no produto na lista que aparece. Se ele ainda não existe, use "Cadastrar … agora" no fim da lista.');
      if (N(i.qtd) <= 0) return bad('Quantidade inválida', `Informe a quantidade de ${i.nome}.`);
    }
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Confirmando…';
    let compraId = null;
    try {
      const c = await q(sb.from('compras').insert({
        fornecedor_id: $('#c_forn_id').value, data_compra: $('#c_data').value,
        numero_documento: $('#c_doc').value.trim() || null, criterio_rateio: $('#c_crit').value,
        valor_frete: N($('#c_frete').value), valor_taxa_cartao: N($('#c_taxa').value),
        outros_custos: N($('#c_outros').value), observacoes: $('#c_obs').value.trim() || null,
        data_pagamento: $('#c_dtpag').value || null, pago: $('#c_pago').checked,
        forma_pagamento_id: $('#c_fpag').value || null
      }).select().single());
      compraId = c.id;
      await q(sb.from('compra_itens').insert(itens.map(i => ({
        compra_id: c.id, produto_id: i.produto_id, quantidade: N(i.qtd), valor_unitario: N(i.vu),
        subtotal: Math.round(N(i.qtd) * N(i.vu) * 100) / 100 }))));
      await rpc('fn_confirmar_compra', { p_compra_id: c.id });
      ok('Compra confirmada', 'Estoque e custo médio atualizados.');
      location.hash = `#compras/${c.id}`;
    } catch (e) {
      if (compraId) { try { await sb.from('compras').delete().eq('id', compraId); } catch (_) {} }
      bad('Não foi possível confirmar', erroAmigavel(e));
      b.disabled = false; b.textContent = 'Confirmar compra';
    }
  };
  render();
}

async function fichaCompra(v, id) {
  const c = await q(sb.from('compras').select('*,fornecedores(*),formas_pagamento(nome),compra_itens(*,produtos(codigo,nome,tamanho))').eq('id', id).single());
  crumb(`Compras › nº ${c.numero}`);
  const badge = { RASCUNHO:['a','Rascunho'], CONFIRMADO:['g','Confirmada'], CANCELADO:['r','Cancelada'] }[c.status];
  v.innerHTML = `
  <div class="page-head"><h1>Compra nº ${c.numero} <span class="tag ${badge[0]}">${badge[1]}</span>
    <small>${dBR(c.data_compra)} · ${esc(c.fornecedores?.nome || '—')}${c.numero_documento ? ' · doc ' + esc(c.numero_documento) : ''}</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#compras">← Voltar</a>
      ${c.status !== 'CANCELADO' ? '<button class="btn btn-p btn-sm" id="edItens">✎ Alterar compra</button>' : ''}
      ${c.status === 'CONFIRMADO' && !c.pago ? '<button class="btn btn-g btn-sm" id="pagBtn">✓ Marcar paga</button>' : ''}
      ${c.status === 'CONFIRMADO' ? '<button class="btn btn-d btn-sm" id="canBtn">Cancelar compra</button>' : ''}</div></div>
  ${c.status === 'CANCELADO' ? `<div class="alert bad"><span>⛔</span><div><b>Compra cancelada</b> em ${dBR(c.data_cancelamento)}.<br>Motivo: ${esc(c.motivo_cancelamento || '')}</div></div>` : ''}
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Produtos</div><div class="val">${BRL(c.subtotal_produtos)}</div></div>
    <div class="kpi"><div class="lab">Frete</div><div class="val">${BRL(c.valor_frete)}</div></div>
    <div class="kpi"><div class="lab">Taxa de cartão</div><div class="val">${BRL(c.valor_taxa_cartao)}</div></div>
    <div class="kpi"><div class="lab">Outros</div><div class="val">${BRL(c.outros_custos)}</div></div>
    <div class="kpi blue"><div class="lab">Custo total</div><div class="val">${BRL(c.custo_total)}</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Itens e rateio</h3>
    <span class="tag n">rateio por ${c.criterio_rateio === 'VALOR' ? 'valor' : 'quantidade'}</span>
    <button class="btn btn-s btn-sm" id="prBtn">🖨 Imprimir</button></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Produto</th><th class="r">Qtd</th><th class="r">Valor unit.</th><th class="r">Subtotal</th>
      <th class="r">Rateio</th><th class="r">Custo do item</th><th class="r">Custo unitário final</th></tr></thead><tbody>
    ${c.compra_itens.map(i => `<tr>
      <td><a href="#produtos/${i.produto_id}"><b>${esc(i.produtos?.nome)}</b></a>
        <span style="color:var(--mute);font-size:11.5px;display:block" class="num">${esc(i.produtos?.codigo)}</span></td>
      <td class="r">${QTD(i.quantidade)}</td><td class="r money">${BRL(i.valor_unitario)}</td>
      <td class="r money">${BRL(i.subtotal)}</td><td class="r money" style="color:var(--amber)">${BRL(i.rateio_acessorio)}</td>
      <td class="r money">${BRL(i.custo_total_item)}</td>
      <td class="r money"><b>${BRL(i.custo_unitario_final)}</b></td></tr>`).join('')}
    </tbody><tfoot><tr style="background:#fbfcfe;font-weight:700">
      <td colspan="3">Total</td><td class="r money">${BRL(c.subtotal_produtos)}</td>
      <td class="r money">${BRL(c.custo_acessorio)}</td><td class="r money">${BRL(c.custo_total)}</td><td></td></tr></tfoot>
    </table></div>
    <div class="pager"><span>A soma dos rateios (${BRL(c.compra_itens.reduce((a, i) => a + N(i.rateio_acessorio), 0))})
      confere exatamente com os custos acessórios (${BRL(c.custo_acessorio)}) ✓</span></div></div>
  ${c.status === 'CONFIRMADO' ? `<div class="card"><div class="card-h"><h3>Pagamento ao fornecedor</h3>
    <span class="tag ${c.pago ? 'g' : c.data_pagamento && c.data_pagamento < hoje() ? 'r' : 'a'}">${
      c.pago ? 'Paga' : c.data_pagamento ? (c.data_pagamento < hoje() ? 'Vencida' : 'A pagar') : 'Sem data'}</span></div>
    <div class="card-b"><div class="sumbox">
      <div class="sumrow"><span class="l">Data prevista / do pagamento</span>
        <span>${c.data_pagamento ? dBR(c.data_pagamento) : '—'}</span></div>
      <div class="sumrow"><span class="l">Forma</span><span>${esc(c.formas_pagamento?.nome || '—')}</span></div>
      <div class="sumrow tot"><span class="l">Valor</span><span class="money">${BRL(c.custo_total)}</span></div>
    </div>
    <div class="hint" style="margin-top:10px">Esta compra aparece em <a href="#pagar">Contas a Pagar</a>.
      Ela não entra como despesa no resultado: o custo da mercadoria vira CMV quando o produto é vendido.</div>
    </div></div>` : ''}
  ${c.observacoes ? `<div class="card"><div class="card-b"><b style="font-size:12px;color:var(--mute)">OBSERVAÇÕES</b>
    <p style="margin-top:6px">${esc(c.observacoes)}</p></div></div>` : ''}`;

  $('#prBtn').onclick = () => imprimir(docCompra(c));
  const eb = $('#edItens'); if (eb) eb.onclick = () => formEditarCompra(c);
  const pb = $('#pagBtn'); if (pb) pb.onclick = () => formPagarCompra({
    id:c.id, numero:c.numero, data_compra:c.data_compra, data_pagamento:c.data_pagamento,
    custo_total:c.custo_total, fornecedor_nome:c.fornecedores?.nome });
  const cb = $('#canBtn');
  if (cb) cb.onclick = async () => {
    const motivo = await confirmar({ titulo:`Cancelar compra nº ${c.numero}`, pedirMotivo:true, textoBotao:'Cancelar compra',
      mensagem:'Esta operação vai <b>devolver os produtos</b> ao fornecedor no sistema, retirando-os do estoque.',
      detalhes:'O custo médio dos produtos será recalculado. Se alguma unidade já foi vendida, o cancelamento será bloqueado.' });
    if (!motivo) return;
    try { await rpc('fn_cancelar_compra', { p_compra_id: c.id, p_motivo: motivo });
          ok('Compra cancelada', 'Estoque e custo médio revertidos.'); navegar(); }
    catch (e) { bad('Não foi possível cancelar', erroAmigavel(e)); }
  };
}

/* Incluir e excluir produto de uma compra, inclusive já confirmada.
   O banco desfaz a entrada de estoque, refaz o rateio de frete e taxa e dá
   entrada de novo — por isso o custo unitário de TODOS os itens muda. */
function formEditarCompra(c) {
  const itens = c.compra_itens.map(i => ({ produto_id:i.produto_id, nome:i.produtos?.nome,
    codigo:i.produtos?.codigo, qtd:String(N(i.quantidade)), vu:String(N(i.valor_unitario)) }));
  const confirmada = c.status === 'CONFIRMADO';

  const m = modal({ titulo:`Alterar compra nº ${c.numero}`, largura:'wide',
    corpo:`${confirmada ? `<div class="alert warn"><span>⚠</span><div>Esta compra <b>já está confirmada</b>.
      Ao salvar, o sistema tira do estoque tudo o que esta compra tinha colocado, refaz o rateio de
      frete e taxa e dá entrada de novo — então o <b>custo unitário de todos os produtos da nota muda</b>.
      Se alguma unidade desta compra já foi vendida, a alteração é recusada.</div></div>`
      : '<div class="alert info"><span>ℹ</span><div>Compra em rascunho: pode mexer à vontade.</div></div>'}
      <div class="grid-f f2" style="margin-bottom:14px">
        <div style="position:relative"><label>Fornecedor</label>
          <input class="inp" id="ec_forn" autocomplete="off" value="${esc(c.fornecedores?.nome || '')}">
          <input type="hidden" id="ec_forn_id" value="${esc(c.fornecedor_id)}"></div>
        <div><label>Data da compra</label>
          <input class="inp" type="date" id="ec_data" value="${c.data_compra}" max="${hoje()}"></div>
      </div>
      <div class="grid-f f2" style="margin-bottom:16px">
        <div><label>Nº do documento / nota</label>
          <input class="inp" id="ec_doc" value="${esc(c.numero_documento || '')}"></div>
        <div><label>Critério de rateio</label><select class="inp" id="ec_crit">
          <option value="VALOR"${c.criterio_rateio === 'VALOR' ? ' selected' : ''}>Proporcional ao valor</option>
          <option value="QUANTIDADE"${c.criterio_rateio === 'QUANTIDADE' ? ' selected' : ''}>Proporcional à quantidade</option>
          </select></div>
      </div>
      <div class="tw"><table class="itens-tb" id="ectb"><thead><tr>
        <th style="width:40%">Produto</th><th style="width:16%">Quantidade</th>
        <th style="width:20%">Valor unitário</th><th style="width:18%" class="r">Subtotal</th>
        <th style="width:6%"></th></tr></thead><tbody></tbody></table></div>
      <div style="margin-top:10px"><button class="btn btn-s btn-sm" id="ecAdd">+ Adicionar produto</button></div>
      <div class="grid-f f3" style="margin-top:16px">
        <div><label>Frete</label><input class="inp num" type="number" step="0.01" min="0" id="ec_frete" value="${N(c.valor_frete).toFixed(2)}"></div>
        <div><label>Taxa do cartão</label><input class="inp num" type="number" step="0.01" min="0" id="ec_taxa" value="${N(c.valor_taxa_cartao).toFixed(2)}"></div>
        <div><label>Outros custos</label><input class="inp num" type="number" step="0.01" min="0" id="ec_outros" value="${N(c.outros_custos).toFixed(2)}"></div>
      </div>
      <div class="grid-f f3" style="margin-top:14px">
        <div><label>Data do pagamento</label>
          <input class="inp" type="date" id="ec_dtpag" value="${c.data_pagamento || ''}"></div>
        <div><label>Forma de pagamento</label><select class="inp" id="ec_fpag">
          <option value="">—</option>${selectOpts(S.formas, c.forma_pagamento_id)}</select></div>
        <div style="display:flex;align-items:flex-end;padding-bottom:9px">
          <label class="chk" style="margin:0"><input type="checkbox" id="ec_pago"${c.pago ? ' checked' : ''}> Já está paga</label></div>
      </div>
      <div id="ec_resumo" style="margin-top:16px"></div>`,
    rodape:`<button class="btn btn-s" data-x>Cancelar</button>
            <button class="btn btn-p" data-ok>Salvar alterações</button>` });

  const resumo = () => {
    const sub = itens.reduce((a, i) => a + N(i.qtd) * N(i.vu), 0);
    const ace = N($('#ec_frete', m.body).value) + N($('#ec_taxa', m.body).value) + N($('#ec_outros', m.body).value);
    const crit = $('#ec_crit', m.body)?.value || c.criterio_rateio;
    const base = crit === 'QUANTIDADE' ? itens.reduce((a, i) => a + N(i.qtd), 0) : sub;
    $('#ec_resumo', m.body).innerHTML = `<div class="sumbox">
      <div class="sumrow"><span class="l">Produtos</span><span class="money">${BRL(sub)}</span></div>
      <div class="sumrow"><span class="l">Frete, taxa e outros</span><span class="money">${BRL(ace)}</span></div>
      <div class="sumrow tot"><span class="l">Custo total da compra</span><span class="money">${BRL(sub + ace)}</span></div>
    </div>
    ${itens.length && base > 0 ? `<div class="tw" style="margin-top:12px"><table class="dt"><thead><tr>
      <th>Produto</th><th class="r">Rateio</th><th class="r">Custo unitário final</th></tr></thead><tbody>
      ${itens.map(i => { const peso = crit === 'QUANTIDADE' ? N(i.qtd) : N(i.qtd) * N(i.vu);
        const rat = ace * (peso / base);
        return `<tr><td>${esc(i.nome || '—')}</td><td class="r money" style="color:var(--amber)">${BRL(rat)}</td>
          <td class="r money"><b>${BRL(N(i.qtd) ? (N(i.qtd) * N(i.vu) + rat) / N(i.qtd) : 0)}</b></td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="hint">Prévia do rateio por ${crit === 'QUANTIDADE' ? 'quantidade' : 'valor'}.
        O valor definitivo é calculado pelo banco ao salvar.</div>` : ''}`;
    $('[data-ok]', m.foot).disabled = !itens.length;
  };

  const render = () => {
    $('#ectb tbody', m.body).innerHTML = itens.map((i, k) => `<tr data-i="${k}">
      <td><input class="inp p-busca" placeholder="Digite para buscar…" autocomplete="off" value="${esc(i.nome || '')}">
        ${i.codigo ? `<span style="display:block;font-size:11px;color:var(--mute)" class="num">${esc(i.codigo)}</span>` : ''}</td>
      <td><input class="inp num q" type="number" min="0.001" step="1" value="${esc(i.qtd)}"></td>
      <td><input class="inp num vu" type="number" min="0" step="0.01" value="${esc(i.vu)}"></td>
      <td class="r money sub">${BRL(N(i.qtd) * N(i.vu))}</td>
      <td class="c"><button class="btn btn-ghost btn-sm rm" title="Remover">✕</button></td></tr>`).join('');
    $$('#ectb tbody tr', m.body).forEach(tr => {
      const k = +tr.dataset.i, inp = $('.p-busca', tr);
      const escolher = (p) => { itens[k].produto_id = p.id; itens[k].nome = p.nome; itens[k].codigo = p.codigo;
        if (!N(itens[k].vu)) itens[k].vu = String(N(p.ultimo_custo) || N(p.custo_medio) || '');
        render(); resumo(); };
      autocomplete(inp, buscaProduto, escolher, fmtProd,
        { aoCriar: (termo) => formProduto(null, escolher, { nome: termo }) });
      $('.q', tr).oninput = (e) => { itens[k].qtd = e.target.value;
        $('.sub', tr).textContent = BRL(N(itens[k].qtd) * N(itens[k].vu)); resumo(); };
      $('.vu', tr).oninput = (e) => { itens[k].vu = e.target.value;
        $('.sub', tr).textContent = BRL(N(itens[k].qtd) * N(itens[k].vu)); resumo(); };
      $('.rm', tr).onclick = () => { itens.splice(k, 1); render(); resumo(); };
    });
    resumo();
  };

  $('#ecAdd', m.body).onclick = () => { itens.push({ qtd:'', vu:'' }); render();
    setTimeout(() => { const l = $$('#ectb tbody .p-busca', m.body).pop(); if (l) l.focus(); }, 40); };
  autocomplete($('#ec_forn', m.body), buscaFornecedor,
    (fo) => { $('#ec_forn', m.body).value = fo.nome; $('#ec_forn_id', m.body).value = fo.id; }, fmtPessoa);
  $('#ec_forn', m.body).addEventListener('input', () => {
    if (!$('#ec_forn', m.body).value.trim()) $('#ec_forn_id', m.body).value = ''; });
  ['#ec_frete','#ec_taxa','#ec_outros','#ec_crit'].forEach(x => $(x, m.body).addEventListener('input', resumo));
  $('#ec_crit', m.body).addEventListener('change', resumo);
  $('[data-x]', m.foot).onclick = m.fechar;

  $('[data-ok]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    if (!itens.length) return bad('Sem produtos', 'A compra precisa de ao menos um produto.');
    if (!$('#ec_forn_id', m.body).value) return bad('Fornecedor não selecionado',
      'Digite o nome e clique no fornecedor na lista que aparece.');
    for (const i of itens) {
      if (!i.produto_id) return bad('Produto não selecionado',
        'Em cada linha, digite o nome e clique no produto na lista que aparece.');
      if (N(i.qtd) <= 0) return bad('Quantidade inválida', `Informe a quantidade de ${i.nome || 'todos os produtos'}.`);
    }
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      await rpc('fn_editar_compra', { p_compra_id:c.id,
        p_dados: {
          fornecedor_id: $('#ec_forn_id', m.body).value || c.fornecedor_id,
          data_compra: $('#ec_data', m.body).value || c.data_compra,
          numero_documento: $('#ec_doc', m.body).value.trim() || null,
          criterio_rateio: $('#ec_crit', m.body).value,
          valor_frete: N($('#ec_frete', m.body).value),
          valor_taxa_cartao: N($('#ec_taxa', m.body).value),
          outros_custos: N($('#ec_outros', m.body).value),
          data_pagamento: $('#ec_dtpag', m.body).value || null,
          pago: $('#ec_pago', m.body).checked,
          forma_pagamento_id: $('#ec_fpag', m.body).value || null },
        p_itens: itens.map(i => ({ produto_id:i.produto_id, quantidade:N(i.qtd), valor_unitario:N(i.vu) })) });
      m.fechar(); ok('Compra alterada', 'Estoque, rateio e custo médio recalculados.');
      navegar();
    } catch (e) { bad('Não foi possível salvar', erroAmigavel(e));
      b.disabled = false; b.textContent = 'Salvar alterações'; }
  };
  render();
}

/* ═══════════════ ESTOQUE (Prompt 6) ═══════════════ */
ROTAS.estoque = async (v) => {
  crumb('Estoque');
  const [prods, movs] = await Promise.all([
    q(sb.from('vw_produtos').select('*').order('nome')),
    q(sb.from('vw_kardex').select('*').order('data_movimento', { ascending:false }).order('created_at', { ascending:false }).limit(300))
  ]);
  const t = (f) => prods.reduce((a, p) => a + N(p[f]), 0);
  const TIPOS = { ENTRADA_COMPRA:'Entrada por compra', SAIDA_VENDA:'Venda', SAIDA_REMESSA:'Envio a revendedor',
    RETORNO_DEVOLUCAO:'Devolução', BAIXA_VENDA_CONSIGNADA:'Venda em consignação', BAIXA_PERDA:'Perda',
    BAIXA_MOSTRUARIO:'Mostruário finalizado',
    RESERVA:'Reserva', LIBERACAO_RESERVA:'Liberação', AJUSTE_POSITIVO:'Ajuste (entrada)',
    AJUSTE_NEGATIVO:'Ajuste (saída)', ESTORNO:'Estorno' };

  v.innerHTML = `
  <div class="page-head"><h1>Estoque<small>Posição em ${agoraBR()}</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-s btn-sm" id="recBtn">✓ Verificar integridade</button>
      <button class="btn btn-p" id="ajBtn">⚖ Ajustar estoque</button></div></div>
  <div class="kpis k5">
    <div class="kpi blue"><div class="lab">Disponível</div><div class="val">${BRL(t('valor_estoque_disponivel'))}</div>
      <div class="sub">${QTD(t('qtd_disponivel'))} unidades</div></div>
    <div class="kpi amber"><div class="lab">Mostruário</div><div class="val">${BRL(t('valor_mostruario'))}</div>
      <div class="sub">${QTD(t('qtd_mostruario'))} un · custo já é despesa</div></div>
    <div class="kpi violet"><div class="lab">Consignado</div><div class="val">${BRL(t('valor_consignado'))}</div>
      <div class="sub">${QTD(t('qtd_consignado'))} unidades</div></div>
    <div class="kpi"><div class="lab">Investimento total</div><div class="val">${BRL(t('valor_total_custo'))}</div></div>
    <div class="kpi green"><div class="lab">Lucro potencial</div>
      <div class="val">${BRL(t('valor_potencial_venda') - t('valor_total_custo'))}</div></div>
  </div>
  <div class="tabs"><button class="on" data-t="pos">Posição por produto</button>
    <button data-t="kx">Movimentações</button></div>

  <div class="card" data-p="pos"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar produto…">
      <select class="inp" id="fcat"><option value="">Todas as categorias</option>${selectOpts(S.categorias)}</select>
      <label class="chk"><input type="checkbox" id="fsaldo" checked> Só com saldo</label>
      <label class="chk"><input type="checkbox" id="fbaixo"> Estoque baixo</label></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Produto</th><th class="c">Disponível</th><th class="c">Reservado</th><th class="c">Mostruário</th>
      <th class="c">Consignado</th><th class="c">Total</th><th class="r">Custo médio</th>
      <th class="r">Valor total</th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="pager"><span id="cnt"></span></div></div>

  <div class="card" data-p="kx" style="display:none"><div class="filters">
      <input class="inp grow" id="kq" placeholder="🔍 Buscar produto…">
      <select class="inp" id="ktipo"><option value="">Todos os tipos</option>
        ${Object.entries(TIPOS).map(([k, x]) => `<option value="${k}">${x}</option>`).join('')}</select></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Data</th><th>Produto</th><th>Tipo</th><th>Bolso</th><th class="r">Entrada</th><th class="r">Saída</th>
      <th class="r">Custo unit.</th><th>Motivo</th></tr></thead><tbody id="ktb"></tbody></table></div>
    <div class="pager"><span id="kcnt"></span><span class="sp"></span>
      <span>Últimas 300 movimentações · o histórico completo fica na ficha de cada produto</span></div></div>`;

  const pintar = () => {
    const t2 = $('#fq').value.trim().toLowerCase(), cat = $('#fcat').value,
          sal = $('#fsaldo').checked, bx = $('#fbaixo').checked;
    const f = prods.filter(p => (!t2 || (p.nome + ' ' + p.codigo).toLowerCase().includes(t2)) &&
      (!cat || p.categoria_id === cat) && (!sal || N(p.qtd_total) > 0) && (!bx || p.estoque_baixo));
    $('#cnt').textContent = `${f.length} produto(s)`;
    $('#tb').innerHTML = f.length ? f.map(p => `<tr>
      <td><a href="#produtos/${p.id}" class="pnome"><div class="ph">🌸</div><div style="min-width:0">
        <b>${esc(p.nome)}</b><span>${esc(p.codigo)}</span></div></a></td>
      <td class="c"><b class="${p.estoque_baixo ? 'neg' : ''}">${QTD(p.qtd_disponivel)}</b></td>
      <td class="c">${N(p.qtd_reservado) ? QTD(p.qtd_reservado) : '—'}</td>
      <td class="c">${N(p.qtd_mostruario) ? QTD(p.qtd_mostruario) : '—'}</td>
      <td class="c">${N(p.qtd_consignado) ? QTD(p.qtd_consignado) : '—'}</td>
      <td class="c"><b>${QTD(p.qtd_total)}</b></td>
      <td class="r money">${BRL(p.custo_medio)}</td>
      <td class="r money"><b>${BRL(p.valor_total_custo)}</b></td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('🗃️','Nenhum produto','Ajuste os filtros ou registre uma compra.')}</td></tr>`;
  };
  const pintarK = () => {
    const t2 = $('#kq').value.trim().toLowerCase(), tp = $('#ktipo').value;
    const f = movs.filter(m => (!t2 || (m.produto_nome + ' ' + m.produto_codigo).toLowerCase().includes(t2)) && (!tp || m.tipo === tp));
    $('#kcnt').textContent = `${f.length} movimentação(ões)`;
    $('#ktb').innerHTML = f.length ? f.map(m => `<tr style="${m.e_estorno ? 'font-style:italic;color:var(--mute)' : ''}">
      <td class="nw">${dBR(m.data_movimento)}</td>
      <td><a href="#produtos/${m.produto_id}">${esc(m.produto_nome)}</a></td>
      <td>${m.e_estorno ? '↩ ' : ''}${esc(TIPOS[m.tipo] || m.tipo)}</td>
      <td><span class="tag n">${esc(m.bucket)}</span></td>
      <td class="r money pos">${N(m.quantidade) > 0 ? QTD(m.quantidade) : ''}</td>
      <td class="r money neg">${N(m.quantidade) < 0 ? QTD(-m.quantidade) : ''}</td>
      <td class="r money">${BRL(m.custo_unitario)}</td>
      <td style="font-size:12px;color:var(--mute)">${esc(m.motivo || '')}</td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('📋','Sem movimentações','Nenhum lançamento com estes filtros.')}</td></tr>`;
  };
  ['#fq','#fcat','#fsaldo','#fbaixo'].forEach(s => $(s).addEventListener('input', pintar));
  ['#kq','#ktipo'].forEach(s => $(s).addEventListener('input', pintarK));
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-p]').forEach(c => c.style.display = c.dataset.p === b.dataset.t ? '' : 'none');
  });
  $('#ajBtn').onclick = () => formAjuste();
  $('#expBtn').onclick = () => exportarExcel('estoque', [
    { t:'Código', v:p => p.codigo }, { t:'Produto', v:p => p.nome }, { t:'Categoria', v:p => p.categoria_nome || '' },
    { t:'Disponível', v:p => N(p.qtd_disponivel) }, { t:'Reservado', v:p => N(p.qtd_reservado) },
    { t:'Mostruário', v:p => N(p.qtd_mostruario) }, { t:'Consignado', v:p => N(p.qtd_consignado) },
    { t:'Total', v:p => N(p.qtd_total) }, { t:'Custo médio', v:p => N(p.custo_medio) },
    { t:'Valor total', v:p => N(p.valor_total_custo) }], prods.filter(p => N(p.qtd_total) > 0));
  $('#recBtn').onclick = async () => {
    const b = $('#recBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Verificando…';
    try {
      const neg = prods.filter(p => N(p.qtd_disponivel) < 0 || N(p.qtd_mostruario) < 0 || N(p.qtd_consignado) < 0);
      const soma = prods.filter(p => Math.abs(N(p.qtd_total) - (N(p.qtd_disponivel) + N(p.qtd_reservado) + N(p.qtd_mostruario) + N(p.qtd_consignado))) > 0.0001);
      if (!neg.length && !soma.length) ok('Estoque íntegro', 'Nenhuma divergência encontrada.');
      else bad('Divergência encontrada', `${neg.length} saldo(s) negativo(s), ${soma.length} soma(s) inconsistente(s).`);
    } finally { b.disabled = false; b.innerHTML = '✓ Verificar integridade'; }
  };
  pintar(); pintarK();
};

function formAjuste() {
  const m = modal({ titulo:'Ajustar estoque',
    corpo:`<div class="alert warn"><span>⚠</span><div>Use o ajuste apenas para corrigir divergências reais
      (inventário, quebra, perda). Toda entrada normal deve vir de uma <b>compra</b>.</div></div>
      <div style="position:relative;margin-bottom:14px"><label>Produto <span style="color:var(--red)">*</span></label>
        <input class="inp" id="a_prod" placeholder="Buscar produto…" autocomplete="off">
        <input type="hidden" id="a_prod_id"><div class="hint" id="a_saldo"></div></div>
      <div class="grid-f f2">
        <div><label>Tipo de ajuste</label><select class="inp" id="a_tipo">
          <option value="1">Entrada (sobra encontrada)</option><option value="-1">Saída (falta / perda)</option></select></div>
        <div><label>Quantidade <span style="color:var(--red)">*</span></label>
          <input class="inp num" type="number" step="0.001" min="0.001" id="a_qtd"></div>
      </div>
      <div style="margin-top:14px"><label>Motivo <span style="color:var(--red)">*</span></label>
        <textarea class="inp" id="a_motivo" placeholder="Ex.: Inventário de 01/08 — 2 frascos quebrados no estoque"></textarea>
        <div class="hint">Obrigatório, mínimo 5 caracteres. Fica registrado na auditoria.</div></div>
      <div id="a_previa" style="margin-top:14px"></div>`,
    rodape:`<button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-ok>Registrar ajuste</button>` });

  let prod = null;
  autocomplete($('#a_prod', m.body), buscaProduto, (p) => {
    prod = p; $('#a_prod', m.body).value = p.nome; $('#a_prod_id', m.body).value = p.id;
    $('#a_saldo', m.body).innerHTML = `Saldo atual: <b>${QTD(p.qtd_disponivel)}</b> un · custo médio ${BRL(p.custo_medio)}`;
    prev();
  }, fmtProd);
  const prev = () => {
    if (!prod) return;
    const q2 = N($('#a_qtd', m.body).value) * (+$('#a_tipo', m.body).value);
    const novo = N(prod.qtd_disponivel) + q2;
    $('#a_previa', m.body).innerHTML = `<div class="sumbox">
      <div class="sumrow"><span class="l">Saldo atual</span><span class="money">${QTD(prod.qtd_disponivel)} un</span></div>
      <div class="sumrow"><span class="l">Ajuste</span><span class="money ${q2 >= 0 ? 'pos' : 'neg'}">${q2 >= 0 ? '+' : ''}${QTD(q2)} un</span></div>
      <div class="sumrow tot"><span class="l">Saldo após</span>
        <span class="money ${novo < 0 ? 'neg' : ''}">${QTD(novo)} un${novo < 0 ? ' ⚠ inválido' : ''}</span></div>
      ${q2 < 0 ? `<div class="hint" style="margin-top:8px">Será lançada uma despesa de ${BRL(Math.abs(q2) * N(prod.custo_medio))} na categoria Perda de estoque.</div>` : ''}
    </div>`;
  };
  $('#a_qtd', m.body).oninput = prev; $('#a_tipo', m.body).onchange = prev;
  $('[data-x]', m.foot).onclick = m.fechar;
  $('[data-ok]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    if (!$('#a_prod_id', m.body).value) return bad('Produto obrigatório', 'Selecione o produto.');
    const qt = N($('#a_qtd', m.body).value) * (+$('#a_tipo', m.body).value);
    if (!qt) return bad('Quantidade inválida', 'Informe uma quantidade maior que zero.');
    const mo = $('#a_motivo', m.body).value.trim();
    if (mo.length < 5) return bad('Motivo obrigatório', 'Descreva o motivo com pelo menos 5 caracteres.');
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Registrando…';
    try { await rpc('fn_ajustar_estoque', { p_produto_id: $('#a_prod_id', m.body).value, p_quantidade: qt, p_motivo: mo, p_data: hoje() });
          m.fechar(); ok('Ajuste registrado'); navegar(); }
    catch (e) { bad('Não foi possível ajustar', erroAmigavel(e)); b.disabled = false; b.textContent = 'Registrar ajuste'; }
  };
}

/* ═══════════════ CADASTRO DE PESSOAS (Prompts 7 e 8) ═══════════════ */
const CAMPOS_PESSOA = {
  clientes:     { titulo:'Cliente',     rota:'clientes' },
  revendedores: { titulo:'Revendedor',  rota:'revendedores' },
  fornecedores: { titulo:'Fornecedor',  rota:'fornecedores' }
};

function formPessoa(tabela, p, aoSalvar, inicial) {
  const cfg = CAMPOS_PESSOA[tabela], novo = !p;
  if (novo && inicial) p = { ...inicial };
  const rev = tabela === 'revendedores', forn = tabela === 'fornecedores';
  const m = modal({
    titulo: novo ? `Novo ${cfg.titulo.toLowerCase()}` : `Editar · ${p.nome}`,
    corpo:`<div class="sec-t">Identificação</div>
    <div class="grid-f f2">
      <div><label>Nome ${forn ? '/ razão social' : 'completo'} <span style="color:var(--red)">*</span></label>
        <input class="inp" id="x_nome" value="${esc(p?.nome || '')}" maxlength="150"></div>
      <div><label>${forn ? 'CPF / CNPJ' : 'CPF'}</label>
        <input class="inp" id="x_cpf" value="${forn ? esc(p?.documento || '') : maskCPF(p?.cpf || '')}" placeholder="${forn ? '' : '000.000.000-00'}">
        <div class="hint" id="h_cpf"></div></div>
    </div>
    <div class="sec-t">Contato</div>
    <div class="grid-f f3">
      <div><label>Telefone</label><input class="inp" id="x_fone" value="${maskFone(p?.telefone || '')}" placeholder="(00) 00000-0000"></div>
      <div><label>WhatsApp</label><input class="inp" id="x_wa" value="${maskFone(p?.whatsapp || '')}" placeholder="(00) 00000-0000">
        <div class="hint"><a href="#" id="copiaFone">copiar do telefone</a></div></div>
      <div><label>E-mail</label><input class="inp" type="email" id="x_email" value="${esc(p?.email || '')}"></div>
    </div>
    <div class="sec-t">Endereço</div>
    <div class="grid-f f4">
      <div><label>CEP</label><input class="inp" id="x_cep" value="${maskCEP(p?.cep || '')}" placeholder="00000-000">
        <div class="hint" id="h_cep"></div></div>
      <div style="grid-column:span 2"><label>Logradouro</label><input class="inp" id="x_end" value="${esc(p?.endereco || '')}"></div>
      <div><label>Número</label><input class="inp" id="x_num" value="${esc(p?.numero || '')}"></div>
    </div>
    <div class="grid-f f4" style="margin-top:14px">
      <div><label>Complemento</label><input class="inp" id="x_comp" value="${esc(p?.complemento || '')}"></div>
      <div><label>Bairro</label><input class="inp" id="x_bairro" value="${esc(p?.bairro || '')}"></div>
      <div><label>Cidade</label><input class="inp" id="x_cid" value="${esc(p?.cidade || '')}"></div>
      <div><label>Estado</label><select class="inp" id="x_uf"><option value="">—</option>
        ${UFS.map(u => `<option ${p?.estado === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
    </div>
    ${rev ? `<div class="sec-t">Condições comerciais</div><div class="grid-f f3">
      <div><label>Prazo de acerto (dias)</label><input class="inp num" type="number" min="1" max="365" id="x_prazo" value="${N(p?.prazo_acerto_dias) || 30}">
        <div class="hint">Define a data prevista das remessas</div></div>
      <div><label>Limite de crédito</label><input class="inp num" type="number" step="0.01" min="0" id="x_lim" value="${N(p?.limite_credito).toFixed(2)}">
        <div class="hint">0 = sem limite</div></div>
      <div><label>Data de cadastro</label><input class="inp" type="date" id="x_dtcad" value="${dISO(p?.data_cadastro) || hoje()}"></div></div>` : ''}
    ${!forn && !rev ? `<div class="grid-f f2" style="margin-top:14px">
      <div><label>Data de nascimento</label><input class="inp" type="date" id="x_nasc" value="${dISO(p?.data_nascimento) || ''}">
        <div class="hint">Para campanhas de aniversário</div></div><div></div></div>` : ''}
    <div style="margin-top:14px"><label>Observações</label>
      <textarea class="inp" id="x_obs">${esc(p?.observacoes || '')}</textarea></div>
    <label class="chk" style="margin-top:14px"><input type="checkbox" id="x_ativo" ${p?.ativo !== false ? 'checked' : ''}> Cadastro ativo</label>`,
    rodape:`${!novo ? '<button class="btn btn-d btn-sm" data-del>Excluir</button>' : ''}<div class="sp"></div>
      <button class="btn btn-s" data-x>Cancelar</button><button class="btn btn-p" data-save>Salvar</button>`
  });

  const cpfEl = $('#x_cpf', m.body);
  if (!forn) cpfEl.addEventListener('input', () => {
    cpfEl.value = maskCPF(cpfEl.value);
    const d = digits(cpfEl.value), h = $('#h_cpf', m.body);
    if (!d) { h.textContent = ''; h.className = 'hint'; }
    else if (d.length < 11) { h.textContent = 'Digite os 11 dígitos'; h.className = 'hint'; }
    else if (validaCPF(d)) { h.textContent = '✓ CPF válido'; h.className = 'hint'; h.style.color = 'var(--green)'; }
    else { h.textContent = '✗ CPF inválido'; h.className = 'hint bad'; }
  });
  $('#x_fone', m.body).addEventListener('input', e => e.target.value = maskFone(e.target.value));
  $('#x_wa', m.body).addEventListener('input', e => e.target.value = maskFone(e.target.value));
  $('#copiaFone', m.body).onclick = (e) => { e.preventDefault(); $('#x_wa', m.body).value = $('#x_fone', m.body).value; };
  const cepEl = $('#x_cep', m.body);
  cepEl.addEventListener('input', async () => {
    cepEl.value = maskCEP(cepEl.value);
    const d = digits(cepEl.value);
    if (d.length !== 8) return;
    $('#h_cep', m.body).textContent = 'Buscando…';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then(x => x.json());
      if (r.erro) { $('#h_cep', m.body).textContent = 'CEP não encontrado'; return; }
      $('#x_end', m.body).value = r.logradouro || ''; $('#x_bairro', m.body).value = r.bairro || '';
      $('#x_cid', m.body).value = r.localidade || ''; $('#x_uf', m.body).value = r.uf || '';
      $('#h_cep', m.body).textContent = '✓ endereço preenchido';
      $('#x_num', m.body).focus();
    } catch (e) { $('#h_cep', m.body).textContent = ''; }
  });

  $('[data-x]', m.foot).onclick = m.fechar;
  if (!novo) $('[data-del]', m.foot).onclick = async () => {
    if (!await confirmar({ titulo:`Excluir ${cfg.titulo.toLowerCase()}`,
      mensagem:`Excluir <b>${esc(p.nome)}</b>?`,
      detalhes:'O histórico de operações é preservado. O cadastro apenas sai das listas.', textoBotao:'Excluir' })) return;
    try { await q(sb.from(tabela).update({ deleted_at:new Date().toISOString() }).eq('id', p.id));
          m.fechar(); ok('Cadastro excluído'); navegar(); }
    catch (e) { bad('Não foi possível excluir', erroAmigavel(e)); }
  };

  $('[data-save]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    const nome = $('#x_nome', m.body).value.trim();
    if (nome.length < 2) return bad('Nome obrigatório', 'Informe o nome.');
    const cpf = digits($('#x_cpf', m.body).value);
    if (!forn && cpf && !validaCPF(cpf)) return bad('CPF inválido', 'Confira os dígitos informados.');
    if (novo) {
      const iguais = await q(sb.from(tabela).select('id,nome').is('deleted_at', null).ilike('nome', `%${nome.split(' ')[0]}%`).limit(5));
      const parecido = iguais.find(x => x.nome.toLowerCase() === nome.toLowerCase());
      if (parecido && !await confirmar({ titulo:'Cadastro parecido encontrado', perigo:false, textoBotao:'Cadastrar assim mesmo',
        mensagem:`Já existe <b>${esc(parecido.nome)}</b> cadastrado.`, detalhes:'Cadastrar duas vezes a mesma pessoa divide o histórico em dois.' })) return;
    }
    const dados = {
      nome, telefone: digits($('#x_fone', m.body).value) || null, whatsapp: digits($('#x_wa', m.body).value) || null,
      email: $('#x_email', m.body).value.trim() || null, cidade: $('#x_cid', m.body).value.trim() || null,
      estado: $('#x_uf', m.body).value || null, endereco: $('#x_end', m.body).value.trim() || null,
      observacoes: $('#x_obs', m.body).value.trim() || null, ativo: $('#x_ativo', m.body).checked
    };
    if (forn) dados.documento = digits($('#x_cpf', m.body).value) || null;
    else {
      dados.cpf = cpf || null; dados.cep = digits($('#x_cep', m.body).value) || null;
      dados.numero = $('#x_num', m.body).value.trim() || null;
      dados.complemento = $('#x_comp', m.body).value.trim() || null;
      dados.bairro = $('#x_bairro', m.body).value.trim() || null;
    }
    if (rev) { dados.prazo_acerto_dias = N($('#x_prazo', m.body).value) || 30;
               dados.limite_credito = N($('#x_lim', m.body).value);
               dados.data_cadastro = $('#x_dtcad', m.body).value || hoje(); }
    if (tabela === 'clientes') dados.data_nascimento = $('#x_nasc', m.body).value || null;

    b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      const r = novo ? await q(sb.from(tabela).insert(dados).select().single())
                     : await q(sb.from(tabela).update(dados).eq('id', p.id).select().single());
      m.fechar(); ok(novo ? `${cfg.titulo} cadastrado` : 'Cadastro atualizado', nome);
      if (aoSalvar) aoSalvar(r); else navegar();
    } catch (e) { bad('Não foi possível salvar', erroAmigavel(e)); b.disabled = false; b.textContent = 'Salvar'; }
  };
}

/* ── Lista de clientes ── */
ROTAS.clientes = async (v, id) => {
  if (id) return fichaCliente(v, id);
  crumb('Clientes');
  const [cs, rk] = await Promise.all([
    q(sb.from('clientes').select('*').is('deleted_at', null).order('nome')),
    q(sb.from('vw_ranking_clientes').select('*'))
  ]);
  const dev = await q(sb.from('vw_titulos_receber').select('cliente_id,saldo,situacao_real').eq('situacao','ABERTO').not('cliente_id','is',null));
  const porCli = {}; dev.forEach(t => { porCli[t.cliente_id] = porCli[t.cliente_id] || { s:0, v:0 };
    porCli[t.cliente_id].s += N(t.saldo); if (/VENCIDO/.test(t.situacao_real)) porCli[t.cliente_id].v += N(t.saldo); });
  const mapa = Object.fromEntries(rk.map(r => [r.id, r]));
  const totDev = Object.values(porCli).reduce((a, x) => a + x.s, 0);

  v.innerHTML = `
  <div class="page-head"><h1>Clientes<small>${cs.length} cadastrado(s)</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-p" id="novoBtn">+ Novo cliente</button></div></div>
  <div class="kpis k4">
    <div class="kpi"><div class="lab">Clientes</div><div class="val">${cs.length}</div></div>
    <div class="kpi"><div class="lab">Com compras</div><div class="val">${rk.filter(r => N(r.qtd_compras) > 0).length}</div></div>
    <div class="kpi amber"><div class="lab">Saldo devedor</div><div class="val">${BRL(totDev)}</div></div>
    <div class="kpi green"><div class="lab">Total comprado</div>
      <div class="val">${BRL(rk.reduce((a, r) => a + N(r.valor_total_comprado), 0))}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por nome, CPF ou telefone…">
      <label class="chk"><input type="checkbox" id="fdev"> Só com saldo devedor</label></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Cliente</th><th>CPF</th><th>WhatsApp</th><th>Cidade</th><th class="c">Compras</th>
      <th class="r">Total comprado</th><th class="r">Saldo devedor</th><th></th></tr></thead>
      <tbody id="tb"></tbody></table></div><div class="pager"><span id="cnt"></span></div></div>`;

  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase(), sd = $('#fdev').checked;
    const f = cs.filter(c => (!t || (c.nome + ' ' + (c.cpf || '') + ' ' + (c.whatsapp || '')).toLowerCase().includes(t)) &&
      (!sd || N(porCli[c.id]?.s) > 0));
    $('#cnt').textContent = `${f.length} de ${cs.length} cliente(s)`;
    $('#tb').innerHTML = f.length ? f.map(c => { const r = mapa[c.id] || {}, d = porCli[c.id] || { s:0, v:0 };
      return `<tr>
      <td><a href="#clientes/${c.id}"><b>${esc(c.nome)}</b></a>
        <span style="display:block;font-size:11.5px;color:var(--mute)" class="num">#${c.codigo}</span></td>
      <td class="num">${c.cpf ? maskCPF(c.cpf) : '—'}</td>
      <td class="num">${c.whatsapp ? `<a href="https://wa.me/55${c.whatsapp}" target="_blank">${maskFone(c.whatsapp)}</a>` : '—'}</td>
      <td>${esc(c.cidade || '—')}${c.estado ? '/' + esc(c.estado) : ''}</td>
      <td class="c">${N(r.qtd_compras) || 0}</td>
      <td class="r money">${BRL(r.valor_total_comprado)}</td>
      <td class="r money ${d.v > 0 ? 'neg' : ''}">${d.s > 0 ? BRL(d.s) + (d.v > 0 ? ' ⚠' : '') : '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-ed="${c.id}">✎</button></td></tr>`; }).join('')
      : `<tr><td colspan="8">${vazio('👤','Nenhum cliente','Cadastre o primeiro cliente para começar a vender.')}</td></tr>`;
    $$('[data-ed]').forEach(b => b.onclick = () => formPessoa('clientes', cs.find(x => x.id === b.dataset.ed)));
  };
  ['#fq','#fdev'].forEach(s => $(s).addEventListener('input', pintar));
  $('#novoBtn').onclick = () => formPessoa('clientes', null);
  $('#expBtn').onclick = () => exportarExcel('clientes', [
    { t:'Código', v:c => c.codigo }, { t:'Nome', v:c => c.nome }, { t:'CPF', v:c => c.cpf ? maskCPF(c.cpf) : '' },
    { t:'Telefone', v:c => c.telefone ? maskFone(c.telefone) : '' }, { t:'WhatsApp', v:c => c.whatsapp ? maskFone(c.whatsapp) : '' },
    { t:'E-mail', v:c => c.email || '' }, { t:'Cidade', v:c => c.cidade || '' }, { t:'UF', v:c => c.estado || '' },
    { t:'Total comprado', v:c => N(mapa[c.id]?.valor_total_comprado) }, { t:'Saldo devedor', v:c => N(porCli[c.id]?.s) }], cs);
  pintar();
};

async function fichaCliente(v, id) {
  const [c, vendas, titulos] = await Promise.all([
    q(sb.from('clientes').select('*').eq('id', id).single()),
    q(sb.from('vendas').select('*,venda_itens(quantidade,produtos(nome))').eq('cliente_id', id).order('data_venda', { ascending:false })),
    q(sb.from('vw_titulos_receber').select('*').eq('cliente_id', id).order('data_vencimento'))
  ]);
  crumb(`Clientes › ${c.nome}`);
  const conf = vendas.filter(x => x.status === 'CONFIRMADO');
  const tot = conf.reduce((a, x) => a + N(x.valor_total), 0);
  const abertos = titulos.filter(t => t.situacao === 'ABERTO');
  const saldo = abertos.reduce((a, t) => a + N(t.saldo), 0);
  const vencido = abertos.filter(t => /VENCIDO/.test(t.situacao_real)).reduce((a, t) => a + N(t.saldo), 0);

  v.innerHTML = `
  <div class="page-head"><h1>${esc(c.nome)}<small>Cliente #${c.codigo}${c.cpf ? ' · ' + maskCPF(c.cpf) : ''}${c.cidade ? ' · ' + esc(c.cidade) + '/' + esc(c.estado || '') : ''}</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#clientes">← Voltar</a>
      ${c.whatsapp ? `<a class="btn btn-g btn-sm" target="_blank" href="https://wa.me/55${c.whatsapp}">WhatsApp</a>` : ''}
      <button class="btn btn-p btn-sm" id="edBtn">✎ Editar</button></div></div>
  <div class="kpis k5">
    <div class="kpi green"><div class="lab">Total comprado</div><div class="val">${BRL(tot)}</div></div>
    <div class="kpi"><div class="lab">Compras</div><div class="val">${conf.length}</div></div>
    <div class="kpi"><div class="lab">Ticket médio</div><div class="val">${BRL(conf.length ? tot / conf.length : 0)}</div></div>
    <div class="kpi ${saldo > 0 ? 'amber' : ''}"><div class="lab">Saldo devedor</div><div class="val">${BRL(saldo)}</div></div>
    <div class="kpi ${vencido > 0 ? 'red' : ''}"><div class="lab">Vencido</div><div class="val">${BRL(vencido)}</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Compras</h3></div><div class="tw"><table class="dt"><thead><tr>
    <th>Nº</th><th>Data</th><th>Itens</th><th class="r">Total</th><th class="c">Parcelas</th><th class="c">Situação</th><th></th></tr></thead><tbody>
    ${vendas.length ? vendas.map(x => `<tr>
      <td class="num"><a href="#vendas/${x.id}"><b>${x.numero}</b></a></td><td class="nw">${dBR(x.data_venda)}</td>
      <td style="font-size:12.5px">${esc(x.venda_itens.map(i => `${QTD(i.quantidade)}× ${i.produtos?.nome}`).join(', ').slice(0, 60))}</td>
      <td class="r money">${BRL(x.valor_total)}</td><td class="c">${x.qtd_parcelas}×</td>
      <td class="c"><span class="tag ${x.status === 'CONFIRMADO' ? 'g' : x.status === 'CANCELADO' ? 'r' : 'a'}">
        ${{RASCUNHO:'Rascunho',CONFIRMADO:'Confirmada',CANCELADO:'Cancelada'}[x.status]}</span></td>
      <td><button class="btn btn-ghost btn-sm" data-rec="${x.id}" title="Recibo">🧾</button></td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('🛒','Nenhuma compra','Este cliente ainda não comprou.')}</td></tr>`}
  </tbody></table></div></div>
  <div class="card"><div class="card-h"><h3>Financeiro</h3></div><div class="tw"><table class="dt"><thead><tr>
    <th>Vencimento</th><th>Origem</th><th class="c">Parcela</th><th class="r">Valor</th><th class="r">Recebido</th>
    <th class="r">Saldo</th><th class="c">Situação</th><th></th></tr></thead><tbody>
    ${titulos.length ? titulos.map(t => `<tr>
      <td class="nw">${dBR(t.data_vencimento)}</td>
      <td>${t.venda_numero ? `<a href="#vendas/${t.venda_id}">Venda ${t.venda_numero}</a>` : '—'}</td>
      <td class="c">${t.numero_parcela}/${t.total_parcelas}</td>
      <td class="r money">${BRL(t.valor_original)}</td><td class="r money">${BRL(t.valor_recebido)}</td>
      <td class="r money"><b>${BRL(t.saldo)}</b></td>
      <td class="c">${tagSituacao(t.situacao_real, t.dias_atraso)}</td>
      <td class="nw">${t.situacao === 'ABERTO'
        ? `<button class="btn btn-s btn-sm" data-vc="${t.id}" title="Alterar vencimento">📅</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('💰','Nada a receber','Este cliente não tem parcelas em aberto.')}</td></tr>`}
  </tbody></table></div></div>
  ${c.observacoes ? `<div class="card"><div class="card-b"><b style="font-size:12px;color:var(--mute)">OBSERVAÇÕES</b>
    <p style="margin-top:6px">${esc(c.observacoes)}</p></div></div>` : ''}`;
  $('#edBtn').onclick = () => formPessoa('clientes', c);
  $$('[data-rec]').forEach(b => b.onclick = () => reciboVenda(b.dataset.rec));
  $$('[data-vc]').forEach(b => b.onclick = () =>
    formVencimento(titulos.find(t => t.id === b.dataset.vc), () => navegar()));
}

function tagSituacao(s, dias) {
  const M = { PAGO:['g','Pago'], VENCIDO:['r','Vencido'], PARCIAL_VENCIDO:['r','Parcial vencido'],
    PARCIAL:['a','Parcial'], VENCE_EM_BREVE:['a','Vence em breve'], A_VENCER:['b','A vencer'], CANCELADO:['n','Cancelado'] };
  const [cor, txt] = M[s] || ['n', s];
  return `<span class="tag ${cor}">${txt}${/VENCIDO/.test(s) && dias > 0 ? ` (${dias}d)` : ''}</span>`;
}

/* ── Fornecedores ── */
ROTAS.fornecedores = async (v) => {
  crumb('Fornecedores');
  const [fs, cps] = await Promise.all([
    q(sb.from('fornecedores').select('*').is('deleted_at', null).order('nome')),
    q(sb.from('compras').select('fornecedor_id,custo_total,data_compra,status'))
  ]);
  const agg = {}; cps.filter(c => c.status === 'CONFIRMADO').forEach(c => {
    agg[c.fornecedor_id] = agg[c.fornecedor_id] || { n:0, v:0, u:null };
    agg[c.fornecedor_id].n++; agg[c.fornecedor_id].v += N(c.custo_total);
    if (!agg[c.fornecedor_id].u || c.data_compra > agg[c.fornecedor_id].u) agg[c.fornecedor_id].u = c.data_compra; });

  v.innerHTML = `
  <div class="page-head"><h1>Fornecedores<small>${fs.length} cadastrado(s)</small></h1>
    <div class="acts"><button class="btn btn-p" id="novoBtn">+ Novo fornecedor</button></div></div>
  <div class="card"><div class="filters"><input class="inp grow" id="fq" placeholder="🔍 Buscar…"></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Fornecedor</th><th>Documento</th><th>Telefone</th><th>Cidade</th>
      <th class="c">Compras</th><th class="r">Total comprado</th><th>Última compra</th><th></th></tr></thead>
      <tbody id="tb"></tbody></table></div><div class="pager"><span id="cnt"></span></div></div>`;
  const pintar = () => {
    const t = $('#fq').value.trim().toLowerCase();
    const f = fs.filter(x => !t || (x.nome + ' ' + (x.documento || '')).toLowerCase().includes(t));
    $('#cnt').textContent = `${f.length} fornecedor(es)`;
    $('#tb').innerHTML = f.length ? f.map(x => { const a = agg[x.id] || { n:0, v:0, u:null }; return `<tr>
      <td><b>${esc(x.nome)}</b></td><td class="num">${esc(x.documento || '—')}</td>
      <td class="num">${x.telefone ? maskFone(x.telefone) : '—'}</td>
      <td>${esc(x.cidade || '—')}${x.estado ? '/' + esc(x.estado) : ''}</td>
      <td class="c">${a.n}</td><td class="r money">${BRL(a.v)}</td><td class="nw">${dBR(a.u)}</td>
      <td><button class="btn btn-ghost btn-sm" data-ed="${x.id}">✎</button></td></tr>`; }).join('')
      : `<tr><td colspan="8">${vazio('🏭','Nenhum fornecedor','Cadastre de quem você compra.')}</td></tr>`;
    $$('[data-ed]').forEach(b => b.onclick = () => formPessoa('fornecedores', fs.find(x => x.id === b.dataset.ed)));
  };
  $('#fq').addEventListener('input', pintar);
  $('#novoBtn').onclick = () => formPessoa('fornecedores', null);
  pintar();
};
