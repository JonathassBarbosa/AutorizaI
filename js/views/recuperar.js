import { html, api, icone, dadosDoForm, toast } from '../core.js';
import { assinatura, processando } from '../marcas.js';

let emailInformado = '';

const passoEmail = () => html`
  <h1>Esqueci minha senha</h1>
  <p style="color:var(--muted);margin:4px 0 22px">Informe o e-mail cadastrado. Vamos enviar um código de 6 dígitos para você criar uma nova senha.</p>
  <form id="form-email" novalidate>
    <div class="erro-rec"></div>
    <div class="campo"><label for="email">E-mail</label>
      <input class="entrada" id="email" name="email" type="email" autocomplete="email" value="${emailInformado}" required></div>
    <button class="btn btn-primario btn-bloco" type="submit">Enviar código</button>
  </form>`;

const passoCodigo = () => html`
  <h1>Criar nova senha</h1>
  <p style="color:var(--muted);margin:4px 0 22px">Enviamos um código para <strong>${emailInformado}</strong>. Confira também a caixa de spam.</p>
  <form id="form-codigo" novalidate>
    <div class="erro-rec"></div>
    <div class="campo"><label for="codigo">Código recebido</label>
      <input class="entrada" id="codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
        placeholder="000000" style="font-size:22px;letter-spacing:.4em;text-align:center" required></div>
    <div class="campo"><label for="nova_senha">Nova senha</label>
      <input class="entrada" id="nova_senha" name="nova_senha" type="password" autocomplete="new-password" required>
      <small>Mínimo de 8 caracteres, com letras e números.</small></div>
    <div class="campo"><label for="confirmar">Confirmar nova senha</label>
      <input class="entrada" id="confirmar" name="confirmar" type="password" autocomplete="new-password" required></div>
    <button class="btn btn-primario btn-bloco" type="submit">Salvar nova senha</button>
    <p style="text-align:center;margin:14px 0 0"><button type="button" class="btn btn-link" data-reenviar>Não recebi o código</button></p>
  </form>`;

export default {
  telaCheia: true,
  publica: true,
  render() {
    return html`
      <div class="tela-auth">
        <section class="auth-marca">${assinatura({ classe: 'grande' })}
          <div><h2>Recupere seu <em>acesso</em>.</h2><p>O código chega no seu e-mail e vale por 15 minutos.</p></div>
          <small>© ${new Date().getFullYear()} GAV Resorts</small></section>
        <section class="auth-form"><div class="caixa-auth">
          <div class="auth-logo-mobile">${assinatura({ classe: 'grande' })}</div>
          <div id="passo">${passoEmail()}</div>
          <p style="text-align:center;margin:18px 0 0;font-size:14px"><a href="#/login">Voltar para o login</a></p>
        </div></section>
      </div>`;
  },
  montar(el, ctx) {
    const passo = el.querySelector('#passo');
    const erro = m => { passo.querySelector('.erro-rec').innerHTML = html`<div class="aviso aviso-vermelho" style="margin-bottom:16px">${icone('alerta')}<div>${m}</div></div>`.toString(); };

    function mostrarEmail() {
      passo.innerHTML = passoEmail().toString();
      const f = passo.querySelector('#form-email');
      f.email.focus();
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const { email } = dadosDoForm(f);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('Informe um e-mail válido.');
        try {
          await processando('Enviando código…', () => api('auth.esqueciSenha', { email }));
          emailInformado = email;
          mostrarCodigo();
        } catch (e) { erro(e.message); }
      });
    }

    function mostrarCodigo() {
      passo.innerHTML = passoCodigo().toString();
      const f = passo.querySelector('#form-codigo');
      f.codigo.focus();
      f.codigo.addEventListener('input', () => { f.codigo.value = f.codigo.value.replace(/\D/g, '').slice(0, 6); });
      passo.querySelector('[data-reenviar]').onclick = mostrarEmail;
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = dadosDoForm(f);
        if (d.codigo.length !== 6) return erro('Digite os 6 números do código.');
        if (d.nova_senha.length < 8 || !/[a-zA-Z]/.test(d.nova_senha) || !/\d/.test(d.nova_senha)) return erro('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
        if (d.nova_senha !== d.confirmar) return erro('A confirmação não confere com a nova senha.');
        try {
          await processando('Salvando nova senha…', () => api('auth.redefinirComCodigo', { email: emailInformado, codigo: d.codigo, nova_senha: d.nova_senha }));
          toast('Senha alterada! Entre com a nova senha.', 'ok');
          ctx.ir('login');
        } catch (e) { erro(e.message); }
      });
    }
    mostrarEmail();
  },
};
