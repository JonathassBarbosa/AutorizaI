import { html, api, icone, dadosDoForm, PERFIS, porHierarquia } from '../core.js';
import { assinatura, processando } from '../marcas.js';
import { mascaraCelular, celularValido } from '../whatsapp.js';

const PERFIS_DE_SALA = ['gerente', 'consultor', 'assistente'];
const AJUDA = {
  consultor: 'Pede autorizações para vendas fora da regra.',
  gerente: 'Aprova as exceções da sua sala.',
  assistente: 'Recebe o retorno das autorizações para finalizar os contratos.',
  regional: 'Aprova as exceções das salas da sua regional.',
  superintendente: 'Aprova as exceções das salas da sua diretoria.',
  diretor: 'Acompanha e aprova as exceções das diretorias sob sua responsabilidade.',
};

let opcoes = null;

function telaEnviado() {
  return html`<div style="text-align:center">
    <div style="width:64px;height:64px;border-radius:50%;background:var(--green-bg);color:var(--green);display:grid;place-items:center;margin:0 auto 16px">${icone('check')}</div>
    <h1 style="margin-bottom:8px">Cadastro enviado!</h1>
    <p style="color:var(--muted);margin:0 0 24px">O master vai analisar seu pedido. Você receberá um <strong>e-mail</strong> quando o acesso for liberado.</p>
    <a class="btn btn-primario btn-bloco" href="#/login">Voltar para o login</a></div>`;
}

export default {
  telaCheia: true,
  publica: true,
  async render() {
    opcoes = await api('cadastro.opcoes');
    return html`
      <div class="tela-auth">
        <section class="auth-marca">
          ${assinatura({ classe: 'grande' })}
          <div><h2>Peça seu <em>acesso</em>.</h2>
            <p>Escolha a função que você ocupa. O master confere e libera o acesso; você recebe a confirmação por e-mail.</p></div>
          <small>© ${new Date().getFullYear()} GAV Resorts</small>
        </section>
        <section class="auth-form">
          <div class="caixa-auth" id="caixa-cadastro">
            <div class="auth-logo-mobile">${assinatura({ classe: 'grande' })}</div>
            <h1>Criar conta</h1>
            <p style="color:var(--muted);margin:4px 0 22px">Preencha seus dados para pedir acesso.</p>
            <form id="form-cadastro" novalidate>
              <div id="erro-cadastro"></div>
              <div class="campo"><label for="nome">Nome completo</label>
                <input class="entrada" id="nome" name="nome" autocomplete="name" required></div>
              <div class="campo"><label for="perfil">Função que você ocupa</label>
                <select class="entrada" id="perfil" name="perfil" required>
                  <option value="">Selecione…</option>
                  ${opcoes.perfis.slice().sort(porHierarquia).map(p => html`<option value="${p}">${PERFIS[p]}</option>`)}
                </select>
                <small id="ajuda-perfil"></small></div>
              <div class="campo" id="campo-sala" hidden><label for="sala_id">Sala de vendas</label>
                <select class="entrada" id="sala_id" name="sala_id">
                  <option value="">Selecione sua sala…</option>
                  ${opcoes.salas.map(s => html`<option value="${s.id}">${s.nome}</option>`)}
                </select></div>
              <div class="aviso aviso-azul" id="aviso-vinculo" hidden style="margin-bottom:16px">${icone('organo')}
                <div>O master vai definir quais regionais ou diretorias ficam sob sua responsabilidade ao aprovar o cadastro.</div></div>
              <div class="campo"><label for="telefone">Celular com WhatsApp</label>
                <input class="entrada" id="telefone" name="telefone" type="tel" autocomplete="tel" inputmode="numeric" placeholder="(81) 99999-9999" required>
                <small>Usado para avisos das solicitações pelo WhatsApp.</small></div>
              <div class="campo"><label for="email">E-mail</label>
                <input class="entrada" id="email" name="email" type="email" autocomplete="email" required>
                <small>Será o seu login e serve para recuperar a senha.</small></div>
              <div class="linha-campos">
                <div class="campo"><label for="senha">Senha</label>
                  <input class="entrada" id="senha" name="senha" type="password" autocomplete="new-password" required></div>
                <div class="campo"><label for="confirmar">Confirmar senha</label>
                  <input class="entrada" id="confirmar" name="confirmar" type="password" autocomplete="new-password" required></div>
              </div>
              <p style="font-size:12px;color:var(--muted);margin:-8px 0 16px">Mínimo de 8 caracteres, com letras e números.</p>
              <button class="btn btn-primario btn-bloco" type="submit">Enviar cadastro</button>
            </form>
            <p style="text-align:center;margin:18px 0 0;font-size:14px">Já tem acesso? <a href="#/login">Entrar</a></p>
          </div>
        </section>
      </div>`;
  },
  montar(el) {
    const form = el.querySelector('#form-cadastro');
    const caixaErro = el.querySelector('#erro-cadastro');
    const erro = m => {
      caixaErro.innerHTML = html`<div class="aviso aviso-vermelho" style="margin-bottom:16px">${icone('alerta')}<div>${m}</div></div>`.toString();
      caixaErro.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    form.nome.focus();
    form.telefone.addEventListener('input', () => { form.telefone.value = mascaraCelular(form.telefone.value); });
    form.perfil.addEventListener('change', () => {
      const p = form.perfil.value;
      el.querySelector('#ajuda-perfil').textContent = AJUDA[p] || '';
      el.querySelector('#campo-sala').hidden = !PERFIS_DE_SALA.includes(p);
      el.querySelector('#aviso-vinculo').hidden = !['regional', 'superintendente', 'diretor'].includes(p);
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      caixaErro.innerHTML = '';
      const d = dadosDoForm(form);
      if (d.nome.split(/\s+/).length < 2) return erro('Informe seu nome completo (nome e sobrenome).');
      if (!d.perfil) return erro('Selecione a função que você ocupa.');
      if (PERFIS_DE_SALA.includes(d.perfil) && !d.sala_id) return erro('Selecione a sua sala de vendas.');
      if (!celularValido(d.telefone)) return erro('Informe seu celular com DDD, por exemplo (81) 99999-9999.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return erro('Informe um e-mail válido.');
      if (d.senha.length < 8 || !/[a-zA-Z]/.test(d.senha) || !/\d/.test(d.senha)) return erro('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
      if (d.senha !== d.confirmar) return erro('A confirmação não confere com a senha.');
      delete d.confirmar;
      try {
        await processando('Enviando cadastro…', () => api('cadastro.solicitar', d));
        el.querySelector('#caixa-cadastro').innerHTML = html`<div class="auth-logo-mobile">${assinatura({ classe: 'grande' })}</div>${telaEnviado()}`.toString();
      } catch (e) { erro(e.message); }
    });
  },
};
