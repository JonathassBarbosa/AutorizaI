import { html, api, icone, seloStatus, seloDesfecho, moeda, relativo, nomeMes, ultimosMeses, vazio, ALCADAS } from '../core.js';

const filtros = { status: '', mes: '', sala_id: '', busca: '' };

function item(s, mostrarAlcada) {
  return html`<a class="lista-item" href="#/solicitacao/${s.id}">
    <div>
      <div class="titulo">${s.cliente}</div>
      <div class="sub">${s.tipo_nome}</div>
    </div>
    <div>
      <div class="sub">${s.consultor_nome} · ${s.sala_nome}</div>
      <div class="codigo">${s.codigo}</div>
    </div>
    <div>
      <div class="sub">${moeda(s.valor)}</div>
      <div class="sub">${relativo(s.criado_em)}${mostrarAlcada ? ` · alçada ${ALCADAS[s.alcada] || s.alcada}` : ''}</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${seloStatus(s.status)}${seloDesfecho(s.desfecho)}</div>
    ${icone('seta')}
  </a>`;
}

function criarLista(paraMim) {
  return {
    titulo: paraMim ? 'Aprovações' : 'Solicitações',
    async render(ctx) {
      const u = ctx.usuario;
      const [lista, estrutura] = await Promise.all([
        api('solicitacoes.listar', paraMim ? { para_mim: true } : filtros),
        paraMim || u.perfil === 'consultor' ? null : api('estrutura.obter'),
      ]);
      const salas = estrutura?.salas || [];

      if (paraMim) {
        return html`
          <div class="cabecalho"><div><h2 style="font-size:22px">Aguardando sua decisão</h2>
            <p>Exceções dentro da sua alçada. A mais antiga aparece por último.</p></div></div>
          <div class="card">${lista.itens.length ? lista.itens.map(s => item(s, true))
            : vazio('Tudo em dia!', 'Nenhuma exceção aguardando sua aprovação agora.', 'check')}</div>`;
      }

      return html`
        <div class="cabecalho">
          <div><h2 style="font-size:22px">${u.perfil === 'consultor' ? 'Minhas solicitações' : 'Solicitações'}</h2>
            <p>${lista.total} ${lista.total === 1 ? 'resultado' : 'resultados'}${lista.total > lista.itens.length ? ` (mostrando ${lista.itens.length})` : ''}</p></div>
          <div class="acoes">${u.perfil !== 'assistente' ? html`<a class="btn btn-ouro" href="#/nova">${icone('mais')} Nova</a>` : ''}</div>
        </div>
        <div class="card" style="margin-bottom:16px"><div class="card-corpo" style="display:flex;flex-direction:column;gap:12px">
          <div class="linha-campos" style="grid-template-columns:2fr 1fr ${salas.length > 1 ? '1fr' : ''};gap:12px">
            <div class="busca">${icone('busca')}<input class="entrada" id="busca" placeholder="Cliente, CPF, código ou consultor" value="${filtros.busca}"></div>
            <select class="entrada" id="f-mes"><option value="">Todos os meses</option>
              ${ultimosMeses(12).map(m => html`<option value="${m}" ${m === filtros.mes ? 'selected' : ''}>${nomeMes(m)}</option>`)}</select>
            ${salas.length > 1 ? html`<select class="entrada" id="f-sala"><option value="">Todas as salas</option>
              ${salas.map(s => html`<option value="${s.id}" ${s.id === filtros.sala_id ? 'selected' : ''}>${s.nome}</option>`)}</select>` : ''}
          </div>
          <div class="chips">
            ${[['', 'Todas'], ['pendente', 'Pendentes'], ['aprovada', 'Aprovadas'], ['negada', 'Negadas'], ['cancelada', 'Canceladas']]
              .map(([v, t]) => html`<button class="chip ${filtros.status === v ? 'ativo' : ''}" data-status="${v}">${t}</button>`)}
          </div>
        </div></div>
        <div class="card" id="resultado">${lista.itens.length ? lista.itens.map(s => item(s, false))
          : vazio('Nenhuma solicitação encontrada', 'Ajuste os filtros ou crie uma nova solicitação.')}</div>`;
    },
    montar(el, ctx) {
      if (paraMim) return;
      const recarregar = () => ctx.ir('solicitacoes?t=' + Date.now());
      let timer;
      const busca = el.querySelector('#busca');
      busca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { filtros.busca = busca.value.trim(); recarregar(); }, 450);
      });
      if (filtros.busca) { busca.focus(); busca.setSelectionRange(busca.value.length, busca.value.length); }
      el.querySelector('#f-mes').addEventListener('change', e => { filtros.mes = e.target.value; recarregar(); });
      el.querySelector('#f-sala')?.addEventListener('change', e => { filtros.sala_id = e.target.value; recarregar(); });
      el.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { filtros.status = b.dataset.status; recarregar(); }));
    },
  };
}

export const listaSolicitacoes = criarLista(false);
export const listaAprovacoes = criarLista(true);
