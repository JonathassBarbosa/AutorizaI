/* Service worker: deixa o app instalável, abre rápido e recebe push (OneSignal). */
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) {
  // Sem internet na instalação: o push volta a funcionar na próxima atualização.
}

const CACHE = 'gav-autorizacoes-v5';
const ARQUIVOS = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/core.js', 'js/app.js', 'js/marcas.js', 'js/marcas-dados.js', 'js/whatsapp.js', 'js/qrcode.js', 'js/push.js', 'js/monitor-client.js',
  'js/views/login.js', 'js/views/cadastro.js', 'js/views/recuperar.js', 'js/views/trocar-senha.js', 'js/views/inicio.js', 'js/views/solicitacoes.js',
  'js/views/detalhe.js', 'js/views/nova.js', 'js/views/verificar.js', 'js/views/estrutura.js',
  'js/views/usuarios.js', 'js/views/tipos.js', 'js/views/monitor.js', 'js/views/perfil.js',
  'img/icon-192.png', 'img/icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ARQUIVOS.map(a => c.add(a)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n.startsWith('gav-') && n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (sempre a versão mais nova); cache só quando estiver sem internet.
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return resp;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))),
  );
});
