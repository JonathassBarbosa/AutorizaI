/**
 * Marcas animadas GAV:
 * - Logotipo: abertura do app (desenho do traço → preenchimento → "Hotéis e Resorts").
 * - Rosa dos ventos: login e processamento de solicitações (pétalas se abrem como um leque e giram).
 */
import { LOGO, ROSA } from './marcas-dados.js';
import { raw, esc } from './core.js';

/** Logotipo GAV em SVG. `animado` desenha o traço antes de preencher. */
export function logoSvg({ classe = '', animado = false, titulo = 'GAV' } = {}) {
  return raw(`<svg class="marca-logo ${animado ? 'animado' : ''} ${classe}" viewBox="-6 -6 ${LOGO.w + 12} ${LOGO.h + 12}" role="img" aria-label="${esc(titulo)}">
    ${LOGO.partes.map((d, i) => `<path d="${d}" pathLength="1" style="--i:${i}"/>`).join('')}</svg>`);
}

/** Rosa dos ventos em SVG. modo: 'parada' | 'abrir' (abre uma vez) | 'girando' (abre e fica girando). */
export function rosaSvg({ classe = '', modo = 'parada' } = {}) {
  return raw(`<svg class="marca-rosa rosa-${modo} ${classe}" viewBox="0 0 ${ROSA.w} ${ROSA.h}" role="img" aria-label="Rosa dos ventos GAV">
    <g class="rosa-giro">${ROSA.petalas.map((d, i) => `<path d="${d}" style="--i:${i}"/>`).join('')}</g></svg>`);
}

/** Logotipo completo com a assinatura "Hotéis e Resorts". */
export function assinatura({ classe = '', animado = false } = {}) {
  return raw(`<span class="assinatura ${animado ? 'animado' : ''} ${classe}">${logoSvg({ animado })}<span class="assinatura-texto">Hotéis e Resorts</span></span>`);
}

const reduzMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- Abertura do app
let aberturaMostrada = false;

/** Mostra a abertura animada com o logotipo. Resolve quando ela some. */
export function abertura(tempoMinimo = 2300) {
  if (aberturaMostrada) return Promise.resolve();
  aberturaMostrada = true;
  const el = document.createElement('div');
  el.className = 'abertura';
  el.innerHTML = `${assinatura({ animado: true }).toString()}<i class="abertura-onda"></i>`;
  document.body.appendChild(el);
  const duracao = reduzMovimento() ? 400 : tempoMinimo;
  return new Promise(resolve => {
    setTimeout(() => {
      el.classList.add('saindo');
      setTimeout(() => { el.remove(); resolve(); }, 550);
    }, duracao);
  });
}

// ---------------------------------------------------------------- Processamento
let camada = null;
let pedidos = 0;

/** Cobre a tela com a rosa dos ventos girando enquanto a promessa roda. */
export async function processando(mensagem, fn) {
  pedidos++;
  if (!camada) {
    camada = document.createElement('div');
    camada.className = 'processando';
    camada.innerHTML = `<div class="processando-caixa">${rosaSvg({ modo: 'girando' }).toString()}<p></p></div>`;
    document.body.appendChild(camada);
    requestAnimationFrame(() => camada?.classList.add('visivel'));
  }
  camada.querySelector('p').textContent = mensagem;
  const inicio = Date.now();
  try {
    return await fn();
  } finally {
    // tempo mínimo para a rosa terminar de abrir e o movimento ser percebido
    const falta = Math.max(0, 900 - (Date.now() - inicio));
    await new Promise(r => setTimeout(r, reduzMovimento() ? 0 : falta));
    if (--pedidos === 0 && camada) {
      const c = camada;
      camada = null;
      c.classList.remove('visivel');
      setTimeout(() => c.remove(), 300);
    }
  }
}
