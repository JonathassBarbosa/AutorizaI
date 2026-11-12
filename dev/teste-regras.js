/**
 * Teste do motor de regras de pagamento (js/regras-pagamento.js).
 * Uso: node dev/teste-regras.js
 */
const assert = require('assert');
const R = require('../js/regras-pagamento.js');

const VENDA = '2026-11-11';
const cota = extra => Object.assign({
  emp: 'SALINAS PARK RESORT', valorCota: 49900, e1Valor: 1330, e1Forma: 'PIX', e1Parc: 1,
  temE2: false, e2Valor: 0, e2Forma: 'CartaoCredito', e2Parc: 1,
  temR: true, rForma: 'Boleto', rData: '2026-12-10', rParc: 2,
  sDia: 10, sMes: 1, sAno: 2027, sParc: 6, sdParc: 72, sdManual: false, sdData: '', desc: 0,
}, extra || {});
const venda = (extraCota, extraVenda) => Object.assign({ modelo: 'padrao', venda: VENDA, aceite: false, cotas: [cota(extraCota)] }, extraVenda || {});
const ids = l => l.map(g => g.id).sort().join(',');
const caso = (nome, neg, esperado) => {
  const v = R.avaliarVenda(neg);
  if (esperado.alcada !== undefined) assert.strictEqual(v.alcadaRegras, esperado.alcada, nome + ': alçada ' + v.alcadaRegras + ' ' + JSON.stringify(v.gatilhos));
  if (esperado.gatilhos !== undefined) assert.strictEqual(ids(v.gatilhos), esperado.gatilhos, nome + ': gatilhos');
  if (esperado.bloqueios !== undefined) assert.strictEqual(ids(v.bloqueios), esperado.bloqueios, nome + ': bloqueios');
  if (esperado.ciencia !== undefined) assert.strictEqual(ids(v.ciencia), esperado.ciencia, nome + ': ciência');
  console.info('✔ ' + nome);
  return v;
};

caso('Dentro da regra', venda(), { alcada: '', gatilhos: '', bloqueios: '', ciencia: '' });
caso('1ª de R$ 1.000 + restante 4x → Gerente', venda({ e1Valor: 1000, rParc: 4, sDia: 5, sMes: 3 }), { alcada: 'gerente', gatilhos: 'p1_gerente,rest_gerente' });
caso('Sinal em ~6 meses → Regional', venda({ rParc: 5, sMes: 4 }), { alcada: 'regional', gatilhos: 'rest_gerente,sinal_reg' });
caso('Sinal em ~8 meses → Diretoria', venda({ rParc: 5, sMes: 6 }), { alcada: 'diretor' });
caso('Entrada no crédito em 6x → Regional + choque', venda({ e1Valor: 3990, e1Forma: 'CartaoCredito', e1Parc: 6, temR: false }), { alcada: 'regional', gatilhos: 'cred_6x', ciencia: 'conflito' });
caso('Duas formas somando R$ 1.000 → Gerente', venda({ e1Valor: 600, temE2: true, e2Valor: 400, e2Forma: 'CartaoCredito', e2Parc: 1 }), { alcada: 'gerente', gatilhos: 'p1_gerente', bloqueios: '' });
caso('Duas formas sem fechar R$ 1.000 em 30 dias → bloqueia', venda({ e1Valor: 500, temE2: true, e2Valor: 500, e2Forma: 'CartaoCredito', e2Parc: 2 }), { bloqueios: 'duas_formas' });
caso('Mês sem pagamento → Diretoria', venda({ rData: '2027-02-10', rParc: 1, sMes: 2 }), { alcada: 'diretor', gatilhos: 'rest_gerente,salto' });
caso('1ª abaixo de R$ 1.000 → bloqueia', venda({ e1Valor: 800 }), { bloqueios: 'p1_abaixo' });
caso('Sinal sobre a entrada → só aceite', venda({ sDia: 5, sMes: 0 }), { alcada: '', ciencia: 'conflito' });
caso('Saldo sobre o sinal → só aceite', venda({ sdManual: true, sdData: '2027-04-10' }), { alcada: '', ciencia: 'choque_saldo' });
caso('Saldo fora do dia 05/10 → bloqueia', venda({ sdManual: true, sdData: '2027-08-20' }), { bloqueios: 'venc_saldo' });
caso('Restante no mesmo mês da 1ª → aceite', venda({ rData: '2026-11-25', sMes: 0 }), { ciencia: 'choque_rest' });
caso('Venda dia 22 com restante pulando um mês → consultor', venda({ rData: '2027-01-10', sMes: 2 }, { venda: '2026-11-22' }), { alcada: '', gatilhos: '' });
caso('Venda dia 11 com restante pulando um mês → Diretoria', venda({ rData: '2027-01-10', sMes: 2 }), { alcada: 'diretor' });
caso('Entrada inteira, venda dia 22, sinal em 50 dias → consultor', venda({ e1Valor: 3990, temR: false, sMes: 0 }, { venda: '2026-11-22' }), { alcada: '', gatilhos: '' });
caso('Entrada inteira, venda dia 11, sinal pulando mês → Diretoria', venda({ e1Valor: 3990, temR: false, sMes: 0 }), { alcada: 'diretor', gatilhos: 'sinal_salto' });
caso('Combo com 1ª de R$ 665 → consultor', venda({ e1Valor: 665 }, { modelo: 'combo' }), { alcada: '', gatilhos: '' });
caso('Padrão com saldo em 130x → Diretoria', venda({ sdParc: 130 }), { alcada: 'diretor', gatilhos: 'faixa_saldo' });
caso('Padrão com saldo em 40x → consultor', venda({ sdParc: 40 }), { alcada: '' });
caso('Sinal em 8x → Diretoria', venda({ sParc: 8 }), { alcada: 'diretor', gatilhos: 'faixa_sinal' });
const av = caso('À vista com 9% de desconto → Gerente', venda({ e1Valor: 3990, temR: false, sDia: 20, sMes: 11, sAno: 2026, sParc: 1, desc: 9 }, { modelo: 'avista' }), { alcada: 'gerente', gatilhos: 'desc_ger' });
assert.strictEqual(av.cotas[0].sValor, 2270.45, 'sinal à vista = 5% do valor com desconto');
assert.strictEqual(Math.round(av.cotas[0].sdValor * 100) / 100, 39148.55, 'saldo à vista');
caso('Linear com parcelas iguais → consultor', venda({ valorCota: 49800, valorEntrada: 2400, e1Valor: 600, rParc: 3, sMes: 2, sValor: 3600, sdValor: 43800, sdParc: 73 }, { modelo: 'linear' }), { alcada: '', gatilhos: '' });
caso('Gran Garden: entrada de R$ 4.490', venda({ emp: 'GRAN GARDEN RESORT', e1Valor: 1500 }), { alcada: '' });
const duas = R.avaliarVenda({ modelo: 'padrao', venda: VENDA, cotas: [cota(), cota({ emp: 'GRAN GARDEN RESORT', valorCota: 69900, e1Valor: 1000 })] });
assert.strictEqual(duas.alcadaRegras, 'gerente');
assert.ok(duas.gatilhos[0].titulo.indexOf('Cota 2: ') === 0);
console.info('✔ Duas cotas: alçada mais alta e motivo com o número da cota');

const d = R.decidirAlcada('regional', { pct: 12, limite: 10, vendas: 50, vagos: { superintendente: true } });
assert.strictEqual(d.alcada, 'superintendente');
assert.strictEqual(d.destino, 'diretor');
console.info('✔ Sala acima do limite sobe um nível e cargo vago passa o aviso adiante');
console.info('\nTodos os testes do motor de regras passaram.');
