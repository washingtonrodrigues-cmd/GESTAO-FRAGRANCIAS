/* ═══════════════ REVENDEDORES (Prompt 8) ═══════════════ */
ROTAS.revendedores = async (v, id, aba) => {
  if (id) return fichaRevendedor(v, id, aba);
  crumb('Revendedores');
  const rs = await q(sb.from('vw_extrato_revendedor').select('*').order('nome'));
  const t = (f) => rs.reduce((a, r) => a + N(r[f]), 0);

  v.innerHTML = `
  <div class="page-head"><h1>Revendedores<small>${rs.length} cadastrado(s)</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <button class="btn btn-p" id="novoBtn">+ Novo revendedor</button></div></div>
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Revendedores</div><div class="val">${rs.length}</div></div>
    <div class="kpi violet"><div class="lab">Em poder deles</div><div class="val">${BRL(t('valor_custo_em_posse'))}</div>
      <div class="sub">${QTD(t('qtd_em_posse'))} unidades</div></div>
    <div class="kpi green"><div class="lab">Total vendido</div><div class="val">${BRL(t('valor_vendido_total'))}</div></div>
    <div class="kpi amber"><div class="lab">Saldo em aberto</div><div class="val">${BRL(t('saldo_aberto'))}</div></div>
    <div class="kpi red"><div class="lab">Vencido</div><div class="val">${BRL(t('saldo_vencido'))}</div></div>
  </div>
  <div class="card"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar por nome ou cidade…">
      <label class="chk"><input type="checkbox" id="fposse"> Só com produtos em posse</label>
      <label class="chk"><input type="checkbox" id="fvenc"> Só com saldo vencido</label></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Revendedor</th><th>Cidade</th><th class="c">Em posse</th><th class="r">Valor em posse</th>
      <th class="r">Total vendido</th><th class="r">Em aberto</th><th class="r">Vencido</th>
      <th class="c">Último acerto</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
    <div class="pager"><span id="cnt"></span></div></div>`;

  const pintar = () => {
    const t2 = $('#fq').value.trim().toLowerCase(), fp = $('#fposse').checked, fv = $('#fvenc').checked;
    const f = rs.filter(r => (!t2 || (r.nome + ' ' + (r.cidade || '')).toLowerCase().includes(t2)) &&
      (!fp || N(r.qtd_em_posse) > 0) && (!fv || N(r.saldo_vencido) > 0));
    $('#cnt').textContent = `${f.length} de ${rs.length} revendedor(es)`;
    $('#tb').innerHTML = f.length ? f.map(r => {
      const atras = N(r.dias_max_em_posse) > 60;
      return `<tr style="${N(r.saldo_vencido) > 0 ? 'background:#fffbfb' : atras ? 'background:#fffdf5' : ''}">
      <td><a href="#revendedores/${r.id}"><b>${esc(r.nome)}</b></a>
        <span style="display:block;font-size:11.5px;color:var(--mute)" class="num">#${r.codigo}</span></td>
      <td>${esc(r.cidade || '—')}${r.estado ? '/' + esc(r.estado) : ''}</td>
      <td class="c">${N(r.qtd_em_posse) ? `<b>${QTD(r.qtd_em_posse)}</b>${atras ? ' ⏳' : ''}` : '—'}</td>
      <td class="r money">${N(r.valor_custo_em_posse) ? BRL(r.valor_custo_em_posse) : '—'}</td>
      <td class="r money">${BRL(r.valor_vendido_total)}</td>
      <td class="r money">${N(r.saldo_aberto) ? BRL(r.saldo_aberto) : '—'}</td>
      <td class="r money ${N(r.saldo_vencido) > 0 ? 'neg' : ''}">${N(r.saldo_vencido) ? BRL(r.saldo_vencido) : '—'}</td>
      <td class="c" style="font-size:12px">${r.ultimo_acerto ? dBR(r.ultimo_acerto) : '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-ed="${r.id}">✎</button></td></tr>`; }).join('')
      : `<tr><td colspan="9">${vazio('🤝','Nenhum revendedor','Cadastre quem revende seus produtos.')}</td></tr>`;
    $$('[data-ed]').forEach(b => b.onclick = async () => {
      const p = await q(sb.from('revendedores').select('*').eq('id', b.dataset.ed).single());
      formPessoa('revendedores', p); });
  };
  ['#fq','#fposse','#fvenc'].forEach(s => $(s).addEventListener('input', pintar));
  $('#novoBtn').onclick = () => formPessoa('revendedores', null);
  $('#expBtn').onclick = () => exportarExcel('revendedores', [
    { t:'Código', v:r => r.codigo }, { t:'Nome', v:r => r.nome }, { t:'Cidade', v:r => r.cidade || '' },
    { t:'UF', v:r => r.estado || '' }, { t:'WhatsApp', v:r => r.whatsapp ? maskFone(r.whatsapp) : '' },
    { t:'Recebidos', v:r => N(r.qtd_total_recebida) }, { t:'Vendidos', v:r => N(r.qtd_vendida) },
    { t:'Devolvidos', v:r => N(r.qtd_devolvida) }, { t:'Perdidos', v:r => N(r.qtd_perdida) },
    { t:'Em posse', v:r => N(r.qtd_em_posse) }, { t:'Valor em posse', v:r => N(r.valor_custo_em_posse) },
    { t:'Total vendido', v:r => N(r.valor_vendido_total) }, { t:'Total pago', v:r => N(r.total_pago) },
    { t:'Em aberto', v:r => N(r.saldo_aberto) }, { t:'Vencido', v:r => N(r.saldo_vencido) }], rs);
  pintar();
};

async function fichaRevendedor(v, id, aba) {
  const [r, posse, remessas, titulos, prests, recs, itens] = await Promise.all([
    q(sb.from('vw_extrato_revendedor').select('*').eq('id', id).single()),
    q(sb.from('vw_itens_em_posse').select('*').eq('revendedor_id', id).order('dias_em_posse', { ascending:false })),
    q(sb.from('remessas').select('*,remessa_itens(*,produtos(nome,codigo))').eq('revendedor_id', id).order('data_envio', { ascending:false })),
    q(sb.from('vw_titulos_receber').select('*').eq('revendedor_id', id).order('data_vencimento')),
    q(sb.from('prestacoes_contas').select('*').eq('revendedor_id', id).order('data_acerto', { ascending:false })),
    q(sb.from('recebimentos').select('*,formas_pagamento(nome)').eq('revendedor_id', id).order('data_recebimento', { ascending:false })),
    q(sb.from('vw_itens_revendedor').select('*').eq('revendedor_id', id).order('data', { ascending:false }))
  ]);
  crumb(`Revendedores › ${r.nome}`);
  const atras = N(r.dias_max_em_posse) > 60;
  const somaSit = (sit) => itens.filter(x => x.situacao === sit).reduce((a, x) => a + N(x.valor_total), 0);

  // Extrato cronológico com saldo corrido
  const mov = [];
  prests.filter(p => p.status === 'CONFIRMADO').forEach(p => mov.push({
    d:p.data_acerto, doc:`Prestação nº ${p.numero}`,
    h:`${QTD(p.qtd_vendida)} item(ns) vendido(s)`, deb:N(p.valor_devido), cred:0 }));
  await Promise.all([]);
  const vendasDiretas = await q(sb.from('vendas').select('*').eq('revendedor_id', id).eq('status','CONFIRMADO'));
  vendasDiretas.forEach(x => mov.push({ d:x.data_venda, doc:`Venda nº ${x.numero}`, h:'Venda direta', deb:N(x.valor_total), cred:0 }));
  recs.filter(x => !x.estornado).forEach(x => mov.push({
    d:x.data_recebimento, doc:`Recebimento nº ${x.numero}`, h:x.formas_pagamento?.nome || '', deb:0, cred:N(x.valor_total) }));
  mov.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  let sal = 0; mov.forEach(m => { sal += m.deb - m.cred; m.saldo = sal; });

  v.innerHTML = `
  <div class="page-head"><h1>${esc(r.nome)}<small>Revendedor #${r.codigo}${r.cidade ? ' · ' + esc(r.cidade) + '/' + esc(r.estado || '') : ''}${r.ultimo_acerto ? ' · último acerto em ' + dBR(r.ultimo_acerto) : ' · nunca prestou contas'}</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#revendedores">← Voltar</a>
      ${r.whatsapp ? `<a class="btn btn-g btn-sm" target="_blank" href="https://wa.me/55${r.whatsapp}">WhatsApp</a>` : ''}
      <button class="btn btn-s btn-sm" id="edBtn">✎ Editar</button>
      <button class="btn btn-s btn-sm" id="remBtn">+ Nova remessa</button>
      ${N(r.qtd_em_posse) > 0 ? '<button class="btn btn-p btn-sm" id="pcBtn">📋 Prestação de contas</button>' : ''}</div></div>

  ${atras ? `<div class="alert warn"><span>⏳</span><div><b>Há produtos com este revendedor há ${r.dias_max_em_posse} dias.</b>
    Considere fazer a prestação de contas.</div></div>` : ''}
  ${N(r.saldo_vencido) > 0 ? `<div class="alert bad"><span>⚠</span><div><b>${BRL(r.saldo_vencido)} vencido.</b>
    ${r.whatsapp ? `<a href="https://wa.me/55${r.whatsapp}?text=${encodeURIComponent(msgCobranca(r))}" target="_blank" style="color:inherit;text-decoration:underline">Cobrar pelo WhatsApp</a>` : ''}</div></div>` : ''}

  <div class="kpis k4">
    <div class="kpi violet"><div class="lab">Em poder dele(a)</div><div class="val">${QTD(r.qtd_em_posse)} un</div>
      <div class="sub">custo ${BRL(r.valor_custo_em_posse)} · revenda ${BRL(r.valor_revenda_em_posse)}</div></div>
    <div class="kpi"><div class="lab">Movimento</div><div class="val" style="font-size:15px">
      ${QTD(r.qtd_total_recebida)} recebidos</div>
      <div class="sub">${QTD(r.qtd_vendida)} vendidos · ${QTD(r.qtd_devolvida)} devolvidos · ${QTD(r.qtd_perdida)} perdidos</div></div>
    <div class="kpi green"><div class="lab">Total vendido</div><div class="val">${BRL(r.valor_vendido_total)}</div>
      <div class="sub">consignação ${BRL(r.valor_vendido_consignacao)} · direto ${BRL(r.valor_vendido_direto)}</div></div>
    <div class="kpi ${N(r.saldo_aberto) > 0 ? 'amber' : 'green'}"><div class="lab">Situação financeira</div>
      <div class="val">${BRL(r.saldo_aberto)}</div>
      <div class="sub">devido ${BRL(r.total_devido)} · pago ${BRL(r.total_pago)}${
        N(r.saldo_credito) ? ' · 🎟 crédito ' + BRL(r.saldo_credito) : ''}</div></div>
  </div>

  <div class="tabs">
    <button class="on" data-t="posse">Em posse (${posse.length})</button>
    <button data-t="tudo">Todos os produtos (${itens.length})</button>
    <button data-t="ext">Extrato financeiro</button>
    <button data-t="rem">Remessas (${remessas.length})</button>
    <button data-t="pc">Prestações (${prests.length})</button>
    <button data-t="fin">Parcelas (${titulos.length})</button></div>

  <div class="card" data-p="posse"><div class="card-h"><h3>Produtos em poder do revendedor</h3>
    ${posse.length ? '<button class="btn btn-s btn-sm" id="prPosse">🖨 Imprimir</button>' : ''}</div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Produto</th><th>Remessa</th><th>Enviado em</th><th class="c">Qtd</th>
      <th class="r">Custo</th><th class="r">Revenda</th><th class="c">Dias</th></tr></thead><tbody>
    ${posse.length ? posse.map(p => `<tr>
      <td><a href="#produtos/${p.produto_id}" class="pnome"><div class="ph">🌸</div><div style="min-width:0">
        <b>${esc(p.produto_nome)}</b><span>${esc(p.produto_codigo)}</span></div></a></td>
      <td><a href="#mostruarios/${p.remessa_id}">nº ${p.remessa_numero}</a>
        <span class="tag ${p.tipo_remessa === 'MOSTRUARIO' ? 'a' : 'v'}" style="font-size:10px">${p.tipo_remessa === 'MOSTRUARIO' ? 'Mostruário' : 'Consignação'}</span></td>
      <td class="nw">${dBR(p.data_envio)}</td><td class="c"><b>${QTD(p.qtd_em_posse)}</b></td>
      <td class="r money">${BRL(p.valor_custo_total)}</td><td class="r money">${BRL(p.valor_revenda_total)}</td>
      <td class="c"><span class="tag ${p.dias_em_posse > 60 ? 'r' : p.dias_em_posse > 30 ? 'a' : 'g'}">${p.dias_em_posse}</span></td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('📦','Nada em posse','Este revendedor não está com nenhum produto.')}</td></tr>`}
    </tbody>${posse.length ? `<tfoot><tr style="background:#fbfcfe;font-weight:700">
      <td colspan="3">Total</td><td class="c">${QTD(r.qtd_em_posse)}</td>
      <td class="r money">${BRL(r.valor_custo_em_posse)}</td><td class="r money">${BRL(r.valor_revenda_em_posse)}</td><td></td></tr></tfoot>` : ''}
    </table></div></div>

  <div class="card" data-p="tudo" style="display:none"><div class="card-h"><h3>Todos os produtos que já pegou</h3>
    <span class="tag g">pago ${BRL(somaSit('PAGO'))}</span>
    <span class="tag a">a pagar ${BRL(somaSit('A_PAGAR'))}</span>
    <button class="btn btn-s btn-sm" id="prTudo">🖨 Imprimir</button>
    <button class="btn btn-s btn-sm" id="exTudo">📊 Excel</button></div>
    <div class="filters"><select class="inp" id="fsit">
      <option value="">Todas as situações</option>
      <option value="PAGO">Pagos</option><option value="A_PAGAR">A pagar</option>
      <option value="DEVOLVIDO">Devolvidos</option><option value="EM_POSSE">Em posse</option>
      <option value="AMOSTRA">Mostruário</option><option value="PERDIDO">Perdidos</option>
      <option value="AMOSTRA_FINALIZADA">Mostruário finalizado</option></select>
      <input class="inp grow" id="ftq" placeholder="🔍 Buscar produto…"></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Origem</th><th>Data</th><th>Produto</th><th class="c">Situação</th><th class="c">Qtd</th>
      <th class="r">Preço unit.</th><th class="r">Total</th></tr></thead><tbody id="tbTudo"></tbody></table></div>
    <div class="pager"><span id="cntTudo"></span></div></div>

  <div class="card" data-p="ext" style="display:none"><div class="card-h"><h3>Extrato financeiro</h3>
    <button class="btn btn-s btn-sm" id="prExt">🖨 Imprimir</button>
    <button class="btn btn-s btn-sm" id="exExt">📊 Excel</button></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Data</th><th>Documento</th><th>Histórico</th><th class="r">Débito</th><th class="r">Crédito</th>
      <th class="r">Saldo</th></tr></thead><tbody>
    ${mov.length ? mov.map(m => `<tr>
      <td class="nw">${dBR(m.d)}</td><td>${esc(m.doc)}</td><td style="color:var(--mute)">${esc(m.h)}</td>
      <td class="r money">${m.deb ? BRL(m.deb) : ''}</td>
      <td class="r money pos">${m.cred ? BRL(m.cred) : ''}</td>
      <td class="r money"><b>${BRL(m.saldo)}</b></td></tr>`).join('')
      : `<tr><td colspan="6">${vazio('📄','Sem movimentação','Nenhum lançamento financeiro ainda.')}</td></tr>`}
    </tbody>${mov.length ? `<tfoot><tr style="background:#fbfcfe;font-weight:700">
      <td colspan="5">Saldo devedor atual</td><td class="r money">${BRL(sal)}</td></tr></tfoot>` : ''}
    </table></div></div>

  <div class="card" data-p="rem" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Nº</th><th>Tipo</th><th>Envio</th><th class="c">Enviados</th><th class="c">Em posse</th>
    <th class="r">Custo</th><th class="r">Revenda</th><th class="c">Situação</th></tr></thead><tbody>
    ${remessas.length ? remessas.map(x => `<tr>
      <td class="num"><a href="#mostruarios/${x.id}"><b>${x.numero}</b></a></td>
      <td><span class="tag ${x.tipo === 'MOSTRUARIO' ? 'a' : 'v'}">${x.tipo === 'MOSTRUARIO' ? 'Mostruário' : 'Consignação'}</span></td>
      <td class="nw">${dBR(x.data_envio)}</td><td class="c">${QTD(x.qtd_total_enviada)}</td>
      <td class="c"><b>${QTD(x.qtd_em_posse)}</b></td>
      <td class="r money">${BRL(x.valor_custo_total)}</td><td class="r money">${BRL(x.valor_revenda_total)}</td>
      <td class="c">${x.status === 'CANCELADO' ? '<span class="tag r">Cancelada</span>'
        : x.status === 'RASCUNHO' ? '<span class="tag a">Rascunho</span>'
        : x.encerrada ? '<span class="tag n">Encerrada</span>' : '<span class="tag g">Aberta</span>'}</td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('📦','Nenhuma remessa','Envie produtos em mostruário ou consignação.')}</td></tr>`}
  </tbody></table></div></div>

  <div class="card" data-p="pc" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Nº</th><th>Data</th><th class="c">Vendidos</th><th class="c">Devolvidos</th><th class="c">Perdidos</th>
    <th class="r">Valor devido</th><th class="r">Lucro</th><th></th></tr></thead><tbody>
    ${prests.length ? prests.map(p => `<tr>
      <td class="num"><b>${p.numero}</b></td><td class="nw">${dBR(p.data_acerto)}</td>
      <td class="c">${QTD(p.qtd_vendida)}</td><td class="c">${QTD(p.qtd_devolvida)}</td>
      <td class="c ${N(p.qtd_perdida) ? 'neg' : ''}">${QTD(p.qtd_perdida)}</td>
      <td class="r money"><b>${BRL(p.valor_devido)}</b></td>
      <td class="r money pos">${BRL(p.lucro_bruto)}</td>
      <td><button class="btn btn-ghost btn-sm" data-pc="${p.id}" title="Imprimir">🖨</button></td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('📋','Nenhuma prestação','Faça o primeiro acerto quando o revendedor reportar as vendas.')}</td></tr>`}
  </tbody></table></div></div>

  <div class="card" data-p="fin" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Vencimento</th><th>Origem</th><th class="c">Parcela</th><th class="r">Valor</th>
    <th class="r">Recebido</th><th class="r">Saldo</th><th class="c">Situação</th><th></th></tr></thead><tbody>
    ${titulos.length ? titulos.map(t => `<tr>
      <td class="nw">${dBR(t.data_vencimento)}</td>
      <td>${t.prestacao_numero ? 'Prestação nº ' + t.prestacao_numero : t.venda_numero ? 'Venda nº ' + t.venda_numero : '—'}</td>
      <td class="c">${t.numero_parcela}/${t.total_parcelas}</td>
      <td class="r money">${BRL(t.valor_original)}</td><td class="r money">${BRL(t.valor_recebido)}</td>
      <td class="r money"><b>${BRL(t.saldo)}</b></td>
      <td class="c">${tagSituacao(t.situacao_real, t.dias_atraso)}</td>
      <td class="nw">${t.situacao === 'ABERTO'
        ? `<button class="btn btn-s btn-sm" data-vc="${t.id}" title="Alterar vencimento">📅</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="8">${vazio('💰','Nada a receber','Este revendedor não tem parcelas em aberto.')}</td></tr>`}
  </tbody></table></div></div>`;

  const TAGSIT = { PAGO:'g', A_PAGAR:'a', DEVOLVIDO:'b', PERDIDO:'r', EM_POSSE:'n', AMOSTRA:'n', AMOSTRA_FINALIZADA:'n' };
  const pintarTudo = () => {
    const sit = $('#fsit').value, t = $('#ftq').value.trim().toLowerCase();
    const f = itens.filter(x => (!sit || x.situacao === sit)
      && (!t || (x.produto_nome + ' ' + x.produto_codigo).toLowerCase().includes(t)));
    $('#cntTudo').textContent = `${f.length} linha(s) · ${QTD(f.reduce((a, x) => a + N(x.quantidade), 0))} un · ${BRL(f.reduce((a, x) => a + N(x.valor_total), 0))}`;
    $('#tbTudo').innerHTML = f.length ? f.map(x => `<tr>
      <td>${esc(x.documento)}</td><td class="nw">${dBR(x.data)}</td>
      <td><b>${esc(x.produto_nome)}</b>
        <span style="display:block;font-size:11px;color:var(--mute)" class="num">${esc(x.produto_codigo)}</span></td>
      <td class="c"><span class="tag ${TAGSIT[x.situacao] || 'n'}">${esc(x.situacao_label)}</span></td>
      <td class="c">${QTD(x.quantidade)}</td>
      <td class="r money">${BRL(x.valor_unitario)}</td>
      <td class="r money"><b>${BRL(x.valor_total)}</b></td></tr>`).join('')
      : `<tr><td colspan="7">${vazio('📦','Nada aqui','Este revendedor ainda não pegou produto nenhum.')}</td></tr>`;
  };
  ['#fsit','#ftq'].forEach(x => $(x).addEventListener('input', pintarTudo));
  pintarTudo();
  $('#prTudo').onclick = () => imprimir(docItensRevendedor(r, itens));
  $('#exTudo').onclick = () => exportarExcel(`produtos-${r.nome.replace(/\s+/g,'-').toLowerCase()}`, [
    { t:'Origem', v:x => x.documento }, { t:'Data', v:x => dBR(x.data) },
    { t:'Código', v:x => x.produto_codigo }, { t:'Produto', v:x => x.produto_nome },
    { t:'Situação', v:x => x.situacao_label }, { t:'Quantidade', v:x => N(x.quantidade) },
    { t:'Preço unitário', v:x => N(x.valor_unitario) }, { t:'Total', v:x => N(x.valor_total) }], itens);

  $$('[data-vc]').forEach(b => b.onclick = () =>
    formVencimento(titulos.find(t => t.id === b.dataset.vc), () => navegar()));
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-p]').forEach(c => c.style.display = c.dataset.p === b.dataset.t ? '' : 'none');
  });
  if (aba) { const b = $(`.tabs button[data-t="${aba}"]`); if (b) b.click(); }
  $('#edBtn').onclick = async () => formPessoa('revendedores', await q(sb.from('revendedores').select('*').eq('id', id).single()));
  $('#remBtn').onclick = () => location.hash = `#mostruarios/nova/${id}`;
  const pc = $('#pcBtn'); if (pc) pc.onclick = () => prestacaoContas(r, posse);
  const pp = $('#prPosse'); if (pp) pp.onclick = () => imprimir(docPosse(r, posse));
  $('#prExt').onclick = () => imprimir(docExtrato(r, mov, sal));
  $('#exExt').onclick = () => exportarExcel(`extrato-${r.nome.replace(/\s+/g,'-').toLowerCase()}`, [
    { t:'Data', v:m => dBR(m.d) }, { t:'Documento', v:m => m.doc }, { t:'Histórico', v:m => m.h },
    { t:'Débito', v:m => m.deb }, { t:'Crédito', v:m => m.cred }, { t:'Saldo', v:m => m.saldo }], mov);
  $$('[data-pc]').forEach(b => b.onclick = () => imprimirPrestacao(b.dataset.pc));
}

function msgCobranca(r) {
  const pix = S.params.empresa_pix;
  return `Olá, ${r.nome.split(' ')[0]}! Tudo bem?\n\nPassando para lembrar do saldo em aberto de ${BRL(r.saldo_vencido)} referente aos produtos.\n${pix ? `\nChave PIX: ${pix}\n` : ''}\nQualquer dúvida é só me chamar. Obrigado!`;
}

/* ── ASSISTENTE DE PRESTAÇÃO DE CONTAS ── */
function prestacaoContas(rev, posse) {
  if (!posse.length) return warn('Nada a acertar', 'Este revendedor não está com produtos.');
  const linhas = posse.map(p => ({ ...p, vend:0, devo:0, perd:0, baix:0, motivo:'',
    mostruario: p.tipo_remessa === 'MOSTRUARIO' }));

  const m = modal({ titulo:`Prestação de contas · ${rev.nome}`, largura:'wide',
    corpo:`<div class="alert info"><span>ℹ</span><div>Informe, para cada produto, o que aconteceu com cada unidade.
      O que sobrar continua com o revendedor.<br>
      <b>Mostruário é amostra e não se vende:</b> o custo dele já virou despesa sua no
      envio da remessa. Ou volta para o estoque — e a despesa é estornada —, ou é marcado
      como <b>finalizado</b> quando acaba. Nunca vira cobrança para o revendedor.</div></div>
      <div class="grid-f f3" style="margin-bottom:16px">
        <div><label>Data do acerto</label><input class="inp" type="date" id="pc_data" value="${hoje()}" max="${hoje()}"></div>
        <div><label>Condição de pagamento</label><select class="inp" id="pc_parc">
          <option value="1">À vista</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></div>
        <div><label>Forma de pagamento</label><select class="inp" id="pc_forma">
          <option value="">—</option>${selectOpts(S.formas)}</select></div>
      </div>
      <div class="grid-f f3" style="margin-bottom:16px">
        <div><label id="pc_lbvenc">Vencimento</label><input class="inp" type="date" id="pc_venc"></div>
        <div id="pc_boxintv"><label>Parcelas a cada</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input class="inp num" type="number" id="pc_intv" min="1" max="365" step="1" value="30" style="flex:1">
            <span style="font-size:12.5px;color:var(--mute)">dias</span></div></div>
        <div style="display:flex;align-items:flex-end"><div class="hint" id="pc_dicavenc" style="margin:0"></div></div>
      </div>
      <div class="tw" style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:9px">
      <table class="itens-tb" id="pctb"><thead><tr>
        <th style="width:28%">Produto</th><th class="c">Em posse</th>
        <th style="width:12%">Vendidas</th>
        <th style="width:12%">Devolvidas</th>
        <th style="width:12%">Perdidas</th>
        <th style="width:12%">Finalizadas<br><span style="font-weight:400;font-size:10px">acabou</span></th>
        <th class="c">Continua</th>
        <th class="r">A receber</th></tr></thead><tbody></tbody></table></div>
      <div id="pc_resumo" style="margin-top:16px"></div>`,
    rodape:`<button class="btn btn-s" data-x>Cancelar</button>
            <button class="btn btn-p" data-ok>Confirmar acerto</button>` });

  /* Mostruário só admite duas saídas: volta ao estoque (devolvida) ou acabou
     (finalizada). Venda e perda ficam travadas — venda porque amostra não se
     vende, perda porque o custo já foi lançado no envio e a perda o lançaria
     de novo. Consignação é o contrário: tudo menos "finalizada". */
  const render = () => {
    $('#pctb tbody', m.body).innerHTML = linhas.map((l, i) => {
      const rest = N(l.qtd_em_posse) - N(l.vend) - N(l.devo) - N(l.perd) - N(l.baix);
      const inval = rest < 0;
      const trava = (cond, titulo) => cond
        ? `disabled title="${titulo}" style="background:#f1f5f9;cursor:not-allowed"` : '';
      return `<tr data-i="${i}" style="${inval ? 'background:var(--red-bg)' : ''}">
        <td><b style="font-size:12.5px">${esc(l.produto_nome)}</b>
          <span style="display:block;font-size:11px;color:var(--mute)">rem. ${l.remessa_numero} ·
            <span class="tag ${l.mostruario ? 'a' : 'v'}" style="font-size:9.5px">${l.mostruario ? 'Mostruário' : 'Consignação'}</span>
            · ${l.dias_em_posse}d${l.mostruario ? '' : ' · rev. ' + BRL(l.valor_revenda_unitario)}</span></td>
        <td class="c"><b>${QTD(l.qtd_em_posse)}</b></td>
        <td><input class="inp num qv" type="number" min="0" step="1" max="${l.qtd_em_posse}"
              value="${l.vend || ''}" placeholder="${l.mostruario ? '—' : '0'}"
              ${trava(l.mostruario, 'Mostruário é amostra e não pode ser vendido. Para vender, devolva ao estoque e registre uma venda normal.')}></td>
        <td><input class="inp num qd" type="number" min="0" step="1" max="${l.qtd_em_posse}" value="${l.devo || ''}" placeholder="0"></td>
        <td><input class="inp num qp" type="number" min="0" step="1" max="${l.qtd_em_posse}"
              value="${l.perd || ''}" placeholder="${l.mostruario ? '—' : '0'}"
              ${trava(l.mostruario, 'Amostra de mostruário não entra como perda: o custo dela já foi lançado no envio. Marque como finalizada.')}></td>
        <td><input class="inp num qb" type="number" min="0" step="1" max="${l.qtd_em_posse}"
              value="${l.baix || ''}" placeholder="${l.mostruario ? '0' : '—'}"
              ${trava(!l.mostruario, 'Finalizar vale só para mostruário. Em consignação use devolvido ou perdido.')}></td>
        <td class="c ${inval ? 'neg' : ''}"><b>${QTD(rest)}</b></td>
        <td class="r money">${BRL(N(l.vend) * N(l.valor_revenda_unitario))}</td></tr>`;
    }).join('');
    $$('#pctb tbody tr', m.body).forEach(tr => {
      const i = +tr.dataset.i;
      $('.qv', tr).oninput = e => { linhas[i].vend = N(e.target.value); resumo(); atualizaLinha(tr, i); };
      $('.qd', tr).oninput = e => { linhas[i].devo = N(e.target.value); resumo(); atualizaLinha(tr, i); };
      $('.qp', tr).oninput = e => { linhas[i].perd = N(e.target.value); resumo(); atualizaLinha(tr, i); };
      $('.qb', tr).oninput = e => { linhas[i].baix = N(e.target.value); resumo(); atualizaLinha(tr, i); };
    });
    resumo();
  };
  const atualizaLinha = (tr, i) => {
    const l = linhas[i], rest = N(l.qtd_em_posse) - N(l.vend) - N(l.devo) - N(l.perd) - N(l.baix);
    tr.style.background = rest < 0 ? 'var(--red-bg)' : '';
    tr.children[6].innerHTML = `<b class="${rest < 0 ? 'neg' : ''}">${QTD(rest)}</b>`;
    tr.children[7].textContent = BRL(N(l.vend) * N(l.valor_revenda_unitario));
  };

  /* Sugere o vencimento enquanto o usuário não escolher uma data própria. */
  const sincVenc = () => {
    const np = +$('#pc_parc', m.body).value || 1;
    const dt = $('#pc_data', m.body).value || hoje();
    const intv = Math.min(365, Math.max(1, +$('#pc_intv', m.body).value || 30));
    const el = $('#pc_venc', m.body);
    el.min = dt;
    if (!el.dataset.tocado) el.value = np === 1 ? dt : addDias(dt, intv);
    if (el.value && el.value < dt) el.value = dt;
    $('#pc_lbvenc', m.body).textContent = np === 1 ? 'Vencimento' : '1º vencimento';
    $('#pc_boxintv', m.body).style.visibility = np === 1 ? 'hidden' : '';
    $('#pc_dicavenc', m.body).innerHTML = np === 1
      ? `Parcela única vencendo em ${dBR(el.value)}.`
      : `${np} parcelas a cada ${intv} dias a partir de ${dBR(el.value)}.`;
  };

  const resumo = () => {
    sincVenc();
    let qv = 0, qd = 0, qp = 0, qb = 0, vv = 0, cv = 0, vd = 0, vp = 0, vb = 0,
        vdm = 0, rest = 0, cr = 0, inval = false;
    linhas.forEach(l => {
      const r2 = N(l.qtd_em_posse) - N(l.vend) - N(l.devo) - N(l.perd) - N(l.baix);
      if (r2 < 0) inval = true;
      qv += N(l.vend); qd += N(l.devo); qp += N(l.perd); qb += N(l.baix); rest += Math.max(r2, 0);
      vv += N(l.vend) * N(l.valor_revenda_unitario);
      cv += N(l.vend) * N(l.valor_custo_unitario);
      vd += N(l.devo) * N(l.valor_custo_unitario);
      vp += N(l.perd) * N(l.valor_custo_unitario);
      vb += N(l.baix) * N(l.valor_custo_unitario);
      /* Devolução de mostruário estorna a despesa lançada no envio. */
      if (l.mostruario) vdm += N(l.devo) * N(l.valor_custo_unitario);
      cr += Math.max(r2, 0) * N(l.valor_custo_unitario);
    });
    const cobra = $('#pc_cobra', m.body)?.checked ?? true;
    const devido = vv + (cobra ? vp : 0);
    const lucro = vv - cv;
    /* A finalização de mostruário não entra no resultado do acerto: o custo
       da amostra já foi despesa lá atrás, no envio da remessa. */
    const liq = lucro - (cobra ? 0 : vp);
    $('#pc_resumo', m.body).innerHTML = `
      ${inval ? '<div class="alert bad"><span>⚠</span><div>Alguma linha soma mais do que o revendedor tem em posse. Corrija antes de confirmar.</div></div>' : ''}
      <div class="sumbox">
        <div class="sumrow"><span class="l">Vendidos</span><span>${QTD(qv)} un · revenda <b class="money">${BRL(vv)}</b> · custo ${BRL(cv)}</span></div>
        <div class="sumrow"><span class="l">Devolvidos</span><span>${QTD(qd)} un · volta ao estoque ${BRL(vd)} de custo</span></div>
        <div class="sumrow"><span class="l">Perdidos</span><span>${QTD(qp)} un · custo ${BRL(vp)}</span></div>
        ${qd > 0 && vdm > 0 ? `<div class="sumrow"><span class="l">↳ amostras de mostruário</span>
          <span>estorna <b class="money pos">${BRL(vdm)}</b> de despesa já lançada</span></div>` : ''}
        ${qb > 0 ? `<div class="sumrow"><span class="l">Mostruário finalizado</span>
          <span>${QTD(qb)} un · custo de ${BRL(vb)} já lançado no envio</span></div>` : ''}
        <div class="sumrow"><span class="l">Continua em posse</span><span>${QTD(rest)} un · custo ${BRL(cr)}</span></div>
        <div class="sumrow" style="border-top:1px solid var(--line);margin-top:6px;padding-top:9px">
          <span class="l">Produtos vendidos</span><span class="money">${BRL(vv)}</span></div>
        ${cobra && vp > 0 ? `<div class="sumrow"><span class="l">(+) Perda cobrada do revendedor</span><span class="money">${BRL(vp)}</span></div>` : ''}
        <div class="sumrow tot"><span class="l">Valor devido</span><span class="money">${BRL(devido)}</span></div>
        <div class="sumrow" style="margin-top:8px"><span class="l">Lucro bruto do acerto</span>
          <span class="money pos">${BRL(lucro)}${vv ? ` (${PCT(lucro / vv * 100)})` : ''}</span></div>
        ${!cobra && vp > 0 ? `<div class="sumrow"><span class="l">Perda absorvida pela empresa</span><span class="money neg">${BRL(vp)}</span></div>` : ''}
        ${!cobra && vp > 0 ? `<div class="sumrow"><span class="l">Resultado líquido do acerto</span><span class="money">${BRL(liq)}</span></div>` : ''}
      </div>
      ${qb > 0 ? `<div class="alert info" style="margin-top:12px"><span>ℹ</span><div>
        As ${QTD(qb)} amostra(s) finalizadas <b>não geram despesa nova</b>: o custo de
        ${BRL(vb)} já foi lançado quando a remessa saiu. Elas apenas saem do seu estoque.
        O revendedor não é cobrado.</div></div>` : ''}
      ${vdm > 0 ? `<div class="alert info" style="margin-top:12px"><span>ℹ</span><div>
        A devolução de amostras de mostruário <b>estorna ${BRL(vdm)}</b> de despesa: o produto
        volta a ser seu, no estoque disponível.</div></div>` : ''}
      ${vp > 0 ? `<label class="chk" style="margin-top:12px"><input type="checkbox" id="pc_cobra" ${cobra ? 'checked' : ''}>
        Cobrar do revendedor os produtos perdidos (${BRL(vp)})</label>
        <div class="hint">Desmarcado, a perda vira despesa da empresa na categoria “Perda de estoque”.</div>` : ''}`;
    const cb = $('#pc_cobra', m.body); if (cb) cb.onchange = resumo;
    $('[data-ok]', m.foot).disabled = inval || (qv + qd + qp + qb) === 0;
  };

  $('[data-x]', m.foot).onclick = m.fechar;
  $('#pc_parc', m.body).onchange = resumo;
  $('#pc_data', m.body).onchange = resumo;
  $('#pc_intv', m.body).oninput = resumo;
  $('#pc_venc', m.body).onchange = (e) => { e.target.dataset.tocado = '1'; resumo(); };
  $('[data-ok]', m.foot).onclick = async (ev) => {
    const b = ev.target;
    const itens = linhas.filter(l => N(l.vend) + N(l.devo) + N(l.perd) + N(l.baix) > 0).map(l => ({
      remessa_item_id: l.remessa_item_id, vendida:N(l.vend), devolvida:N(l.devo),
      perdida:N(l.perd), finalizada:N(l.baix),
      motivo: N(l.baix) > 0 ? (l.motivo || 'Amostra de mostruário finalizada — acabou')
            : N(l.perd) > 0 ? (l.motivo || 'Perda informada na prestação de contas') : null }));
    if (!itens.length) return bad('Nada informado', 'Preencha ao menos uma quantidade.');
    if (!$('#pc_venc', m.body).value) return bad('Vencimento em branco', 'Informe a data de vencimento.');
    if ($('#pc_venc', m.body).value < $('#pc_data', m.body).value)
      return bad('Vencimento inválido', 'O vencimento não pode ser anterior à data do acerto.');
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Confirmando…';
    try {
      const pcId = await rpc('fn_prestar_contas', {
        p_revendedor_id: rev.id, p_data: $('#pc_data', m.body).value, p_itens: itens,
        p_cobrar_perdas: $('#pc_cobra', m.body)?.checked ?? true,
        p_qtd_parcelas: +$('#pc_parc', m.body).value,
        p_forma_pagamento_id: $('#pc_forma', m.body).value || null, p_observacoes: null,
        p_primeiro_venc: $('#pc_venc', m.body).value || null,
        p_intervalo_dias: Math.min(365, Math.max(1, +$('#pc_intv', m.body).value || 30)) });
      m.fechar(); ok('Prestação de contas registrada', 'Estoque, títulos e dashboard atualizados.');
      imprimirPrestacao(pcId);
      navegar();
    } catch (e) { bad('Não foi possível registrar', erroAmigavel(e)); b.disabled = false; b.textContent = 'Confirmar acerto'; }
  };
  render();
}

/* ═══════════════ MOSTRUÁRIOS (Prompt 9) ═══════════════ */
ROTAS.mostruarios = async (v, id, revId) => {
  if (id === 'nova') return formRemessa(v, revId);
  if (id) return fichaRemessa(v, id);
  crumb('Mostruários');
  const [posse, remessas] = await Promise.all([
    q(sb.from('vw_itens_em_posse').select('*').order('dias_em_posse', { ascending:false })),
    q(sb.from('remessas').select('*,revendedores(nome)').order('data_envio', { ascending:false }))
  ]);
  const t = (f) => posse.reduce((a, p) => a + N(p[f]), 0);
  const media = posse.length ? Math.round(posse.reduce((a, p) => a + N(p.dias_em_posse), 0) / posse.length) : 0;

  v.innerHTML = `
  <div class="page-head"><h1>Mostruários e consignação<small>Produtos que saíram do estoque mas ainda são seus</small></h1>
    <div class="acts"><button class="btn btn-s btn-sm" id="expBtn">📊 Excel</button>
      <a class="btn btn-p" href="#mostruarios/nova">+ Nova remessa</a></div></div>
  <div class="alert info"><span>ℹ</span><div><b>Enviar não é vender.</b> A remessa apenas transfere o produto
    para o bolso “em poder de terceiros”. A receita só nasce na prestação de contas.</div></div>
  <div class="kpis k5">
    <div class="kpi violet"><div class="lab">Itens em poder de terceiros</div><div class="val">${QTD(t('qtd_em_posse'))}</div></div>
    <div class="kpi"><div class="lab">Investido (custo)</div><div class="val">${BRL(t('valor_custo_total'))}</div></div>
    <div class="kpi green"><div class="lab">Potencial de revenda</div><div class="val">${BRL(t('valor_revenda_total'))}</div></div>
    <div class="kpi"><div class="lab">Tempo médio em posse</div><div class="val">${media}d</div></div>
    <div class="kpi ${posse.filter(p => p.acerto_atrasado).length ? 'red' : ''}"><div class="lab">Acertos atrasados</div>
      <div class="val">${new Set(posse.filter(p => p.acerto_atrasado).map(p => p.remessa_id)).size}</div></div>
  </div>
  <div class="tabs"><button class="on" data-t="it">Por item (${posse.length})</button>
    <button data-t="rm">Por remessa (${remessas.length})</button></div>

  <div class="card" data-p="it"><div class="filters">
      <input class="inp grow" id="fq" placeholder="🔍 Buscar produto ou revendedor…">
      <select class="inp" id="ftipo"><option value="">Mostruário e consignação</option>
        <option value="MOSTRUARIO">Só mostruário</option><option value="CONSIGNACAO">Só consignação</option></select>
      <label class="chk"><input type="checkbox" id="fant"> Só há mais de 60 dias</label></div>
    <div class="tw"><table class="dt"><thead><tr>
      <th>Produto</th><th>Revendedor</th><th>Tipo</th><th>Envio</th><th class="c">Qtd</th>
      <th class="r">Custo</th><th class="r">Revenda</th><th class="c">Dias</th><th></th></tr></thead>
      <tbody id="tb"></tbody></table></div><div class="pager"><span id="cnt"></span></div></div>

  <div class="card" data-p="rm" style="display:none"><div class="tw"><table class="dt"><thead><tr>
    <th>Nº</th><th>Revendedor</th><th>Tipo</th><th>Envio</th><th>Previsão</th><th class="c">Enviados</th>
    <th class="c">Em posse</th><th class="r">Custo</th><th class="c">Situação</th></tr></thead><tbody>
    ${remessas.length ? remessas.map(x => `<tr style="cursor:pointer" data-go="${x.id}">
      <td class="num"><b>${x.numero}</b></td><td>${esc(x.revendedores?.nome || '—')}</td>
      <td><span class="tag ${x.tipo === 'MOSTRUARIO' ? 'a' : 'v'}">${x.tipo === 'MOSTRUARIO' ? 'Mostruário' : 'Consignação'}</span></td>
      <td class="nw">${dBR(x.data_envio)}</td>
      <td class="nw ${x.data_prevista_acerto && x.data_prevista_acerto < hoje() && N(x.qtd_em_posse) > 0 ? 'neg' : ''}">${dBR(x.data_prevista_acerto)}</td>
      <td class="c">${QTD(x.qtd_total_enviada)}</td><td class="c"><b>${QTD(x.qtd_em_posse)}</b></td>
      <td class="r money">${BRL(x.valor_custo_total)}</td>
      <td class="c">${x.status === 'CANCELADO' ? '<span class="tag r">Cancelada</span>'
        : x.status === 'RASCUNHO' ? '<span class="tag a">Rascunho</span>'
        : x.encerrada ? '<span class="tag n">Encerrada</span>' : '<span class="tag g">Aberta</span>'}</td></tr>`).join('')
    : `<tr><td colspan="9">${vazio('📦','Nenhuma remessa','Envie produtos para um revendedor.')}</td></tr>`}
  </tbody></table></div></div>`;

  const pintar = () => {
    const t2 = $('#fq').value.trim().toLowerCase(), tp = $('#ftipo').value, an = $('#fant').checked;
    const f = posse.filter(p => (!t2 || (p.produto_nome + ' ' + p.revendedor_nome).toLowerCase().includes(t2)) &&
      (!tp || p.tipo_remessa === tp) && (!an || p.dias_em_posse > 60));
    $('#cnt').textContent = `${f.length} item(ns) · ${BRL(f.reduce((a, p) => a + N(p.valor_custo_total), 0))} de custo`;
    $('#tb').innerHTML = f.length ? f.map(p => `<tr>
      <td><a href="#produtos/${p.produto_id}" class="pnome"><div class="ph">🌸</div><div style="min-width:0">
        <b>${esc(p.produto_nome)}</b><span>${esc(p.produto_codigo)}</span></div></a></td>
      <td><a href="#revendedores/${p.revendedor_id}">${esc(p.revendedor_nome)}</a></td>
      <td><span class="tag ${p.tipo_remessa === 'MOSTRUARIO' ? 'a' : 'v'}">${p.tipo_remessa === 'MOSTRUARIO' ? 'Mostruário' : 'Consignação'}</span></td>
      <td class="nw">${dBR(p.data_envio)}</td><td class="c"><b>${QTD(p.qtd_em_posse)}</b></td>
      <td class="r money">${BRL(p.valor_custo_total)}</td><td class="r money">${BRL(p.valor_revenda_total)}</td>
      <td class="c"><span class="tag ${p.dias_em_posse > 60 ? 'r' : p.dias_em_posse > 30 ? 'a' : 'g'}">${p.dias_em_posse}</span></td>
      <td><a class="btn btn-ghost btn-sm" href="#revendedores/${p.revendedor_id}" title="Prestar contas">📋</a></td></tr>`).join('')
      : `<tr><td colspan="9">${vazio('📦','Nada em poder de terceiros','Todos os produtos estão no seu estoque.')}</td></tr>`;
  };
  ['#fq','#ftipo','#fant'].forEach(s => $(s).addEventListener('input', pintar));
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-p]').forEach(c => c.style.display = c.dataset.p === b.dataset.t ? '' : 'none');
    $$('[data-go]').forEach(r => r.onclick = () => location.hash = `#mostruarios/${r.dataset.go}`);
  });
  $$('[data-go]').forEach(r => r.onclick = () => location.hash = `#mostruarios/${r.dataset.go}`);
  $('#expBtn').onclick = () => exportarExcel('mostruarios', [
    { t:'Revendedor', v:p => p.revendedor_nome }, { t:'Produto', v:p => p.produto_nome },
    { t:'Código', v:p => p.produto_codigo }, { t:'Tipo', v:p => p.tipo_remessa },
    { t:'Remessa', v:p => p.remessa_numero }, { t:'Data de envio', v:p => dBR(p.data_envio) },
    { t:'Qtd em posse', v:p => N(p.qtd_em_posse) }, { t:'Custo total', v:p => N(p.valor_custo_total) },
    { t:'Revenda total', v:p => N(p.valor_revenda_total) }, { t:'Dias em posse', v:p => p.dias_em_posse }], posse);
  pintar();
};

async function formRemessa(v, revId) {
  crumb('Mostruários › Nova remessa');
  const itens = [];
  let rev = revId ? await q(sb.from('revendedores').select('*').eq('id', revId).single()) : null;

  v.innerHTML = `
  <div class="page-head"><h1>Nova remessa<small>Envio de produtos a revendedor — não gera receita nem cobrança</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#mostruarios">← Cancelar</a></div></div>
  <div style="display:grid;grid-template-columns:1fr 336px;gap:16px;align-items:start" class="g-cmp">
    <div>
      <div class="card"><div class="card-h"><h3>Dados da remessa</h3></div><div class="card-b">
        <div class="grid-f f2">
          <div style="position:relative"><label>Revendedor <span style="color:var(--red)">*</span></label>
            <input class="inp" id="r_rev" value="${esc(rev?.nome || '')}" placeholder="Digite para buscar…" autocomplete="off">
            <input type="hidden" id="r_rev_id" value="${esc(rev?.id || '')}">
            <div class="hint">Não achou? <a href="#" id="novoRev">Cadastrar revendedor</a></div></div>
          <div><label>Tipo <span style="color:var(--red)">*</span></label><select class="inp" id="r_tipo">
            <option value="MOSTRUARIO">Mostruário — amostra para demonstração</option>
            <option value="CONSIGNACAO">Consignação — para o revendedor vender</option></select></div>
        </div>
        <div class="grid-f f2" style="margin-top:14px">
          <div><label>Data do envio</label><input class="inp" type="date" id="r_data" value="${hoje()}" max="${hoje()}"></div>
          <div><label>Previsão de acerto</label><input class="inp" type="date" id="r_prev" value="${addDias(hoje(), N(rev?.prazo_acerto_dias) || 30)}">
            <div class="hint" id="h_prazo">${rev ? `Prazo do revendedor: ${rev.prazo_acerto_dias} dias` : ''}</div></div>
        </div>
        <div style="margin-top:14px"><label>Observações</label><textarea class="inp" id="r_obs"></textarea></div>
      </div></div>

      <div class="card"><div class="card-h"><h3>Produtos enviados</h3>
        <button class="btn btn-s btn-sm" id="addItem">+ Adicionar produto</button></div>
        <div class="card-b flush"><div class="tw"><table class="itens-tb" id="itb"><thead><tr>
          <th style="width:32%">Produto</th><th style="width:13%">Quantidade</th><th style="width:16%">Custo unit.</th>
          <th style="width:16%">Revenda unit.</th><th style="width:17%" class="r">Total de revenda</th><th style="width:6%"></th>
        </tr></thead><tbody></tbody></table></div>
        <div id="semItens">${vazio('📦','Nenhum produto','Adicione os produtos que serão enviados.')}</div></div></div>
    </div>

    <div style="position:sticky;top:72px"><div class="card"><div class="card-h"><h3>Resumo</h3></div><div class="card-b">
      <div class="sumbox">
        <div class="sumrow"><span class="l">Itens</span><span class="money" id="s_qtd">0 un</span></div>
        <div class="sumrow"><span class="l">Valor de custo</span><span class="money" id="s_custo">R$ 0,00</span></div>
        <div class="sumrow"><span class="l">Valor de revenda</span><span class="money" id="s_rev">R$ 0,00</span></div>
        <div class="sumrow tot"><span class="l">Lucro potencial</span><span class="money pos" id="s_luc">R$ 0,00</span></div>
      </div>
      <div class="alert warn" style="margin-top:14px;font-size:12.5px"><span>⚠</span><div>
        Estes produtos <b>saem do estoque disponível</b> mas continuam sendo seus. Nenhuma receita é registrada agora.</div></div>
      <div id="pend" style="margin-top:12px"></div>
      <button class="btn btn-p btn-block" id="confirmar" style="margin-top:6px">Confirmar remessa</button>
      <div class="hint" style="text-align:center;margin-top:8px">Depois de confirmar, o recibo de entrega fica disponível</div>
    </div></div></div>
  </div>
  <style>@media(max-width:1080px){.g-cmp{grid-template-columns:1fr !important}}</style>`;

  const escolherRev = (x) => {
    rev = x; $('#r_rev').value = x.nome; $('#r_rev_id').value = x.id;
    $('#r_prev').value = addDias($('#r_data').value || hoje(), N(x.prazo_acerto_dias) || 30);
    $('#h_prazo').textContent = `Prazo do revendedor: ${x.prazo_acerto_dias || 30} dias`;
    recalc();
  };
  autocomplete($('#r_rev'), buscaRevendedor, escolherRev, fmtPessoa,
    { aoCriar: (termo) => formPessoa('revendedores', null, escolherRev, { nome: termo }) });
  $('#novoRev').onclick = (e) => { e.preventDefault(); formPessoa('revendedores', null, escolherRev); };
  $('#r_rev').addEventListener('input', () => { if (!$('#r_rev').value.trim()) $('#r_rev_id').value = ''; recalc(); });

  const recalc = () => {
    const qtd = itens.reduce((a, i) => a + N(i.qtd), 0);
    const custo = itens.reduce((a, i) => a + N(i.qtd) * N(i.cu), 0);
    const revd = itens.reduce((a, i) => a + N(i.qtd) * N(i.vr), 0);
    $('#s_qtd').textContent = QTD(qtd) + ' un';
    $('#s_custo').textContent = BRL(custo); $('#s_rev').textContent = BRL(revd);
    $('#s_luc').textContent = BRL(revd - custo);
    $('#semItens').style.display = itens.length ? 'none' : '';
    const falta = [];
    if (!$('#r_rev_id').value) falta.push($('#r_rev').value.trim()
      ? 'Escolher o revendedor na lista de sugestões (digitar o nome não basta)'
      : 'Informar o revendedor');
    if (!itens.length) falta.push('Adicionar ao menos um produto');
    if (itens.some(i => !i.produto_id)) falta.push('Escolher o produto na lista de sugestões em todas as linhas');
    if (itens.some(i => i.produto_id && N(i.qtd) <= 0)) falta.push('Informar a quantidade de todos os produtos');
    const pd = $('#pend');
    if (pd) pd.innerHTML = falta.length
      ? `<div class="alert warn" style="margin:0;font-size:12.5px"><span>⚠</span><div><b>Falta:</b><br>${
          falta.map(f => '· ' + esc(f)).join('<br>')}</div></div>`
      : '<div class="alert ok" style="margin:0;font-size:12.5px"><span>✓</span><div>Tudo pronto para confirmar.</div></div>';
  };

  const render = () => {
    $('#itb tbody').innerHTML = itens.map((it, i) => `<tr data-i="${i}" style="${!it.produto_id ? 'background:#fffdf5' : ''}">
      <td><div style="position:relative"><input class="inp p-busca" placeholder="Digite o nome ou o código…"
        value="${esc(it.nome || '')}" autocomplete="off" style="${!it.produto_id ? 'border-color:var(--amber)' : ''}"></div>
        ${!it.produto_id ? '<span style="font-size:11px;color:var(--amber);font-weight:600">⚠ escolha o produto na lista que aparece</span>'
          : it.disp != null ? `<span style="font-size:11px;color:var(--mute)">disponível: ${QTD(it.disp)}</span>` : ''}</td>
      <td><input class="inp num q" type="number" step="1" min="0" max="${it.disp ?? ''}" value="${it.qtd || ''}"></td>
      <td><input class="inp num cu" type="number" step="0.0001" value="${it.cu || ''}" disabled></td>
      <td><input class="inp num vr" type="number" step="0.01" min="0" value="${it.vr || ''}"></td>
      <td class="r money tt">${BRL(N(it.qtd) * N(it.vr))}</td>
      <td><button class="btn btn-ghost btn-sm rm">✕</button></td></tr>`).join('');
    $$('#itb tbody tr').forEach(tr => {
      const i = +tr.dataset.i;
      autocomplete($('.p-busca', tr), buscaProduto, (p) => {
        if (N(p.qtd_disponivel) <= 0) return bad('Sem estoque',
          `${p.nome} está com 0 unidade disponível. Registre uma compra antes de enviar.`);
        if (itens.some((x, j) => j !== i && x.produto_id === p.id)) return bad('Produto repetido', 'Ajuste a quantidade da linha existente.');
        itens[i] = { produto_id:p.id, nome:p.nome, disp:N(p.qtd_disponivel), cu:N(p.custo_medio),
                     vr:N(p.preco_revendedor) || '', qtd:itens[i].qtd || '' };
        render(); recalc();
      }, fmtProd);
      $('.q', tr).oninput = e => {
        const max = N(itens[i].disp);
        if (max && N(e.target.value) > max) { e.target.value = max; warn('Estoque insuficiente', `Só há ${QTD(max)} unidade(s) disponíveis.`); }
        itens[i].qtd = e.target.value; $('.tt', tr).textContent = BRL(N(itens[i].qtd) * N(itens[i].vr)); recalc(); };
      $('.vr', tr).oninput = e => { itens[i].vr = e.target.value; $('.tt', tr).textContent = BRL(N(itens[i].qtd) * N(itens[i].vr)); recalc(); };
      $('.rm', tr).onclick = () => { itens.splice(i, 1); render(); recalc(); };
    });
    recalc();
  };
  $('#addItem').onclick = () => { itens.push({ qtd:'' }); render();
    setTimeout(() => { const l = $$('#itb tbody .p-busca').pop(); if (l) l.focus(); }, 40); };
  $('#r_data').onchange = () => { if (rev) $('#r_prev').value = addDias($('#r_data').value, N(rev.prazo_acerto_dias) || 30); };

  $('#confirmar').onclick = async (ev) => {
    const b = ev.target;
    if (!$('#r_rev_id').value) return bad('Revendedor não selecionado',
      'Digite o nome e clique no revendedor na lista que aparece abaixo do campo.');
    if (!itens.length) return bad('Sem produtos', 'Clique em "Adicionar produto".');
    if (itens.some(i => !i.produto_id)) return bad('Produto não selecionado',
      'Em cada linha, digite o nome e clique no produto na lista que aparece.');
    if (itens.some(i => N(i.qtd) <= 0)) return bad('Quantidade inválida', 'Informe a quantidade de todos os produtos.');
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Confirmando…';
    let remId = null;
    try {
      const r = await q(sb.from('remessas').insert({
        revendedor_id: $('#r_rev_id').value, tipo: $('#r_tipo').value,
        data_envio: $('#r_data').value, data_prevista_acerto: $('#r_prev').value || null,
        observacoes: $('#r_obs').value.trim() || null }).select().single());
      remId = r.id;
      await q(sb.from('remessa_itens').insert(itens.map(i => ({
        remessa_id:r.id, produto_id:i.produto_id, quantidade:N(i.qtd),
        valor_custo_unitario:N(i.cu), valor_revenda_unitario:N(i.vr) }))));
      await rpc('fn_confirmar_remessa', { p_remessa_id: r.id });
      ok('Remessa confirmada', 'Produtos transferidos para o revendedor.');
      location.hash = `#mostruarios/${r.id}`;
    } catch (e) {
      if (remId) { try { await sb.from('remessas').delete().eq('id', remId); } catch (_) {} }
      bad('Não foi possível confirmar', erroAmigavel(e));
      b.disabled = false; b.textContent = 'Confirmar remessa';
    }
  };
  render();
}

async function fichaRemessa(v, id) {
  const r = await q(sb.from('remessas').select('*,revendedores(*),remessa_itens(*,produtos(codigo,nome,tamanho))').eq('id', id).single());
  crumb(`Mostruários › remessa nº ${r.numero}`);
  const dias = Math.floor((new Date(hoje()) - new Date(r.data_envio)) / 86400000);
  const mostr = r.tipo === 'MOSTRUARIO' && r.status === 'CONFIRMADO';
  v.innerHTML = `
  <div class="page-head"><h1>Remessa nº ${r.numero}
    <span class="tag ${r.tipo === 'MOSTRUARIO' ? 'a' : 'v'}">${r.tipo === 'MOSTRUARIO' ? 'Mostruário' : 'Consignação'}</span>
    ${r.encerrada ? '<span class="tag n">Encerrada</span>' : r.status === 'CONFIRMADO' ? '<span class="tag g">Aberta</span>' : ''}
    <small><a href="#revendedores/${r.revendedor_id}">${esc(r.revendedores?.nome)}</a> · enviada em ${dBR(r.data_envio)} · há ${dias} dias</small></h1>
    <div class="acts"><a class="btn btn-s btn-sm" href="#mostruarios">← Voltar</a>
      <button class="btn btn-s btn-sm" id="prBtn">🖨 Recibo de entrega</button>
      ${N(r.qtd_em_posse) > 0 ? `<a class="btn btn-p btn-sm" href="#revendedores/${r.revendedor_id}">📋 Prestar contas</a>` : ''}</div></div>
  <div class="kpis k5">
    <div class="kpi"><div class="lab">Enviados</div><div class="val">${QTD(r.qtd_total_enviada)}</div></div>
    <div class="kpi violet"><div class="lab">Ainda em posse</div><div class="val">${QTD(r.qtd_em_posse)}</div></div>
    <div class="kpi"><div class="lab">${mostr ? 'Custo (já é despesa)' : 'Valor de custo'}</div><div class="val">${BRL(r.valor_custo_total)}</div></div>
    <div class="kpi green"><div class="lab">Valor de revenda</div><div class="val">${BRL(r.valor_revenda_total)}</div></div>
    <div class="kpi ${r.data_prevista_acerto && r.data_prevista_acerto < hoje() && N(r.qtd_em_posse) > 0 ? 'red' : ''}">
      <div class="lab">Previsão de acerto</div><div class="val" style="font-size:16px">${dBR(r.data_prevista_acerto)}</div></div>
  </div>
  ${mostr ? `<div class="alert info"><span>ℹ</span><div>O custo destas amostras
    (<b>${BRL(r.valor_custo_total)}</b>) já entrou como <b>despesa sua</b> no dia do envio —
    uma vez só. Quando uma amostra acabar, marque como <b>finalizada</b>: ela sai do estoque
    sem gerar custo novo. Se voltar para você, use <b>devolver</b> e a despesa é estornada
    na proporção do que voltou.</div></div>` : ''}
  <div class="card"><div class="card-h"><h3>Itens</h3></div><div class="tw"><table class="dt"><thead><tr>
    <th>Produto</th><th class="c">Enviado</th><th class="c">Vendido</th><th class="c">Devolvido</th>
    <th class="c">${mostr ? 'Finalizado' : 'Perdido'}</th><th class="c">Em posse</th>
    <th class="r">Custo un.</th><th class="r">Revenda un.</th>
    ${mostr ? '<th class="r" style="width:190px">Ações</th>' : ''}</tr></thead><tbody>
    ${r.remessa_itens.map(i => `<tr>
      <td><a href="#produtos/${i.produto_id}"><b>${esc(i.produtos?.nome)}</b></a>
        <span style="display:block;font-size:11.5px;color:var(--mute)" class="num">${esc(i.produtos?.codigo)}</span></td>
      <td class="c">${QTD(i.quantidade)}</td>
      <td class="c pos">${N(i.qtd_vendida) ? QTD(i.qtd_vendida) : '—'}</td>
      <td class="c">${N(i.qtd_devolvida) ? QTD(i.qtd_devolvida) : '—'}</td>
      <td class="c ${mostr ? '' : 'neg'}">${mostr
          ? (N(i.qtd_baixada) ? QTD(i.qtd_baixada) : '—')
          : (N(i.qtd_perdida) ? QTD(i.qtd_perdida) : '—')}</td>
      <td class="c"><b>${QTD(i.qtd_em_posse)}</b></td>
      <td class="r money">${BRL(i.valor_custo_unitario)}</td>
      <td class="r money">${BRL(i.valor_revenda_unitario)}</td>
      ${mostr ? `<td class="r">${N(i.qtd_em_posse) > 0
        ? `<button class="btn btn-s btn-sm" data-fin="${i.id}">✓ Finalizar</button>
           <button class="btn btn-s btn-sm" data-dev="${i.id}">↩ Devolver</button>`
        : '<span style="color:var(--mute);font-size:11.5px">encerrado</span>'}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>
  <div class="pager"><span>Conferência: enviado = vendido + devolvido + ${mostr ? 'finalizado' : 'perdido'} + em posse ✓</span></div></div>
  ${r.observacoes ? `<div class="card"><div class="card-b"><b style="font-size:12px;color:var(--mute)">OBSERVAÇÕES</b>
    <p style="margin-top:6px">${esc(r.observacoes)}</p></div></div>` : ''}`;
  $('#prBtn').onclick = () => imprimir(docRemessa(r));
  const acao = (attr, cfg) => $$(`[data-${attr}]`).forEach(b => b.onclick = () => {
    const it = r.remessa_itens.find(x => x.id === b.dataset[attr]);
    baixaMostruario(cfg, it, r);
  });
  acao('fin', { rpc:'fn_finalizar_mostruario', titulo:'Finalizar amostra',
    verbo:'Finalizar', motivoPadrao:'Amostra de mostruário finalizada — acabou',
    aviso:'A amostra sai do seu estoque. <b>Nenhuma despesa nova</b> é lançada: o custo já entrou no envio da remessa.' });
  acao('dev', { rpc:'fn_devolver_mostruario', titulo:'Devolver amostra ao estoque',
    verbo:'Devolver', motivoPadrao:'Amostra de mostruário devolvida ao estoque',
    aviso:'A amostra volta para o estoque disponível e a despesa lançada no envio é <b>estornada</b> na proporção do que voltou.' });
}

/* Finalizar e devolver amostra sem passar por prestação de contas: mostruário
   nunca gera cobrança, então não faz sentido exigir um documento de acerto. */
function baixaMostruario(cfg, item, remessa) {
  const max = N(item.qtd_em_posse);
  const m = modal({ titulo:`${cfg.titulo} · ${item.produtos?.nome || ''}`,
    corpo:`<div class="alert info"><span>ℹ</span><div>${cfg.aviso}</div></div>
      <div class="grid-f f2">
        <div><label>Quantidade</label>
          <input class="inp num" type="number" id="bm_q" min="0.001" step="1" max="${max}" value="${max}">
          <div class="hint">O revendedor está com ${QTD(max)} un desta amostra.</div></div>
        <div><label>Data</label>
          <input class="inp" type="date" id="bm_d" value="${hoje()}" min="${remessa.data_envio}" max="${hoje()}"></div>
      </div>
      <div style="margin-top:12px"><label>Motivo (opcional)</label>
        <input class="inp" id="bm_m" placeholder="${esc(cfg.motivoPadrao)}"></div>`,
    rodape:`<button class="btn btn-s" data-x>Cancelar</button>
            <button class="btn btn-p" data-ok>${cfg.verbo}</button>` });
  $('[data-x]', m.foot).onclick = m.fechar;
  $('[data-ok]', m.foot).onclick = async (ev) => {
    const b = ev.target, qtd = N($('#bm_q', m.body).value);
    if (qtd <= 0 || qtd > max)
      return bad('Quantidade inválida', `Informe de 1 até ${QTD(max)} unidade(s).`);
    b.disabled = true; b.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      await rpc(cfg.rpc, { p_remessa_item_id:item.id, p_quantidade:qtd,
        p_data:$('#bm_d', m.body).value || null,
        p_motivo:$('#bm_m', m.body).value.trim() || null });
      m.fechar(); ok(`${cfg.verbo} concluído`, 'Estoque, despesas e dashboard atualizados.');
      navegar();
    } catch (e) { bad('Não foi possível concluir', erroAmigavel(e));
      b.disabled = false; b.textContent = cfg.verbo; }
  };
}
