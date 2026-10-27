import { html, api, icone, iniciais, modal, ocupado, toast, confirmar, dadosDoForm, relativo, vazio, PERFIS } from '../core.js';
import { mascaraCelular } from '../whatsapp.js';

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
    <td class="cel-cheia"><div style="display:flex;gap:10px;align-items:center"><span class="avatar ${u.ativo ? '' : 'claro'}">${iniciais(u.nome)}</span>
      <div><div class="forte">${u.nome}</div><div class="secundario">${u.email}</div></div></div></td>
    <td data-rotulo="Perfil">${PERFIS[u.perfil]}</td>
    <td class="secundario" data-rotulo="Vínculo">${u.vinculo}</td>
    <td class="secundario" data-rotulo="Último acesso">${u.ultimo_acesso ? relativo(u.ultimo_acesso) : 'nunca entrou'}</td>
    <td data-rotulo="Situação">${u.cadastro === 'recusado' ? html`<span class="selo selo-vermelho">Recusado</span>`
      : u.ativo ? html`<span class="selo selo-verde">Ativo</span>` : html`<span class="selo selo-cinza">Inativo</span>`}</td>
  </tr>`;
}

export default {
  titulo: 'Usuários',
  perfis: ['master'],
  async render() {
    [usuarios, est] = await Promise.all([api('usuarios.listar'), api('estrutura.obter')]);
    const b = filtro.busca.toLowerCase();
    const pendentes = usuarios.filter(u => u.cadastro === 'pendente');
    const lista = usuarios.filter(u => u.cadastro !== 'pendente' && (!filtro.perfil || u.perfil === filtro.perfil)
      && (!b || (u.nome + ' ' + u.email + ' ' + u.vinculo).toLowerCase().includes(b)));
    const contagem = p => usuarios.filter(u => u.perfil === p && u.ativo).length;
    const salaNome = id => est.salas.find(s => s.id === id)?.nome || '';
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Pessoas e acessos</h2><p>${usuarios.filter(u => u.ativo).length} usuários ativos</p></div>
        <div class="acoes"><button class="btn btn-ouro" data-novo>${icone('mais')} Novo usuário</button></div>
      </div>
      ${pendentes.length ? html`<div class="card" style="margin-bottom:16px;border-color:var(--gold-500);box-shadow:0 0 0 3px var(--gold-100)">
        <div class="card-topo"><h3>Cadastros aguardando aprovação</h3><span class="contador ouro">${pendentes.length}</span></div>
        ${pendentes.map(u => html`<div class="pendente-item">
          <span class="avatar claro">${iniciais(u.nome)}</span>
          <div class="pendente-dados"><div class="forte">${u.nome}</div>
            <div class="secundario">${u.email}${u.telefone ? ` · ${u.telefone}` : ''}</div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap"><span class="selo selo-ouro sem-ponto">${PERFIS[u.perfil]}</span>
              ${u.sala_id ? html`<span class="selo selo-azul sem-ponto">${salaNome(u.sala_id)}</span>` : ''}
              <span class="selo selo-cinza sem-ponto">${relativo(u.criado_em)}</span></div></div>
          <div class="pendente-acoes"><button class="btn btn-claro btn-pequeno" data-recusar="${u.id}">Recusar</button>
            <button class="btn btn-verde btn-pequeno" data-aprovar="${u.id}">${icone('check')} Aprovar</button></div>
        </div>`)}</div>` : ''}
      <div class="card" style="margin-bottom:16px"><div class="card-corpo" style="display:flex;flex-direction:column;gap:12px">
        <div class="busca">${icone('busca')}<input class="entrada" id="busca-u" placeholder="Buscar por nome, e-mail ou vínculo" value="${filtro.busca}"></div>
        <div class="chips">
          <button class="chip ${!filtro.perfil ? 'ativo' : ''}" data-perfil="">Todos</button>
          ${Object.entries(PERFIS).map(([k, v]) => html`<button class="chip ${filtro.perfil === k ? 'ativo' : ''}" data-perfil="${k}">${v} <span class="secundario">${contagem(k)}</span></button>`)}
        </div>
      </div></div>
      <div class="card">${lista.length ? html`<div class="tabela-wrap"><table class="tabela cartoes">
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
            <div class="campo"><label>Celular com WhatsApp</label><input class="entrada" name="telefone" type="tel" inputmode="numeric" placeholder="(81) 99999-9999" value="${mascaraCelular(u.telefone)}"></div>
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
      form.telefone.addEventListener('input', () => { form.telefone.value = mascaraCelular(form.telefone.value); });
      const caixaVinculo = m.el.querySelector('#vinculo');
      const desenharVinculo = () => {
        const p = form.perfil.value;
        let h = '';
        if (PERFIS_DE_SALA.includes(p)) {
          h = html`<div class="campo"><label>Sala de vendas</label><select class="entrada" name="sala_id" required>
            <option value="">Selecione…</option>${est.salas.map(s => html`<option value="${s.id}" ${s.id === u.sala_id ? 'selected' : ''}>${s.nome}${s.regional_nome ? ` — ${s.regional_nome}` : ''}</option>`)}</select>
            ${!est.salas.length ? html`<small>Nenhuma sala cadastrada ainda. Crie em <a href="#/estrutura">Estrutura</a>.</small>` : ''}</div>`;
        } else if (p === 'superintendente' || p === 'regional' || p === 'diretor') {
          const lista = p === 'regional' ? est.regionais : est.diretorias;
          const marcados = u.perfil === p ? (u.vinculo_ids || []) : [];
          h = html`<div class="campo"><span class="rotulo">${p === 'regional' ? 'Regionais sob responsabilidade' : 'Diretorias sob responsabilidade'}</span>
            ${lista.length ? html`<div class="grade grade-2" style="gap:8px">${lista.map(x => html`<label class="check"><input type="checkbox" name="vinculo" value="${x.id}" ${marcados.includes(x.id) ? 'checked' : ''}> ${x.nome}</label>`)}</div>`
              : html`<small>Nenhuma ${p === 'regional' ? 'regional' : 'diretoria'} cadastrada. Você pode vincular depois em Estrutura.</small>`}</div>`;
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
        if (['superintendente', 'regional', 'diretor'].includes(d.perfil)) d.vinculo_ids = [...form.querySelectorAll('[name=vinculo]:checked')].map(c => c.value);
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

    function aprovar(u) {
      const m = modal({
        titulo: `Aprovar cadastro — ${u.nome}`,
        corpo: html`<form id="form-ap">
          <p class="secundario" style="margin-top:0">${u.email}${u.telefone ? ` · ${u.telefone}` : ''}</p>
          <div class="campo"><label>Função</label><select class="entrada" name="perfil">
            ${['consultor', 'gerente', 'assistente', 'regional', 'superintendente', 'diretor'].map(p => html`<option value="${p}" ${p === u.perfil ? 'selected' : ''}>${PERFIS[p]}</option>`)}</select>
            <small>Confira se a função informada pela pessoa está correta.</small></div>
          <div id="vinculo-ap"></div></form>`,
        rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn btn-verde" type="submit" form="form-ap">${icone('check')} Aprovar acesso</button>`,
      });
      const form = m.el.querySelector('#form-ap');
      const caixa = m.el.querySelector('#vinculo-ap');
      const desenhar = () => {
        const p = form.perfil.value;
        if (PERFIS_DE_SALA.includes(p)) {
          caixa.innerHTML = html`<div class="campo"><label>Sala de vendas</label><select class="entrada" name="sala_id">
            <option value="">Selecione…</option>${est.salas.map(s => html`<option value="${s.id}" ${s.id === u.sala_id ? 'selected' : ''}>${s.nome}</option>`)}</select></div>`.toString();
        } else {
          const lista = p === 'regional' ? est.regionais : est.diretorias;
          const nomeLista = p === 'regional' ? 'Regionais' : 'Diretorias';
          caixa.innerHTML = html`<div class="campo"><span class="rotulo">${nomeLista} sob responsabilidade de ${u.nome.split(' ')[0]}</span>
            ${lista.length ? html`<div class="grade grade-2" style="gap:8px">${lista.map(x => html`<label class="check"><input type="checkbox" name="vinculo" value="${x.id}"> ${x.nome}</label>`)}</div>`
              : html`<div class="aviso aviso-ambar">${icone('alerta')}<div>Nenhuma ${p === 'regional' ? 'regional' : 'diretoria'} cadastrada. Crie primeiro em <a href="#/estrutura">Estrutura</a>.</div></div>`}</div>`.toString();
        }
      };
      desenhar();
      form.perfil.addEventListener('change', desenhar);
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = { id: u.id, perfil: form.perfil.value, sala_id: form.sala_id?.value || '', vinculo_ids: [...form.querySelectorAll('[name=vinculo]:checked')].map(c => c.value) };
        try {
          await ocupado(m.el.querySelector('[type=submit]'), () => api('usuarios.aprovarCadastro', d));
          m.fechar();
          toast(`Acesso de ${u.nome.split(' ')[0]} liberado. O aviso foi enviado por e-mail.`, 'ok');
          ctx.atualizarNotificacoes(true);
          recarregar();
        } catch (e) { toast(e.message, 'erro'); }
      });
    }

    async function recusar(u) {
      const m = modal({
        titulo: `Recusar cadastro — ${u.nome}`,
        corpo: html`<form id="form-rec"><div class="campo"><label>Motivo (opcional, vai no e-mail)</label>
          <textarea class="entrada" name="motivo" rows="3" placeholder="Ex.: não faz parte da equipe comercial"></textarea></div></form>`,
        rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button><button class="btn btn-vermelho" type="submit" form="form-rec">Recusar</button>`,
      });
      m.el.querySelector('#form-rec').addEventListener('submit', async ev => {
        ev.preventDefault();
        try {
          await ocupado(m.el.querySelector('[type=submit]'), () => api('usuarios.recusarCadastro', { id: u.id, motivo: ev.target.motivo.value.trim() }));
          m.fechar();
          toast('Cadastro recusado.', 'ok');
          ctx.atualizarNotificacoes(true);
          recarregar();
        } catch (e) { toast(e.message, 'erro'); }
      });
    }

    el.addEventListener('click', ev => {
      if (ev.target.closest('[data-novo]')) return abrir();
      const ap = ev.target.closest('[data-aprovar]');
      if (ap) return aprovar(usuarios.find(u => u.id === ap.dataset.aprovar));
      const rc = ev.target.closest('[data-recusar]');
      if (rc) return recusar(usuarios.find(u => u.id === rc.dataset.recusar));
      const p = ev.target.closest('[data-perfil]');
      if (p) { filtro.perfil = p.dataset.perfil; return recarregar(); }
      const tr = ev.target.closest('tr[data-id]');
      if (tr) abrir(usuarios.find(u => u.id === tr.dataset.id));
    });
  },
};
