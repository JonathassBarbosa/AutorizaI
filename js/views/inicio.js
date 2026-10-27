import {
  html, api, icone, seloStatus, moeda, relativo, duracao, mesAtual, nomeMes, ultimosMeses, modal, ocupado, toast, vazio,
  APROVADORES, PERFIS,
} from '../core.js';

let mesEscolhido = mesAtual();

function kpi(rotulo, valor, sub, cor, destaque = false) {
  return html`<div class="card kpi ${destaque ? 'destaque' : ''}" style="--kpi-cor:${cor}">
    <small>${rotulo}</small><strong>${valor}</strong>${sub ? html`<span>${sub}</span>` : ''}</div>`;
}

function barraSala(s) {
  const escala = Math.max(s.limite_pct * 1.5, s.pct, 10);
  const acima = s.limite_pct > 0 && s.pct >= s.limite_pct;
  return html`<div class="barra" title="${s.pct}% de exceções${s.limite_pct ? ` · limite ${s.limite_pct}%` : ''}">
    <i class="${acima ? 'alerta' : ''}" style="width:${Math.min(100, (s.pct / escala) * 100)}%"></i>
    ${s.limite_pct ? html`<b style="left:${(s.limite_pct / escala) * 100}%"></b>` : ''}</div>`;
}

function linhaRecente(s) {
  return html`<a class="lista-item" href="#/solicitacao/${s.id}">
    <div><div class="titulo">${s.cliente}</div><div class="sub">${s.tipo_nome}</div></div>
    <div><div class="sub">${s.sala_nome}</div><div class="codigo">${s.codigo}</div></div>
    <div class="sub">${relativo(s.criado_em)}</div>
    ${seloStatus(s.status)}${icone('seta')}</a>`;
}

export default {
  titulo: 'Início',
  async render(ctx) {
    const u = ctx.usuario;
    const d = await api('dashboard.obter', { mes: mesEscolhido });
    const k = d.kpis;
    const ehConsultor = u.perfil === 'consultor';
    const aprovador = APROVADORES.includes(u.perfil);
    const primeiroNome = u.nome.split(' ')[0];

    return html`
      <div class="cabecalho">
        <div>
          <h2 style="font-size:24px">Olá, ${primeiroNome}</h2>
          <p>${PERFIS[u.perfil]} · ${u.vinculo}</p>
        </div>
        <div class="acoes">
          <select class="entrada" id="mes" style="width:auto;min-width:190px">
            ${ultimosMeses(12).map(m => html`<option value="${m}" ${m === d.mes ? 'selected' : ''}>${nomeMes(m)}</option>`)}
          </select>
          ${!['assistente'].includes(u.perfil) ? html`<a class="btn btn-ouro" href="#/nova">${icone('mais')} Nova solicitação</a>` : ''}
        </div>
      </div>

      ${aprovador && k.para_mim ? html`
        <a class="aviso aviso-ambar" href="#/aprovacoes" style="margin-bottom:16px;color:#7A500D">${icone('escudo')}
          <div><strong>${k.para_mim} ${k.para_mim === 1 ? 'exceção aguardando' : 'exceções aguardando'} sua aprovação.</strong> Toque para revisar.</div></a>` : ''}

      <div class="grade grade-4">
        ${!ehConsultor && d.taxa_geral !== null
          ? kpi('Taxa de exceção', `${d.taxa_geral}%`, `${d.vendas_total} vendas lançadas no mês`, '', true)
          : kpi('Solicitações no mês', k.total, `${k.canceladas} canceladas`, '', true)}
        ${kpi('Pendentes', k.pendentes, 'aguardando resposta', 'var(--amber)')}
        ${kpi('Aprovadas', k.aprovadas, `${k.finalizadas} com contrato finalizado`, 'var(--green)')}
        ${kpi('Negadas', k.negadas, `${k.sem_venda} ${k.sem_venda === 1 ? 'exceção terminou' : 'exceções terminaram'} sem venda`, 'var(--red)')}
      </div>
      <div class="espaco"></div>

      ${ehConsultor ? html`
        <div class="card">
          <div class="card-topo"><h3>Minhas solicitações em ${nomeMes(d.mes)}</h3><a href="#/solicitacoes" class="btn btn-link">Ver todas</a></div>
          ${d.recentes.length ? d.recentes.map(linhaRecente) : vazio('Nenhuma solicitação neste mês', 'Quando precisar de uma exceção, toque em "Nova solicitação".')}
        </div>` : html`
        <div class="grade grade-lateral">
          <div class="card">
            <div class="card-topo">
              <div><h3>Exceções por sala</h3><small>Barra = % de exceções sobre as vendas do mês · traço dourado = limite da sala</small></div>
            </div>
            ${d.salas.length ? html`<div class="tabela-wrap"><table class="tabela cartoes">
              <thead><tr><th>Sala</th><th class="num">Vendas</th><th class="num">Exceções</th><th style="min-width:180px">% / limite</th><th class="num">Pend.</th>${d.pode_editar_vendas ? html`<th></th>` : ''}</tr></thead>
              <tbody>${d.salas.map(s => html`<tr>
                <td class="cel-cheia"><div class="forte">${s.nome}</div><div class="secundario">${s.regional || 'Sem regional'}</div></td>
                <td class="num" data-rotulo="Vendas">${s.vendas || html`<span class="secundario">—</span>`}</td>
                <td class="num" data-rotulo="Exceções">${s.excecoes}</td>
                <td class="cel-cheia">${barraSala(s)}<div class="barra-legenda"><span>${s.vendas ? `${s.pct}%` : 'sem vendas lançadas'}</span><span>${s.limite_pct ? `limite ${s.limite_pct}%` : 'sem limite'}</span></div></td>
                <td class="num" data-rotulo="Pendentes">${s.pendentes ? html`<span class="selo selo-ambar sem-ponto">${s.pendentes}</span>` : '0'}</td>
                ${d.pode_editar_vendas ? html`<td class="num"><button class="btn btn-claro btn-pequeno" data-vendas="${s.id}" data-nome="${s.nome}" data-valor="${s.vendas}">Vendas</button></td>` : ''}
              </tr>`)}</tbody></table></div>`
            : vazio('Nenhuma sala no seu acesso', u.perfil === 'master' ? html`Cadastre a estrutura em <a href="#/estrutura">Estrutura</a>.` : 'Peça ao master para vincular você a uma sala, regional ou diretoria.', 'predio')}
          </div>

          <div class="grade">
            <div class="card">
              <div class="card-topo"><h3>Consultores com mais exceções</h3></div>
              ${d.consultores.length ? html`<div class="tabela-wrap"><table class="tabela"><tbody>
                ${d.consultores.map(c => html`<tr><td><div class="forte">${c.nome}</div><div class="secundario">${c.sala}</div></td>
                  <td class="num"><strong>${c.total}</strong><div class="secundario">${c.aprovadas} apr. · ${c.negadas} neg.</div></td></tr>`)}
              </tbody></table></div>` : html`<div class="card-corpo secundario">Sem solicitações no mês.</div>`}
            </div>
            <div class="card">
              <div class="card-topo"><h3>Por tipo de exceção</h3></div>
              <div class="card-corpo">
                ${d.tipos.length ? d.tipos.map(t => html`<div style="margin-bottom:12px">
                  <div style="display:flex;justify-content:space-between;font-size:13px"><span>${t.nome}</span><strong>${t.total}</strong></div>
                  <div class="barra" style="margin-top:6px"><i style="width:${(t.total / d.tipos[0].total) * 100}%;background:var(--gold-500)"></i></div></div>`)
                : html`<span class="secundario">Sem solicitações no mês.</span>`}
              </div>
            </div>
            <div class="card kpi" style="--kpi-cor:var(--blue)"><small>Tempo médio de resposta</small><strong>${duracao(k.tempo_medio_min)}</strong><span>entre o pedido e a decisão</span></div>
          </div>
        </div>
        <div class="espaco"></div>
        <div class="card">
          <div class="card-topo"><h3>Últimas solicitações</h3><a href="#/solicitacoes" class="btn btn-link">Ver todas</a></div>
          ${d.recentes.length ? d.recentes.map(linhaRecente) : vazio('Nenhuma solicitação neste mês', '')}
        </div>`}
    `;
  },

  montar(el, ctx) {
    el.querySelector('#mes').addEventListener('change', ev => {
      mesEscolhido = ev.target.value;
      ctx.ir('inicio?m=' + mesEscolhido);
    });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-vendas]');
      if (!b) return;
      const m = modal({
        titulo: `Vendas do mês — ${b.dataset.nome}`,
        corpo: html`<form id="form-vendas"><p class="secundario" style="margin-top:0">Total de vendas da sala em <strong>${nomeMes(mesEscolhido)}</strong>
          (dentro e fora da regra). É a base do cálculo da % de exceções.</p>
          <div class="campo"><label for="total">Total de vendas</label>
          <input class="entrada" id="total" name="total" type="number" min="0" step="1" inputmode="numeric" value="${b.dataset.valor || ''}" required></div></form>`,
        rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn btn-primario" form="form-vendas" type="submit">Salvar</button>`,
      });
      m.el.querySelector('#form-vendas').addEventListener('submit', async e => {
        e.preventDefault();
        try {
          await ocupado(m.el.querySelector('[type=submit]'), () => api('vendas.salvar', {
            sala_id: b.dataset.vendas, mes: mesEscolhido, total_vendas: Number(m.el.querySelector('#total').value),
          }));
          m.fechar();
          toast('Vendas do mês atualizadas.', 'ok');
          ctx.ir('inicio?r=' + Date.now());
        } catch (er) { toast(er.message, 'erro'); }
      });
    });
  },
};
