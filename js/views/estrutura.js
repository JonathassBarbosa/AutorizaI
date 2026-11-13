import { html, api, icone, iniciais, modal, ocupado, toast, dadosDoForm, vazio } from '../core.js';

let est = null;

const pessoa = (nome, papel) => nome
  ? html`<span class="pessoa"><span class="avatar claro">${iniciais(nome)}</span><span><span class="titulo-papel">${papel}</span><br>${nome}</span></span>`
  : html`<span class="pessoa secundario"><span class="avatar claro">?</span><span><span class="titulo-papel">${papel}</span><br>não definido</span></span>`;

const opcoes = (lista, selecionado, vazioTxt) => html`<option value="">${vazioTxt}</option>
  ${lista.map(x => html`<option value="${x.id}" ${x.id === selecionado ? 'selected' : ''}>${x.nome}${x.ativo === false ? ' (inativo)' : ''}</option>`)}`;

function cardSala(s) {
  return html`<div class="org-sala ${s.ativo ? '' : 'inativa'}" data-editar="sala" data-id="${s.id}">
    <div style="display:flex;justify-content:space-between;gap:8px"><strong>${s.nome}</strong>
      ${s.limite_pct ? html`<span class="selo selo-ouro sem-ponto">${s.limite_pct}%</span>` : ''}</div>
    <small>Diretoria: ${s.diretores.length ? s.diretores.join(', ') : '—'}</small>
    <small>Superintendente: ${s.superintendente_nome || '—'}</small>
    <small>Regional: ${s.regional_resp_nome || '—'}</small>
    <small>Gerente de Sala: ${s.gerentes.length ? s.gerentes.join(', ') : '—'}</small>
    <small>Consultores de Vendas: ${s.consultores.length}</small>
    <small>Assistente de Contratos: ${s.assistentes.length ? s.assistentes.join(', ') : '—'}${s.ativo ? '' : ' · inativa'}</small>
  </div>`;
}


function blocoRegional(r) {
  const salas = est.salas.filter(s => s.regional_id === r.id);
  return html`<div class="org-reg">
    <header><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <strong>${icone('predio')} ${r.nome}${r.ativo ? '' : ' (inativa)'}</strong></div>
      <button class="editar-link" data-editar="regional" data-id="${r.id}" title="Editar regional">${icone('editar')}</button></header>
    <div class="org-salas">${salas.length ? salas.map(cardSala) : html`<span class="secundario" style="padding:4px">Nenhuma sala nesta regional.</span>`}</div>
  </div>`;
}

export default {
  titulo: 'Estrutura',
  perfis: ['master'],
  async render() {
    est = await api('estrutura.obter');
    const regSemDir = est.regionais.filter(r => !est.diretorias.some(d => d.id === r.diretoria_id));
    const salasSemReg = est.salas.filter(s => !est.regionais.some(r => r.id === s.regional_id));
    const nada = !est.diretorias.length && !est.regionais.length && !est.salas.length;
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Diretorias, regionais e salas</h2>
          <p>Diretoria e regional agrupam as salas. Em cada sala, o master escolhe a Diretoria, o Superintendente e o Regional responsáveis.</p></div>
        <div class="acoes">
          <button class="btn btn-claro" data-novo="diretoria">${icone('mais')} Diretoria</button>
          <button class="btn btn-claro" data-novo="regional">${icone('mais')} Regional</button>
          <button class="btn btn-ouro" data-novo="sala">${icone('mais')} Sala</button>
        </div>
      </div>
      ${nada ? html`<div class="card">${vazio('Comece pela estrutura',
        html`1) Crie a diretoria e as regionais (só agrupam) · 2) abra cada sala e escolha a regional e os responsáveis: Diretoria, Superintendente e Regional · 3) aprove gerentes de sala, consultores de vendas e assistentes de contratos em <a href="#/usuarios">Usuários</a>.`, 'organo')}</div>` : ''}

      ${est.diretorias.map(d => html`<div class="card org-dir">
        <div class="card-topo"><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <h3 style="font-size:17px">${d.nome}${d.ativo ? '' : ' (inativa)'}</h3></div>
          <button class="editar-link" data-editar="diretoria" data-id="${d.id}" title="Editar diretoria">${icone('editar')}</button></div>
        <div class="org-regionais">${est.regionais.filter(r => r.diretoria_id === d.id).map(blocoRegional)}
          ${!est.regionais.some(r => r.diretoria_id === d.id) ? html`<span class="secundario">Nenhuma regional nesta diretoria.</span>` : ''}</div>
      </div>`)}

      ${regSemDir.length ? html`<div class="card org-dir"><div class="card-topo"><h3>Regionais sem diretoria</h3></div>
        <div class="org-regionais">${regSemDir.map(blocoRegional)}</div></div>` : ''}
      ${salasSemReg.length ? html`<div class="card org-dir"><div class="card-topo"><h3>Salas sem regional</h3></div>
        <div class="org-salas" style="padding:16px">${salasSemReg.map(cardSala)}</div></div>` : ''}`;
  },

  montar(el, ctx) {
    const superintendentes = est.usuarios.filter(u => u.perfil === 'superintendente');
    const diretoresPessoas = est.usuarios.filter(u => u.perfil === 'diretor');
    const regionaisPessoas = est.usuarios.filter(u => u.perfil === 'regional');
    const semPessoas = rotulo => html`<small>Nenhum usuário aprovado com perfil ${rotulo}. Aprove os cadastros em <a href="#/usuarios">Usuários</a>.</small>`;

    function abrir(tipo, id) {
      const reg = id ? est[{ diretoria: 'diretorias', regional: 'regionais', sala: 'salas' }[tipo]].find(x => x.id === id) : {};
      const ativo = reg.ativo !== false;
      let corpo;
      if (tipo === 'diretoria') {
        corpo = html`<div class="campo"><label>Nome da diretoria</label><input class="entrada" name="nome" value="${reg.nome || ''}" required></div>
          <div class="aviso aviso-azul">${icone('usuarios')}<div>A diretoria agrupa regionais e salas. Os diretores responsáveis são escolhidos em cada sala (ou no cadastro do usuário).</div></div>`;
      } else if (tipo === 'regional') {
        corpo = html`<div class="campo"><label>Nome da regional</label><input class="entrada" name="nome" value="${reg.nome || ''}" required></div>
          <div class="campo"><label>Diretoria</label><select class="entrada" name="diretoria_id">${opcoes(est.diretorias, reg.diretoria_id, '— sem diretoria —')}</select></div>
          <div class="aviso aviso-azul">${icone('usuarios')}<div>A regional agrupa salas. O Regional e o Superintendente responsáveis são escolhidos em cada sala (ou no cadastro do usuário).</div></div>`;
      } else {
        corpo = html`<div class="campo"><label>Nome da sala de vendas</label><input class="entrada" name="nome" value="${reg.nome || ''}" required></div>
          <div class="campo"><label>Regional (agrupamento)</label><select class="entrada" name="regional_id">${opcoes(est.regionais, reg.regional_id, '— sem regional —')}</select></div>
          <div class="cadeia-sala">
            <span class="titulo-papel">Responsáveis pela sala</span>
            <div class="campo" style="margin:0"><label>Diretoria</label>
              ${diretoresPessoas.length ? html`<div class="grade grade-2" style="gap:6px">${diretoresPessoas.map(p => html`<label class="check"><input type="checkbox" name="diretores" value="${p.id}" ${(reg.diretores_ids || []).includes(p.id) ? 'checked' : ''}> ${p.nome}${p.ativo === false ? ' (inativo)' : ''}</label>`)}</div>` : semPessoas('Diretoria')}</div>
            <div class="campo" style="margin:0"><label>Superintendente</label>
              ${superintendentes.length ? html`<select class="entrada" name="superintendente_id">${opcoes(superintendentes, reg.superintendente_id, '— sem superintendente —')}</select>` : semPessoas('Superintendente')}</div>
            <div class="campo" style="margin:0"><label>Regional</label>
              ${regionaisPessoas.length ? html`<select class="entrada" name="regional_resp_id">${opcoes(regionaisPessoas, reg.regional_resp_id, '— sem regional —')}</select>` : semPessoas('Regional')}</div>
          </div>
          <div class="campo"><label>Limite padrão de exceções no mês (%)</label>
            <input class="entrada" name="limite_pct" type="number" min="0" max="100" step="0.5" value="${reg.limite_pct ?? 0}">
            <small>Vale nos meses sem % definido em <a href="#/metas">Metas das salas</a>. Quando a sala atinge o limite, novas exceções sobem um nível de alçada. 0 = sem limite.</small></div>
          ${id ? html`<div class="aviso aviso-azul">${icone('usuarios')}<div>Gerentes de sala, consultores de vendas e assistentes de contratos são vinculados à sala no cadastro de <a href="#/usuarios">Usuários</a>.</div></div>` : ''}`;
      }
      const m = modal({
        titulo: `${id ? 'Editar' : 'Nova'} ${tipo}`,
        corpo: html`<form id="form-est">${corpo}<label class="check" style="margin-top:4px"><input type="checkbox" name="ativo" ${ativo ? 'checked' : ''}> Ativa</label></form>`,
        rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="form-est">Salvar</button>`,
      });
      const form = m.el.querySelector('#form-est');
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = dadosDoForm(form);
        d.ativo = form.ativo.checked;
        if (tipo === 'sala') { delete d.diretores; d.diretores_ids = [...form.querySelectorAll('[name=diretores]:checked')].map(c => c.value); }
        if (id) d.id = id;
        const acao = { diretoria: 'estrutura.salvarDiretoria', regional: 'estrutura.salvarRegional', sala: 'estrutura.salvarSala' }[tipo];
        try {
          await ocupado(m.el.querySelector('[type=submit]'), () => api(acao, d));
          m.fechar();
          toast('Estrutura atualizada.', 'ok');
          ctx.ir('estrutura?t=' + Date.now());
        } catch (e) { toast(e.message, 'erro'); }
      });
    }

    el.addEventListener('click', ev => {
      const novo = ev.target.closest('[data-novo]');
      if (novo) return abrir(novo.dataset.novo);
      const ed = ev.target.closest('[data-editar]');
      if (ed) abrir(ed.dataset.editar, ed.dataset.id);
    });
  },
};
