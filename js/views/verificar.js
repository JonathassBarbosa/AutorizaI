import { html, api, icone, seloStatus, seloDesfecho, dataHora, moeda, ALCADAS, dadosCliente } from '../core.js';
import { processando } from '../marcas.js';

function resultado(s) {
  const cor = { aprovada: 'verde', negada: 'vermelho', pendente: 'ambar', cancelada: 'azul' }[s.status];
  const frase = {
    aprovada: 'Autorização VÁLIDA — pode seguir para contrato.',
    negada: 'Exceção NEGADA — a venda só pode seguir dentro da regra.',
    pendente: 'Ainda AGUARDANDO aprovação — não finalize o contrato.',
    cancelada: 'Solicitação CANCELADA pelo consultor.',
  }[s.status];
  return html`
    <div class="aviso aviso-${cor}" style="font-size:16px;margin-bottom:16px">${icone(s.status === 'aprovada' ? 'check' : 'alerta')}<strong>${frase}</strong></div>
    <div class="card"><div class="card-topo"><div><div class="codigo" style="font-family:monospace;color:var(--muted)">${s.codigo}</div>
      <h3 style="font-size:18px">${s.cliente}</h3></div><div style="display:flex;gap:6px">${seloStatus(s.status)}${seloDesfecho(s.desfecho)}</div></div>
      <div class="card-corpo"><dl class="dados">
        ${dadosCliente(s).slice(1).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
        <div><dt>Tipo</dt><dd>${s.tipo_nome}</dd></div>
        <div><dt>Valor</dt><dd>${moeda(s.valor)}</dd></div>
        <div><dt>Sala</dt><dd>${s.sala_nome}</dd></div>
        <div><dt>Consultor</dt><dd>${s.consultor_nome}</dd></div>
        <div><dt>Alçada</dt><dd>${ALCADAS[s.alcada] || s.alcada}</dd></div>
        ${s.aprovador_nome ? html`<div><dt>Decisão de</dt><dd>${s.aprovador_nome} · ${dataHora(s.respondido_em)}</dd></div>` : ''}
        ${s.resposta ? html`<div><dt>Comentário</dt><dd>${s.resposta}</dd></div>` : ''}
      </dl>
      <div style="margin-top:18px"><a class="btn btn-primario" href="#/solicitacao/${s.id}">Abrir solicitação ${s.status === 'aprovada' && !s.desfecho ? '· registrar desfecho' : ''}</a></div>
      </div></div>`;
}

export default {
  titulo: 'Verificar autorização',
  render() {
    return html`
      <div class="cabecalho"><div><h2 style="font-size:22px">Conferir antes de finalizar o contrato</h2>
        <p>Digite o código que aparece na autorização (ex.: GAV-000123-AB12).</p></div></div>
      <form class="card" id="form-verificar" style="margin-bottom:16px"><div class="card-corpo" style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="busca" style="flex:1;min-width:220px">${icone('busca')}
          <input class="entrada" id="codigo" name="codigo" placeholder="GAV-000000-XXXX" autocomplete="off" autocapitalize="characters"
            style="text-transform:uppercase;font-family:ui-monospace,monospace;letter-spacing:.05em"></div>
        <button class="btn btn-primario" type="submit">Verificar</button>
      </div></form>
      <div id="resultado"></div>`;
  },
  montar(el) {
    const form = el.querySelector('#form-verificar');
    form.codigo.focus();
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const caixa = el.querySelector('#resultado');
      try {
        const s = await processando('Conferindo autorização…', () => api('solicitacoes.verificar', { codigo: form.codigo.value }));
        caixa.innerHTML = resultado(s).toString();
      } catch (e) {
        caixa.innerHTML = html`<div class="aviso aviso-vermelho">${icone('alerta')}<div><strong>Não confirmada.</strong> ${e.message}</div></div>`.toString();
      }
    });
  },
};
