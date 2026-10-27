/**
 * Avisos por WhatsApp usando links wa.me: o app abre a conversa com a mensagem pronta,
 * e a pessoa só toca em "Enviar" (o wa.me não envia sozinho).
 */
import { html, raw, modal, moeda, dataHora, PERFIS, dadosCliente } from './core.js';

export const ICONE_WHATS = raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none">
  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>`);

export const linkWa = (numero, texto) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

export function mascaraCelular(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function celularValido(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return /^[1-9]\d{9,10}$/.test(d);
}

const primeiroNome = n => String(n || '').trim().split(/\s+/)[0];
const urlSolicitacao = id => `${location.origin}${location.pathname}#/solicitacao/${id}`;

/** Mensagem do solicitante para o aprovador. */
export function textoPedido(s, aprovador) {
  const linhas = [
    '*GAV · Pedido de autorização*',
    `Olá, ${primeiroNome(aprovador.nome)}! Tenho uma venda fora da regra aguardando sua aprovação:`,
    '',
    `*Código:* ${s.codigo}`,
    `*Tipo:* ${s.tipo_nome}`,
    ...dadosCliente(s).map(([k, v]) => `*${k}:* ${v}`),
    `*Valor da venda:* ${moeda(s.valor)}`,
    `*Sala:* ${s.sala_nome}`,
    ...Object.entries(s.campos || {}).map(([k, v]) => `*${k}:* ${v}`),
    `*Justificativa:* ${s.justificativa}`,
    '',
    `Aprovar ou negar: ${urlSolicitacao(s.id)}`,
    `— ${s.consultor_nome}`,
  ];
  return linhas.join('\n');
}

/** Mensagem do aprovador para o solicitante, com o status. */
export function textoResposta(s) {
  const aprovada = s.status === 'aprovada';
  return [
    aprovada ? '*GAV · Autorização APROVADA ✅*' : '*GAV · Autorização NEGADA ❌*',
    `Olá, ${primeiroNome(s.consultor_nome)}! Sua solicitação foi respondida.`,
    '',
    `*Código:* ${s.codigo}`,
    ...dadosCliente(s).map(([k, v]) => `*${k}:* ${v}`),
    `*Tipo:* ${s.tipo_nome}`,
    `*Status:* ${aprovada ? 'Aprovada' : 'Negada'} por ${s.aprovador_nome} em ${dataHora(s.respondido_em)}`,
    `*Comentário:* ${s.resposta}`,
    '',
    aprovada ? 'Pode seguir para o contrato com o assistente.' : 'A venda só pode seguir dentro da regra.',
    `Detalhes: ${urlSolicitacao(s.id)}`,
  ].join('\n');
}

/** Botão verde do WhatsApp (ou aviso de número ausente). */
export function botaoWhats(contato, texto, rotulo) {
  if (!contato.whatsapp) {
    return html`<div class="contato-sem-whats"><strong>${contato.nome}</strong>${contato.perfil ? ` · ${PERFIS[contato.perfil]}` : ''}
      <small>Sem celular cadastrado. Peça para atualizar em "Meu perfil".</small></div>`;
  }
  return html`<a class="btn btn-whats btn-bloco" href="${linkWa(contato.whatsapp, texto)}" target="_blank" rel="noopener">
    ${ICONE_WHATS} ${rotulo || `Avisar ${primeiroNome(contato.nome)}`}${contato.perfil ? html` <small>· ${PERFIS[contato.perfil]}</small>` : ''}</a>`;
}

/** Modal com um botão de WhatsApp por contato. */
export function modalWhats({ titulo, descricao, contatos, texto }) {
  return modal({
    titulo,
    corpo: html`<div class="modal-whats">
      <div class="whats-selo">${ICONE_WHATS}</div>
      <p style="margin:0 0 16px;text-align:center">${descricao}</p>
      <div style="display:flex;flex-direction:column;gap:10px">${contatos.length
        ? contatos.map(c => botaoWhats(c, texto(c)))
        : html`<div class="aviso aviso-ambar">Nenhum aprovador cadastrado para esta sala. Avise o master.</div>`}</div>
      <p class="secundario" style="font-size:12px;text-align:center;margin:14px 0 0">O WhatsApp abre com a mensagem pronta. É só tocar em <strong>Enviar</strong>.</p>
    </div>`,
    rodape: html`<button class="btn btn-claro" data-fechar>Agora não</button>`,
  });
}
