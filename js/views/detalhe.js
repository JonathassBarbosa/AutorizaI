import {
  html, api, icone, seloStatus, seloDesfecho, moeda, dataHora, relativo, ocupado, toast, confirmar, dadosDoForm,
  ALCADAS, PERFIS,
} from '../core.js';
import { logoSvg, processando } from '../marcas.js';

let atual = null;

function documentoImpressao(s) {
  const linhas = [
    ['Código de verificação', s.codigo], ['Tipo de exceção', s.tipo_nome], ['Cliente', s.cliente], ['CPF', s.cpf],
    ['Empreendimento', s.empreendimento || '—'], ['Valor da venda', moeda(s.valor)],
    ...Object.entries(s.campos || {}),
    ['Justificativa', s.justificativa], ['Sala de vendas', s.sala_nome], ['Regional / Diretoria', `${s.regional_nome || '—'} / ${s.diretoria_nome || '—'}`],
    ['Solicitado por', `${s.consultor_nome} em ${dataHora(s.criado_em)}`],
    ['Aprovado por', `${s.aprovador_nome} (alçada ${ALCADAS[s.alcada] || s.alcada}) em ${dataHora(s.respondido_em)}`],
    ['Observação do aprovador', s.resposta],
  ];
  return html`<div class="doc-autorizacao">
    <header>${logoSvg()}<div style="text-align:right"><h1>Autorização de venda fora da regra</h1>
      <div class="codigo-grande">${s.codigo}</div></div></header>
    <table>${linhas.map(([k, v]) => html`<tr><td>${k}</td><td>${v}</td></tr>`)}</table>
    <p style="font-size:11px;color:#555">A autenticidade pode ser conferida no sistema pela opção "Verificar autorização" com o código acima.
      Emitido em ${dataHora(new Date().toISOString())}.</p>
    <div class="assinaturas"><div>Consultor</div><div>Assistente de contratos</div><div>Cliente</div></div>
  </div>`;
}

export default {
  titulo: 'Solicitação',
  async render(ctx) {
    const s = await api('solicitacoes.obter', { id: ctx.rota.params[0] });
    atual = s;
    const campos = Object.entries(s.campos || {});
    return html`
      <div class="cabecalho" style="margin-bottom:12px">
        <button class="btn btn-claro btn-pequeno" onclick="history.length > 1 ? history.back() : location.hash = '#/solicitacoes'">${icone('voltar')} Voltar</button>
        ${s.status === 'aprovada' ? html`<button class="btn btn-claro btn-pequeno" id="imprimir">${icone('impressora')} Imprimir autorização</button>` : ''}
      </div>

      <section class="hero-sol">
        <div class="codigo">${s.codigo}</div>
        <h2>${s.cliente}</h2>
        <p>${s.tipo_nome}${s.tipo_descricao ? ` — ${s.tipo_descricao}` : ''}</p>
        <div class="linha">
          ${seloStatus(s.status)} ${seloDesfecho(s.desfecho)}
          <span class="selo selo-cinza sem-ponto">${icone('escudo')} Alçada: ${ALCADAS[s.alcada] || s.alcada}</span>
          <span class="selo selo-cinza sem-ponto">${icone('relogio')} ${relativo(s.criado_em)}</span>
        </div>
      </section>
      <div class="espaco"></div>

      <div class="grade grade-lateral">
        <div class="grade">
          ${s.pode_aprovar ? html`
            <div class="card" style="border-color:var(--gold-500);box-shadow:0 0 0 3px var(--gold-100)">
              <div class="card-topo"><h3>Sua decisão</h3><small>${s.alcada_motivo}</small></div>
              <form class="card-corpo" id="form-decisao">
                <div class="campo"><label for="resposta">Comentário para o consultor</label>
                  <textarea class="entrada" id="resposta" name="resposta" placeholder="Obrigatório. Na negativa, explique o motivo (mín. 10 caracteres)."></textarea></div>
                <div style="display:flex;gap:10px;flex-wrap:wrap">
                  <button class="btn btn-verde" type="submit" value="aprovada">${icone('check')} Aprovar</button>
                  <button class="btn btn-vermelho" type="submit" value="negada">${icone('x')} Negar</button>
                </div>
              </form>
            </div>` : ''}

          ${s.status === 'pendente' && !s.pode_aprovar ? html`
            <div class="aviso aviso-ambar">${icone('relogio')}<div><strong>Aguardando aprovação.</strong>
              ${s.aguardando.length ? html` Com: ${s.aguardando.map((a, i) => html`${i ? ', ' : ''}${a.nome} (${PERFIS[a.perfil]})`)}.` : ' Nenhum aprovador cadastrado para esta sala — avise o master.'}
              <br><small>${s.alcada_motivo}</small></div></div>` : ''}

          ${s.status !== 'pendente' && s.status !== 'cancelada' ? html`
            <div class="aviso ${s.status === 'aprovada' ? 'aviso-verde' : 'aviso-vermelho'}">${icone(s.status === 'aprovada' ? 'check' : 'x')}
              <div><strong>${s.status === 'aprovada' ? 'Aprovada' : 'Negada'} por ${s.aprovador_nome}</strong> · ${dataHora(s.respondido_em)}
              <br>“${s.resposta}”</div></div>` : ''}

          <div class="card">
            <div class="card-topo"><h3>Dados da negociação</h3></div>
            <div class="card-corpo">
              <dl class="dados">
                <div><dt>Cliente</dt><dd>${s.cliente}</dd></div>
                <div><dt>CPF</dt><dd>${s.cpf}</dd></div>
                <div><dt>Empreendimento</dt><dd>${s.empreendimento || '—'}</dd></div>
                <div><dt>Valor da venda</dt><dd>${moeda(s.valor)}</dd></div>
                ${campos.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
              </dl>
              <div style="margin-top:18px"><div class="rotulo" style="color:var(--muted);font-size:12px;letter-spacing:.04em;text-transform:uppercase">Justificativa do consultor</div>
                <p style="margin:6px 0 0;white-space:pre-wrap">${s.justificativa}</p></div>
            </div>
          </div>

          ${s.desfecho ? html`<div class="card"><div class="card-topo"><h3>Desfecho</h3>${seloDesfecho(s.desfecho)}</div>
            <div class="card-corpo"><dl class="dados">
              ${s.desfecho === 'venda_finalizada' ? html`<div><dt>Contrato</dt><dd>${s.contrato}</dd></div>`
                : html`<div style="grid-column:1/-1"><dt>Motivo da perda</dt><dd>${s.desfecho_justificativa}</dd></div>`}
              <div><dt>Registrado por</dt><dd>${s.desfecho_por} · ${dataHora(s.desfecho_em)}</dd></div>
            </dl></div></div>` : ''}

          ${s.pode_desfecho ? html`
            <div class="card">
              <div class="card-topo"><h3>Registrar desfecho</h3><small>Assistente de contratos</small></div>
              <form class="card-corpo" id="form-desfecho">
                <div class="opcoes-radio">
                  <label class="opcao-radio"><input type="radio" name="desfecho" value="venda_finalizada" checked>
                    <span><strong>Venda finalizada</strong><small>Contrato assinado</small></span></label>
                  <label class="opcao-radio"><input type="radio" name="desfecho" value="sem_venda">
                    <span><strong>Sem venda</strong><small>Cliente não fechou</small></span></label>
                </div>
                <div class="campo" data-se="venda_finalizada"><label for="contrato">Número do contrato</label>
                  <input class="entrada" id="contrato" name="contrato"></div>
                <div class="campo" data-se="sem_venda" hidden><label for="justificativa">Por que a venda não aconteceu?</label>
                  <textarea class="entrada" id="justificativa" name="justificativa" placeholder="Obrigatório (mín. 10 caracteres)"></textarea></div>
                <button class="btn btn-primario" type="submit">Registrar</button>
              </form>
            </div>` : ''}
        </div>

        <div class="grade">
          <div class="card"><div class="card-topo"><h3>Origem</h3></div><div class="card-corpo">
            <dl class="dados" style="grid-template-columns:1fr">
              <div><dt>Consultor</dt><dd>${s.consultor_nome}</dd></div>
              <div><dt>Sala de vendas</dt><dd>${s.sala_nome}</dd></div>
              <div><dt>Regional</dt><dd>${s.regional_nome || '—'}</dd></div>
              <div><dt>Diretoria</dt><dd>${s.diretoria_nome || '—'}</dd></div>
            </dl></div></div>
          <div class="card"><div class="card-topo"><h3>Histórico</h3></div><div class="card-corpo">
            <ul class="linha-tempo">${s.historico.map(h => html`<li><strong>${h.usuario} ${h.acao}</strong>
              <p>${dataHora(h.data)}</p>${h.detalhes ? html`<p>${h.detalhes}</p>` : ''}</li>`)}</ul>
          </div></div>
          ${s.pode_cancelar ? html`<button class="btn btn-claro" id="cancelar">${icone('x')} Cancelar solicitação</button>` : ''}
        </div>
      </div>
      ${s.status === 'aprovada' ? documentoImpressao(s) : ''}`;
  },

  montar(el, ctx) {
    const s = atual;
    const recarregar = () => ctx.ir(`solicitacao/${s.id}?t=${Date.now()}`);

    // A folha de impressão precisa ficar fora do shell para não ser escondida.
    const doc = el.querySelector('.doc-autorizacao');
    if (doc) {
      document.querySelectorAll('body > .doc-autorizacao').forEach(d => d.remove());
      document.body.appendChild(doc);
    }
    el.querySelector('#imprimir')?.addEventListener('click', () => window.print());

    const fd = el.querySelector('#form-decisao');
    fd?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const decisao = ev.submitter?.value;
      const resposta = fd.resposta.value.trim();
      if (decisao === 'negada' && resposta.length < 10) return toast('Na negativa, explique o motivo (mínimo 10 caracteres).', 'erro');
      if (resposta.length < 2) return toast('Escreva um comentário para o consultor.', 'erro');
      try {
        await processando(decisao === 'aprovada' ? 'Registrando aprovação…' : 'Registrando negativa…', () => api('solicitacoes.responder', { id: s.id, decisao, resposta }));
        toast(decisao === 'aprovada' ? 'Exceção aprovada. O consultor foi avisado.' : 'Exceção negada. O consultor foi avisado.', 'ok');
        ctx.atualizarNotificacoes(true);
        recarregar();
      } catch (e) { toast(e.message, 'erro'); }
    });

    const fdes = el.querySelector('#form-desfecho');
    if (fdes) {
      const alternar = () => {
        const v = fdes.querySelector('[name=desfecho]:checked').value;
        fdes.querySelectorAll('[data-se]').forEach(c => { c.hidden = c.dataset.se !== v; });
      };
      fdes.addEventListener('change', alternar);
      fdes.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = dadosDoForm(fdes);
        if (d.desfecho === 'venda_finalizada' && !d.contrato) return toast('Informe o número do contrato.', 'erro');
        if (d.desfecho === 'sem_venda' && d.justificativa.length < 10) return toast('Explique por que a venda não aconteceu (mín. 10 caracteres).', 'erro');
        try {
          await processando('Registrando desfecho…', () => api('solicitacoes.desfecho', { id: s.id, ...d }));
          toast('Desfecho registrado.', 'ok');
          recarregar();
        } catch (e) { toast(e.message, 'erro'); }
      });
    }

    el.querySelector('#cancelar')?.addEventListener('click', async () => {
      if (!(await confirmar('Cancelar solicitação', 'Os aprovadores deixarão de ver este pedido como pendente. Continuar?', 'Cancelar pedido', 'btn-vermelho'))) return;
      try {
        await processando('Cancelando solicitação…', () => api('solicitacoes.cancelar', { id: s.id }));
        toast('Solicitação cancelada.', 'ok');
        recarregar();
      } catch (e) { toast(e.message, 'erro'); }
    });
  },

  sair() {
    document.querySelectorAll('body > .doc-autorizacao').forEach(d => d.remove());
  },
};
