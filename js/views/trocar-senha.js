import { html, api, sessao, icone, ocupado, dadosDoForm, toast } from '../core.js';
import { assinatura } from '../marcas.js';

/** Formulário de troca de senha, reaproveitado pela tela "Meu perfil". */
export function formSenha(obrigatoria) {
  return html`
    <form id="form-senha" novalidate>
      ${obrigatoria ? html`<div class="aviso aviso-ambar" style="margin-bottom:18px">${icone('chave')}
        <div>Por segurança, crie uma senha pessoal antes de continuar.</div></div>` : ''}
      <div id="erro-senha"></div>
      <div class="campo">
        <label for="senha_atual">${obrigatoria ? 'Senha provisória' : 'Senha atual'}</label>
        <input class="entrada" id="senha_atual" name="senha_atual" type="password" autocomplete="current-password" required>
      </div>
      <div class="campo">
        <label for="nova_senha">Nova senha</label>
        <input class="entrada" id="nova_senha" name="nova_senha" type="password" autocomplete="new-password" required>
        <small>Mínimo de 8 caracteres, com letras e números.</small>
      </div>
      <div class="campo">
        <label for="confirmar">Confirmar nova senha</label>
        <input class="entrada" id="confirmar" name="confirmar" type="password" autocomplete="new-password" required>
      </div>
      <button class="btn ${obrigatoria ? 'btn-primario btn-bloco' : 'btn-primario'}" type="submit">Salvar nova senha</button>
    </form>`;
}

export function montarFormSenha(el, aoConcluir) {
  const form = el.querySelector('#form-senha');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const d = dadosDoForm(form);
    const caixa = el.querySelector('#erro-senha');
    const erro = m => { caixa.innerHTML = html`<div class="aviso aviso-vermelho" style="margin-bottom:16px">${icone('alerta')}${m}</div>`.toString(); };
    caixa.innerHTML = '';
    if (d.nova_senha !== d.confirmar) return erro('A confirmação não confere com a nova senha.');
    if (d.nova_senha.length < 8 || !/[a-zA-Z]/.test(d.nova_senha) || !/\d/.test(d.nova_senha)) {
      return erro('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
    }
    try {
      const u = await ocupado(form.querySelector('button[type=submit]'),
        () => api('auth.trocarSenha', { senha_atual: d.senha_atual, nova_senha: d.nova_senha }));
      sessao.atualizarUsuario(u);
      toast('Senha alterada com sucesso.', 'ok');
      form.reset();
      aoConcluir?.(u);
    } catch (e) {
      erro(e.message);
    }
  });
}

export default {
  telaCheia: true,
  render() {
    const u = sessao.usuario;
    return html`
      <div class="tela-auth">
        <section class="auth-marca">${assinatura({ classe: 'grande' })}<div><h2>Olá, <em>${u?.nome?.split(' ')[0] || ''}</em>.</h2>
          <p>Este é seu primeiro acesso. Defina uma senha que só você conheça.</p></div><small></small></section>
        <section class="auth-form"><div class="caixa-auth">
          <div class="auth-logo-mobile">${assinatura({ classe: 'grande' })}</div>
          <h1 style="margin-bottom:18px">Criar sua senha</h1>
          ${formSenha(true)}
          <p style="text-align:center;margin-top:16px"><button class="btn btn-link" onclick="GAVSair()">Sair</button></p>
        </div></section>
      </div>`;
  },
  montar(el, ctx) {
    el.querySelector('#senha_atual').focus();
    montarFormSenha(el, () => ctx.ir('inicio'));
  },
};
