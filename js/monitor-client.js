/**
 * Captura erros do navegador (arquivo, função, linha e coluna) e envia ao
 * monitor do master. Carregado antes de tudo, como script comum.
 */
(function () {
  var fila = [];
  var enviando = false;
  var minuto = 0;
  var noMinuto = 0;

  function quadro(stack) {
    var linhas = String(stack || '').split('\n');
    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i].trim();
      // Chrome: "at funcao (https://.../app.js:10:5)" | Safari/Firefox: "funcao@https://.../app.js:10:5"
      var m = l.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/) || l.match(/^(.*?)@(.+?):(\d+):(\d+)$/);
      if (m && !/onesignal|extension:|<anonymous>/i.test(m[2])) {
        return { funcao: (m[1] || '').replace(/^async\s+/, '').replace(/^(Module|Object)\./, ''), arquivo: m[2], linha: m[3], coluna: m[4] };
      }
    }
    return {};
  }

  function usuario() {
    try {
      var s = JSON.parse(localStorage.getItem('gav_sessao'));
      return s && s.usuario ? s.usuario.nome + ' (' + s.usuario.perfil + ')' : '-';
    } catch (e) { return '-'; }
  }

  function registrar(info) {
    var agora = Math.floor(Date.now() / 60000);
    if (agora !== minuto) { minuto = agora; noMinuto = 0; }
    if (++noMinuto > 15) return;
    var q = quadro(info.stack);
    fila.push({
      tipo: info.tipo || 'js',
      mensagem: String(info.mensagem || 'Erro desconhecido').slice(0, 500),
      arquivo: info.arquivo || q.arquivo || '',
      linha: info.linha || q.linha || '',
      coluna: info.coluna || q.coluna || '',
      funcao: q.funcao || '',
      stack: String(info.stack || '').slice(0, 3000),
      rota: info.rota || location.hash || '#/',
      url: location.href,
      navegador: navigator.userAgent,
      usuario: usuario(),
    });
    enviar();
  }

  function enviar() {
    var cfg = window.GAV_CONFIG || {};
    if (enviando || !fila.length || !cfg.API_URL || /COLE_AQUI/.test(cfg.API_URL)) return;
    enviando = true;
    var item = fila.shift();
    fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'monitor.erroFront', data: item }),
    }).then(function () {
      enviando = false;
      enviar();
    }).catch(function () {
      fila.unshift(item); // sem internet: tenta de novo em 20 s
      setTimeout(function () { enviando = false; enviar(); }, 20000);
    });
  }

  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {
      var url = t.src || t.href;
      if (!/onesignal|fonts\.g/i.test(url)) registrar({ tipo: 'recurso', mensagem: 'Falha ao carregar ' + url, arquivo: url });
      return;
    }
    registrar({ tipo: 'js', mensagem: e.message, arquivo: e.filename, linha: e.lineno, coluna: e.colno, stack: e.error && e.error.stack });
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    if (r.name === 'ApiErro') return; // erros da API já são registrados pelo backend
    registrar({ tipo: 'promise', mensagem: r.message || String(r), stack: r.stack });
  });

  window.GAVMonitor = { registrar: registrar };
})();
