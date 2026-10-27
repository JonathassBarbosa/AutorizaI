import { html, api, icone, modal, ocupado, toast, dadosDoForm, vazio, ALCADAS } from '../core.js';

let tipos = [];

export default {
  titulo: 'Tipos de exceção',
  perfis: ['master'],
  async render() {
    tipos = await api('tipos.listar');
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Regras e alçadas</h2>
          <p>Cada tipo define quem aprova e quais informações o consultor precisa preencher.</p></div>
        <div class="acoes"><button class="btn btn-ouro" data-novo>${icone('mais')} Novo tipo</button></div>
      </div>
      ${tipos.length ? html`<div class="grade grade-2">${tipos.map(t => html`
        <div class="card" style="cursor:pointer;${t.ativo ? '' : 'opacity:.6'}" data-id="${t.id}">
          <div class="card-topo"><h3>${t.nome}</h3>${t.ativo ? html`<span class="selo selo-ouro sem-ponto">${ALCADAS[t.alcada]}</span>` : html`<span class="selo selo-cinza">Inativo</span>`}</div>
          <div class="card-corpo">
            <p style="margin:0 0 12px" class="secundario">${t.descricao || 'Sem descrição.'}</p>
            <div class="chips">${t.campos.length ? t.campos.map(c => html`<span class="selo selo-azul sem-ponto">${c}</span>`) : html`<span class="secundario" style="font-size:13px">Sem campos extras</span>`}</div>
          </div>
        </div>`)}</div>` : html`<div class="card">${vazio('Nenhum tipo cadastrado', 'Crie o primeiro tipo de exceção.', 'etiqueta')}</div>`}`;
  },
  montar(el, ctx) {
    function abrir(t = {}) {
      const m = modal({
        titulo: t.id ? 'Editar tipo de exceção' : 'Novo tipo de exceção',
        corpo: html`<form id="form-t">
          <div class="campo"><label>Nome</label><input class="entrada" name="nome" value="${t.nome || ''}" required placeholder="Ex.: Parcelamento de entrada acima do limite"></div>
          <div class="campo"><label>Descrição (aparece para o consultor)</label><textarea class="entrada" name="descricao" rows="2">${t.descricao || ''}</textarea></div>
          <div class="campo"><label>Alçada mínima de aprovação</label><select class="entrada" name="alcada">
            ${Object.entries(ALCADAS).map(([k, v]) => html`<option value="${k}" ${(t.alcada || 'gerente') === k ? 'selected' : ''}>${v}</option>`)}</select>
            <small>Níveis acima também podem aprovar. Se o cargo estiver vago na sala, o pedido sobe automaticamente.</small></div>
          <div class="campo"><label>Campos que o consultor deve preencher (um por linha)</label>
            <textarea class="entrada" name="campos" rows="4" placeholder="Parcelas da entrada&#10;Limite da política">${(t.campos || []).join('\n')}</textarea></div>
          <label class="check"><input type="checkbox" name="ativo" ${t.ativo === false ? '' : 'checked'}> Ativo</label>
        </form>`,
        rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="form-t">Salvar</button>`,
      });
      const form = m.el.querySelector('#form-t');
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = dadosDoForm(form);
        d.campos = d.campos.split('\n').map(s => s.trim()).filter(Boolean);
        d.ativo = form.ativo.checked;
        if (t.id) d.id = t.id;
        try {
          await ocupado(m.el.querySelector('[type=submit]'), () => api('tipos.salvar', d));
          m.fechar();
          toast('Tipo de exceção salvo.', 'ok');
          ctx.ir('tipos?t=' + Date.now());
        } catch (e) { toast(e.message, 'erro'); }
      });
    }
    el.addEventListener('click', ev => {
      if (ev.target.closest('[data-novo]')) return abrir();
      const c = ev.target.closest('[data-id]');
      if (c) abrir(tipos.find(t => t.id === c.dataset.id));
    });
  },
};
