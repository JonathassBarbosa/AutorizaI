/**
 * Formulário das condições de pagamento (tipo "Condição de pagamento fora da regra").
 * Calcula na hora, com o mesmo motor do servidor (js/regras-pagamento.js), quais regras disparam,
 * a alçada e para quem vai o aviso. O servidor refaz tudo ao receber o pedido.
 *
 * Várias cotas: nada é somado. Cada cota tem valor e negociação próprios.
 *  - mesmo empreendimento e mesmo valor de outra cota → copia o financeiro inteiro;
 *  - mesmo valor de entrada → mantém a negociação da entrada e recalcula sinal e saldo;
 *  - entrada diferente → o consultor preenche tudo.
 */
import { esc, toast } from './core.js';

// As regras são lidas na hora de usar: se o arquivo não carregar, o resto do app continua abrindo.
let R = null;
let U = null;
function carregarRegras() {
  R = window.RegrasPagamento || null;
  U = R ? R.util : null;
  return !!R;
}
const CAMPOS_ENTRADA = ['valorEntrada', 'e1Valor', 'e1Forma', 'e1Parc', 'temE2', 'e2Valor', 'e2Forma', 'e2Parc', 'temR', 'rForma', 'rData', 'rParc'];
const CAMPOS_SINAL = ['sDia', 'sMes', 'sAno', 'sParc', 'sdParc', 'sdManual', 'sdData', 'sValor', 'sdValor', 'desc', 'sForma', 'sdForma'];
const CHECKS = ['temE2', 'temR', 'sdManual'];
const ROTULO = { gerente: 'Gerente de Sala', regional: 'Regional', superintendente: 'Superintendente (Gerente Nacional)', diretor: 'Diretoria' };
const ROTULO_CURTO = { gerente: 'Gerente', regional: 'Regional', superintendente: 'Superint.', diretor: 'Diretoria' };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const opcoes = (lista, sel) => lista.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join('');
const nChip = n => `<span class="nv nv-${esc(n)}">${esc(R.ROTULO_ACAO[n] || n)}</span>`;
const n = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const int = (v, min = 1) => Math.max(min, parseInt(v, 10) || min);

function marcacao() {
  const formas = opcoes(R.FORMAS);
  const anoAtual = new Date().getFullYear();
  return `
  <div class="ng-aviso" id="ng-aviso" role="status" aria-live="polite"></div>
  <div class="card"><div class="card-topo"><h3>Condições da venda</h3><small>O sistema confere as regras de comercialização enquanto você preenche</small></div>
    <div class="card-corpo">
      <div class="linha-campos">
        <div class="campo"><label for="ng-modelo">Modelo de venda</label><select class="entrada" id="ng-modelo">${opcoes(Object.entries(R.MODELOS))}</select></div>
        <div class="campo"><label for="ng-venda">Data da venda</label><input class="entrada" id="ng-venda" type="date"></div>
      </div>
      <div class="campo"><label>Cotas da venda</label><div class="ng-tabs" id="ng-tabs"></div></div>
      <div class="linha-campos">
        <div class="campo"><label for="ng-emp">Empreendimento</label><select class="entrada" id="ng-emp"><option value="">Selecione…</option>${opcoes(R.EMPREENDIMENTOS.map(e => [e, e]))}</select></div>
        <div class="campo"><label for="ng-valorCota">Valor da cota (R$)</label><input class="entrada" id="ng-valorCota" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Ex.: 49900"><small id="ng-totalCota">Valor desta cota</small></div>
      </div>
      <div class="campo"><label for="ng-valorEntrada">Valor da entrada (R$)</label><input class="entrada" id="ng-valorEntrada" type="number" step="0.01" min="0"><small id="ng-padraoEntrada"></small></div>
      <div class="aviso aviso-azul" id="ng-vinculo" hidden></div>
    </div></div>

  <div class="card" id="ng-cardE1"><div class="card-topo"><h3>1ª parcela da entrada</h3><small>Crédito em 1x é à vista; em 2x ou mais é a entrada inteira no cartão</small></div>
    <div class="card-corpo">
      <div class="linha-campos">
        <div class="campo"><label for="ng-e1Valor">Valor (R$)</label><input class="entrada" id="ng-e1Valor" type="number" step="0.01" min="0" inputmode="decimal"></div>
        <div class="campo"><label for="ng-e1Forma">Forma de pagamento</label><select class="entrada" id="ng-e1Forma">${formas}</select></div>
      </div>
      <div class="campo" style="max-width:220px"><label for="ng-e1Parc">Parcelas</label><input class="entrada" id="ng-e1Parc" type="number" min="1" max="24" value="1"></div>
      <div class="vencs" id="ng-e1Datas"></div>
      <label class="check" style="margin-bottom:12px"><input type="checkbox" id="ng-temE2"> O cliente paga a 1ª parcela em uma segunda forma</label>
      <div id="ng-blocoE2">
        <div class="linha-campos">
          <div class="campo"><label for="ng-e2Valor">Valor na 2ª forma (R$)</label><input class="entrada" id="ng-e2Valor" type="number" step="0.01" min="0" inputmode="decimal"></div>
          <div class="campo"><label for="ng-e2Forma">Forma de pagamento</label><select class="entrada" id="ng-e2Forma">${formas}</select></div>
        </div>
        <div class="campo" style="max-width:220px"><label for="ng-e2Parc">Parcelas</label><input class="entrada" id="ng-e2Parc" type="number" min="1" max="24" value="1"></div>
        <div class="vencs" id="ng-e2Datas"></div>
      </div>
    </div></div>

  <div class="card" id="ng-cardR"><div class="card-topo"><h3>Entrada restante</h3><label class="check"><input type="checkbox" id="ng-temR" checked> Tem entrada restante</label></div>
    <div class="card-corpo" id="ng-blocoR">
      <div class="linha-campos">
        <div class="campo"><label for="ng-rForma">Forma</label><select class="entrada" id="ng-rForma">${formas}</select></div>
        <div class="campo"><label for="ng-rData">1º vencimento</label><input class="entrada" id="ng-rData" type="date"><small>De preferência dia 05 ou 10; qualquer dia do mês de competência vale</small></div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label for="ng-rParc">Parcelas</label><input class="entrada" id="ng-rParc" type="number" min="1" max="24" value="2"></div>
        <div class="campo"><label>Valor por parcela</label><div class="ng-valor-fixo" id="ng-rValor">—</div></div>
      </div>
    </div></div>

  <div class="card" id="ng-cardS"><div class="card-topo"><h3>Sinal e saldo</h3></div>
    <div class="card-corpo">
      <div class="linha-campos">
        <div class="campo"><label for="ng-sDia">Dia do sinal</label><select class="entrada" id="ng-sDia"></select></div>
        <div class="campo"><label for="ng-sMes">Mês</label><select class="entrada" id="ng-sMes">${opcoes(MESES.map((m, i) => [i, m]))}</select></div>
        <div class="campo"><label for="ng-sAno">Ano</label><input class="entrada" id="ng-sAno" type="number" min="${anoAtual - 1}" max="${anoAtual + 10}"></div>
        <div class="campo"><label for="ng-sParc">Parcelas do sinal</label><input class="entrada" id="ng-sParc" type="number" min="1" max="60" value="6"><small id="ng-sInfo"></small></div>
        <div class="campo"><label for="ng-sdParc">Parcelas do saldo</label><input class="entrada" id="ng-sdParc" type="number" min="1" max="180" value="72"><small id="ng-sdFaixa"></small></div>
        <div class="campo"><label for="ng-sForma">Forma do sinal</label><select class="entrada" id="ng-sForma">${formas}</select></div>
        <div class="campo"><label for="ng-sdForma">Forma do saldo</label><select class="entrada" id="ng-sdForma">${formas}</select></div>
        <div class="campo"><label for="ng-sdData">1º vencimento do saldo</label><input class="entrada" id="ng-sdData" type="date" readonly><small>Automático pelo modelo de venda</small></div>
      </div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" id="ng-sdManual"> Definir a data do saldo manualmente</label>
      <div class="linha-campos">
        <div class="campo"><label for="ng-sValor">Valor total do sinal (R$)</label><input class="entrada" id="ng-sValor" type="number" step="0.01" min="0"><small id="ng-sValorInfo"></small></div>
        <div class="campo"><label for="ng-sdValor">Valor total do saldo (R$)</label><input class="entrada" id="ng-sdValor" type="number" step="0.01" min="0"><small id="ng-sdValorInfo"></small></div>
      </div>
      <div class="campo" id="ng-descCampo" hidden style="max-width:260px"><label for="ng-desc">Desconto à vista (%)</label><input class="entrada" id="ng-desc" type="number" step="0.1" min="0" max="100" value="0"><small>Até 7% consultor · até 10% Gerente · acima, Diretoria</small></div>
      <div class="vencs" id="ng-fechamento" hidden></div>
    </div></div>

  <div class="card"><div class="card-corpo" id="ng-tempo"></div></div>
  <div class="card"><div class="card-topo"><h3 id="ng-cronoTit">Cronograma calculado</h3><small>Centavos acertados na última parcela</small></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Etapa</th><th>Parcela</th><th>Data</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody id="ng-crono"></tbody></table></div></div>`;
}

/**
 * Monta o formulário. painel = elemento onde vai o "Quem aprova".
 * Retorna { obter(), atualizarContexto(ctx) }.
 */
export function montarNegociacao(raiz, painel, { config, contexto, aoMudar }) {
  if (!carregarRegras()) throw new Error('As regras de comercialização não carregaram. Atualize a página.');
  raiz.innerHTML = marcacao();
  const q = id => raiz.querySelector('#ng-' + id);
  let ctx = contexto || {};
  let aceite = false;
  let cotas = [];
  let ativa = 0;
  let ultimoAviso = null;
  let ultimo = null;

  // ------------------------------------------------- valores padrão
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const proxMes10 = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 10);
  const sinalPadrao = new Date(hoje.getFullYear(), hoje.getMonth() + 3, 10);
  q('venda').value = U.isoData(hoje);
  q('rData').value = U.isoData(proxMes10);
  q('rForma').value = 'Boleto'; q('sForma').value = 'Boleto'; q('sdForma').value = 'Boleto';
  q('sMes').value = String(sinalPadrao.getMonth()); q('sAno').value = String(sinalPadrao.getFullYear());

  const ler = ids => Object.fromEntries(ids.map(id => [id, CHECKS.includes(id) ? q(id).checked : q(id).value]));
  const escrever = o => Object.entries(o).forEach(([id, v]) => {
    const el = q(id); if (!el) return;
    if (CHECKS.includes(id)) el.checked = !!v; else if (el.value !== String(v ?? '')) el.value = v ?? '';
  });

  // ------------------------------------------------- cotas e cópia do financeiro
  const valor = c => n(c.valorCota);
  function vinculo(i) {
    const c = cotas[i];
    for (let j = 0; j < i; j++) if (cotas[j].emp && cotas[j].emp === c.emp && valor(cotas[j]) === valor(c)) return { tipo: 'igual', ref: j };
    for (let j = 0; j < i; j++) if (cotas[j].emp && c.emp && R.baseCota(cotas[j].emp, config) === R.baseCota(c.emp, config)) return { tipo: 'entrada', ref: j };
    return { tipo: i === 0 ? 'principal' : 'livre' };
  }
  function efetivo(i) {
    const v = vinculo(i);
    if (v.tipo === 'igual') return efetivo(v.ref);
    if (v.tipo === 'entrada') { const o = { ...cotas[i].raw }; const src = efetivo(v.ref); CAMPOS_ENTRADA.forEach(k => { o[k] = src[k]; }); return o; }
    return cotas[i].raw;
  }
  function salvarAtiva() {
    const c = cotas[ativa]; if (!c) return;
    c.emp = q('emp').value; c.valorCota = q('valorCota').value;
    const v = vinculo(ativa);
    if (v.tipo === 'igual') return;
    Object.assign(c.raw, ler(v.tipo === 'entrada' ? CAMPOS_SINAL : CAMPOS_ENTRADA.concat(CAMPOS_SINAL)));
  }
  const ENTRADA_VAZIA = { valorEntrada: '', e1Valor: '', e1Forma: 'PIX', e1Parc: '1', temE2: false, e2Valor: '', e2Forma: 'PIX', e2Parc: '1', temR: true, rForma: 'Boleto', rData: U.isoData(proxMes10), rParc: '2' };
  function atualizarVinculos() {
    cotas.forEach((c, i) => {
      const t = vinculo(i).tipo;
      if (c.tipo && c.tipo !== t && t === 'livre') {
        Object.assign(c.raw, ENTRADA_VAZIA);
        if (i === ativa) toast(`A cota ${i + 1} tem entrada diferente: preencha a negociação dela.`, 'info');
      }
      c.tipo = t;
    });
  }
  function mostrarAtiva() {
    const c = cotas[ativa];
    if (q('emp').value !== c.emp) q('emp').value = c.emp;
    if (q('valorCota').value !== String(c.valorCota)) q('valorCota').value = c.valorCota;
    escrever(efetivo(ativa));
  }

  // ------------------------------------------------- campos calculados
  function syncEntrada() {
    const modelo = q('modelo').value, fixo = modelo !== 'linear';
    q('valorEntrada').readOnly = fixo;
    if (fixo) q('valorEntrada').value = q('emp').value ? R.entradaModelo(q('emp').value, modelo, config).toFixed(2) : '';
    q('padraoEntrada').textContent = !fixo ? 'Valor da tabela linear escolhido pelo cliente'
      : modelo === 'combo' ? 'Combo: metade da entrada da tabela' : 'Fixo pela tabela do empreendimento';
    const dias = modelo === 'avista' ? Array.from({ length: 31 }, (_, i) => i + 1) : R.VENC_SINAL;
    if (q('sDia').options.length !== dias.length) {
      const atual = +q('sDia').value || 10;
      q('sDia').innerHTML = opcoes(dias.map(d => [d, U.pad(d)]));
      q('sDia').value = String(dias.includes(atual) ? atual : dias[dias.length - 1]);
    }
  }
  function syncValores() {
    const modelo = q('modelo').value, auto = modelo !== 'linear', total = n(q('valorCota').value), desc = modelo === 'avista' ? n(q('desc').value) : 0;
    q('descCampo').hidden = modelo !== 'avista';
    q('totalCota').textContent = desc > 0 && total > 0 ? `Com ${U.pct(desc)}% de desconto: ${U.reais(Math.round(total * (100 - desc)) / 100)}` : 'Valor desta cota';
    q('sValor').readOnly = auto; q('sdValor').readOnly = auto;
    if (auto) {
      if (total > 0) {
        const liq = Math.round(total * (100 - desc)) / 100, s = Math.round(liq * config.params.pctSinal) / 100;
        q('sValor').value = s.toFixed(2);
        q('sdValor').value = (liq - n(q('valorEntrada').value) - s).toFixed(2);
      } else { q('sValor').value = ''; q('sdValor').value = ''; }
    }
    const fix = modelo === 'avista' ? 1 : modelo === 'ate36'
      ? Math.max(1, 36 - R.parcelasEntrada(ler(['e1Forma', 'e1Parc', 'temR', 'rParc'])) - int(q('sParc').value)) : null;
    q('sdParc').readOnly = fix !== null; if (fix !== null) q('sdParc').value = fix;
    q('sdFaixa').textContent = R.FAIXA_TXT[modelo] || '';
    q('sInfo').textContent = modelo === 'avista' ? '1x' : modelo === 'linear' ? '' : 'Até 6x';
    q('sValorInfo').textContent = auto ? `${U.pct(config.params.pctSinal)}% do valor ${desc ? 'com desconto' : 'da cota'}` : 'Mesmo valor de parcela das outras séries';
    q('sdValorInfo').textContent = auto ? (desc ? 'Valor com desconto − entrada − sinal' : 'Valor da cota − entrada − sinal') : 'Mesmo valor de parcela das outras séries';
  }

  function renderCotas() {
    const v = vinculo(ativa), base = cotas[ativa].emp ? U.reais(R.baseCota(cotas[ativa].emp, config)) : '';
    q('tabs').innerHTML = cotas.map((c, i) => `<button type="button" class="chip${i === ativa ? ' ativo' : ''}" data-cota="${i}">Cota ${i + 1}
        <span class="sub">· ${esc((c.emp || 'sem empreendimento').replace(/ RESORT| RESIDENCE/, ''))} · ${valor(c) ? U.reais(valor(c)) : 'sem valor'}</span></button>`).join('')
      + '<button type="button" class="chip add" data-add>+ Adicionar cota</button>'
      + (cotas.length > 1 ? `<button type="button" class="chip add" data-rem>Remover cota ${ativa + 1}</button>` : '');
    const msgs = {
      igual: `Mesmo empreendimento e mesmo valor da cota ${v.ref + 1}: o financeiro foi copiado. Para negociar diferente, mude o empreendimento ou o valor.`,
      entrada: `Mesma entrada da cota ${v.ref + 1} (${base}): a negociação da entrada foi mantida. Sinal e saldo seguem o valor desta cota.`,
      livre: `Entrada diferente das outras cotas (${base}): preencha toda a negociação desta cota.`,
    };
    q('vinculo').hidden = !msgs[v.tipo];
    q('vinculo').textContent = msgs[v.tipo] || '';
    q('vinculo').className = 'aviso ' + (v.tipo === 'livre' ? 'aviso-ambar' : 'aviso-azul');
    const copiaEntrada = v.tipo === 'igual' || v.tipo === 'entrada';
    q('cardE1').classList.toggle('ng-copiado', copiaEntrada);
    q('cardR').classList.toggle('ng-copiado', copiaEntrada);
    q('cardS').classList.toggle('ng-copiado', v.tipo === 'igual');
    q('valorEntrada').closest('.campo').classList.toggle('ng-copiado', copiaEntrada);
  }

  // ------------------------------------------------- avaliação
  function negociacao() {
    return {
      modelo: q('modelo').value, venda: q('venda').value, aceite,
      cotas: cotas.map((c, i) => Object.assign({ emp: c.emp, valorCota: c.valorCota }, efetivo(i))),
    };
  }
  function pendencias(neg) {
    const p = [];
    if (!neg.venda) p.push('data da venda');
    neg.cotas.forEach((c, i) => {
      const rot = neg.cotas.length > 1 ? ` da cota ${i + 1}` : '';
      if (!c.emp) p.push('empreendimento' + rot);
      if (!(n(c.valorCota) > 0)) p.push('valor' + rot);
      if (!(n(c.e1Valor) > 0)) p.push('1ª parcela' + rot);
      if (c.temR && !c.rData) p.push('1º vencimento da restante' + rot);
    });
    return p;
  }

  const vencsHtml = (itens, forma) => !itens.length ? '' : `<span class="regra">Vencimentos pela forma escolhida · ${esc(U.regraData(forma))}</span>` +
    itens.map(c => `<div class="vr"><span>${esc(c.parc)} · ${U.fmtData(c.data)}</span><b>${U.reais(c.valor)}</b></div>`).join('');
  const motivoHtml = g => `<li><span>${esc(g.titulo)}<span class="det">${esc(g.det)}</span></span>${nChip(g.acao)}</li>`;

  function render() {
    salvarAtiva(); atualizarVinculos(); mostrarAtiva();
    syncEntrada(); syncValores(); salvarAtiva();
    renderCotas();
    const neg = negociacao();
    const pend = pendencias(neg);
    const av = R.avaliarVenda(neg, config);
    const dec = R.decidirAlcada(av.alcadaRegras, ctx, config);
    const f = av.cotas[ativa], r = av.porCota[ativa];
    q('blocoE2').classList.toggle('ng-off', !q('temE2').checked);
    q('blocoR').classList.toggle('ng-off', !q('temR').checked);
    q('sdData').readOnly = !q('sdManual').checked;
    if (!q('sdManual').checked && r.saldoAuto) q('sdData').value = U.isoData(r.saldoAuto);
    q('rValor').textContent = f.temR && r.restanteParcela !== undefined ? `${U.reais(r.restanteParcela)} × ${f.rParc}` : '—';
    q('e1Datas').innerHTML = vencsHtml(r.cronograma.filter(c => c.mk === 'e1'), f.e1Forma);
    q('e2Datas').innerHTML = f.temE2 ? vencsHtml(r.cronograma.filter(c => c.mk === 'e2'), f.e2Forma) : '';
    q('e2Datas').hidden = !f.temE2;
    q('cronoTit').textContent = cotas.length > 1 ? `Cronograma da cota ${ativa + 1}` : 'Cronograma calculado';
    q('crono').innerHTML = r.cronograma.map(c => `<tr><td>${esc(c.etapa)}</td><td class="num">${esc(c.parc)}</td>
      <td>${U.fmtData(c.data)}${c.nota ? ` <span class="secundario">(${esc(c.nota)})</span>` : ''}</td><td>${esc(c.forma)}</td>
      <td class="num">${c.valor === null ? '—' : U.reais(c.valor)}</td></tr>`).join('');

    // fechamento da cota
    q('fechamento').hidden = !(f.valorCota > 0);
    if (f.valorCota > 0) {
      const liquido = Math.round(f.valorCota * (100 - (f.desc || 0))) / 100;
      const dif = liquido - (f.valorEntrada + f.sValor + f.sdValor);
      q('fechamento').innerHTML = `<span class="regra">Fechamento da cota</span>
        <div class="vr"><span>Entrada</span><b>${U.reais(f.valorEntrada)}</b></div>
        <div class="vr"><span>Sinal: ${f.sParc}x de ${U.reais(r.sinalParcela)}</span><b>${U.reais(f.sValor)}</b></div>
        <div class="vr"><span>Saldo: ${f.sdParc}x de ${U.reais(r.saldoParcela)}${r.saldoPer ? ` (a cada ${r.saldoPer} meses)` : ''}</span><b>${U.reais(f.sdValor)}</b></div>
        ${f.desc ? `<div class="vr"><span>Desconto à vista (${U.pct(f.desc)}% de ${U.reais(f.valorCota)})</span><b>− ${U.reais(f.valorCota - liquido)}</b></div>` : ''}
        <div class="vr" style="border-top:1px solid var(--border);padding-top:4px"><span>${f.desc ? 'Valor com desconto' : 'Valor total da cota'}</span><b>${U.reais(liquido)}</b></div>
        ${Math.abs(dif) > 0.004 ? `<div class="vr" style="color:var(--amber);font-weight:700"><span>${dif > 0 ? 'Falta distribuir' : 'Passa do valor total em'}</span><b>${U.reais(Math.abs(dif))}</b></div>` : ''}`;
    }
    renderTempo(f, r);

    // estado geral
    let estado;
    if (pend.length) estado = 'pendente';
    else if (av.bloqueios.length) estado = 'bloqueado';
    else if (av.faltaAceite) estado = 'aceite';
    else if (!av.gatilhos.length) estado = 'dentro';
    else estado = 'enviar';
    ultimo = { neg, av, dec, pend, estado };
    renderAviso(ultimo);
    renderPainel(ultimo, r);
    if (aoMudar) aoMudar(ultimo);
  }

  function renderTempo(f, r) {
    const p = config.params;
    if (r.dias === null) { q('tempo').innerHTML = ''; return; }
    const max = Math.max(p.diasDir + 90, r.dias + 30), pc = v => Math.min(100, Math.max(0, v / max * 100));
    const marcas = {};
    r.cronograma.forEach(c => { const k = U.chaveMes(c.data); (marcas[k] = marcas[k] || new Set()).add(c.mk); });
    for (let k = U.chaveMes(r.sinal); k <= U.chaveMes(r.fimSinal); k++) (marcas[k] = marcas[k] || new Set()).add('s');
    const ROT = { e1: '1ª', e2: '1ª (2)', r: 'Rest.', s: 'Sinal', sd: 'Saldo' };
    const ini = U.chaveMes(f.venda), fim = Math.min(U.chaveMes(r.saldo), ini + 36);
    let cel = '';
    for (let k = ini; k <= fim; k++) {
      const salto = r.saltos.includes(k);
      cel += `<div class="mes${salto ? ' salto' : ''}"><span class="m">${R.MES_CURTO[k % 12]}/${String(Math.floor(k / 12)).slice(2)}</span>
        ${[...(marcas[k] || [])].map(m => `<span class="mk mk-${m}">${ROT[m]}</span>`).join('')}${salto ? '<span class="mk" style="color:var(--red)">vazio</span>' : ''}</div>`;
    }
    q('tempo').innerHTML = `<div class="card-topo" style="padding:0 0 10px;border:0"><h3>Venda → início do sinal</h3><strong style="font-variant-numeric:tabular-nums">${r.dias} dias</strong></div>
      <div class="regua" aria-label="${r.dias} dias entre a venda e o sinal">
        <div class="faixa" style="left:0;width:${pc(p.diasReg)}%;background:var(--green-bg);border-radius:5px 0 0 5px"></div>
        <div class="faixa" style="left:${pc(p.diasReg)}%;width:${pc(p.diasDir) - pc(p.diasReg)}%;background:var(--amber-bg)"></div>
        <div class="faixa" style="left:${pc(p.diasDir)}%;right:0;background:var(--red-bg);border-radius:0 5px 5px 0"></div>
        <div class="marc" style="left:${pc(r.dias)}%"></div>
        <span class="tick" style="left:${pc(p.diasReg)}%">${p.diasReg}</span><span class="tick" style="left:${pc(p.diasDir)}%">${p.diasDir}</span>
      </div>
      <div class="regua-leg"><span>Consultor</span><span style="color:var(--nv-regional)">Regional</span><span style="color:var(--nv-diretor)">Diretoria</span></div>
      <p class="secundario" style="font-size:13px;margin:8px 0 12px">Sem autorização até <b>${U.fmtData(r.limReg)}</b>; Regional até <b>${U.fmtData(r.limDir)}</b> (ajustado ao vencimento 05 ou 10).</p>
      <div class="titulo-papel" style="margin-bottom:6px">Mês a mês</div><div class="meses-wrap"><div class="meses">${cel}</div></div>`;
  }

  function renderAviso(e) {
    const el = q('aviso');
    const lista = l => l.map(g => g.titulo).join(' · ');
    let cls = '', tit, mot, chave;
    if (e.estado === 'pendente') { tit = 'Preencha a negociação para ver quem aprova'; mot = 'Falta: ' + e.pend.join(', ') + '.'; chave = 'pend'; }
    else if (e.estado === 'bloqueado') { cls = 'bloq'; tit = 'Não pode enviar: a política não permite esta condição'; mot = 'Motivo: ' + lista(e.av.bloqueios); chave = 'bloq'; }
    else if (e.av.gatilhos.length) {
      cls = 'nivel'; chave = e.dec.destino;
      tit = `Autorização vai para: ${ROTULO[e.dec.destino]}${e.dec.destino !== e.dec.alcada ? ` (alçada ${ROTULO[e.dec.alcada]}, cargo vago)` : ''}`;
      mot = 'Motivo: ' + lista(e.av.gatilhos) + (e.dec.ajustes.length ? ' · ' + e.dec.ajustes.map(a => a.titulo).join(' · ') : '');
    } else {
      cls = e.av.faltaAceite ? 'espera' : 'ok'; chave = 'ok';
      tit = e.av.faltaAceite ? 'Não precisa de autorização, mas falta o aceite do cliente' : 'Não precisa de autorização: está na alçada do consultor';
      mot = 'Nenhuma regra de alçada disparou. A venda segue sem pedido de autorização.';
    }
    const choque = e.av.ciencia.length && e.estado !== 'bloqueado' && e.estado !== 'pendente'
      ? `<span class="choque">Choque de parcelas: ${esc(lista(e.av.ciencia).replace(/Choque: /g, ''))}. Dispensa autorização, mas o cliente precisa estar de acordo${e.av.faltaAceite ? '. Marque o aceite no painel “Quem aprova”.' : '. Aceite registrado.'}</span>` : '';
    el.className = 'ng-aviso ' + cls;
    el.style.setProperty('--ng-cor', e.dec.destino ? `var(--nv-${e.dec.destino})` : 'var(--navy-700)');
    el.innerHTML = `<span class="t">${esc(tit)}</span><span class="m">${esc(mot)}</span>${choque}`;
    const k = chave + '|' + e.av.ciencia.length;
    if (ultimoAviso !== null && k !== ultimoAviso && e.estado !== 'pendente') {
      const antes = Number(ultimoAviso.split('|')[1]);
      toast(e.av.ciencia.length > antes && e.estado !== 'bloqueado' ? 'Choque de parcelas: confirme o aceite do cliente.' : tit, 'info');
    }
    ultimoAviso = k;
  }

  function renderPainel(e, r) {
    if (!painel) return;
    const av = e.av, dec = e.dec;
    let h;
    if (e.estado === 'pendente') h = `<div class="veredito"><span class="rot">Quem aprova</span><h3>—</h3><p>Preencha ${esc(e.pend.slice(0, 3).join(', '))}${e.pend.length > 3 ? '…' : ''}.</p></div>`;
    else if (e.estado === 'bloqueado') h = '<div class="veredito bloq"><span class="rot">Não pode enviar</span><h3>Corrija a negociação</h3><p>A política não permite esta condição.</p></div>';
    else if (e.estado === 'aceite' && !av.gatilhos.length) h = '<div class="veredito espera"><span class="rot">Falta um passo</span><h3>Aceite do cliente</h3><p>Confirme abaixo que o cliente está de acordo.</p></div>';
    else if (!av.gatilhos.length) h = '<div class="veredito ok"><span class="rot">Quem aprova</span><h3>Ninguém</h3><p>Está na alçada do consultor. Não precisa pedir autorização.</p></div>';
    else h = `<div class="veredito nv-${dec.alcada}"><span class="rot">Alçada mínima</span><h3>${esc(ROTULO[dec.alcada])}</h3>
      <p>${dec.destino !== dec.alcada ? `Aviso enviado para ${esc(ROTULO[dec.destino])}. ` : ''}Níveis acima também podem aprovar.</p></div>`;
    const itens = av.bloqueios.concat(av.gatilhos, av.ciencia);
    if (itens.length && e.estado !== 'pendente') {
      h += `<div><div class="titulo-papel" style="margin:14px 0 8px">Regras que dispararam</div><ul class="motivos">${itens.map(motivoHtml).join('')}
        ${dec.ajustes.map(a => `<li class="ajuste"><span>${esc(a.titulo)}<span class="det">${esc(a.det)}</span></span><span></span></li>`).join('')}</ul></div>`;
    }
    if (av.ciencia.length && !av.bloqueios.length && e.estado !== 'pendente') {
      h += `<label class="aceite" style="margin-top:12px"><input type="checkbox" data-aceite ${aceite ? 'checked' : ''}><span>O cliente está ciente e de acordo com o choque de parcelas acima.</span></label>`;
    }
    if (dec.alcada && e.estado === 'enviar') {
      const vagos = (ctx && ctx.vagos) || {};
      h += `<div class="titulo-papel" style="margin:14px 0 8px">Cadeia de aprovação</div><div class="cadeia">${R.NIVEIS.map(nv => {
        const pode = R.NIVEL[nv] >= R.NIVEL[dec.alcada];
        const cls = [pode ? 'pode' : '', nv === dec.destino ? 'destino' : '', vagos[nv] ? 'vago' : ''].join(' ');
        const rot = vagos[nv] ? 'vago' : nv === dec.destino ? 'recebe' : pode ? 'pode aprovar' : 'acompanha';
        return `<div class="no ${cls}">${ROTULO_CURTO[nv]}<small>${rot}</small></div>`;
      }).join('')}</div>`;
    }
    const sobras = e.av.porCota.map((x, i) => x.avisoSobra ? (cotas.length > 1 ? `Cota ${i + 1}: ` : '') + x.avisoSobra : '').filter(Boolean);
    if (sobras.length && e.estado !== 'pendente') h += `<div class="aviso aviso-ambar" style="margin-top:12px">${esc(sobras.join(' '))}</div>`;
    if (r.dicaVenc) h += `<div class="aviso aviso-azul" style="margin-top:12px">${esc(r.dicaVenc)}</div>`;
    painel.innerHTML = h;
  }

  // ------------------------------------------------- eventos
  raiz.addEventListener('input', () => render());
  painel?.addEventListener('change', ev => { if (ev.target.matches('[data-aceite]')) { aceite = ev.target.checked; render(); } });
  q('tabs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-cota]');
    if (b) { salvarAtiva(); ativa = +b.dataset.cota; mostrarAtiva(); render(); return; }
    if (ev.target.closest('[data-add]')) {
      salvarAtiva();
      const src = cotas[ativa];
      cotas.push({ emp: src.emp, valorCota: src.valorCota, raw: { ...efetivo(ativa) }, tipo: null });
      ativa = cotas.length - 1; atualizarVinculos(); mostrarAtiva(); render();
      toast(`Cota ${ativa + 1} adicionada com o financeiro copiado. Mude o empreendimento ou o valor se for diferente.`, 'info');
    }
    if (ev.target.closest('[data-rem]')) {
      cotas.splice(ativa, 1); ativa = Math.max(0, ativa - 1);
      cotas.forEach(c => { c.tipo = null; }); atualizarVinculos(); mostrarAtiva(); render();
    }
  });

  syncEntrada();
  cotas = [{ emp: '', valorCota: '', raw: ler(CAMPOS_ENTRADA.concat(CAMPOS_SINAL)), tipo: null }];
  atualizarVinculos();
  render();

  return {
    obter: () => ultimo,
    atualizarContexto(novo) { ctx = novo || {}; render(); },
  };
}

/** Bloco do detalhe da solicitação: cotas, cronograma e regras, recalculados a partir da negociação salva. */
export function resumoNegociacao(s, config) {
  if (!s.negociacao || !carregarRegras()) return '';
  const av = R.avaliarVenda(s.negociacao, s.negociacao.cfg || config);
  const cotasHtml = av.cotas.map((f, i) => {
    const r = av.porCota[i];
    return `<div style="margin-top:${i ? 18 : 0}px"><div class="titulo-papel" style="margin-bottom:8px">Cota ${i + 1} · ${esc(f.emp)} · ${U.reais(f.valorCota)}</div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Etapa</th><th>Parcela</th><th>Data</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>
      ${r.cronograma.map(c => `<tr><td>${esc(c.etapa)}</td><td class="num">${esc(c.parc)}</td><td>${U.fmtData(c.data)}${c.nota ? ` <span class="secundario">(${esc(c.nota)})</span>` : ''}</td>
        <td>${esc(c.forma)}</td><td class="num">${c.valor === null ? '—' : U.reais(c.valor)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }).join('');
  const regras = (s.regras || []).map(g => `<li><span>${esc(g.titulo)}<span class="det">${esc(g.det || '')}</span></span>${nChip(g.acao)}</li>`).join('');
  return `<div class="card"><div class="card-topo"><h3>Condições de pagamento</h3><small>${esc(R.MODELOS[s.negociacao.modelo] || '')} · venda em ${U.fmtData(U.lerData(s.negociacao.venda))}</small></div>
    <div class="card-corpo">
      ${regras ? `<div class="titulo-papel" style="margin-bottom:8px">Regras que pediram autorização</div><ul class="motivos" style="margin-bottom:18px">${regras}</ul>` : ''}
      ${s.aceite_cliente ? '<div class="aviso aviso-verde" style="margin-bottom:18px">Choque de parcelas com aceite do cliente registrado pelo consultor.</div>' : ''}
      ${cotasHtml}
    </div></div>`;
}
