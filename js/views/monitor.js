import { html, api, icone, hora, dataHora, relativo, confirmar, toast, esc } from '../core.js';

const INTERVALO_MS = 4000;
let timer = null;
let pausado = false;
let somenteErros = false;
let logs = [];
let vistos = new Set();
let desde = 0;
let ultimaResposta = null;
let falhas = 0;
let aberto = null;

function detalhesFormatados(l) {
  let d = l.detalhes;
  try { d = JSON.stringify(JSON.parse(l.detalhes), null, 2); } catch { /* texto puro */ }
  return d;
}

function linhaFeed(l, nova) {
  const exp = aberto === l.id;
  return `<div class="feed-linha ${l.nivel} ${nova ? 'nova' : ''}" data-log="${esc(l.id)}">
      <span>${esc(hora(l.data))}</span>
      <span class="nivel ${esc(l.nivel)}">${esc(l.nivel)}</span>
      <span class="secundario">${esc(l.origem)}</span>
      <span class="msg"><strong>${esc(l.acao)}</strong> · ${esc(l.mensagem)} <span class="secundario">— ${esc(l.usuario)}</span></span>
      <span class="num secundario">${l.duracao_ms ? esc(l.duracao_ms) + ' ms' : ''}</span>
    </div>
    ${exp ? `<div class="feed-detalhe">
      ${l.local ? `<div class="local">📍 ${esc(l.local)}</div>` : ''}
      <div>${esc(dataHora(l.data))} · ${esc(l.usuario)} · ação <strong>${esc(l.acao)}</strong></div>
      <div style="margin-top:4px">${esc(l.mensagem)}</div>
      ${l.detalhes ? `<pre>${esc(detalhesFormatados(l))}</pre>` : ''}
    </div>` : ''}`;
}

function desenharFeed(novosIds = new Set()) {
  const caixa = document.getElementById('feed');
  if (!caixa) return;
  const lista = logs.filter(l => !somenteErros || l.nivel !== 'INFO').slice(-300).reverse();
  caixa.innerHTML = lista.length
    ? lista.map(l => linhaFeed(l, novosIds.has(l.id))).join('')
    : '<div class="vazio" style="padding:32px">Nenhum evento ainda. Use o app em outra aba e veja aparecer aqui.</div>';
}

function desenharPainel(r) {
  const m = r.metricas;
  const s = r.saude;
  const maxSerie = Math.max(1, ...m.serie.map(x => x.total));
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };
  set('m-operacoes', m.operacoes);
  set('m-erros', `<span style="color:${m.erros ? 'var(--red)' : 'inherit'}">${m.erros}</span>`);
  set('m-latencia', `${m.latencia_media} ms`);
  set('m-p95', `p95: ${m.latencia_p95} ms`);
  set('m-usuarios', m.usuarios_ativos);
  set('m-avisos', `${m.avisos} avisos`);
  set('grafico', m.serie.map(x => `<div title="${x.total} eventos, ${x.erros} erros" style="height:${(x.total / maxSerie) * 100}%">
    ${x.erros ? `<i style="height:${(x.erros / Math.max(1, x.total)) * 100}%"></i>` : ''}</div>`).join(''));
  set('acoes', m.acoes.length ? m.acoes.map(a => `<tr><td><code>${esc(a.acao)}</code></td><td class="num">${a.total}</td>
    <td class="num" style="color:${a.erros ? 'var(--red)' : 'inherit'}">${a.erros}</td><td class="num">${a.media_ms} ms</td></tr>`).join('')
    : '<tr><td colspan="4" class="secundario">Sem operações nos últimos 15 min.</td></tr>');
  set('saude', `
    <div style="display:flex;justify-content:space-between"><span>Versão da API</span><strong>${esc(s.versao)}</strong></div>
    <div style="display:flex;justify-content:space-between"><span>Push (OneSignal)</span>${s.push_configurado
      ? '<span class="selo selo-verde">Configurado</span>' : '<span class="selo selo-ambar">Não configurado</span>'}</div>
    <div style="display:flex;justify-content:space-between"><span>Leitura dos logs</span><strong>${s.tempo_leitura_ms} ms</strong></div>
    <div style="margin-top:6px" class="titulo-papel">Linhas por aba</div>
    ${s.abas.map(a => `<div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(a.nome)}</span><span>${a.linhas}</span></div>`).join('')}`);
  const ue = s.ultimo_erro;
  set('ultimo-erro', ue ? `<div class="erro-destaque">
      <div class="titulo-papel" style="color:var(--red)">Último erro · ${esc(relativo(ue.data))} · ${esc(ue.origem)}</div>
      <div class="local">📍 ${esc(ue.local || 'local não identificado')}</div>
      <div><strong>${esc(ue.acao)}</strong> — ${esc(ue.mensagem)}</div>
      <div class="secundario" style="margin-top:4px">${esc(dataHora(ue.data))} · ${esc(ue.usuario)}</div>
      <button class="btn btn-claro btn-pequeno" style="margin-top:10px" data-ver="${esc(ue.id)}">Ver detalhes completos</button></div>`
    : `<div class="aviso aviso-verde">${icone('check')}<div>Nenhum erro registrado. Tudo funcionando.</div></div>`);
}

function status(texto, tipo) {
  const el = document.getElementById('status-monitor');
  if (el) el.innerHTML = `<span class="pulso ${tipo}"></span>${esc(texto)}`;
}

async function ciclo() {
  if (pausado) return;
  const t0 = performance.now();
  try {
    const r = await api('monitor.status', { desde: desde ? desde - 2000 : 0 });
    const ping = Math.round(performance.now() - t0);
    falhas = 0;
    ultimaResposta = Date.now();
    const novos = new Set();
    r.logs.forEach(l => { if (!vistos.has(l.id)) { vistos.add(l.id); logs.push(l); if (desde) novos.add(l.id); } });
    if (logs.length > 600) logs = logs.slice(-600);
    desde = Math.max(desde, ...r.logs.map(l => l.ts), 0) || Date.now();
    desenharPainel(r);
    desenharFeed(novos);
    status(`Ao vivo · resposta em ${ping} ms`, '');
  } catch (e) {
    falhas++;
    status(`Sem resposta da API (${falhas}x): ${e.message}`, 'erro');
  }
}

export default {
  titulo: 'Monitor',
  perfis: ['master'],
  render() {
    logs = []; vistos = new Set(); desde = 0; aberto = null;
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Funcionamento em tempo real</h2>
          <p><span class="monitor-status" id="status-monitor"><span class="pulso parado"></span>Conectando…</span> · atualiza a cada ${INTERVALO_MS / 1000}s · últimos 15 minutos</p></div>
        <div class="acoes">
          <button class="btn btn-claro" id="btn-pausa">${icone('pausa')} Pausar</button>
          <button class="btn btn-claro" id="btn-teste" title="Gera um erro proposital no servidor para validar o monitor">${icone('raio')} Testar erro</button>
          <button class="btn btn-claro" id="btn-limpar">${icone('lixo')} Limpar logs</button>
        </div>
      </div>

      <div class="grade grade-4">
        <div class="card kpi destaque"><small>Operações</small><strong id="m-operacoes">—</strong><span>registradas em 15 min</span></div>
        <div class="card kpi" style="--kpi-cor:var(--red)"><small>Erros</small><strong id="m-erros">—</strong><span id="m-avisos"></span></div>
        <div class="card kpi" style="--kpi-cor:var(--blue)"><small>Tempo médio da API</small><strong id="m-latencia">—</strong><span id="m-p95"></span></div>
        <div class="card kpi" style="--kpi-cor:var(--green)"><small>Usuários ativos</small><strong id="m-usuarios">—</strong><span>com ações em 15 min</span></div>
      </div>
      <div class="espaco"></div>

      <div class="grade grade-lateral">
        <div class="grade">
          <div id="ultimo-erro"></div>
          <div class="card">
            <div class="card-topo"><h3>Eventos ao vivo</h3>
              <div class="chips"><button class="chip ${somenteErros ? '' : 'ativo'}" data-filtro="todos">Todos</button>
                <button class="chip ${somenteErros ? 'ativo' : ''}" data-filtro="erros">Erros e avisos</button></div></div>
            <div class="feed" id="feed"><div class="carregando"></div></div>
          </div>
        </div>
        <div class="grade">
          <div class="card"><div class="card-topo"><h3>Atividade por minuto</h3><small>vermelho = erros</small></div>
            <div class="card-corpo"><div class="grafico-barras" id="grafico"></div></div></div>
          <div class="card"><div class="card-topo"><h3>Ações mais usadas</h3></div>
            <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Ação</th><th class="num">Qtd</th><th class="num">Erros</th><th class="num">Média</th></tr></thead>
            <tbody id="acoes"></tbody></table></div></div>
          <div class="card"><div class="card-topo"><h3>Saúde do sistema</h3></div>
            <div class="card-corpo" id="saude" style="display:flex;flex-direction:column;gap:8px"></div></div>
        </div>
      </div>`;
  },

  montar(el) {
    pausado = false;
    ciclo();
    timer = setInterval(() => { if (!document.hidden) ciclo(); }, INTERVALO_MS);

    el.querySelector('#btn-pausa').addEventListener('click', ev => {
      pausado = !pausado;
      ev.currentTarget.innerHTML = pausado ? `${icone('play')} Retomar` : `${icone('pausa')} Pausar`;
      if (pausado) status('Pausado', 'parado'); else ciclo();
    });
    el.querySelector('#btn-teste').addEventListener('click', async () => {
      try { await api('monitor.testarErro'); } catch (e) { toast(`Erro de teste gerado: ${e.local || e.message}`, 'ok'); }
      setTimeout(ciclo, 300);
    });
    el.querySelector('#btn-limpar').addEventListener('click', async () => {
      if (!(await confirmar('Limpar logs', 'Apaga todo o histórico de eventos do monitor. A auditoria das solicitações não é afetada.', 'Limpar', 'btn-vermelho'))) return;
      await api('monitor.limparLogs').catch(e => toast(e.message, 'erro'));
      logs = []; vistos = new Set(); desde = 0;
      ciclo();
    });
    el.addEventListener('click', ev => {
      const f = ev.target.closest('[data-filtro]');
      if (f) {
        somenteErros = f.dataset.filtro === 'erros';
        el.querySelectorAll('[data-filtro]').forEach(b => b.classList.toggle('ativo', b === f));
        return desenharFeed();
      }
      const ver = ev.target.closest('[data-ver]');
      const linha = ev.target.closest('[data-log]');
      const id = ver?.dataset.ver || linha?.dataset.log;
      if (id) {
        aberto = aberto === id ? null : id;
        if (ver) { somenteErros = false; }
        desenharFeed();
        document.querySelector(`[data-log="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  },

  sair() {
    clearInterval(timer);
    timer = null;
  },
};
