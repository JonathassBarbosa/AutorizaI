import {
  html, api, icone, ocupado, toast, dadosDoForm, mascaraCpf, cpfValido, mascaraMoeda, lerMoeda, vazio, ALCADAS,
} from '../core.js';
import { processando } from '../marcas.js';

const PERFIS_DE_SALA = ['gerente', 'assistente', 'consultor'];
let dados = null;

export default {
  titulo: 'Nova solicitação',
  async render(ctx) {
    const u = ctx.usuario;
    const [tipos, estrutura] = await Promise.all([api('tipos.listar'), api('estrutura.obter')]);
    dados = { tipos };
    const escolheSala = !PERFIS_DE_SALA.includes(u.perfil);
    if (!estrutura.salas.length) {
      return html`<div class="espaco"></div><div class="card">${vazio('Você ainda não está vinculado a uma sala',
        'Peça ao master para concluir seu cadastro antes de abrir solicitações.', 'predio')}</div>`;
    }
    return html`
      <div class="cabecalho"><div><h2 style="font-size:22px">Pedir autorização</h2>
        <p>A exceção vai direto para quem tem alçada na sua sala. Você é avisado quando houver resposta.</p></div></div>
      <form id="form-nova" class="grade grade-lateral" novalidate>
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
            <div class="campo"><label for="cliente">Nome do cliente</label>
              <input class="entrada" id="cliente" name="cliente" autocomplete="off" required></div>
            <div class="campo"><label for="cpf">CPF do cliente</label>
              <input class="entrada" id="cpf" name="cpf" inputmode="numeric" placeholder="000.000.000-00" required></div>
            <div class="campo"><label for="empreendimento">Empreendimento</label>
              <input class="entrada" id="empreendimento" name="empreendimento" list="lista-emp" autocomplete="off">
              <datalist id="lista-emp">${['SALINAS PARK RESORT', 'SALINAS BEACH RESORT', 'SALINAS MATRIZ', 'PORTO ALTO RESORT', 'GRAN GARDEN RESORT']
                .map(e => html`<option value="${e}">`)}</datalist></div>
            <div class="campo"><label for="valor">Valor da venda</label>
              <input class="entrada" id="valor" name="valor" inputmode="numeric" placeholder="R$ 0,00"></div>
          </div>
          <div id="campos-tipo"></div>
          <div class="campo"><label for="justificativa">Justificativa</label>
            <textarea class="entrada" id="justificativa" name="justificativa" rows="4" placeholder="Explique por que a exceção é necessária para fechar a venda." required></textarea></div>
        </div></div>
        <div class="grade">
          <div class="card"><div class="card-corpo" id="resumo-alcada">
            <div class="aviso aviso-azul">${icone('escudo')}<div>Escolha o tipo de exceção para ver quem vai aprovar.</div></div>
          </div></div>
          <button class="btn btn-ouro btn-bloco" type="submit" style="height:48px">${icone('raio')} Enviar para aprovação</button>
          <a class="btn btn-claro btn-bloco" href="#/solicitacoes">Cancelar</a>
        </div>
      </form>`;
  },

  montar(el, ctx) {
    const form = el.querySelector('#form-nova');
    if (!form) return;
    const cpf = form.cpf;
    const valor = form.valor;
    cpf.addEventListener('input', () => { cpf.value = mascaraCpf(cpf.value); cpf.classList.remove('invalida'); });
    cpf.addEventListener('blur', () => cpf.classList.toggle('invalida', !!cpf.value && !cpfValido(cpf.value)));
    valor.addEventListener('input', () => { valor.value = mascaraMoeda(valor.value); });

    form.tipo_id.addEventListener('change', () => {
      const t = dados.tipos.find(x => x.id === form.tipo_id.value);
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
      if (d.cliente.length < 3) faltando.push('nome do cliente');
      if (!cpfValido(d.cpf)) faltando.push('CPF válido');
      Object.entries(campos).forEach(([k, v]) => { if (!v) faltando.push(k.toLowerCase()); });
      if (d.justificativa.length < 10) faltando.push('justificativa (mín. 10 caracteres)');
      if (faltando.length) return toast('Preencha: ' + faltando.join(', ') + '.', 'erro');
      try {
        const s = await processando('Enviando para aprovação…', () => api('solicitacoes.criar', {
          ...d, valor: lerMoeda(d.valor), campos,
        }));
        toast(`Solicitação ${s.codigo} enviada para aprovação.`, 'ok');
        ctx.ir('solicitacao/' + s.id);
      } catch (e) { toast(e.message, 'erro'); }
    });
  },
};
