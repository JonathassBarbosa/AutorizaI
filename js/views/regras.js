import { html, api, icone, toast, ocupado, confirmar } from '../core.js';

const BASE = b => (b === 'calc' ? 'Calculadora' : b === 'comercial' ? 'Definido pelo comercial' : `Política ${b}`);
const PARAMS = [
  ['diasReg', 'Sinal sem autorização até (dias)', 'Política 7.1.1 e 7.1.2: 150'],
  ['diasDir', 'Sinal com o Regional até (dias)', 'Política 7.1.3: 210'],
  ['p1Cons', '1ª parcela mínima sem autorização (R$ por cota)', 'Política 7.1.1: 1.330 (metade no Combo)'],
  ['p1Ger', '1ª parcela mínima com o Gerente (R$ por cota)', 'Política 7.1.2: 1.000 (metade no Combo)'],
  ['restMin', 'Parcela mínima da entrada restante (R$ por cota)', 'Política 7.1.4: 265'],
  ['base', 'Entrada por cota (R$)', '3.990'],
  ['baseGran', 'Entrada por cota no Gran Garden e Gran Valley (R$)', '4.490'],
  ['pctSinal', 'Sinal (% do valor da cota)', '5%'],
];
let cfg = null;

export default {
  titulo: 'Regras de alçada',
  perfis: ['master'],
  async render() {
    const R = window.RegrasPagamento;
    cfg = (await api('regras.obter')).config;
    const p = cfg.params;
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Regras de comercialização</h2>
          <p>Valem para o tipo “Condição de pagamento fora da regra”. O que você salvar aqui vale na hora para os próximos pedidos.</p></div>
        <div class="acoes">
          <button class="btn btn-claro" id="restaurar" type="button">Restaurar padrão</button>
          <button class="btn btn-primario" id="salvar" type="button">${icone('check')} Salvar regras</button>
        </div>
      </div>
      <div class="card"><div class="card-topo"><h3>Parâmetros</h3></div><div class="card-corpo">
        <div class="grade grade-4">${PARAMS.map(([k, rot, dica]) => html`<div class="campo"><label for="p-${k}">${rot}</label>
          <input class="entrada" id="p-${k}" data-param="${k}" type="number" step="0.01" min="0" value="${p[k]}"><small>${dica}</small></div>`)}</div>
        <label class="check" style="margin-bottom:10px"><input type="checkbox" id="p-tol" ${p.tol ? 'checked' : ''}> Prazos contam até o próximo vencimento dia 05 ou 10 (política 7.1.3)</label>
        <label class="check"><input type="checkbox" id="p-sobeSala" ${p.sobeSala ? 'checked' : ''}> Sala acima do limite de exceções do mês sobe um nível</label>
      </div></div>
      <div class="espaco"></div>
      <div class="card"><div class="card-topo"><h3>Regras e ação</h3><small>“Bloqueia o envio” impede o pedido; “Só aceite do cliente” dispensa autorização</small></div>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Regra</th><th>Base</th><th>Quando vale</th><th style="min-width:200px">Ação</th></tr></thead><tbody>
        ${R.META.map(m => html`<tr>
          <td><div class="forte">${m.nome}</div>${m.obs ? html`<div class="secundario">${m.obs}</div>` : ''}</td>
          <td><span class="selo ${m.base === 'calc' ? 'selo-cinza' : m.base === 'comercial' ? 'selo-ouro' : 'selo-azul'} sem-ponto">${BASE(m.base)}</span></td>
          <td class="secundario" style="min-width:220px">${m.quando(p)}</td>
          <td><select class="entrada" data-acao="${m.id}">${R.ACOES.map(a => html`<option value="${a}" ${cfg.acoes[m.id] === a ? 'selected' : ''}>${R.ROTULO_ACAO[a]}</option>`)}</select></td>
        </tr>`)}
        </tbody></table></div></div>`;
  },

  montar(el, ctx) {
    const R = window.RegrasPagamento;
    const coletar = () => {
      const params = { tol: el.querySelector('#p-tol').checked, sobeSala: el.querySelector('#p-sobeSala').checked };
      el.querySelectorAll('[data-param]').forEach(i => { params[i.dataset.param] = Number(i.value); });
      const acoes = {};
      el.querySelectorAll('[data-acao]').forEach(s => { acoes[s.dataset.acao] = s.value; });
      return { params, acoes };
    };
    el.querySelector('#salvar').addEventListener('click', async ev => {
      try {
        await ocupado(ev.currentTarget, () => api('regras.salvar', coletar()));
        toast('Regras salvas. Já valem para os próximos pedidos.', 'ok');
        ctx.ir('regras?t=' + Date.now());
      } catch (e) { toast(e.message, 'erro'); }
    });
    el.querySelector('#restaurar').addEventListener('click', async ev => {
      if (!(await confirmar('Restaurar padrão', 'Volta todos os parâmetros e ações para o que foi definido com o comercial. Continuar?', 'Restaurar'))) return;
      try {
        await ocupado(ev.currentTarget, () => api('regras.salvar', R.PADRAO));
        toast('Regras restauradas.', 'ok');
        ctx.ir('regras?t=' + Date.now());
      } catch (e) { toast(e.message, 'erro'); }
    });
  },
};
