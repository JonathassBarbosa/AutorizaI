/**
 * Simulação mínima dos serviços do Google Apps Script usados pelo Code.gs,
 * para testar o sistema no computador sem publicar nada.
 * Os dados ficam em dev/dados-dev.json.
 */
const crypto = require('crypto');

function bytesAssinados(buf) {
  return Array.from(buf).map(b => (b > 127 ? b - 256 : b));
}

function criarServicos(estado) {
  // ---------------- Planilha ----------------
  class Range {
    constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
    getValues() {
      const out = [];
      for (let r = 0; r < this.nr; r++) {
        const linha = this.sheet.rows[this.row - 1 + r] || [];
        const o = [];
        for (let c = 0; c < this.nc; c++) { const v = linha[this.col - 1 + c]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    setValues(vals) {
      vals.forEach((linha, r) => {
        const idx = this.row - 1 + r;
        while (this.sheet.rows.length <= idx) this.sheet.rows.push([]);
        linha.forEach((v, c) => { this.sheet.rows[idx][this.col - 1 + c] = v; });
      });
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
  }
  class Sheet {
    constructor(nome, rows) { this.nome = nome; this.rows = rows; }
    getName() { return this.nome; }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return Math.max(1000, this.rows.length); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    getDataRange() { return new Range(this, 1, 1, this.rows.length, Math.max(0, ...this.rows.map(l => l.length))); }
    appendRow(linha) { this.rows.push(linha.slice()); return this; }
    deleteRows(inicio, n) { this.rows.splice(inicio - 1, n); }
    setFrozenRows() { return this; }
  }
  const sheets = {};
  Object.keys(estado.abas).forEach(n => { sheets[n] = new Sheet(n, estado.abas[n]); });
  const spreadsheet = {
    getId: () => 'planilha-dev',
    getName: () => 'GAV Autorizações (dev)',
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => { estado.abas[n] = []; sheets[n] = new Sheet(n, estado.abas[n]); return sheets[n]; },
    getSheets: () => Object.values(sheets),
    deleteSheet: sh => { delete sheets[sh.nome]; delete estado.abas[sh.nome]; },
  };

  // ---------------- Cache / Propriedades / Trava ----------------
  const cache = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get: k => { const v = cache.get(k); if (!v || v.exp < Date.now()) return null; return v.val; },
      put: (k, val, seg) => cache.set(k, { val: String(val), exp: Date.now() + (seg || 600) * 1000 }),
      remove: k => cache.delete(k),
    }),
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (k in estado.props ? estado.props[k] : null),
      setProperty: (k, v) => { estado.props[k] = String(v); },
    }),
  };
  const LockService = {
    getScriptLock: () => ({ tryLock: () => true, waitLock: () => true, releaseLock: () => {} }),
  };

  // ---------------- Utilities ----------------
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, txt) => bytesAssinados(crypto.createHash(alg).update(String(txt), 'utf8').digest()),
    computeHmacSha256Signature: (valor, chave) =>
      bytesAssinados(crypto.createHmac('sha256', String(chave)).update(String(valor), 'utf8').digest()),
    formatDate: (data, tz, fmt) => {
      const p = {};
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(data).forEach(x => { p[x.type] = x.value; });
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
        .replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute).replace('ss', p.second);
    },
  };

  // ---------------- Saída HTTP / externos ----------------
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: s => ({ conteudo: s, setMimeType() { return this; }, getContent() { return this.conteudo; } }),
  };
  const UrlFetchApp = {
    fetch: (url, op) => {
      console.log('[push simulado]', url, op && op.payload ? JSON.parse(op.payload).headings.pt : '');
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    },
  };
  const ScriptApp = {
    getProjectTriggers: () => [],
    deleteTrigger: () => {},
    newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, create: () => t }; return t; },
  };
  const DriveApp = {
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: () => ({ getFiles: () => ({ hasNext: () => false }) }),
    getFileById: () => ({ makeCopy: () => ({}) }),
  };

  return {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet },
    CacheService, PropertiesService, LockService, Utilities, ContentService, UrlFetchApp, ScriptApp, DriveApp,
    Logger: { log: (...a) => console.log('[Logger]', ...a) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo', getEffectiveUser: () => ({ getEmail: () => 'master@gav.dev' }) },
    MailApp: {
      sendEmail: msg => {
        (estado.emails = estado.emails || []).push({ to: msg.to, subject: msg.subject, data: new Date().toISOString() });
        console.log('[e-mail simulado] para ' + msg.to + ': ' + msg.subject);
      },
    },
  };
}

module.exports = { criarServicos };
