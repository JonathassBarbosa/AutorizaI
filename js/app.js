/**
 * Shell do app: rotas, menu por perfil, notificações e push.
 */
import { html, api, sessao, icone, iniciais, CFG, PERFIS, APROVADORES, relativo, toast, caixaErro, ApiErro } from './core.js';
import { iniciarPush, sairPush } from './push.js';
import { assinatura, rosaSvg, abertura } from './marcas.js';
import login from './views/login.js';
import cadastro from './views/cadastro.js';
import recuperar from './views/recuperar.js';
import trocarSenha from './views/trocar-senha.js';
import inicio from './views/inicio.js';
import { listaSolicitacoes, listaAprovacoes } from './views/solicitacoes.js';
import detalhe from './views/detalhe.js';
import nova from './views/nova.js';
import verificar from './views/verificar.js';
import estrutura from './views/estrutura.js';
import usuarios from './views/usuarios.js';
import tipos from './views/tipos.js';
import monitor from './views/monitor.js';
import perfil from './views/perfil.js';

const TODOS = Object.keys(PERFIS);
const QUEM_CRIA = ['consultor', 'gerente', 'regional', 'superintendente', 'diretor', 'master']; // o assistente não solicita
const QUEM_VERIFICA = ['assistente', 'gerente', 'regional', 'superintendente', 'diretor', 'master'];

const VIEWS = {
  login, cadastro, recuperar, 'trocar-senha': trocarSenha, inicio, solicitacoes: listaSolicitacoes, aprovacoes: listaAprovacoes,
  solicitacao: detalhe, nova, verificar, estrutura, usuarios, tipos, monitor, perfil,
};

const MENU = [
  { rota: 'inicio', titulo: 'Início', icone: 'home', perfis: TODOS, barra: true },
  { rota: 'solicitacoes', titulo: 'Solicitações', icone: 'lista', perfis: TODOS.filter(p => p !== 'assistente'), barra: true },
  { rota: 'solicitacoes', titulo: 'Retornos', icone: 'lista', perfis: ['assistente'], barra: true },
  { rota: 'aprovacoes', titulo: 'Aprovações', icone: 'escudo', perfis: APROVADORES, barra: true, contador: 'para_aprovar' },
  { rota: 'nova', titulo: 'Nova solicitação', icone: 'mais', perfis: QUEM_CRIA, barra: true },
  { rota: 'verificar', titulo: 'Verificar autorização', icone: 'busca', perfis: QUEM_VERIFICA, barra: true },
  { secao: 'Administração', perfis: ['master'] },
  { rota: 'estrutura', titulo: 'Estrutura', icone: 'organo', perfis: ['master'] },
  { rota: 'usuarios', titulo: 'Usuários', icone: 'usuarios', perfis: ['master'], contador: 'cadastros_pendentes' },
  { rota: 'tipos', titulo: 'Tipos de exceção', icone: 'etiqueta', perfis: ['master'] },
  { rota: 'monitor', titulo: 'Monitor', icone: 'pulso', perfis: ['master'] },
];

const raiz = document.getElementById('app');
const estado = { notif: { nao_lidas: 0, para_aprovar: 0, itens: [] }, vistas: null, viewAtual: null, seq: 0, timerNotif: null, appConfig: null };

// ---------------------------------------------------------------- Rotas
function lerRota() {
  const h = location.hash.replace(/^#\/?/, '');
  const [caminho, qs] = h.split('?');
  const [nome, ...params] = caminho.split('/').filter(Boolean);
  return { nome: nome || 'inicio', params, query: new URLSearchParams(qs || '') };
}
export const ir = (rota) => { location.hash = '#/' + rota; };

async function navegar() {
  const rota = lerRota();
  const s = sessao.ler();
  const publica = VIEWS[rota.nome]?.publica || rota.nome === 'login';
  if (!s && !publica) return ir('login');
  if (s && publica) return ir('inicio');
  if (s?.usuario?.trocar_senha && rota.nome !== 'trocar-senha') return ir('trocar-senha');

  const view = VIEWS[rota.nome];
  const seq = ++estado.seq;
  estado.viewAtual?.sair?.();
  estado.viewAtual = view || null;

  let alvo;
  if (!view || view.telaCheia) {
    pararNotificacoes();
    alvo = raiz;
    alvo.innerHTML = '';
  } else {
    montarShell();
    // Container novo a cada página: os eventos da página anterior não ficam pendurados.
    const anterior = document.getElementById('conteudo');
    alvo = anterior.cloneNode(false);
    anterior.replaceWith(alvo);
    if (estado.ultimaRota !== rota.nome) document.getElementById('modal-root').innerHTML = '';
    estado.ultimaRota = rota.nome;
    marcarMenu(rota.nome);
    document.getElementById('shell').classList.remove('drawer-aberto');
    document.getElementById('titulo-pagina').textContent = typeof view.titulo === 'string' ? view.titulo : '';
    if (view.perfis && !view.perfis.includes(s.usuario.perfil)) {
      alvo.innerHTML = html`<div class="espaco"></div>${caixaErro({ message: 'Seu perfil não tem acesso a esta página.' })}`.toString();
      return;
    }
    alvo.innerHTML = `<div class="carregando-rosa">${rosaSvg({ modo: 'girando' })}</div>`;
    window.scrollTo(0, 0);
  }
  if (!view) { alvo.innerHTML = '<div class="carregando">Página não encontrada</div>'; return; }

  const ctx = { usuario: sessao.usuario, rota, ir, atualizarNotificacoes, aoEntrar, estado };
  try {
    const conteudo = await view.render(ctx);
    if (seq !== estado.seq) return; // o usuário já navegou para outra página
    alvo.innerHTML = conteudo.toString();
    if (typeof view.titulo === 'function') document.getElementById('titulo-pagina').textContent = view.titulo(ctx);
    await view.montar?.(alvo, ctx);
  } catch (e) {
    if (seq !== estado.seq) return;
    alvo.innerHTML = html`<div class="espaco"></div>${caixaErro(e)}`.toString();
    if (!(e instanceof ApiErro)) throw e; // vai para o monitor
  }
}

// ---------------------------------------------------------------- Shell
function itensDoMenu(perfil) {
  return MENU.filter(m => m.perfis.includes(perfil));
}

function montarShell() {
  if (document.getElementById('shell')) return;
  const u = sessao.usuario;
  const itens = itensDoMenu(u.perfil);
  const barra = itens.filter(m => m.barra).slice(0, 4);
  raiz.innerHTML = html`
    <div class="shell" id="shell">
      <aside class="sidebar">
        <div class="sidebar-topo">${assinatura()}<small>Autorizações</small></div>
        <ul class="menu">
          ${itens.map(m => m.secao
            ? html`<li class="menu-secao">${m.secao}</li>`
            : html`<li><a href="#/${m.rota}" data-rota="${m.rota}">${icone(m.icone)}<span>${m.titulo}</span>
                ${m.contador ? html`<span class="contador ouro" data-contador="${m.contador}" hidden></span>` : ''}</a></li>`)}
        </ul>
        <a class="sidebar-usuario" href="#/perfil">
          <span class="avatar">${iniciais(u.nome)}</span>
          <div><strong>${u.nome}</strong><small>${PERFIS[u.perfil]}</small></div>
        </a>
      </aside>
      <div class="drawer-fundo" data-acao="fechar-menu"></div>
      <div class="principal">
        <header class="topbar" id="topbar">
          <button class="icone-btn so-mobile" data-acao="abrir-menu" aria-label="Menu">${icone('menu')}</button>
          <h1 id="titulo-pagina"></h1>
          <div style="position:relative">
            <button class="icone-btn" data-acao="notificacoes" aria-label="Notificações">${icone('sino')}
              <span class="contador ponto" data-contador="nao_lidas" hidden></span></button>
            <div id="painel-notif"></div>
          </div>
        </header>
        <main class="conteudo" id="conteudo"></main>
      </div>
      <nav class="bottom-nav">
        ${barra.map(m => html`<a href="#/${m.rota}" data-rota="${m.rota}">${icone(m.icone)}<span>${m.titulo.split(' ')[0]}</span>
          ${m.contador ? html`<span class="contador ouro" data-contador="${m.contador}" hidden></span>` : ''}</a>`)}
        <button data-acao="abrir-menu">${icone('menu')}<span>Menu</span></button>
      </nav>
    </div>`.toString();

  const shell = document.getElementById('shell');
  shell.addEventListener('click', ev => {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.acao;
    if (acao === 'abrir-menu') shell.classList.add('drawer-aberto');
    if (acao === 'fechar-menu') shell.classList.remove('drawer-aberto');
    if (acao === 'notificacoes') alternarPainelNotif();
  });
  window.addEventListener('scroll', () => document.getElementById('topbar')?.classList.toggle('rolou', window.scrollY > 4), { passive: true });
  iniciarNotificacoes();
  carregarConfigEPush();
}

function marcarMenu(nome) {
  const ativo = nome === 'solicitacao' ? 'solicitacoes' : nome;
  document.querySelectorAll('[data-rota]').forEach(a => a.classList.toggle('ativo', a.dataset.rota === ativo));
}

// ---------------------------------------------------------------- Notificações
function iniciarNotificacoes() {
  pararNotificacoes();
  atualizarNotificacoes(true);
  estado.timerNotif = setInterval(() => { if (!document.hidden) atualizarNotificacoes(); }, 45000);
}
function pararNotificacoes() { clearInterval(estado.timerNotif); estado.timerNotif = null; estado.vistas = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && estado.timerNotif) atualizarNotificacoes(); });

export async function atualizarNotificacoes(primeira = false) {
  if (!sessao.token) return;
  try {
    const r = await api('notificacoes.listar');
    const novas = estado.vistas ? r.itens.filter(n => !n.lida && !estado.vistas.has(n.id)) : [];
    estado.vistas = new Set(r.itens.map(n => n.id));
    estado.notif = r;
    if (!primeira) novas.slice(0, 3).forEach(n => toast(html`<strong>${n.titulo}</strong><br>${n.mensagem}`, 'info', n.link));
    document.querySelectorAll('[data-contador]').forEach(el => {
      const v = r[el.dataset.contador] || 0;
      el.textContent = v > 99 ? '99+' : v;
      el.hidden = !v;
    });
  } catch { /* silencioso: a próxima rodada tenta de novo */ }
}

function alternarPainelNotif() {
  const painel = document.getElementById('painel-notif');
  if (painel.innerHTML) { painel.innerHTML = ''; return; }
  const n = estado.notif;
  painel.innerHTML = html`
    <div class="painel-notif">
      <header><strong>Notificações</strong>${n.nao_lidas ? html`<button class="btn btn-link" data-ler-todas>Marcar como lidas</button>` : ''}</header>
      ${n.itens.length ? n.itens.map(x => html`
        <a class="notif ${x.lida ? '' : 'nova'}" href="${x.link || '#/inicio'}" data-notif="${x.id}">
          <strong>${x.titulo}</strong><p>${x.mensagem}</p><small>${relativo(x.criado_em)}</small></a>`)
      : html`<div class="vazio" style="padding:28px">${icone('sino')}<br>Nada por aqui ainda.</div>`}
    </div>`.toString();
  painel.onclick = async ev => {
    if (ev.target.closest('[data-ler-todas]')) {
      ev.preventDefault();
      await api('notificacoes.marcarLidas', {}).catch(() => {});
      painel.innerHTML = '';
      atualizarNotificacoes(true);
      return;
    }
    const a = ev.target.closest('[data-notif]');
    if (a) {
      painel.innerHTML = '';
      api('notificacoes.marcarLidas', { ids: [a.dataset.notif] }).then(() => atualizarNotificacoes(true)).catch(() => {});
    }
  };
  setTimeout(() => document.addEventListener('click', function fora(ev) {
    if (!ev.target.closest('#painel-notif') && !ev.target.closest('[data-acao="notificacoes"]')) {
      painel.innerHTML = '';
      document.removeEventListener('click', fora);
    }
  }), 0);
}

// ---------------------------------------------------------------- Push / sessão
async function carregarConfigEPush() {
  try {
    if (!estado.appConfig) estado.appConfig = await api('app.config');
    await iniciarPush(estado.appConfig.onesignal_app_id || CFG.ONESIGNAL_APP_ID, sessao.usuario);
  } catch (e) {
    console.warn('Push indisponível:', e.message);
  }
}

function aoEntrar(resposta) {
  sessao.salvar({ token: resposta.token, expira_em: resposta.expira_em, usuario: resposta.usuario });
  document.getElementById('shell')?.remove();
}

export async function sair() {
  try { await api('auth.logout'); } catch { /* a sessão local é apagada de qualquer forma */ }
  await sairPush();
  sessao.limpar();
  document.getElementById('shell')?.remove();
  pararNotificacoes();
  ir('login');
}
window.GAVSair = sair;

// ---------------------------------------------------------------- PWA
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const base = location.pathname.replace(/[^/]*$/, '');
  navigator.serviceWorker.register('sw.js', { scope: base }).catch(e => console.warn('Service worker:', e.message));
}

window.addEventListener('hashchange', navegar);
abertura(); // logotipo animado ao iniciar o app
navegar();
