/**
 * Servidor de desenvolvimento: serve o site (raiz do repositório) e executa o Code.gs
 * real com serviços simulados do Google. Uso:
 *
 *   node dev/server.js            → http://localhost:8080
 *   node dev/server.js --reset    → apaga os dados de teste e recomeça
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { criarServicos } = require('./gas-mock');

const PORTA = Number(process.env.PORT || 8080);
const RAIZ = path.join(__dirname, '..'); // o site fica na raiz do repositório
const ARQ_DADOS = path.join(__dirname, 'dados-dev.json');
const ARQ_GS = path.join(__dirname, '..', 'apps-script', 'Code.gs');

if (process.argv.includes('--reset') && fs.existsSync(ARQ_DADOS)) fs.unlinkSync(ARQ_DADOS);

const novoDoZero = !fs.existsSync(ARQ_DADOS);
const estado = novoDoZero ? { abas: {}, props: {} } : JSON.parse(fs.readFileSync(ARQ_DADOS, 'utf8'));
const contexto = vm.createContext(Object.assign({ console }, criarServicos(estado)));

function carregarCodigo() {
  let codigo = fs.readFileSync(ARQ_GS, 'utf8');
  if (novoDoZero || /seu-email/.test(codigo)) codigo = codigo.replace("'seu-email@gmail.com'", "'master@gav.dev'");
  vm.runInContext(codigo, contexto, { filename: 'Code.gs' });
}
carregarCodigo();

function salvar() { fs.writeFileSync(ARQ_DADOS, JSON.stringify(estado)); }

if (novoDoZero) {
  const msg = contexto.setup();
  salvar();
  console.log('\n' + msg + '\n');
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' && req.method === 'POST') {
    let corpo = '';
    req.on('data', c => { corpo += c; });
    req.on('end', () => {
      const saida = contexto.doPost({ postData: { contents: corpo } });
      salvar();
      setTimeout(() => { // simula a latência do Apps Script
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(saida.getContent());
      }, 120);
    });
    return;
  }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end("window.GAV_CONFIG = { API_URL: '/api' };");
    return;
  }
  let arquivo = path.join(RAIZ, decodeURIComponent(url.pathname));
  if (!arquivo.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(arquivo) && fs.statSync(arquivo).isDirectory()) arquivo = path.join(arquivo, 'index.html');
  fs.readFile(arquivo, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORTA, () => console.log('GAV Autorizações (dev) em http://localhost:' + PORTA));
