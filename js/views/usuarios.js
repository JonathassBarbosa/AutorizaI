import { html, api, icone, iniciais, modal, ocupado, toast, confirmar, dadosDoForm, relativo, vazio, PERFIS } from '../core.js';

let usuarios = [];
let est = null;
let filtro = { perfil: '', busca: '' };

const PERFIS_DE_SALA = ['gerente', 'assistente', 'consultor'];

function mostrarSenha(nome, email, senha) {
  const texto = `Acesso ao GAV Autorizações\nEndereço: ${location.origin + location.pathname}\nE-mail: ${email}\nSenha provisória: ${senha}`;
  const m = modal({
    titulo: 'Senha provisória',
    corpo: html`<p style="margin-top:0">Envie para <strong>${nome}</strong>. No primeiro acesso será pedida uma senha pessoal.</p>
      <div class="senha-gerada">${senha}</div>
      <p class="secundario" style="font-size:13px">Por segurança ela não será mostrada de novo. Se perder, use “Redefinir senha”.</p>`,
    rodape: html`<button class="btn btn-claro" data-copiar>${icone('copiar')} Copiar mensagem</button><button class="btn btn-primario" data-fechar>Pronto</button>`,
  });
  m.el.querySelector('[data-copiar]').onclick = async () => {
    try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada.', 'ok'); } catch { toast('Copie manualmente: ' + senha); }
  };
}

function linha(u) {
  return html`<tr class="clicavel" data-id="${u.id}">
    <td><div style="display:flex;gap:10px;align-items:center"><span class="avatar ${u.ativo ? '' : 'claro'}">${iniciais(u.nome)}</span>
      <div><div class="forte">${u.nome}</div><div class="secundario">${u.email}</div></div></div></td>
    <td>${PERFIS[u.perfil]}</td>
    <td class="secundario" style="min-width:200px">${u.vinculo}</td>
    <td class="secundario">${u.ultimo_acesso ? relativo(u.ultimo_acesso) : 'nunca entrou'}</td>
    <td>${u.ativo ? html`<span class="selo selo-verde">Ativo</span>` : html`<span class="selo selo-cinza">Inativo</span>`}</td>
  </tr>`;
}

export default {
  titulo: 'Usuários',
  perfis: ['master'],
  async render() {
    [usuarios, est] = await Promise.all([api('usuarios.listar'), api('estrutura.obter')]);
    const b = filtro.busca.toLowerCase();
    const lista = usuarios.filter(u => (!filtro.perfil || u.perfil === filtro.perfil)
      && (!b || (u.nome + ' ' + u.email + ' ' + u.vinculo).toLowerCase().includes(b)));
    const contagem = p => usuarios.filter(u => u.perfil === p && u.ativo).length;
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Pessoas e acessos</h2><p>${usuarios.filter(u => u.ativo).length} usuários ativos</p></div>
        <div class="acoes"><button class="btn btn-ouro" data-novo>${icone('mais')} Novo usuário</button></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-corpo" style="display:flex;flex-direction:column;gap:12px">
        <div class="busca">${icone('busca')}<input class="entrada" id="busca-u" placeholder="Buscar por nome, e-mail ou vínculo" value="${filtro.busca}"></div>
        <div class="chips">
          <button class="chip ${!filtro.perfil ? 'ativo' : ''}" data-perfil="">Todos</button>
          ${Object.entries(PERFIS).map(([k, v]) => html`<button class="chip ${filtro.perfil === k ? 'ativo' : ''}" data-perfil="${k}">${v} <span class="secundario">${contagem(k)}</span></button>`)}
        </div>
      </div></div>
      <div class="card">${lista.length ? html`<div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nome</th><th>Perfil</th><th>Vínculo</th><th>Último acesso</th><th>Situação</th></tr></thead>
        <tbody>${lista.map(linha)}</tbody></table></div>` : vazio('Nenhum usuário encontrado', '', 'usuarios')}</div>`;
  },

  montar(el, ctx) {
    const recarregar = () => ctx.ir('usuarios?t=' + Date.now());
    const busca = el.querySelector('#busca-u');
    let timer;
    busca.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filtro.busca = busca.value.trim(); recarregar(); }, 300); });
    if (filtro.busca) { busca.focus(); busca.setSelectionRange(busca.value.length, busca.value.length); }

    function abrir(u = {}) {
      const novo = !u.id;
      const m = modal({
        titulo: novo ? 'Novo usuário' : 'Editar usuário',
        largo: true,
        corpo: html`<form id="form-u">
          <div class="linha-campos">
            <div class="campo"><label>Nome completo</label><input class="entrada" name="nome" value="${u.nome || ''}" required></div>
            <div class="campo"><label>E-mail (login)</label><input class="entrada" name="email" type="email" value="${u.email || ''}" required></div>
            <div class="campo"><label>Telefone</label><input class="entrada" name="telefone" type="tel" value="${u.telefone || ''}"></div>
            <div class="campo"><label>Perfil</label><select class="entrada" name="perfil" required>
              ${Object.entries(PERFIS).map(([k, v]) => html`<option value="${k}" ${(u.perfil || 'consultor') === k ? 'selected' : ''}>${v}</option>`)}</select></div>
          </div>
          <div id="vinculo"></div>
          <label class="check"><input type="checkbox" name="ativo" ${u.ativo === false ? '' : 'checked'}> Acesso ativo</label>
        </form>`,
        rodape: html`${!novo ? html`<button class="btn btn-claro" data-reset style="margin-right:auto">${icone('chave')} Redefinir senha</button>` : ''}
          <button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn btn-primario" type="submit" form="form-u">Salvar</button>`,
      });
      const form = m.el.querySelector('#form-u');
      const caixaVinculo = m.el.querySelector('#vinculo');
      const desenharVinculo = () => {
        const p = form.perfil.value;
        let h = '';
        if (PERFIS_DE_SALA.includes(p)) {
          h = html`<div class="campo"><label>Sala de vendas</label><select class="entrada" name="sala_id" required>
            <option value="">Selecione…</option>${est.salas.map(s => html`<option value="${s.id}" ${s.id === u.sala_id ? 'selected' : ''}>${s.nome}${s.regional_nome ? ` — ${s.regional_nome}` : ''}</option>`)}</select>
            ${!est.salas.length ? html`<small>Nenhuma sala cadastrada ainda. Crie em <a href="#/estrutura">Estrutura</a>.</small>` : ''}</div>`;
        } else if (p === 'superintendente' || p === 'regional') {
          const lista = p === 'superintendente' ? est.diretorias : est.regionais;
          const marcados = u.perfil === p ? (u.vinculo_ids || []) : [];
          h = html`<div class="campo"><span class="rotulo">${p === 'superintendente' ? 'Diretorias sob responsabilidade' : 'Regionais sob responsabilidade'}</span>
            ${lista.length ? html`<div class="grade grade-2" style="gap:8px">${lista.map(x => html`<label class="check"><input type="checkbox" name="vinculo" value="${x.id}" ${marcados.includes(x.id) ? 'checked' : ''}> ${x.nome}</label>`)}</div>`
              : html`<small>Nenhuma ${p === 'superintendente' ? 'diretoria' : 'regional'} cadastrada. Você pode vincular depois em Estrutura.</small>`}</div>`;
        } else {
          h = html`<div class="aviso aviso-azul" style="margin-bottom:16px">${icone('escudo')}<div>Master tem acesso total ao sistema.</div></div>`;
        }
        caixaVinculo.innerHTML = h.toString();
      };
      desenharVinculo();
      form.perfil.addEventListener('change', desenharVinculo);

      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = dadosDoForm(form);
        delete d.vinculo;
        d.ativo = form.ativo.checked;
        if (['superintendente', 'regional'].includes(d.perfil)) d.vinculo_ids = [...form.querySelectorAll('[name=vinculo]:checked')].map(c => c.value);
        if (u.id) d.id = u.id;
        try {
          const r = await ocupado(m.el.querySelector('[type=submit]'), () => api('usuarios.salvar', d));
          m.fechar();
          toast(novo ? 'Usuário criado.' : 'Usuário atualizado.', 'ok');
          if (r.senha_temporaria) mostrarSenha(r.usuario.nome, r.usuario.email, r.senha_temporaria);
          recarregar();
        } catch (e) { toast(e.message, 'erro'); }
      });

      m.el.querySelector('[data-reset]')?.addEventListener('click', async () => {
        if (!(await confirmar('Redefinir senha', `Gerar uma nova senha provisória para ${u.nome}? As sessões abertas dessa pessoa serão encerradas.`, 'Gerar nova senha'))) return;
        try {
          const r = await api('usuarios.redefinirSenha', { id: u.id });
          m.fechar();
          mostrarSenha(u.nome, u.email, r.senha_temporaria);
        } catch (e) { toast(e.message, 'erro'); }
      });
    }

    el.addEventListener('click', ev => {
      if (ev.target.closest('[data-novo]')) return abrir();
      const p = ev.target.closest('[data-perfil]');
      if (p) { filtro.perfil = p.dataset.perfil; return recarregar(); }
      const tr = ev.target.closest('tr[data-id]');
      if (tr) abrir(usuarios.find(u => u.id === tr.dataset.id));
    });
  },
};
