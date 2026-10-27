/**
 * Núcleo do app: HTML seguro, chamada à API, sessão, formatação e componentes.
 */
export const CFG = window.GAV_CONFIG || {};

// ---------------------------------------------------------------- HTML seguro
// Tudo que entra por ${...} é escapado, exceto o que vier marcado com raw().
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s ?? ''));
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function paraHtml(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(paraHtml).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
export function html(partes, ...valores) {
  let out = '';
  partes.forEach((p, i) => { out += p; if (i < valores.length) out += paraHtml(valores[i]); });
  return new Raw(out);
}

// ---------------------------------------------------------------- Sessão
const CHAVE_SESSAO = 'gav_sessao';
export const sessao = {
  ler() { try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)); } catch { return null; } },
  salvar(s) { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); },
  limpar() { localStorage.removeItem(CHAVE_SESSAO); },
  get usuario() { return this.ler()?.usuario || null; },
  get token() { return this.ler()?.token || null; },
  atualizarUsuario(u) { const s = this.ler(); if (s) { s.usuario = u; this.salvar(s); } },
};

// ---------------------------------------------------------------- API
export class ApiErro extends Error {
  constructor(mensagem, codigo, local) { super(mensagem); this.name = 'ApiErro'; this.codigo = codigo; this.local = local; }
}

export async function api(acao, dados = {}) {
  if (!CFG.API_URL || /COLE_AQUI/.test(CFG.API_URL)) {
    throw new ApiErro('A URL da API ainda não foi configurada no arquivo config.js.', 'CONFIG');
  }
  let resp;
  try {
    resp = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS no Apps Script
      body: JSON.stringify({ action: acao, token: sessao.token, data: dados }),
    });
  } catch {
    throw new ApiErro('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 'REDE');
  }
  let json;
  try {
    json = await resp.json();
  } catch {
    window.GAVMonitor?.registrar({ tipo: 'api', mensagem: `Resposta inválida do servidor em "${acao}" (HTTP ${resp.status})`, rota: acao });
    throw new ApiErro(`O servidor respondeu de forma inesperada (HTTP ${resp.status}).`, 'RESPOSTA');
  }
  if (!json.ok) {
    const e = json.error || {};
    if (e.code === 'SESSAO') {
      sessao.limpar();
      if (location.hash !== '#/login') location.hash = '#/login';
    } else if (e.code === 'TROCAR_SENHA') {
      const s = sessao.ler();
      if (s?.usuario) { s.usuario.trocar_senha = true; sessao.salvar(s); }
      location.hash = '#/trocar-senha';
    }
    throw new ApiErro(e.message || 'Erro desconhecido.', e.code, e.local);
  }
  return json.data;
}

// ---------------------------------------------------------------- Rótulos
export const PERFIS = {
  master: 'Master', superintendente: 'Superintendente', regional: 'Regional',
  gerente: 'Gerente', assistente: 'Assistente de contratos', consultor: 'Consultor',
};
export const ALCADAS = { gerente: 'Gerente', regional: 'Regional', superintendente: 'Superintendente' };
export const STATUS = {
  pendente: ['Pendente', 'ambar'], aprovada: ['Aprovada', 'verde'], negada: ['Negada', 'vermelho'], cancelada: ['Cancelada', 'cinza'],
};
export const DESFECHOS = { venda_finalizada: ['Venda finalizada', 'azul'], sem_venda: ['Sem venda', 'cinza'] };
export const APROVADORES = ['gerente', 'regional', 'superintendente', 'master'];

export const seloStatus = s => { const [t, c] = STATUS[s] || [s, 'cinza']; return html`<span class="selo selo-${c}">${t}</span>`; };
export const seloDesfecho = d => { if (!d) return ''; const [t, c] = DESFECHOS[d] || [d, 'cinza']; return html`<span class="selo selo-${c}">${t}</span>`; };
export const iniciais = nome => String(nome || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

// ---------------------------------------------------------------- Formatação
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = v => (v === null || v === undefined || v === '' || isNaN(v) ? '—' : fmtMoeda.format(Number(v)));
export const dataHora = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const data = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
export const hora = iso => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
export function relativo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} d`;
  return data(iso);
}
export function duracao(min) {
  if (min === null || min === undefined) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}
export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function nomeMes(m) {
  const [a, n] = m.split('-').map(Number);
  const t = new Date(a, n - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function ultimosMeses(qtd = 12) {
  const l = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < qtd; i++) {
    l.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return l;
}
export function mascaraCpf(v) {
  const d = String(v).replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export function cpfValido(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
/** "R$ 1.234,56" → 1234.56 */
export function lerMoeda(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d ? Number(d) / 100 : '';
}
export function mascaraMoeda(v) {
  const n = lerMoeda(v);
  return n === '' ? '' : fmtMoeda.format(n);
}

// ---------------------------------------------------------------- Ícones
const ICONES = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  lista: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  escudo: '<path d="M12 3 4.5 6v6c0 4.6 3.2 8 7.5 9 4.3-1 7.5-4.4 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  organo: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2.5h12V16"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  etiqueta: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.4"/>',
  pulso: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.4-6 8-6s7 2 8 6"/>',
  sino: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  sair: '<path d="M9 4H5v16h4"/><path d="m14 8 4 4-4 4M18 12H9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alerta: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  impressora: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  seta: '<path d="m9 6 6 6-6 6"/>',
  voltar: '<path d="m15 6-6 6 6 6"/>',
  predio: '<path d="M4 21V5l8-3v19M12 9h8v12M3 21h18"/><path d="M8 7v.01M8 11v.01M8 15v.01M16 13v.01M16 17v.01"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  celular: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  grafico: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
};
export const icone = (nome, extra = '') => raw(`<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`);

// ---------------------------------------------------------------- Toast / modal
export function toast(mensagem, tipo = 'info', link = null) {
  const caixa = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = html`<div>${mensagem}${link ? html` <a href="${link}">Abrir</a>` : ''}</div>`.toString();
  caixa.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 4500);
}

export function erroToast(e) {
  toast(e?.message || String(e), 'erro');
  if (!(e instanceof ApiErro)) window.GAVMonitor?.registrar({ tipo: 'js', mensagem: e?.message || String(e), stack: e?.stack });
}

/** Abre um modal. Retorna { el, fechar }. Botões com [data-fechar] fecham. */
export function modal({ titulo, corpo, rodape = '', largo = false, aoFechar }) {
  const raiz = document.getElementById('modal-root');
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = html`
    <div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
      <header><h3>${titulo}</h3><button class="editar-link" data-fechar aria-label="Fechar">${icone('x')}</button></header>
      <div class="modal-corpo">${corpo}</div>
      ${rodape ? html`<footer>${rodape}</footer>` : ''}
    </div>`.toString();
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); aoFechar?.(); };
  const esc = ev => { if (ev.key === 'Escape') fechar(); };
  fundo.addEventListener('click', ev => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', esc);
  raiz.appendChild(fundo);
  setTimeout(() => fundo.querySelector('input:not([type=hidden]), select, textarea')?.focus(), 50);
  return { el: fundo, fechar };
}

export function confirmar(titulo, mensagem, textoOk = 'Confirmar', classeOk = 'btn-primario') {
  return new Promise(resolve => {
    let ok = false;
    const m = modal({
      titulo,
      corpo: html`<p style="margin:0">${mensagem}</p>`,
      rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn ${classeOk}" data-ok>${textoOk}</button>`,
      aoFechar: () => resolve(ok),
    });
    m.el.querySelector('[data-ok]').onclick = () => { ok = true; m.fechar(); };
  });
}

/** Põe o botão em estado de carregamento enquanto a promessa roda. */
export async function ocupado(botao, fn) {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<span class="giro"></span> Aguarde…';
  try { return await fn(); } finally { botao.disabled = false; botao.innerHTML = original; }
}

export function dadosDoForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

export const vazio = (titulo, texto, nomeIcone = 'lista') =>
  html`<div class="vazio">${icone(nomeIcone)}<strong>${titulo}</strong>${texto}</div>`;

export function caixaErro(e) {
  return html`<div class="aviso aviso-vermelho">${icone('alerta')}<div><strong>Não foi possível carregar.</strong><br>${e.message}
    ${e.local ? html`<pre>${e.local}</pre>` : ''}</div></div>`;
}
