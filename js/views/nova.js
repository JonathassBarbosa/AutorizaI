import {
  html, api, icone, ocupado, toast, dadosDoForm, mascaraMoeda, lerMoeda, vazio, ALCADAS,
} from '../core.js';
import { processando } from '../marcas.js';
import { lerIdCasal } from '../qrcode.js';
import { montarNegociacao } from '../negociacao.js';

const PERFIS_DE_SALA = ['gerente', 'assistente', 'consultor'];
let dados = null;

// Texto do botão de envio no tipo com alçada automática
const BOTAO_AUTO = {
  pendente: ['Preencha a negociação', true], bloqueado: ['Bloqueado pela política', true], aceite: ['Aguardando aceite do cliente', true],
  dentro: ['Não precisa de autorização', true], enviar: ['Enviar para aprovação', false],
};

export default {
  titulo: 'Nova solicitação',
  async render(ctx) {
    const u = ctx.usuario;
    const [tipos, estrutura] = await Promise.all([api('tipos.listar'), api('estrutura.obter')]);
    const escolheSala = !PERFIS_DE_SALA.includes(u.perfil);
    const temAuto = tipos.some(t => t.alcada === 'auto') && !!window.RegrasPagamento;
    const [regras, contexto] = temAuto
      ? await Promise.all([api('regras.obter'), escolheSala ? Promise.resolve({}) : api('regras.contexto')])
      : [null, {}];
    dados = { tipos, regras, contexto, escolheSala };
    if (!estrutura.salas.length) {
      return html`<div class="espaco"></div><div class="card">${vazio('Você ainda não está vinculado a uma sala',
        'Peça ao master para concluir seu cadastro antes de abrir solicitações.', 'predio')}</div>`;
    }
    return html`
      <div class="cabecalho"><div><h2 style="font-size:22px">Pedir autorização</h2>
        <p>A exceção vai direto para quem tem alçada na sua sala. Você é avisado quando houver resposta.</p></div></div>
      <form id="form-nova" class="grade grade-lateral" novalidate>
        <div class="grade">
        <div class="card"><div class="card-corpo">
          <div class="campo">
            <label for="tipo_id">Tipo de exceção</label>
            <select class="entrada" id="tipo_id" name="tipo_id" required>
              <option value="">Selecione…</option>
              ${tipos.map(t => html`<option value="${t.id}">${t.nome}</option>`)}
            </select>
            <small id="tipo-ajuda"></small>
          </div>
          ${escolheSala ? html`<div class="campo"><label for="sala_id">Sala de vendas</label>
            <select class="entrada" id="sala_id" name="sala_id" required><option value="">Selecione…</option>
            ${estrutura.salas.map(s => html`<option value="${s.id}">${s.nome}</option>`)}</select></div>` : ''}
          <div class="linha-campos">
            <div class="campo"><label for="id_casal">ID Casal</label>
              <div class="campo-com-botao">
                <input class="entrada" id="id_casal" name="id_casal" inputmode="numeric" autocomplete="off" placeholder="Ex.: 1234567" required>
                <button class="btn btn-claro" type="button" id="ler-qr" title="Ler o QR code da ficha de atendimento">${icone('qr')} Ler QR</button>
              </div>
              <small>Está na ficha de atendimento. Toque em “Ler QR” para capturar pela câmera.</small></div>
          </div>
          <div class="linha-campos" id="campos-gerais">
            <div class="campo"><label for="empreendimento">Empreendimento</label>
              <input class="entrada" id="empreendimento" name="empreendimento" list="lista-emp" autocomplete="off">
              <datalist id="lista-emp">${['SALINAS PARK RESORT', 'SALINAS BEACH RESORT', 'SALINAS MATRIZ', 'PORTO ALTO RESORT', 'GRAN GARDEN RESORT']
                .map(e => html`<option value="${e}">`)}</datalist></div>
            <div class="campo"><label for="valor">Valor da venda</label>
              <input class="entrada" id="valor" name="valor" inputmode="numeric" placeholder="R$ 0,00"></div>
          </div>
          <div id="campos-tipo"></div>
          <div class="campo" style="margin-bottom:0"><label for="justificativa">Justificativa</label>
            <textarea class="entrada" id="justificativa" name="justificativa" rows="4" placeholder="Explique por que a exceção é necessária para fechar a venda." required></textarea></div>
        </div></div>
        <div id="negociacao" class="grade" hidden></div>
        </div>
        <div class="grade" style="position:sticky;top:calc(var(--topbar) + 12px)">
          <div class="card"><div class="card-corpo" id="resumo-alcada">
            <div class="aviso aviso-azul">${icone('escudo')}<div>Escolha o tipo de exceção para ver quem vai aprovar.</div></div>
          </div></div>
          <button class="btn btn-ouro btn-bloco" type="submit" id="enviar" style="height:48px">${icone('raio')} Enviar para aprovação</button>
          <a class="btn btn-claro btn-bloco" href="#/solicitacoes">Cancelar</a>
        </div>
      </form>`;
  },

  montar(el, ctx) {
    const form = el.querySelector('#form-nova');
    if (!form) return;
    const idCasal = form.id_casal;
    const valor = form.valor;
    idCasal.addEventListener('input', () => { idCasal.value = idCasal.value.replace(/\D/g, '').slice(0, 12); });
    el.querySelector('#ler-qr').addEventListener('click', async () => {
      const id = await lerIdCasal();
      if (!id) return;
      idCasal.value = id;
      toast(`ID Casal ${id} capturado da ficha.`, 'ok');
    });
    valor.addEventListener('input', () => { valor.value = mascaraMoeda(valor.value); });

    // Tipo com alçada automática: o formulário da negociação decide quem aprova
    let neg = null;
    const botao = el.querySelector('#enviar');
    const textoBotao = botao.innerHTML;
    const tipoAtual = () => dados.tipos.find(x => x.id === form.tipo_id.value);
    const ehAuto = () => tipoAtual()?.alcada === 'auto';
    const atualizarBotao = e => {
      if (!ehAuto()) return;
      const [rot, travado] = BOTAO_AUTO[e.estado] || BOTAO_AUTO.pendente;
      botao.innerHTML = `${icone('raio')} ${rot}`;
      botao.disabled = travado;
    };
    form.sala_id?.addEventListener('change', async () => {
      if (!dados.regras || !form.sala_id.value) return;
      try {
        dados.contexto = await api('regras.contexto', { sala_id: form.sala_id.value });
        neg?.atualizarContexto(dados.contexto);
      } catch (e) { toast(e.message, 'erro'); }
    });

    form.tipo_id.addEventListener('change', () => {
      const t = tipoAtual();
      const auto = t?.alcada === 'auto';
      el.querySelector('#campos-gerais').hidden = auto;
      el.querySelector('#negociacao').hidden = !auto;
      if (!auto) { botao.innerHTML = textoBotao; botao.disabled = false; }
      if (auto) {
        el.querySelector('#tipo-ajuda').textContent = t.descricao || '';
        el.querySelector('#campos-tipo').innerHTML = '';
        if (!dados.regras) {
          el.querySelector('#resumo-alcada').innerHTML = html`<div class="aviso aviso-vermelho">${icone('alerta')}<div>As regras de comercialização não carregaram. Atualize a página.</div></div>`.toString();
          return;
        }
        if (!neg) {
          neg = montarNegociacao(el.querySelector('#negociacao'), el.querySelector('#resumo-alcada'), {
            config: dados.regras.config, contexto: dados.contexto, aoMudar: atualizarBotao,
          });
        } else {
          neg.atualizarContexto(dados.contexto);
        }
        return;
      }
      el.querySelector('#tipo-ajuda').textContent = t?.descricao || '';
      el.querySelector('#campos-tipo').innerHTML = t && t.campos.length ? html`<div class="linha-campos">
        ${t.campos.map((c, i) => html`<div class="campo"><label for="campo-${i}">${c}</label>
          <input class="entrada" id="campo-${i}" data-campo="${c}" required></div>`)}</div>`.toString() : '';
      el.querySelector('#resumo-alcada').innerHTML = (t ? html`
        <div class="titulo-papel">Quem aprova</div>
        <h3 style="font-size:20px;margin:6px 0 4px">${ALCADAS[t.alcada]}</h3>
        <p class="secundario" style="margin:0">Se o cargo estiver vago na sua sala, o pedido sobe para o nível seguinte.
          Se a sala estiver acima do limite de exceções do mês, a alçada também sobe.</p>`
        : html`<div class="aviso aviso-azul">${icone('escudo')}<div>Escolha o tipo de exceção para ver quem vai aprovar.</div></div>`).toString();
    });

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = dadosDoForm(form);
      const campos = {};
      el.querySelectorAll('[data-campo]').forEach(i => { campos[i.dataset.campo] = i.value.trim(); });
      const faltando = [];
      if (!d.tipo_id) faltando.push('tipo de exceção');
      if (form.sala_id && !d.sala_id) faltando.push('sala');
      if (!/^\d{3,12}$/.test(d.id_casal)) faltando.push('ID Casal');
      Object.entries(campos).forEach(([k, v]) => { if (!v) faltando.push(k.toLowerCase()); });
      if (d.justificativa.length < 10) faltando.push('justificativa (mín. 10 caracteres)');
      const e = ehAuto() && neg ? neg.obter() : null;
      if (e && e.estado === 'pendente') faltando.push(...e.pend);
      if (faltando.length) return toast('Preencha: ' + faltando.join(', ') + '.', 'erro');
      if (e && e.estado !== 'enviar') {
        return toast({
          bloqueado: 'A política não permite esta negociação. Ajuste os itens em vermelho.',
          aceite: 'Confirme o aceite do cliente para o choque de parcelas.',
          dentro: 'Esta negociação está dentro da regra e não precisa de autorização.',
        }[e.estado] || 'Revise a negociação.', 'erro');
      }
      try {
        const s = await processando('Enviando para aprovação…', () => api('solicitacoes.criar', e
          ? { tipo_id: d.tipo_id, sala_id: d.sala_id, id_casal: d.id_casal, justificativa: d.justificativa, negociacao: e.neg }
          : { ...d, valor: lerMoeda(d.valor), campos }));
        toast(`Solicitação ${s.codigo} enviada para aprovação.`, 'ok');
        ctx.ir(`solicitacao/${s.id}?avisar=1`); // abre o aviso por WhatsApp para quem aprova
      } catch (e) { toast(e.message, 'erro'); }
    });
  },
};
