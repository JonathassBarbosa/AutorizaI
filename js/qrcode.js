/**
 * Leitura do QR code da ficha de atendimento para capturar o ID Casal.
 * O QR traz um JSON como {"tse_id":1234567,"stage":"..."}; o tse_id é o ID Casal.
 * Usa o leitor nativo do navegador (BarcodeDetector) quando existe e o jsQR nos demais (iPhone).
 */
import { html, icone, modal } from './core.js';

/** Extrai o ID Casal do texto lido no QR code. */
export function extrairIdCasal(texto) {
  const t = String(texto || '').trim();
  try {
    const j = JSON.parse(t);
    const v = j && (j.tse_id ?? j.id_casal ?? j.idCasal ?? j.id);
    if (/^\d{3,12}$/.test(String(v))) return String(v);
  } catch (e) { /* não é JSON */ }
  const m = t.match(/(?:tse_id|id_?casal)\D{0,5}(\d{3,12})/i) || t.match(/^(\d{3,12})$/);
  return m ? m[1] : '';
}

let carregandoJsQR = null;
function jsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  carregandoJsQR = carregandoJsQR || new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = () => ok(window.jsQR);
    s.onerror = () => { carregandoJsQR = null; erro(new Error('Não foi possível carregar o leitor de QR code.')); };
    document.head.appendChild(s);
  });
  return carregandoJsQR;
}

const detectorNativo = async () => {
  try {
    if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
      return new BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (e) { /* segue com o jsQR */ }
  return null;
};

/** Lê um QR code de uma imagem/vídeo desenhado no canvas. */
async function decodificar(fonte, canvas, nativo) {
  if (nativo) {
    const r = await nativo.detect(fonte).catch(() => []);
    return r[0]?.rawValue || '';
  }
  const w = fonte.videoWidth || fonte.naturalWidth || fonte.width;
  const h = fonte.videoHeight || fonte.naturalHeight || fonte.height;
  if (!w || !h) return '';
  const escala = Math.min(1, 1000 / Math.max(w, h));
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = (await jsQR())(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return r?.data || '';
}

/** Abre a câmera e devolve o ID Casal lido (ou null se a pessoa fechar). */
export function lerIdCasal() {
  return new Promise(resolve => {
    let stream = null;
    let ativo = true;
    let resultado = null;
    const m = modal({
      titulo: 'Ler QR code da ficha',
      corpo: html`<div class="leitor-qr">
        <div class="leitor-video"><video playsinline muted></video><span class="leitor-mira"></span></div>
        <p class="secundario" id="qr-status" style="text-align:center;margin:12px 0 0">Aponte a câmera para o QR code no canto da ficha de atendimento.</p>
        <label class="btn btn-claro btn-bloco" style="margin-top:12px">${icone('qr')} Usar uma foto da ficha
          <input type="file" accept="image/*" capture="environment" hidden></label>
      </div>`,
      rodape: html`<button class="btn btn-claro" data-fechar>Cancelar</button>`,
      aoFechar: () => { ativo = false; stream?.getTracks().forEach(t => t.stop()); resolve(resultado); },
    });
    const video = m.el.querySelector('video');
    const status = m.el.querySelector('#qr-status');
    const canvas = document.createElement('canvas');
    const aviso = (txt, erro) => { status.textContent = txt; status.style.color = erro ? 'var(--red)' : ''; };

    const conferir = texto => {
      if (!texto) return false;
      const id = extrairIdCasal(texto);
      if (!id) { aviso('Este QR code não é de uma ficha de atendimento. Tente de novo.', true); return false; }
      resultado = id;
      m.fechar();
      return true;
    };

    detectorNativo().then(async nativo => {
      if (!nativo) jsQR().catch(e => aviso(e.message, true)); // já começa a baixar o leitor
      m.el.querySelector('input[type=file]').addEventListener('change', async ev => {
        const arq = ev.target.files[0];
        if (!arq) return;
        aviso('Lendo a foto…');
        const img = new Image();
        img.src = URL.createObjectURL(arq);
        await img.decode().catch(() => {});
        const texto = await decodificar(img, canvas, nativo).catch(() => '');
        URL.revokeObjectURL(img.src);
        if (!conferir(texto) && !texto) aviso('Não encontrei um QR code na foto. Tire outra, mais perto e com boa luz.', true);
      });

      if (!navigator.mediaDevices?.getUserMedia) return aviso('Este navegador não abre a câmera aqui. Use uma foto da ficha.', true);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        return aviso('Sem acesso à câmera. Libere a permissão no navegador ou use uma foto da ficha.', true);
      }
      if (!ativo) return stream.getTracks().forEach(t => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => {});
      const ciclo = async () => {
        if (!ativo) return;
        if (video.readyState >= 2 && conferir(await decodificar(video, canvas, nativo).catch(() => ''))) return;
        setTimeout(ciclo, 250);
      };
      ciclo();
    });
  });
}
