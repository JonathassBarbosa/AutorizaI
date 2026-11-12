import { html, api, icone, toast, ocupado, vazio, duracao, nomeMes, ultimosMeses, mesAtual, PERFIS, ALCADAS } from '../core.js';

const filtros = { de: mesAtual(), ate: mesAtual(), sala_id: '', status: '', alcada: '' };
const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const resumoStatus = x => `${pl(x.aprovadas, 'aprovada', 'aprovadas')} · ${pl(x.negadas, 'negada', 'negadas')} · ${pl(x.pendentes, 'pendente', 'pendentes')}`;
const EXPORTA = ['gerente', 'regional', 'superintendente', 'diretor', 'master']; // a exportação traz e-mails: só a gestão
const COR_ALCADA = { gerente: 'var(--nv-gerente)', regional: 'var(--nv-regional)', superintendente: 'var(--nv-superintendente)', diretor: 'var(--nv-diretor)' };

function kpi(rotulo, valor, sub, cor, destaque = false) {
  return html`<div class="card kpi ${destaque ? 'destaque' : ''}" style="--kpi-cor:${cor}"><small>${rotulo}</small><strong>${valor}</strong>${sub ? html`<span>${sub}</span>` : ''}</div>`;
}

function barraStatus(x) {
  const t = Math.max(1, x.total);
  return html`<div class="barra-alcada" title="${resumoStatus(x)}">
    <i style="width:${(x.aprovadas / t) * 100}%;background:var(--green)"></i>
    <i style="width:${(x.negadas / t) * 100}%;background:var(--red)"></i>
    <i style="width:${(x.pendentes / t) * 100}%;background:var(--amber)"></i></div>`;
}

/** CSV para o Excel em português: separador ";", vírgula decimal e BOM para os acentos. */
function baixarCsv(nome, colunas, linhas) {
  const cel = v => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = '﻿' + [colunas, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default {
  titulo: 'Painel',
  async render(ctx) {
    const u = ctx.usuario;
    const d = await api('relatorio.obter', filtros);
    const k = d.kpis;
    const meses = ultimosMeses(24);
    const amplo = ['diretor', 'master'].includes(u.perfil);
    const podeExportar = EXPORTA.includes(u.perfil);
    const maxTipo = Math.max(1, ...d.por_tipo.map(t => t.total));
    const escopo = u.perfil === 'consultor' ? 'Suas solicitações' : u.perfil === 'gerente' ? 'Solicitações da sua sala'
      : amplo ? (u.perfil === 'master' ? 'Todas as salas' : 'Salas das suas diretorias') : 'Salas das suas regionais';
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Painel de solicitações</h2><p>${escopo} · ${PERFIS[u.perfil]}</p></div>
        ${podeExportar ? html`<div class="acoes"><button class="btn btn-ouro" id="exportar" type="button">${icone('baixar')} Exportar relatório completo</button></div>` : ''}
      </div>
      <div class="card"><div class="card-corpo">
        <form class="filtros-painel" id="filtros">
          <div class="campo"><label for="f-de">De</label><select class="entrada" id="f-de" name="de">${meses.map(m => html`<option value="${m}" ${m === d.de ? 'selected' : ''}>${nomeMes(m)}</option>`)}</select></div>
          <div class="campo"><label for="f-ate">Até</label><select class="entrada" id="f-ate" name="ate">${meses.map(m => html`<option value="${m}" ${m === d.ate ? 'selected' : ''}>${nomeMes(m)}</option>`)}</select></div>
          ${d.filtros.salas.length > 1 ? html`<div class="campo"><label for="f-sala">Sala</label><select class="entrada" id="f-sala" name="sala_id"><option value="">Todas</option>
            ${d.filtros.salas.map(s => html`<option value="${s.id}" ${s.id === filtros.sala_id ? 'selected' : ''}>${s.nome}</option>`)}</select></div>` : ''}
          <div class="campo"><label for="f-alcada">Alçada</label><select class="entrada" id="f-alcada" name="alcada"><option value="">Todas</option>
            ${Object.entries(ALCADAS).map(([a, t]) => html`<option value="${a}" ${a === filtros.alcada ? 'selected' : ''}>${t}</option>`)}</select></div>
          <div class="campo"><label for="f-status">Status</label><select class="entrada" id="f-status" name="status"><option value="">Todos</option>
            ${[['pendente', 'Pendentes'], ['aprovada', 'Aprovadas'], ['negada', 'Negadas'], ['cancelada', 'Canceladas']].map(([v, t]) => html`<option value="${v}" ${v === filtros.status ? 'selected' : ''}>${t}</option>`)}</select></div>
        </form>
      </div></div>
      <div class="espaco"></div>

      <div class="grade grade-4">
        ${kpi('Solicitações', k.total, `${k.canceladas} canceladas`, '', true)}
        ${kpi('Pendentes', k.pendentes, 'aguardando resposta', 'var(--amber)')}
        ${kpi('Aprovadas', k.aprovadas, `${k.finalizadas} com contrato finalizado`, 'var(--green)')}
        ${kpi('Negadas', k.negadas, `tempo médio de resposta: ${duracao(k.tempo_medio_min)}`, 'var(--red)')}
      </div>
      <div class="espaco"></div>

      <div class="grade grade-2">
        <div class="card"><div class="card-topo"><h3>Por alçada</h3><small>verde aprovadas · vermelho negadas · âmbar pendentes</small></div>
          <div class="card-corpo">${d.por_alcada.map(a => html`<div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:14px"><span><span class="nv nv-${a.alcada}">${ALCADAS[a.alcada]}</span></span>
              <strong>${a.total}</strong></div>
            <div style="margin-top:6px">${barraStatus(a)}</div>
            <div class="secundario" style="font-size:12px;margin-top:4px">${resumoStatus(a)}</div></div>`)}</div></div>
        <div class="card"><div class="card-topo"><h3>Por tipo de solicitação</h3><small>No tipo automático, cada regra que pediu autorização</small></div>
          <div class="card-corpo">${d.por_tipo.length ? d.por_tipo.map(t => html`<div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:10px;font-size:13.5px"><span>${t.nome}</span><strong>${t.total}</strong></div>
            <div class="barra" style="margin-top:6px"><i style="width:${(t.total / maxTipo) * 100}%;background:var(--gold-500)"></i></div>
            <div class="secundario" style="font-size:12px;margin-top:3px">${resumoStatus(t)}</div></div>`)
            : html`<span class="secundario">Sem solicitações no período.</span>`}</div></div>
      </div>
      <div class="espaco"></div>

      ${u.perfil !== 'consultor' ? html`
        <div class="card"><div class="card-topo"><h3>Sala × tipo de solicitação</h3><small>${d.matriz.tipos.length} tipos mais frequentes</small></div>
          ${d.matriz.salas.length ? html`<div class="tabela-wrap"><table class="tabela matriz"><thead><tr><th>Sala</th>${d.matriz.tipos.map(t => html`<th class="num" style="max-width:120px;white-space:normal">${t}</th>`)}<th class="num">Total</th></tr></thead>
            <tbody>${d.matriz.salas.map(s => html`<tr><td><div class="forte">${s.nome}</div><div class="secundario">${s.regional || 'Sem regional'}</div></td>
              ${d.matriz.tipos.map(t => html`<td class="num ${s.por_tipo[t] ? 'calor' : 'secundario'}">${s.por_tipo[t] || '·'}</td>`)}<td class="num forte">${s.total}</td></tr>`)}</tbody></table></div>`
            : html`<div class="card-corpo secundario">Sem solicitações no período.</div>`}</div>
        <div class="espaco"></div>
        <div class="card"><div class="card-topo"><h3>Por sala e alçada</h3></div>
          ${d.salas.length ? html`<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Sala</th><th class="num">Total</th><th class="num">Pend.</th><th class="num">Aprov.</th><th class="num">Neg.</th>
            ${Object.keys(ALCADAS).map(a => html`<th class="num">${ALCADAS[a]}</th>`)}</tr></thead>
            <tbody>${d.salas.map(s => html`<tr><td><div class="forte">${s.nome}</div><div class="secundario">${[s.regional, s.diretoria].filter(Boolean).join(' · ') || '—'}</div></td>
              <td class="num forte">${s.total}</td><td class="num">${s.pendentes}</td><td class="num">${s.aprovadas}</td><td class="num">${s.negadas}</td>
              ${Object.keys(ALCADAS).map(a => html`<td class="num" style="color:${s.por_alcada[a] ? COR_ALCADA[a] : 'var(--faint)'}">${s.por_alcada[a] || '·'}</td>`)}</tr>`)}</tbody></table></div>`
            : html`<div class="card-corpo secundario">Sem solicitações no período.</div>`}</div>
        <div class="espaco"></div>` : ''}

      <div class="grade grade-2">
        <div class="card"><div class="card-topo"><h3>Quem autorizou</h3></div>
          ${d.aprovadores.length ? html`<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Autorizador</th><th class="num">Aprov.</th><th class="num">Neg.</th><th class="num">Tempo médio</th></tr></thead>
            <tbody>${d.aprovadores.map(a => html`<tr><td><div class="forte">${a.nome}</div><div class="secundario">${PERFIS[a.perfil] || a.perfil}</div></td>
              <td class="num">${a.aprovadas}</td><td class="num">${a.negadas}</td><td class="num">${duracao(a.tempo_medio_min)}</td></tr>`)}</tbody></table></div>`
            : html`<div class="card-corpo secundario">Nenhuma resposta no período.</div>`}</div>
        <div class="card"><div class="card-topo"><h3>Quem pediu</h3></div>
          ${d.solicitantes.length ? html`<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Solicitante</th><th class="num">Total</th><th class="num">Aprov.</th><th class="num">Neg.</th></tr></thead>
            <tbody>${d.solicitantes.map(s => html`<tr><td><div class="forte">${s.nome}</div><div class="secundario">${s.sala}</div></td>
              <td class="num forte">${s.total}</td><td class="num">${s.aprovadas}</td><td class="num">${s.negadas}</td></tr>`)}</tbody></table></div>`
            : vazio('Sem solicitações no período', '', 'lista')}</div>
      </div>`;
  },

  montar(el, ctx) {
    el.querySelector('#filtros').addEventListener('change', ev => {
      const campo = ev.target.name;
      filtros[campo] = ev.target.value;
      if (campo === 'de' && filtros.ate < filtros.de) filtros.ate = filtros.de;
      if (campo === 'ate' && filtros.ate < filtros.de) filtros.de = filtros.ate;
      ctx.ir('painel?t=' + Date.now());
    });
    el.querySelector('#exportar')?.addEventListener('click', async ev => {
      try {
        const r = await ocupado(ev.currentTarget, () => api('relatorio.exportar', filtros));
        if (!r.linhas.length) return toast('Nenhuma solicitação no período escolhido.', 'info');
        baixarCsv(`relatorio-autorizacoes-${r.de}${r.ate !== r.de ? '_a_' + r.ate : ''}.csv`, r.colunas, r.linhas);
        toast(`Relatório com ${r.linhas.length} solicitação(ões) baixado.${r.total > r.linhas.length ? ' Limite de 5.000 linhas: filtre um período menor.' : ''}`, 'ok');
      } catch (e) { toast(e.message, 'erro'); }
    });
  },
};
