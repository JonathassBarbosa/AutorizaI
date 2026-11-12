/**
 * Regras de comercialização — motor de alçada automática.
 *
 * O MESMO arquivo roda em dois lugares:
 *  - no app (index.html carrega como <script>, antes do app.js), para o consultor ver na hora quem aprova;
 *  - no Apps Script (crie um arquivo "RegrasPagamento" no editor e cole este conteúdo), para o servidor
 *    refazer as contas sem confiar no navegador.
 * Por isso: sem import/export, sem "?." e sem "??", e sem Intl (o Apps Script não garante o pt-BR).
 *
 * Base: política PO.02.01.001 (Regras de Comercialização, rev. 26/03/2025), calculadora de pagamentos
 * e as definições do comercial registradas no protótipo de alçada automática (nov/2026).
 */
var RegrasPagamento = (function () {
  'use strict';

  var NIVEIS = ['gerente', 'regional', 'superintendente', 'diretor'];
  var NIVEL = { gerente: 1, regional: 2, superintendente: 3, diretor: 4 };
  var ROTULO_ALCADA = { gerente: 'Gerente de Sala', regional: 'Regional', superintendente: 'Superintendente', diretor: 'Diretoria' };
  var ACOES = ['gerente', 'regional', 'superintendente', 'diretor', 'ciencia', 'bloquear', 'desligada'];
  var ROTULO_ACAO = {
    gerente: 'Gerente de Sala', regional: 'Regional', superintendente: 'Superintendente', diretor: 'Diretoria',
    ciencia: 'Só aceite do cliente', bloquear: 'Bloqueia o envio', desligada: 'Desligada',
  };

  var PADRAO = {
    params: { diasReg: 150, diasDir: 210, p1Cons: 1330, p1Ger: 1000, restMin: 265, base: 3990, baseGran: 4490, tol: true, sobeSala: true, pctSinal: 5 },
    acoes: {
      sinal_reg: 'regional', sinal_dir: 'diretor', p1_gerente: 'gerente', p1_abaixo: 'bloquear', duas_formas: 'bloquear',
      rest_gerente: 'gerente', rest_acima: 'diretor', rest_minima: 'diretor', cred_6x: 'regional', cred_acima: 'diretor',
      salto: 'diretor', conflito: 'ciencia', choque_saldo: 'ciencia', sinal_salto: 'diretor', choque_rest: 'ciencia',
      venc_saldo: 'bloquear', forma_1a: 'bloquear', linear_2formas: 'bloquear', entrada_excede: 'bloquear',
      restante_antes: 'bloquear', saldo_negativo: 'bloquear', faixa_sinal: 'diretor', faixa_saldo: 'diretor',
      avista_parc: 'diretor', desc_ger: 'gerente', desc_dir: 'diretor', linear_prazo: 'diretor', linear_igual: 'diretor',
    },
  };

  // base: seção da política, 'calc' (calculadora) ou 'comercial' (definido pelo comercial)
  var META = [
    { id: 'sinal_reg', nome: 'Sinal após o prazo padrão', base: '7.1.3', obs: 'Regional ou Superintendente (o Gerente Nacional da política).', quando: function (p) { return 'Entre ' + (p.diasReg + 1) + ' e ' + p.diasDir + ' dias após a venda'; } },
    { id: 'sinal_dir', nome: 'Sinal após o prazo do Regional', base: 'comercial', quando: function (p) { return 'Mais de ' + p.diasDir + ' dias após a venda'; } },
    { id: 'p1_gerente', nome: '1ª parcela abaixo do mínimo do consultor', base: '7.1.2', quando: function (p) { return 'De ' + reais(p.p1Ger) + ' a ' + reais(p.p1Cons - 0.01) + ' por cota (metade no Combo)'; } },
    { id: 'p1_abaixo', nome: '1ª parcela abaixo do mínimo do gerente', base: 'comercial', obs: 'Só é permitida no modelo Linear.', quando: function (p) { return 'Menos de ' + reais(p.p1Ger) + ' por cota (metade no Combo)'; } },
    { id: 'duas_formas', nome: '1ª parcela em duas formas sem fechar o mínimo', base: '7.1.3', obs: 'Proibido: nem a Diretoria aprova.', quando: function (p) { return 'As duas formas não somam ' + reais(p.p1Ger) + ' por cota em até 30 dias'; } },
    { id: 'rest_gerente', nome: 'Restante além da alçada do consultor', base: '7.1.2', quando: function () { return '3 a 5 parcelas, ou terminando depois do 2º mês após a venda (3º com crédito à vista; +1 mês em vendas a partir do dia 20)'; } },
    { id: 'rest_acima', nome: 'Restante além da alçada do gerente', base: 'comercial', quando: function () { return 'Mais de 5 parcelas, ou terminando depois do 5º mês após a venda (6º com crédito à vista; +1 mês em vendas a partir do dia 20)'; } },
    { id: 'rest_minima', nome: 'Parcela da restante abaixo do mínimo', base: '7.1.4', quando: function (p) { return 'Menos de ' + reais(p.restMin) + ' por cota'; } },
    { id: 'cred_6x', nome: 'Entrada inteira no crédito em 6x', base: '7.1.3', quando: function () { return 'Consultor vai até 5x; Regional até 6x'; } },
    { id: 'cred_acima', nome: 'Entrada inteira no crédito acima de 6x', base: 'comercial', quando: function () { return 'Mais de 6 parcelas no cartão'; } },
    { id: 'salto', nome: 'Mês sem pagamento entre as entradas', base: 'calc', quando: function () { return 'Restante não começa no mês seguinte à venda (vendas a partir do dia 20 podem pular um mês)'; } },
    { id: 'sinal_salto', nome: 'Sinal não subsequente à entrada', base: 'comercial', quando: function () { return 'Mês vazio entre a última parcela da entrada e o sinal (entrada paga inteira em venda a partir do dia 20 pode pular um mês)'; } },
    { id: 'conflito', nome: 'Choque: sinal sobre a entrada', base: 'comercial', obs: 'Não precisa de autorização; pede o aceite do cliente.', quando: function () { return 'Sinal no dia ou antes da última parcela da entrada, inclusive parcelas no cartão'; } },
    { id: 'choque_saldo', nome: 'Choque: saldo sobre o sinal', base: 'comercial', obs: 'Não precisa de autorização; pede o aceite do cliente.', quando: function () { return 'Saldo no dia ou antes da última parcela do sinal'; } },
    { id: 'choque_rest', nome: 'Choque: restante no mês da 1ª parcela', base: 'comercial', obs: 'Não precisa de autorização; pede o aceite do cliente.', quando: function () { return '1º vencimento da restante no mesmo mês da 1ª parcela'; } },
    { id: 'venc_saldo', nome: 'Saldo fora do dia 05 ou 10', base: 'comercial', obs: 'A política ainda fala em 05 e 15; sinal e saldo vencem dia 05 ou 10.', quando: function () { return 'Data do saldo definida à mão em outro dia (exceto à vista)'; } },
    { id: 'forma_1a', nome: '1ª parcela em boleto', base: '7.1 / 8.1', quando: function () { return '1ª parcela só em dinheiro, débito, PIX, TED ou crédito à vista'; } },
    { id: 'linear_2formas', nome: 'Linear com entrada em duas formas', base: '8.1', quando: function () { return 'O modelo Linear não aceita a entrada dividida em formas'; } },
    { id: 'entrada_excede', nome: 'Pagamentos passam do total da entrada', base: 'calc', quando: function () { return 'Entrada restante ficaria negativa'; } },
    { id: 'restante_antes', nome: 'Restante antes da data da venda', base: 'calc', quando: function () { return '1º vencimento anterior à venda'; } },
    { id: 'saldo_negativo', nome: 'Valor da cota não cobre entrada e sinal', base: 'calc', quando: function () { return 'Saldo ficaria negativo'; } },
    { id: 'faixa_sinal', nome: 'Sinal acima do máximo do modelo', base: 'comercial', quando: function () { return 'Mais de 6 parcelas (menos parcelas pode)'; } },
    { id: 'faixa_saldo', nome: 'Saldo acima do máximo do modelo', base: 'comercial', quando: function () { return 'Padrão e Combo 124x; Anual 8x; Semestral 12x; Até 36x sem sobra para o saldo (menos parcelas pode)'; } },
    { id: 'avista_parc', nome: 'À vista com parcelamento', base: 'comercial', quando: function () { return 'Entrada, sinal ou saldo em mais de 1x'; } },
    { id: 'desc_ger', nome: 'Desconto à vista acima de 7%', base: 'comercial', quando: function () { return 'Acima de 7% e até 10%'; } },
    { id: 'desc_dir', nome: 'Desconto à vista acima de 10%', base: 'comercial', quando: function () { return 'Mais de 10%'; } },
    { id: 'linear_prazo', nome: 'Linear acima do prazo', base: 'comercial', quando: function () { return 'Prazo total acima de 120x (menos parcelas pode)'; } },
    { id: 'linear_igual', nome: 'Linear com parcelas diferentes', base: 'comercial', quando: function () { return 'Entrada, sinal e saldo com valores de parcela diferentes'; } },
  ];
  var META_POR_ID = {};
  META.forEach(function (m) { META_POR_ID[m.id] = m; });

  var MODELOS = { padrao: 'Padrão', combo: 'Padrão (Combo)', ate36: 'Até 36x', anual: 'Anual', semestral: 'Semestral', avista: 'À vista', linear: 'Linear' };
  var FAIXA_SALDO = { padrao: [68, 124], combo: [68, 124], anual: [6, 8], semestral: [12, 12] };
  var FAIXA_TXT = {
    padrao: 'Até 124x, mensal', combo: 'Até 124x, mensal', anual: 'Até 8x, a cada 12 meses a partir da venda',
    semestral: 'Até 12x, a cada 6 meses a partir da venda', ate36: '36x menos as parcelas de entrada e sinal',
    avista: '1x, em data negociada', linear: 'Prazo total até 120x, parcelas iguais',
  };
  var FORMAS = [['PIX', 'PIX'], ['Dinheiro', 'Dinheiro'], ['CartaoDebito', 'Cartão de Débito'], ['TED', 'TED'], ['CartaoCredito', 'Cartão de Crédito'], ['Boleto', 'Boleto']];
  var FORMA_ROT = {};
  FORMAS.forEach(function (f) { FORMA_ROT[f[0]] = f[1]; });
  var EMPREENDIMENTOS = ['AREYA BARRA RESORT', 'GRAN GARDEN RESORT', 'GRAN VALLEY RESORT', 'JERIQUIÁ LAGOA RESORT', 'MARAGOGI RESORT',
    'PIPA ISLAND RESORT', 'PORTO 2 LIFE RESORT', 'PORTO ALTO RESORT', 'PYRENÉUS RESIDENCE', 'SALINAS BEACH RESORT',
    'SALINAS EXCLUSIVE RESORT', 'SALINAS PARK RESORT', 'SALINAS PREMIUM RESORT'];
  var EMP_GRAN = ['GRAN GARDEN RESORT', 'GRAN VALLEY RESORT'];
  var MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Sinal e saldo vencem obrigatoriamente dia 05 ou 10; a entrada restante, de preferência.
  var VENC_SINAL = [5, 10];
  var VENC_REST = [5, 10];

  // ------------------------------------------------------------- utilidades
  function num(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
  function int(v, min) { if (min === undefined) min = 1; return Math.max(min, parseInt(v, 10) || min); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function reais(v) {
    var neg = v < 0; var c = Math.round(Math.abs(v || 0) * 100);
    var inteiro = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '− ' : '') + 'R$ ' + inteiro + ',' + pad(c % 100);
  }
  function pct(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  function fmtData(d) { return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : '—'; }
  function isoData(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function lerData(v) {
    if (!v) return null;
    var p = String(v).slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || !p[0]) return null;
    var r = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(r.getTime()) ? null : r;
  }
  function addMeses(data, k, dia) {
    var y = data.getFullYear(), m = data.getMonth() + k;
    var ult = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(dia === undefined ? data.getDate() : dia, ult));
  }
  function addDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function proxVenc(d, venc) {
    for (var i = 0; i < venc.length; i++) if (d.getDate() <= venc[i]) return new Date(d.getFullYear(), d.getMonth(), venc[i]);
    return new Date(d.getFullYear(), d.getMonth() + 1, venc[0]);
  }
  function diasEntre(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  }
  function chaveMes(d) { return d.getFullYear() * 12 + d.getMonth(); }
  function rotMes(k) { return MES_CURTO[k % 12] + '/' + Math.floor(k / 12); }
  /** Divide em centavos; a diferença de arredondamento fica na última parcela. */
  function dividir(total, n) {
    var c = Math.round((total || 0) * 100); n = Math.max(1, n | 0);
    var b = Math.trunc(c / n); var a = [];
    for (var i = 0; i < n; i++) a.push(b);
    a[n - 1] = c - b * (n - 1);
    return a.map(function (x) { return x / 100; });
  }
  /** Datas da 1ª parcela pela forma de pagamento (regra da calculadora). */
  function datasEntrada(venda, n, forma) {
    var out = [];
    for (var i = 0; i < n; i++) {
      if (forma === 'CartaoDebito') out.push(addDias(venda, 1));
      else if (forma === 'CartaoCredito' || forma === 'Boleto') out.push(addMeses(venda, i + 1, venda.getDate()));
      else out.push(new Date(venda.getTime()));
    }
    return out;
  }
  function regraData(forma) {
    return {
      PIX: 'PIX: no dia da venda', Dinheiro: 'Dinheiro: no dia da venda', TED: 'TED: no dia da venda',
      CartaoDebito: 'Débito: no dia seguinte à venda',
      CartaoCredito: 'Crédito: mesmo dia da venda, a partir do mês seguinte',
      Boleto: 'Boleto: mesmo dia da venda, a partir do mês seguinte',
    }[forma] || '';
  }

  // ------------------------------------------------------------- configuração
  function config(salva) {
    var c = { params: {}, acoes: {} };
    var s = salva || {};
    Object.keys(PADRAO.params).forEach(function (k) { c.params[k] = PADRAO.params[k]; });
    Object.keys(PADRAO.acoes).forEach(function (k) { c.acoes[k] = PADRAO.acoes[k]; });
    Object.keys(s.params || {}).forEach(function (k) { if (k in c.params) c.params[k] = s.params[k]; });
    Object.keys(s.acoes || {}).forEach(function (k) { if (k in c.acoes && ACOES.indexOf(s.acoes[k]) >= 0) c.acoes[k] = s.acoes[k]; });
    return c;
  }
  function baseCota(emp, cfg) { return EMP_GRAN.indexOf(emp) >= 0 ? cfg.params.baseGran : cfg.params.base; }
  function entradaModelo(emp, modelo, cfg) { return modelo === 'combo' ? Math.round(baseCota(emp, cfg) * 50) / 100 : baseCota(emp, cfg); }
  /** Parcelas da entrada: 1ª parcela (mesmo em duas formas conta como uma) + restante; ou o cartão inteiro. */
  function parcelasEntrada(raw) {
    var e1Parc = int(raw.e1Parc);
    if (raw.e1Forma === 'CartaoCredito' && e1Parc > 1) return e1Parc;
    return 1 + (bool(raw.temR) ? int(raw.rParc) : 0);
  }
  function bool(v) { return v === true || v === 'true'; }

  /**
   * Monta a cota a partir do que o consultor preencheu. Os valores fixos (entrada da tabela, sinal de 5%,
   * saldo e parcelas automáticas) são SEMPRE recalculados aqui, nunca lidos do navegador.
   */
  function cotaDe(raw, neg, cfg) {
    var modelo = MODELOS[neg.modelo] ? neg.modelo : 'padrao';
    var p = cfg.params;
    var valorCota = num(raw.valorCota);
    var valorEntrada = modelo === 'linear' ? num(raw.valorEntrada) : entradaModelo(raw.emp, modelo, cfg);
    var desc = modelo === 'avista' ? num(raw.desc) : 0;
    var sValor = num(raw.sValor), sdValor = num(raw.sdValor);
    if (modelo !== 'linear') {
      var liquido = Math.round(valorCota * (100 - desc)) / 100;
      sValor = valorCota > 0 ? Math.round(liquido * p.pctSinal) / 100 : 0;
      sdValor = valorCota > 0 ? liquido - valorEntrada - sValor : 0;
    }
    var nE = parcelasEntrada(raw);
    var sdFix = modelo === 'avista' ? 1 : modelo === 'ate36' ? Math.max(1, 36 - nE - int(raw.sParc)) : null;
    return {
      modelo: modelo, emp: String(raw.emp || ''), cotas: 1, venda: lerData(neg.venda),
      valorCota: valorCota, valorEntrada: valorEntrada, desc: desc, sValor: sValor, sdValor: sdValor,
      e1Valor: num(raw.e1Valor), e1Forma: raw.e1Forma || 'PIX', e1Parc: int(raw.e1Parc),
      temE2: bool(raw.temE2), e2Valor: num(raw.e2Valor), e2Forma: raw.e2Forma || 'PIX', e2Parc: int(raw.e2Parc),
      temR: bool(raw.temR), rForma: raw.rForma || 'Boleto', rData: lerData(raw.rData), rParc: int(raw.rParc),
      sDia: int(raw.sDia), sMes: parseInt(raw.sMes, 10) || 0, sAno: int(raw.sAno, 2000), sParc: int(raw.sParc),
      sdParc: sdFix === null ? int(raw.sdParc) : sdFix, sdManual: bool(raw.sdManual), sdData: lerData(raw.sdData),
      sForma: raw.sForma || 'Boleto', sdForma: raw.sdForma || 'Boleto',
    };
  }

  // ------------------------------------------------------------- avaliação de uma cota
  function avaliarCota(f, cfg) {
    var p = cfg.params, a = cfg.acoes;
    var r = { gatilhos: [], bloqueios: [], ciencia: [], cronograma: [], saltos: [], dias: null };
    if (!f.venda) { r.incompleto = 'Informe a data da venda.'; return r; }
    var limite = function (venda, dias, venc) { return p.tol ? proxVenc(addDias(venda, dias), venc) : addDias(venda, dias); };
    var regrasEntrada = f.modelo !== 'linear'; // à vista segue as regras de entrada do padrão

    var e1d = datasEntrada(f.venda, f.e1Parc, f.e1Forma), e1v = dividir(f.e1Valor, f.e1Parc);
    e1d.forEach(function (d, i) { r.cronograma.push({ etapa: '1ª parcela', mk: 'e1', parc: (i + 1) + '/' + f.e1Parc, data: d, forma: FORMA_ROT[f.e1Forma], valor: e1v[i] }); });
    var e2d = [], e2v = [];
    if (f.temE2) {
      e2d = datasEntrada(f.venda, f.e2Parc, f.e2Forma); e2v = dividir(f.e2Valor, f.e2Parc);
      e2d.forEach(function (d, i) { r.cronograma.push({ etapa: '1ª parcela (2ª forma)', mk: 'e2', parc: (i + 1) + '/' + f.e2Parc, data: d, forma: FORMA_ROT[f.e2Forma], valor: e2v[i] }); });
    }
    var restanteTotal = f.valorEntrada - f.e1Valor - (f.temE2 ? f.e2Valor : 0);
    r.restanteTotal = restanteTotal;
    var rd = [];
    if (f.temR && f.rData) {
      for (var i = 0; i < f.rParc; i++) rd.push(addMeses(f.rData, i, f.rData.getDate()));
      var rv = dividir(Math.max(0, restanteTotal), f.rParc); r.restanteParcela = rv[0];
      rd.forEach(function (d, i) { r.cronograma.push({ etapa: 'Entrada restante', mk: 'r', parc: (i + 1) + '/' + f.rParc, data: d, forma: FORMA_ROT[f.rForma], valor: rv[i] }); });
    }
    var sinal = new Date(f.sAno, f.sMes, f.sDia);
    r.sinal = sinal;
    r.fimSinal = addMeses(sinal, f.sParc - 1, f.sDia);
    r.saldoPer = { anual: 12, semestral: 6 }[f.modelo] || 0;
    r.saldoAuto = r.saldoPer ? addMeses(f.venda, r.saldoPer, f.sDia) : addMeses(sinal, f.sParc, f.sDia);
    r.saldo = f.sdManual && f.sdData ? f.sdData : r.saldoAuto;
    var sv = dividir(f.sValor, f.sParc), sdv = dividir(Math.max(0, f.sdValor), f.sdParc);
    r.sinalParcela = sv[0]; r.saldoParcela = sdv[0];
    r.cronograma.push({ etapa: 'Sinal', mk: 's', parc: '1/' + f.sParc, data: sinal, forma: FORMA_ROT[f.sForma] || '—', valor: f.sValor ? sv[0] : null, nota: 'até ' + fmtData(r.fimSinal) + (f.sValor ? ' · total ' + reais(f.sValor) : '') });
    r.cronograma.push({ etapa: 'Saldo', mk: 'sd', parc: '1/' + f.sdParc, data: r.saldo, forma: FORMA_ROT[f.sdForma] || '—', valor: f.sdValor > 0 ? sdv[0] : null, nota: (f.sdValor > 0 ? 'total ' + reais(f.sdValor) : '') + (r.saldoPer ? ' · a cada ' + r.saldoPer + ' meses' : '') });
    r.dias = diasEntre(f.venda, sinal);
    r.limReg = limite(f.venda, p.diasReg, VENC_SINAL);
    r.limDir = limite(f.venda, p.diasDir, VENC_SINAL);

    var add = function (id, titulo, det) {
      var acao = a[id];
      if (!acao || acao === 'desligada') return;
      var item = { id: id, titulo: titulo, det: det, acao: acao, base: META_POR_ID[id] ? META_POR_ID[id].base : '' };
      (acao === 'bloquear' ? r.bloqueios : acao === 'ciencia' ? r.ciencia : r.gatilhos).push(item);
    };

    var datasLivres = f.modelo === 'avista'; // à vista: qualquer dia negociado, mas o sinal continua em até 150 dias
    if (!datasLivres && f.sdManual && f.sdData && VENC_SINAL.indexOf(f.sdData.getDate()) < 0) {
      add('venc_saldo', 'Saldo vencendo no dia ' + pad(f.sdData.getDate()), 'Sinal e saldo vencem dia 05 ou 10');
    }
    if (sinal > r.limDir) add('sinal_dir', 'Sinal começa ' + r.dias + ' dias após a venda', 'Limite do Regional: ' + fmtData(r.limDir));
    else if (sinal > r.limReg) add('sinal_reg', 'Sinal começa ' + r.dias + ' dias após a venda', 'Sem autorização até ' + fmtData(r.limReg) + '; Regional até ' + fmtData(r.limDir));

    if (f.e1Forma === 'Boleto') add('forma_1a', '1ª parcela em boleto', 'Use dinheiro, débito, PIX, TED ou crédito à vista');
    if (f.modelo === 'linear' && f.temE2) add('linear_2formas', 'Linear com entrada em duas formas', 'Política 8.1: não pode dividir a entrada entre formas');

    var credParcelado = f.e1Forma === 'CartaoCredito' && f.e1Parc > 1;
    var aVista1 = f.e1Forma !== 'CartaoCredito';
    if (regrasEntrada && credParcelado) {
      if (f.e1Parc > 6) add('cred_acima', 'Entrada inteira no crédito em ' + f.e1Parc + 'x', 'Regional libera até 6x');
      else if (f.e1Parc === 6) add('cred_6x', 'Entrada inteira no crédito em 6x', 'Consultor libera até 5x');
    }
    if (regrasEntrada && !credParcelado) {
      var lim1 = addMeses(f.venda, 1);
      var pago = f.e1Valor + (f.temE2 ? e2v.reduce(function (s, v, i) { return s + (e2d[i] <= lim1 ? v : 0); }, 0) : 0);
      // No Combo a entrada é a metade, e os mínimos da 1ª parcela também
      var fat = f.modelo === 'combo' ? 0.5 : 1, minGer = p.p1Ger * fat, minCons = p.p1Cons * fat;
      var porCota = pago / f.cotas;
      if (f.temE2 && porCota < minGer - 0.004) add('duas_formas', '1ª parcela em duas formas sem fechar o mínimo', reais(porCota) + ' por cota em até 30 dias. Proibido: os ' + reais(minGer) + ' precisam entrar em até 30 dias');
      else if (porCota < minGer - 0.004) add('p1_abaixo', '1ª parcela de ' + reais(porCota) + ' por cota', 'Abaixo de ' + reais(minGer) + ' por cota só no modelo Linear');
      else if (porCota < minCons - 0.004) add('p1_gerente', '1ª parcela de ' + reais(porCota) + ' por cota', 'Sem autorização a partir de ' + reais(minCons) + (f.temE2 ? ' (soma das duas formas em até 30 dias)' : ''));
    }

    if (rd.length) {
      var ult = rd[rd.length - 1];
      if (regrasEntrada) {
        // Prazos por mês de competência: 30/60 dias = 2 meses após a venda; 150 dias = 5 meses.
        // Crédito à vista +1 mês; vendas a partir do dia 20 +1 mês (o prazo inteiro anda junto, 7.1.5).
        var desloc = (aVista1 ? 0 : 1) + (f.venda.getDate() >= 20 ? 1 : 0), mv = chaveMes(f.venda);
        var mesCons = mv + 2 + desloc, mesGer = mv + 5 + desloc;
        if (f.rParc > 5 || chaveMes(ult) > mesGer) add('rest_acima', 'Restante em ' + f.rParc + 'x, última em ' + fmtData(ult), 'Gerente libera até 5x, terminando até ' + rotMes(mesGer));
        else if (f.rParc > 2 || chaveMes(ult) > mesCons) add('rest_gerente', 'Restante em ' + f.rParc + 'x, última em ' + fmtData(ult), 'Sem autorização: até 2x, terminando até ' + rotMes(mesCons));
        if (r.restanteParcela !== undefined && restanteTotal > 0 && r.restanteParcela / f.cotas < p.restMin - 0.004) {
          add('rest_minima', 'Parcela da restante de ' + reais(r.restanteParcela / f.cotas) + ' por cota', 'Mínimo ' + reais(p.restMin));
        }
      }
      if (f.rForma === 'Boleto' && VENC_REST.indexOf(rd[0].getDate()) < 0) {
        r.dicaVenc = 'O boleto da restante vence dia ' + pad(rd[0].getDate()) + '. Prefira dia 05 ou 10, como sinal e saldo (não é obrigatório).';
      }
      if (e1d.some(function (d) { return chaveMes(d) === chaveMes(rd[0]); })) add('choque_rest', 'Choque: restante no mesmo mês da 1ª parcela', '1º vencimento da restante em ' + fmtData(rd[0]));
      // Competência: a restante começa no mês seguinte à venda; vendas a partir do dia 20 podem pular um mês (7.1.5)
      var mesPermitido = chaveMes(f.venda) + (f.venda.getDate() >= 20 ? 2 : 1);
      var anteriores = e1d.concat(e2d), antes = anteriores.filter(function (d) { return d < rd[0]; });
      if (chaveMes(rd[0]) > mesPermitido && antes.length) {
        var pagos = {}; anteriores.forEach(function (d) { pagos[chaveMes(d)] = true; });
        var ultAnt = Math.max.apply(null, antes.map(chaveMes));
        for (var k = ultAnt + 1; k < chaveMes(rd[0]); k++) if (!pagos[k]) r.saltos.push(k);
      }
      if (r.saltos.length) add('salto', (r.saltos.length === 1 ? 'Um mês' : r.saltos.length + ' meses') + ' sem pagamento', r.saltos.map(rotMes).join(', ') + ' · 1º vencimento permitido até ' + rotMes(mesPermitido));
      if (rd[0] < f.venda) add('restante_antes', 'Restante começa antes da venda', fmtData(rd[0]) + ' é anterior a ' + fmtData(f.venda));
    }
    var todasEntradas = e1d.concat(e2d, rd);
    if (todasEntradas.length) {
      var ultE = new Date(Math.max.apply(null, todasEntradas.map(function (d) { return d.getTime(); })));
      r.fimEntrada = ultE;
      if (sinal <= ultE) add('conflito', 'Choque: sinal começa antes do fim da entrada', 'Sinal ' + fmtData(sinal) + ' · última parcela da entrada ' + fmtData(ultE));
      // Sinal subsequente à última parcela da entrada; entrada paga inteira em venda a partir do dia 20 pode pular um mês
      var ultMes = Math.max.apply(null, todasEntradas.map(chaveMes));
      var integral = !rd.length && !f.temE2 && f.e1Parc === 1;
      var limMes = integral && f.venda.getDate() >= 20 ? Math.max(ultMes + 1, chaveMes(f.venda) + 2) : ultMes + 1;
      if (!datasLivres && chaveMes(sinal) > limMes) {
        var vaz = []; for (var k2 = ultMes + 1; k2 < chaveMes(sinal); k2++) vaz.push(k2);
        r.saltos = r.saltos.concat(vaz);
        add('sinal_salto', 'Sinal não começa logo após a entrada', vaz.map(rotMes).join(', ') + ' sem pagamento antes do sinal');
      }
    }
    if (r.saldo <= r.fimSinal) add('choque_saldo', 'Choque: saldo começa antes do fim do sinal', 'Saldo ' + fmtData(r.saldo) + ' · última parcela do sinal ' + fmtData(r.fimSinal));

    // Faixas do modelo de venda: menos parcelas sempre pode; passar do máximo vai para a Diretoria
    var nE = credParcelado ? f.e1Parc : 1 + (f.temR ? f.rParc : 0);
    r.parcelasEntrada = nE;
    if (f.modelo === 'avista') {
      if (nE > 1 || f.sParc > 1 || f.sdParc > 1) add('avista_parc', 'À vista com parcelamento', 'Entrada ' + nE + 'x, sinal ' + f.sParc + 'x, saldo ' + f.sdParc + 'x; no à vista tudo é 1x');
      if (f.desc > 10) add('desc_dir', 'Desconto à vista de ' + pct(f.desc) + '%', 'Acima de 10%');
      else if (f.desc > 7) add('desc_ger', 'Desconto à vista de ' + pct(f.desc) + '%', 'Consultor até 7%; Gerente até 10%');
    } else if (f.modelo === 'linear') {
      var totalParc = nE + f.sParc + f.sdParc;
      if (totalParc > 120) add('linear_prazo', 'Prazo total de ' + totalParc + 'x', 'O Linear vai até 120x; menos parcelas pode');
      var vals = e1v.concat(f.temR && r.restanteParcela !== undefined ? [r.restanteParcela] : [], [f.sValor / f.sParc, f.sdValor / f.sdParc])
        .filter(function (v) { return v > 0; });
      if (vals.length > 1 && Math.max.apply(null, vals) - Math.min.apply(null, vals) > 1) {
        add('linear_igual', 'Parcelas diferentes no Linear', 'De ' + reais(Math.min.apply(null, vals)) + ' a ' + reais(Math.max.apply(null, vals)) + '; todas as séries devem ter o mesmo valor');
      }
    } else {
      if (f.sParc > 6) add('faixa_sinal', 'Sinal em ' + f.sParc + 'x', MODELOS[f.modelo] + ' vai até 6x');
      var fx = FAIXA_SALDO[f.modelo];
      if (fx && f.sdParc > fx[1]) add('faixa_saldo', 'Saldo em ' + f.sdParc + 'x', MODELOS[f.modelo] + ' vai até ' + fx[1] + 'x; menos parcelas pode');
      if (f.modelo === 'ate36' && nE + f.sParc >= 36) add('faixa_saldo', 'Entrada e sinal ocupam as 36 parcelas', 'Precisa sobrar pelo menos 1 parcela para o saldo');
    }
    if (f.modelo !== 'linear' && f.valorCota > 0 && f.sdValor < -0.004) add('saldo_negativo', 'Valor da cota não cobre entrada e sinal', 'Faltam ' + reais(-f.sdValor) + ' para fechar');
    if (restanteTotal < -0.004) add('entrada_excede', 'Pagamentos passam do total da entrada', 'Excedem em ' + reais(-restanteTotal));
    else if (!f.temR && restanteTotal > 0.004) r.avisoSobra = 'Faltam ' + reais(restanteTotal) + ' para fechar a entrada. Ative a entrada restante ou ajuste os valores.';
    return r;
  }

  // ------------------------------------------------------------- venda inteira
  /**
   * neg = { modelo, venda: 'AAAA-MM-DD', aceite: bool, cotas: [ {...campos da cota} ] }
   * Devolve as regras disparadas de todas as cotas e a alçada que as regras pedem (antes de sala e cargos vagos).
   */
  function avaliarVenda(neg, cfgSalva) {
    var cfg = config(cfgSalva);
    var cotas = (neg && Array.isArray(neg.cotas) ? neg.cotas : []).slice(0, 20);
    var v = { gatilhos: [], bloqueios: [], ciencia: [], porCota: [], cotas: [], alcadaRegras: '' };
    if (!cotas.length) { v.incompleto = 'Informe pelo menos uma cota.'; return v; }
    var fs = cotas.map(function (c) { return cotaDe(c, neg, cfg); });
    var rs = fs.map(function (f) { return avaliarCota(f, cfg); });
    v.cotas = fs; v.porCota = rs; v.incompleto = rs[0].incompleto;
    rs.forEach(function (ri, i) {
      ['gatilhos', 'bloqueios', 'ciencia'].forEach(function (k) {
        ri[k].forEach(function (g) {
          v[k].push({ id: g.id, acao: g.acao, base: g.base, det: g.det, cota: i + 1, titulo: (fs.length > 1 ? 'Cota ' + (i + 1) + ': ' : '') + g.titulo });
        });
      });
    });
    v.faltaAceite = v.ciencia.length > 0 && !bool(neg.aceite);
    v.alcadaRegras = v.gatilhos.reduce(function (m, g) { return !m || NIVEL[g.acao] > NIVEL[m] ? g.acao : m; }, '');
    return v;
  }

  /** Mesma decisão do servidor: sobe um nível se a sala passou do limite; o aviso sobe se o cargo estiver vago. */
  function decidirAlcada(alcadaRegras, ctx, cfgSalva) {
    var cfg = config(cfgSalva);
    var r = { alcada: alcadaRegras, destino: alcadaRegras, ajustes: [] };
    if (!alcadaRegras) return r;
    var alc = alcadaRegras;
    if (cfg.params.sobeSala && ctx && ctx.limite > 0 && ctx.vendas > 0 && ctx.pct >= ctx.limite && alc !== 'diretor') {
      var nova = NIVEIS[NIVEIS.indexOf(alc) + 1];
      r.ajustes.push({ titulo: 'Sobe de ' + ROTULO_ALCADA[alc] + ' para ' + ROTULO_ALCADA[nova], det: 'A sala está com ' + pct(ctx.pct) + '% de exceções no mês (limite ' + pct(ctx.limite) + '%)' });
      alc = nova;
    }
    r.alcada = alc;
    var vagos = (ctx && ctx.vagos) || {};
    var i = NIVEIS.indexOf(alc);
    while (i < NIVEIS.length - 1 && vagos[NIVEIS[i]]) i++;
    r.destino = NIVEIS[i];
    if (r.destino !== alc) r.ajustes.push({ titulo: 'Aviso vai para ' + ROTULO_ALCADA[r.destino], det: ROTULO_ALCADA[alc] + ' está vago nesta sala' });
    return r;
  }

  /** Texto curto da negociação, usado no detalhe, no WhatsApp e na exportação. */
  function resumo(neg, aval) {
    var cotas = aval.cotas || [];
    var linhas = ['Modelo: ' + (MODELOS[neg.modelo] || neg.modelo), 'Data da venda: ' + fmtData(lerData(neg.venda)), 'Cotas: ' + cotas.length];
    cotas.forEach(function (f, i) {
      var r = aval.porCota[i];
      linhas.push('Cota ' + (i + 1) + ': ' + f.emp + ' · ' + reais(f.valorCota) + ' · entrada ' + reais(f.valorEntrada) +
        ' (1ª ' + reais(f.e1Valor + (f.temE2 ? f.e2Valor : 0)) + (f.temR ? ' + restante ' + f.rParc + 'x' : '') + ')' +
        ' · sinal ' + f.sParc + 'x a partir de ' + fmtData(r.sinal) + ' · saldo ' + f.sdParc + 'x');
    });
    return linhas.join('\n');
  }

  return {
    NIVEIS: NIVEIS, NIVEL: NIVEL, ROTULO_ALCADA: ROTULO_ALCADA, ACOES: ACOES, ROTULO_ACAO: ROTULO_ACAO,
    PADRAO: PADRAO, META: META, MODELOS: MODELOS, FAIXA_SALDO: FAIXA_SALDO, FAIXA_TXT: FAIXA_TXT,
    FORMAS: FORMAS, FORMA_ROT: FORMA_ROT, EMPREENDIMENTOS: EMPREENDIMENTOS, MES_CURTO: MES_CURTO, VENC_SINAL: VENC_SINAL,
    config: config, baseCota: baseCota, entradaModelo: entradaModelo, parcelasEntrada: parcelasEntrada,
    cotaDe: cotaDe, avaliarCota: avaliarCota, avaliarVenda: avaliarVenda, decidirAlcada: decidirAlcada, resumo: resumo,
    util: { reais: reais, pct: pct, fmtData: fmtData, isoData: isoData, lerData: lerData, addMeses: addMeses, chaveMes: chaveMes, pad: pad, regraData: regraData, dividir: dividir },
  };
})();

if (typeof window !== 'undefined') window.RegrasPagamento = RegrasPagamento;
if (typeof module !== 'undefined' && module.exports) module.exports = RegrasPagamento;
