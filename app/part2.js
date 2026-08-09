<script>
/* ═══════════════════════════════════════════════════════════════════════
   GESTÃO DE FRAGRÂNCIAS — aplicação de página única
   Todo cálculo financeiro vive no PostgreSQL (funções, triggers e views).
   Este arquivo apenas exibe e envia comandos. Ver Documento 1, ADR-06.
   ═══════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://amuogadwazxknsphpsga.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E8AdwhPYUNpbd5zxQpFcLw_o7aX-xdt';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
});

const S = { user: null, perfil: null, params: {}, formas: [], categorias: [], marcas: [], dash: null };

/* ───────── utilidades ───────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const BRL = (v) => N(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const BRLn = (v) => N(v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const QTD = (v) => { const n = N(v); return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')); };
const PCT = (v) => N(v).toLocaleString('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%';

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone:'America/Sao_Paulo' });
const dBR  = (d) => d ? String(d).slice(0,10).split('-').reverse().join('/') : '—';
const dISO = (d) => d ? String(d).slice(0,10) : null;
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const agoraBR = () => new Date().toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' });

const digits = (s) => String(s ?? '').replace(/\D/g,'');
const maskCPF = (s) => { const d = digits(s).slice(0,11); return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); };
const maskFone = (s) => { const d = digits(s).slice(0,11);
  return d.length <= 10 ? d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d)/,'$1-$2')
                        : d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2'); };
const maskCEP = (s) => digits(s).slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');

function validaCPF(cpf) {
  const c = digits(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0; return r === +c[10];
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* ───────── feedback ───────── */
function toast(titulo, msg, tipo = '') {
  const t = el(`<div class="toast ${tipo}"><b>${esc(titulo)}</b>${msg ? `<span>${esc(msg)}</span>` : ''}</div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s,transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(24px)';
                     setTimeout(() => t.remove(), 300); }, tipo === 'bad' ? 7000 : 4200);
}
const ok   = (t, m) => toast(t, m, 'ok');
const bad  = (t, m) => toast(t, m, 'bad');
const warn = (t, m) => toast(t, m, 'warn');

/** Traduz o erro do Postgres para linguagem de negócio (RN-S05). */
function erroAmigavel(e) {
  const m = (e?.message || e?.error_description || String(e || '')).trim();
  if (/duplicate key|already exists/i.test(m)) {
    if (/cpf/i.test(m)) return 'Já existe um cadastro com este CPF.';
    if (/codigo/i.test(m)) return 'Já existe um registro com este código.';
    if (/nome/i.test(m)) return 'Já existe um registro com este nome.';
    return 'Este registro já existe.';
  }
  if (/violates foreign key/i.test(m)) return 'Este registro está sendo usado em outro lugar e não pode ser removido.';
  if (/violates row-level security/i.test(m)) return 'Você não tem permissão para esta operação.';
  if (/JWT|not authenticated|Invalid login/i.test(m)) return 'Sessão expirada. Entre novamente.';
  if (/chk_vendas_desconto/i.test(m)) return 'O desconto não pode ser maior que o valor dos produtos.';
  if (/chk_.*_negativa|check_violation/i.test(m) && /Saldo insuficiente/i.test(m)) return m;
  if (/^ERROR:\s*/i.test(m)) return m.replace(/^ERROR:\s*/i,'');
  return m || 'Não foi possível concluir a operação.';
}

/* ───────── modal ───────── */
function modal({ titulo, corpo, rodape, largura = '', aoAbrir }) {
  const ov = el(`<div class="ov"><div class="modal ${largura}">
    <div class="modal-h"><h3>${esc(titulo)}</h3><button class="x" type="button">×</button></div>
    <div class="modal-b"></div>
    ${rodape !== null ? '<div class="modal-f"></div>' : ''}
  </div></div>`);
  const body = $('.modal-b', ov);
  body.innerHTML = typeof corpo === 'string' ? corpo : '';
  if (corpo instanceof Node) body.appendChild(corpo);
  const foot = $('.modal-f', ov);
  if (foot && rodape) foot.innerHTML = rodape;
  const fechar = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') fechar(); };
  $('.x', ov).onclick = fechar;
  ov.onclick = (e) => { if (e.target === ov) fechar(); };
  document.addEventListener('keydown', onKey);
  $('#modals').appendChild(ov);
  const ctx = { ov, body, foot, fechar };
  if (aoAbrir) aoAbrir(ctx);
  setTimeout(() => { const f = $('input:not([type=hidden]),select,textarea', body); if (f) f.focus(); }, 60);
  return ctx;
}

/** Confirmação obrigatória antes de excluir ou cancelar (RN-S02). */
function confirmar({ titulo, mensagem, detalhes = '', textoBotao = 'Confirmar', perigo = true, pedirMotivo = false }) {
  return new Promise(resolve => {
    const m = modal({
      titulo, largura: 'narrow',
      corpo: `<p style="font-size:14px;margin-bottom:${detalhes || pedirMotivo ? '14px' : '0'}">${mensagem}</p>
        ${detalhes ? `<div class="alert warn">${detalhes}</div>` : ''}
        ${pedirMotivo ? `<div class="field" style="margin-top:6px"><label>Motivo <span style="color:var(--red)">*</span></label>
           <textarea class="inp" id="cmotivo" placeholder="Explique o motivo — ficará registrado na auditoria"></textarea></div>` : ''}`,
      rodape: `<button class="btn btn-s" data-x>Voltar</button>
               <button class="btn ${perigo ? 'btn-d' : 'btn-p'}" data-ok>${esc(textoBotao)}</button>`
    });
    $('[data-x]', m.foot).onclick = () => { m.fechar(); resolve(null); };
    $('[data-ok]', m.foot).onclick = () => {
      if (pedirMotivo) {
        const mo = $('#cmotivo', m.body).value.trim();
        if (mo.length < 3) { bad('Motivo obrigatório', 'Descreva o motivo com pelo menos 3 caracteres.'); return; }
        m.fechar(); resolve(mo);
      } else { m.fechar(); resolve(true); }
    };
  });
}

/* ───────── acesso a dados ───────── */

/** Sessão expirada no meio do uso: em vez de espalhar erro pelas telas,
 *  avisa uma única vez e devolve o usuário para o login. */
let sessaoCaindo = false;
function checarSessao(error) {
  const m = String(error?.message || '');
  const cod = String(error?.code || '');
  if (!/JWT|jwt expired|not authenticated|invalid claim|token is expired/i.test(m)
      && cod !== 'PGRST301' && error?.status !== 401) return;
  if (sessaoCaindo) return;
  sessaoCaindo = true;
  bad('Sessão expirada', 'Entre novamente para continuar.');
  setTimeout(async () => { try { await sb.auth.signOut(); } catch (e) {} location.reload(); }, 1800);
}

async function q(fn) {
  const { data, error } = await fn;
  if (error) { checarSessao(error); throw error; }
  return data;
}
async function rpc(nome, args) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) { checarSessao(error); throw error; }
  return data;
}

/* ───────── componentes ───────── */
function selectOpts(lista, valor, campoV = 'id', campoT = 'nome') {
  return lista.map(o => `<option value="${esc(o[campoV])}" ${String(o[campoV]) === String(valor) ? 'selected' : ''}>${esc(o[campoT])}</option>`).join('');
}

function vazio(icone, titulo, texto, botao = '') {
  return `<div class="empty"><div class="ic">${icone}</div><h4>${esc(titulo)}</h4><p>${esc(texto)}</p>${botao}</div>`;
}

const CARREGANDO = '<div class="loading"><span class="spin"></span></div>';

/** Campo de busca com sugestões, usado para produto/cliente/revendedor/fornecedor.
 *  A lista é presa ao <body> com position:fixed — dentro das tabelas de itens
 *  (que têm overflow-x:auto) uma lista absoluta ficava recortada e invisível.
 *  opcoes.aoCriar: função (termo) chamada pelo item "Cadastrar novo…". */
function autocomplete(input, buscar, aoEscolher, formatar, opcoes = {}) {
  if (input.__ac) input.__ac.destruir();

  const box = el('<div class="gres flut"></div>');
  document.body.appendChild(box);

  let t, itens = [], idx = -1, aberto = false;

  const posicionar = () => {
    const r = input.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 270)) + 'px';
    box.style.width = Math.max(r.width, 250) + 'px';
    const espacoAbaixo = window.innerHeight - r.bottom;
    if (espacoAbaixo < 190 && r.top > 220) {
      box.style.top = ''; box.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    } else {
      box.style.bottom = ''; box.style.top = (r.bottom + 4) + 'px';
    }
  };
  const fechar = () => { box.classList.remove('on'); idx = -1; aberto = false; };
  const abrir = () => { posicionar(); box.classList.add('on'); aberto = true; };
  const pintar = () => $$('a[data-i]', box).forEach((a, i) => a.style.background = i === idx ? 'var(--brand-50)' : '');

  const destruir = () => {
    clearTimeout(t); box.remove();
    window.removeEventListener('scroll', aoRolar, true);
    window.removeEventListener('resize', aoRolar);
    document.removeEventListener('click', aoClicarFora, true);
    delete input.__ac;
  };
  const aoRolar = () => { if (!aberto) return;
    if (!document.contains(input)) return destruir();
    posicionar(); };
  const aoClicarFora = (e) => { if (!box.contains(e.target) && e.target !== input) fechar(); };
  window.addEventListener('scroll', aoRolar, true);
  window.addEventListener('resize', aoRolar);
  document.addEventListener('click', aoClicarFora, true);
  input.__ac = { destruir, fechar };

  const linhaCriar = (termo) => opcoes.aoCriar
    ? `<a href="#" class="criar" data-criar>➕ Cadastrar "${esc(termo)}" agora</a>` : '';

  const ligar = (termo) => {
    $$('a[data-i]', box).forEach((a, i) => a.onclick = (e) => {
      e.preventDefault(); e.stopPropagation(); aoEscolher(itens[i]); fechar(); });
    const c = $('[data-criar]', box);
    if (c) c.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fechar(); opcoes.aoCriar(termo); };
  };

  const procurar = async () => {
    const termo = input.value.trim();
    if (termo.length < 1) return fechar();
    try {
      itens = await buscar(termo) || [];
      box.innerHTML = itens.length
        ? itens.map((x, i) => formatar(x).replace('<a ', `<a data-i="${i}" `)).join('') + linhaCriar(termo)
        : `<a class="vazio">Nenhum resultado para "${esc(termo)}"</a>` + linhaCriar(termo);
      abrir(); idx = -1; ligar(termo);
    } catch (e) {
      box.innerHTML = `<a class="vazio">Erro na busca: ${esc(erroAmigavel(e))}</a>` + linhaCriar(termo);
      abrir(); ligar(termo);
    }
  };

  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(procurar, 220); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 1 && !aberto) procurar(); });
  input.addEventListener('keydown', (e) => {
    if (!aberto) { if (e.key === 'ArrowDown' && input.value.trim()) procurar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, itens.length - 1); pintar(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); idx = Math.max(idx - 1, 0); pintar(); }
    if (e.key === 'Enter') { e.preventDefault();
      if (idx >= 0 && itens[idx]) { aoEscolher(itens[idx]); fechar(); }
      else if (itens.length === 1) { aoEscolher(itens[0]); fechar(); } }
    if (e.key === 'Escape') fechar();
  });
  return { fechar, destruir };
}

/** Escapa os caracteres que quebram o filtro "or" do PostgREST. */
const termoBusca = (t) => String(t || '').replace(/[,()%\\]/g, ' ').trim();

const buscaProduto = (t) => { const b = termoBusca(t);
  return q(sb.from('vw_produtos').select('*').eq('ativo', true)
    .or(`nome.ilike.%${b}%,codigo.ilike.%${b}%,codigo_barras.ilike.%${b}%`).order('nome').limit(15)); };
const buscaCliente = (t) => { const b = termoBusca(t), d = digits(t);
  return q(sb.from('clientes').select('*').is('deleted_at', null)
    .or(`nome.ilike.%${b}%,cpf.ilike.%${d || b}%`).order('nome').limit(15)); };
const buscaRevendedor = (t) => { const b = termoBusca(t), d = digits(t);
  return q(sb.from('revendedores').select('*').is('deleted_at', null)
    .or(`nome.ilike.%${b}%,cpf.ilike.%${d || b}%`).order('nome').limit(15)); };
const buscaFornecedor = (t) => q(sb.from('fornecedores').select('*').is('deleted_at', null)
  .ilike('nome', `%${termoBusca(t)}%`).order('nome').limit(15));

const fmtProd = (p) => `<a href="#"><div class="pnome"><div class="ph">🌸</div><div style="min-width:0">
  <b>${esc(p.nome)}</b><span>${esc(p.codigo)} · ${QTD(p.qtd_disponivel)} disp. · ${BRL(p.preco_consumidor)}</span></div></div></a>`;
const fmtPessoa = (c) => `<a href="#"><b style="font-size:13px">${esc(c.nome)}</b>
  <span style="display:block;font-size:11.5px;color:var(--mute)">${c.cpf ? maskCPF(c.cpf) + ' · ' : ''}${c.whatsapp ? maskFone(c.whatsapp) : (c.cidade || '')}</span></a>`;

/* ───────── exportação ───────── */
function exportarExcel(nomeArquivo, colunas, linhas, resumo) {
  try {
    const wb = XLSX.utils.book_new();
    const dados = linhas.map(l => { const o = {}; colunas.forEach(c => o[c.t] = c.v(l)); return o; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), 'Dados');
    if (resumo) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
    XLSX.writeFile(wb, `${nomeArquivo}-${hoje()}.xlsx`);
    ok('Excel gerado', `${linhas.length} registro(s) exportado(s).`);
  } catch (e) {
    const csv = '﻿' + [colunas.map(c => c.t).join(';')]
      .concat(linhas.map(l => colunas.map(c => String(c.v(l) ?? '').replace(/;/g, ',')).join(';'))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
    a.download = `${nomeArquivo}-${hoje()}.csv`; a.click();
    ok('CSV gerado', 'O arquivo abre direto no Excel.');
  }
}

function imprimir(html) {
  $('#printarea').innerHTML = html;
  window.print();
}

/* ───────── autenticação ───────── */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#lbtn'); const erro = $('#loginErr');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Entrando…'; erro.innerHTML = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#lemail').value.trim(), password: $('#lsenha').value });
  if (error) {
    erro.innerHTML = `<div class="err">${/Invalid login/i.test(error.message)
      ? 'E-mail ou senha incorretos.' : esc(error.message)}</div>`;
    btn.disabled = false; btn.textContent = 'Entrar'; return;
  }
  await iniciar();
});

/** Encerra a sessão no Supabase e volta para a tela de login. */
async function sair() {
  if (!await confirmar({ titulo:'Sair do sistema', textoBotao:'Sair', perigo:false,
    mensagem:'Deseja encerrar a sessão?',
    detalhes:'Na próxima vez será preciso informar e-mail e senha novamente.' })) return;
  try { await sb.auth.signOut(); } catch (e) {}
  location.reload();
}
$('#sairBtn').onclick = sair;
$('#sairTopo').onclick = sair;

/* ───────── navegação ───────── */
const MENU = [
  { g:'Principal', itens:[ { h:'dashboard', i:'◈', t:'Dashboard' } ] },
  { g:'Cadastros', itens:[
      { h:'produtos', i:'🌸', t:'Produtos' },
      { h:'clientes', i:'👤', t:'Clientes' },
      { h:'revendedores', i:'🤝', t:'Revendedores' },
      { h:'fornecedores', i:'🏭', t:'Fornecedores' } ] },
  { g:'Operação', itens:[
      { h:'compras', i:'📥', t:'Compras' },
      { h:'vendas', i:'🛒', t:'Vendas' },
      { h:'mostruarios', i:'📦', t:'Mostruários' },
      { h:'estoque', i:'🗃️', t:'Estoque' } ] },
  { g:'Financeiro', itens:[
      { h:'receber', i:'💰', t:'Contas a Receber', badge:'vencidos' },
      { h:'pagar', i:'📤', t:'Contas a Pagar', badge:'apagar' },
      { h:'recebimentos', i:'🧾', t:'Recebimentos' },
      { h:'despesas', i:'📉', t:'Despesas' },
      { h:'financeiro', i:'📊', t:'DRE e Caixa' } ] },
  { g:'Análise', itens:[
      { h:'relatorios', i:'📄', t:'Relatórios' },
      { h:'configuracoes', i:'⚙️', t:'Configurações' } ] }
];

function montarMenu() {
  $('#nav').innerHTML = MENU.map(g =>
    `<div class="sb-grp">${g.g}</div>` + g.itens.map(i =>
      `<a href="#${i.h}" data-h="${i.h}"><span class="ic">${i.i}</span>${i.t}
        ${i.badge ? `<span class="bdg" data-badge="${i.badge}" style="display:none"></span>` : ''}</a>`).join('')
  ).join('');
}

const ROTAS = {};
async function navegar() {
  const [rota, ...args] = (location.hash.slice(1) || 'dashboard').split('/');
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.h === rota));
  $('#sidebar').classList.remove('open');
  const alvo = ROTAS[rota] || ROTAS.dashboard;
  const view = $('#view');
  view.innerHTML = CARREGANDO;
  try { await alvo(view, ...args); }
  catch (e) {
    console.error(e);
    view.innerHTML = `<div class="alert bad"><div><b>Não foi possível carregar esta tela.</b><br>${esc(erroAmigavel(e))}</div></div>
      <button class="btn btn-s" onclick="navegar()">Tentar novamente</button>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navegar);
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');

function crumb(txt) { $('#crumb').innerHTML = `<b>${esc(txt)}</b>`; }

/* ───────── busca global ───────── */
let gT;
$('#gsearch').addEventListener('input', (e) => {
  clearTimeout(gT);
  const t = e.target.value.trim();
  const box = $('#gres');
  if (t.length < 2) { box.classList.remove('on'); return; }
  gT = setTimeout(async () => {
    try {
      const [prods, clis, revs] = await Promise.all([
        buscaProduto(t).catch(() => []), buscaCliente(t).catch(() => []), buscaRevendedor(t).catch(() => [])
      ]);
      let h = '';
      if (prods.length) h += '<a class="t" style="cursor:default;background:#fbfcfe">Produtos</a>' +
        prods.slice(0,5).map(p => `<a href="#produtos/${p.id}"><b>${esc(p.nome)}</b>
          <span style="color:var(--mute);font-size:11.5px"> · ${esc(p.codigo)} · ${QTD(p.qtd_disponivel)} disp.</span></a>`).join('');
      if (clis.length) h += '<a class="t" style="cursor:default;background:#fbfcfe">Clientes</a>' +
        clis.slice(0,4).map(c => `<a href="#clientes/${c.id}"><b>${esc(c.nome)}</b></a>`).join('');
      if (revs.length) h += '<a class="t" style="cursor:default;background:#fbfcfe">Revendedores</a>' +
        revs.slice(0,4).map(r => `<a href="#revendedores/${r.id}"><b>${esc(r.nome)}</b></a>`).join('');
      box.innerHTML = h || '<a style="color:var(--mute);cursor:default">Nenhum resultado</a>';
      box.classList.add('on');
      $$('#gres a[href]').forEach(a => a.onclick = () => { box.classList.remove('on'); $('#gsearch').value = ''; });
    } catch (e) { box.classList.remove('on'); }
  }, 280);
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search-glob')) $('#gres').classList.remove('on'); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#gsearch').focus(); }
});

/* ───────── inicialização ───────── */
async function carregarBase() {
  const [params, formas, cats, marcas] = await Promise.all([
    q(sb.from('parametros').select('*')),
    q(sb.from('formas_pagamento').select('*').eq('ativo', true).order('nome')),
    q(sb.from('categorias').select('*').is('deleted_at', null).eq('ativo', true).order('nome')),
    q(sb.from('marcas').select('*').is('deleted_at', null).eq('ativo', true).order('nome'))
  ]);
  S.params = Object.fromEntries(params.map(p => [p.chave, p.valor]));
  S.formas = formas; S.categorias = cats; S.marcas = marcas;
  if (S.params.empresa_nome) $('#empNome').textContent = S.params.empresa_nome;
}

async function atualizarBadges() {
  try {
    const d = await q(sb.from('vw_dashboard').select('qtd_titulos_vencidos').single());
    const b = $('[data-badge="vencidos"]');
    if (b) { const n = N(d.qtd_titulos_vencidos); b.textContent = n; b.style.display = n > 0 ? '' : 'none'; }
  } catch (e) {}
  /* Compra vencida e não paga também merece aviso no menu. */
  try {
    const c = await q(sb.from('vw_compras_a_pagar').select('id').eq('situacao','VENCIDO'));
    const b = $('[data-badge="apagar"]');
    if (b) { b.textContent = c.length; b.style.display = c.length > 0 ? '' : 'none'; }
  } catch (e) {}
}

/* Carimbo de versão do arquivo. Trocado pelo scripts/build.sh a cada geração:
   é o que permite dizer, olhando a tela, se a cópia aberta é a mais nova. */
const VERSAO = '__VERSAO__';

async function iniciar() {
  const el = document.getElementById('sbVer');
  if (el) el.textContent = 'versão ' + VERSAO;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $('#login').style.display = 'grid'; $('#app').classList.remove('on'); return; }
  S.user = session.user;
  try {
    const u = await q(sb.from('usuarios').select('*').eq('id', session.user.id).single());
    S.perfil = u;
    $('#unome').textContent = u.nome;
    $('#tbNome').textContent = u.nome;
    $('#uperfil').textContent = u.perfil.charAt(0) + u.perfil.slice(1).toLowerCase();
    $('#uav').textContent = u.nome.trim().charAt(0).toUpperCase();
    await sb.from('usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', u.id);
  } catch (e) {
    $('#loginErr').innerHTML = '<div class="err">Seu usuário não tem perfil configurado no sistema.</div>';
    await sb.auth.signOut(); return;
  }
  await carregarBase();
  montarMenu();
  $('#login').style.display = 'none';
  $('#app').classList.add('on');
  await navegar();
  atualizarBadges();
  setInterval(atualizarBadges, 120000);
}

/* Se a sessão cair ou o token não puder ser renovado enquanto o sistema
   está aberto, volta para o login em vez de deixar a tela dando erro. */
sb.auth.onAuthStateChange((ev, sessao) => {
  if (ev === 'SIGNED_OUT' || (ev === 'TOKEN_REFRESHED' && !sessao)) location.reload();
});

// Expostos para uso no console do navegador (diagnóstico e consultas manuais)
window.sb = sb; window.q = q; window.rpc = rpc; window.S = S; window.navegar = navegar;
