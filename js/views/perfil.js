import { html, api, icone, iniciais, toast, dataHora, ocupado, sessao, PERFIS } from '../core.js';
import { mascaraCelular, celularValido, ICONE_WHATS } from '../whatsapp.js';
import { formSenha, montarFormSenha } from './trocar-senha.js';
import { statusPush, ativarPush, desativarPush } from '../push.js';

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

async function desenharPush(caixa) {
  const st = await statusPush().catch(() => 'nao-configurado');
  const textos = {
    ativo: ['selo-verde', 'Ativas neste aparelho', 'Você recebe avisos de novas exceções e respostas mesmo com o app fechado.'],
    inativo: ['selo-ambar', 'Desativadas', 'Ative para ser avisado na hora, mesmo com o app fechado.'],
    bloqueado: ['selo-vermelho', 'Bloqueadas no navegador', 'Libere as notificações deste site nas configurações do navegador e recarregue a página.'],
    'nao-configurado': ['selo-cinza', 'Indisponíveis', 'O administrador ainda não configurou o push (OneSignal). Os avisos continuam aparecendo no sino dentro do app.'],
    indisponivel: ['selo-cinza', 'Não suportadas', ehIOS && !instalado
      ? 'No iPhone, primeiro adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.'
      : 'Este navegador não suporta notificações push.'],
  }[st];
  caixa.innerHTML = html`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="selo ${textos[0]}">${textos[1]}</span>
      ${st === 'inativo' ? html`<button class="btn btn-ouro btn-pequeno" data-push="ativar">${icone('sino')} Ativar</button>` : ''}
      ${st === 'ativo' ? html`<button class="btn btn-claro btn-pequeno" data-push="desativar">Desativar</button>` : ''}
    </div>
    <p class="secundario" style="margin:10px 0 0">${textos[2]}</p>`.toString();
}

export default {
  titulo: 'Meu perfil',
  render(ctx) {
    const u = ctx.usuario;
    return html`
      <div class="espaco"></div>
      <div class="grade grade-lateral">
        <div class="grade">
          <div class="card"><div class="card-corpo" style="display:flex;gap:16px;align-items:center">
            <span class="avatar" style="width:64px;height:64px;font-size:22px">${iniciais(u.nome)}</span>
            <div><h2 style="font-size:20px">${u.nome}</h2><div class="secundario">${u.email}</div>
              <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="selo selo-ouro sem-ponto">${PERFIS[u.perfil]}</span>
              <span class="selo selo-azul sem-ponto">${u.vinculo}</span></div></div>
          </div></div>
          <div class="card"><div class="card-topo"><h3 style="display:flex;gap:8px;align-items:center">${ICONE_WHATS} Celular com WhatsApp</h3></div>
            <form class="card-corpo" id="form-celular">
              ${!u.telefone ? html`<div class="aviso aviso-ambar" style="margin-bottom:14px">${icone('alerta')}<div>Cadastre seu celular para receber e enviar os avisos das solicitações pelo WhatsApp.</div></div>` : ''}
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <input class="entrada" name="telefone" type="tel" inputmode="numeric" placeholder="(81) 99999-9999" value="${mascaraCelular(u.telefone)}" style="flex:1;min-width:180px">
                <button class="btn btn-primario" type="submit">Salvar</button></div>
            </form></div>
          <div class="card"><div class="card-topo"><h3>Alterar senha</h3></div><div class="card-corpo">${formSenha(false)}</div></div>
        </div>
        <div class="grade">
          <div class="card"><div class="card-topo"><h3>${icone('sino')} Notificações push</h3></div>
            <div class="card-corpo" id="caixa-push"><div class="esqueleto" style="height:60px"></div></div></div>
          ${!instalado ? html`<div class="card"><div class="card-topo"><h3>${icone('celular')} Instalar no celular</h3></div><div class="card-corpo secundario">
            ${ehIOS ? html`No Safari, toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.`
              : html`No Chrome, toque no menu <strong>⋮</strong> → <strong>Instalar app</strong> (ou “Adicionar à tela inicial”).`}
            O app abre em tela cheia, como um aplicativo.</div></div>` : ''}
          <div class="card"><div class="card-corpo">
            <p class="secundario" style="margin:0 0 12px">Último acesso: ${dataHora(u.ultimo_acesso)}</p>
            <button class="btn btn-claro btn-bloco" onclick="GAVSair()">${icone('sair')} Sair da conta</button>
          </div></div>
        </div>
      </div>`;
  },
  montar(el) {
    montarFormSenha(el);
    const fc = el.querySelector('#form-celular');
    fc.telefone.addEventListener('input', () => { fc.telefone.value = mascaraCelular(fc.telefone.value); });
    fc.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!celularValido(fc.telefone.value)) return toast('Informe o celular com DDD, por exemplo (81) 99999-9999.', 'erro');
      try {
        const u = await ocupado(fc.querySelector('[type=submit]'), () => api('auth.atualizarTelefone', { telefone: fc.telefone.value }));
        sessao.atualizarUsuario(u);
        fc.querySelector('.aviso')?.remove();
        toast('Celular atualizado.', 'ok');
      } catch (e) { toast(e.message, 'erro'); }
    });
    const caixa = el.querySelector('#caixa-push');
    desenharPush(caixa);
    caixa.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-push]');
      if (!b) return;
      try {
        if (b.dataset.push === 'ativar') {
          const ok = await ativarPush();
          toast(ok ? 'Notificações ativadas neste aparelho.' : 'Permissão não concedida.', ok ? 'ok' : 'erro');
        } else {
          await desativarPush();
          toast('Notificações desativadas neste aparelho.');
        }
      } catch (e) { toast(e.message, 'erro'); }
      desenharPush(caixa);
    });
  },
};
