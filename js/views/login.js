import { html, api, icone, dadosDoForm, ApiErro } from '../core.js';
import { assinatura, processando } from '../marcas.js';

export default {
  telaCheia: true,
  render() {
    return html`
      <div class="tela-auth">
        <section class="auth-marca">
          ${assinatura({ classe: 'grande' })}
          <div>
            <h2>Autorizações de vendas <em>fora da regra</em>, com rastreabilidade de ponta a ponta.</h2>
            <p>Solicite, aprove pela alçada certa e acompanhe cada exceção por sala, regional e diretoria.</p>
          </div>
          <small>© ${new Date().getFullYear()} GAV Resorts</small>
        </section>
        <section class="auth-form">
          <form id="form-login" novalidate>
            <div class="auth-logo-mobile">${assinatura({ classe: 'grande' })}</div>
            <h1>Entrar</h1>
            <p>Use seu e-mail e senha de acesso.</p>
            <div id="erro-login"></div>
            <div class="campo">
              <label for="email">E-mail</label>
              <input class="entrada" id="email" name="email" type="email" autocomplete="username" required>
            </div>
            <div class="campo">
              <label for="senha">Senha</label>
              <input class="entrada" id="senha" name="senha" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn btn-primario btn-bloco" type="submit">Entrar</button>
            <p style="margin:14px 0 0;text-align:center"><a href="#/recuperar" style="font-size:14px">Esqueci minha senha</a></p>
            <div class="divisor"><span>Ainda não tem acesso?</span></div>
            <a class="btn btn-claro btn-bloco" href="#/cadastro">Criar conta</a>
          </form>
        </section>
      </div>`;
  },
  montar(el, ctx) {
    const form = el.querySelector('#form-login');
    form.email.focus();
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = dadosDoForm(form);
      const caixa = el.querySelector('#erro-login');
      caixa.innerHTML = '';
      if (!d.email || !d.senha) {
        caixa.innerHTML = html`<div class="aviso aviso-vermelho" style="margin-bottom:16px">${icone('alerta')}Preencha e-mail e senha.</div>`.toString();
        return;
      }
      try {
        const r = await processando('Entrando…', () => api('auth.login', { email: d.email, senha: d.senha }));
        ctx.aoEntrar(r);
        ctx.ir(r.usuario.trocar_senha ? 'trocar-senha' : 'inicio');
      } catch (e) {
        caixa.innerHTML = html`<div class="aviso aviso-vermelho" style="margin-bottom:16px">${icone('alerta')}${e.message}</div>`.toString();
        if (!(e instanceof ApiErro)) throw e;
      }
    });
  },
};
