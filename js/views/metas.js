import { html, api, icone, toast, ocupado, mesAtual } from '../core.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
let dados = null;
let ano = mesAtual().slice(0, 4);
let mes = mesAtual().slice(5, 7);
let rascunho = {}; // edições ainda não salvas: { 'sala|AAAA-MM': { meta_vendas, limite_pct } }

const chave = (salaId, m) => `${salaId}|${m}`;
const fmt = v => (v === null || v === undefined || v === '' ? '' : String(v));
const num = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));

/** Valor que aparece no campo: o rascunho, senão o salvo. */
function valor(s, m, campo) {
  const r = rascunho[chave(s.id, m)];
  if (r && campo in r) return r[campo];
  const salvo = s.meses[m];
  return fmt(salvo ? (campo === 'meta_vendas' ? salvo.meta : salvo.limite_pct) : '');
}

function maxExcecoes(s, m) {
  const meta = num(valor(s, m, 'meta_vendas'));
  const limTxt = valor(s, m, 'limite_pct');
  const lim = limTxt === '' ? s.limite_padrao : num(limTxt);
  if (!(meta > 0) || !(lim > 0)) return null;
  return Math.round(meta * lim) / 100;
}

function celulaMax(s, m) {
  const max = maxExcecoes(s, m);
  const exc = (s.meses[m] || {}).excecoes || 0;
  if (max === null) return html`<span class="secundario">${exc ? `${exc} exceção(ões)` : '—'}</span>`;
  const acima = exc >= max;
  return html`<strong style="color:${acima ? 'var(--red)' : 'inherit'}">${String(max).replace('.', ',')}</strong>
    <div class="secundario" style="font-size:12px">${exc} realizada(s)${acima ? ' · limite atingido' : ''}</div>`;
}

export default {
  titulo: 'Metas das salas',
  perfis: ['master'],
  async render() {
    dados = await api('metas.obter', { ano });
    const m = `${ano}-${mes}`;
    const anos = [Number(ano) - 1, Number(ano), Number(ano) + 1].map(String);
    const pendentes = Object.keys(rascunho).length;
    return html`
      <div class="cabecalho">
        <div><h2 style="font-size:22px">Metas e limite fora do padrão</h2>
          <p>Para cada sala e mês: a meta de vendas e o % máximo de vendas fora do padrão. Ex.: meta 100 e 10% = até 10 exceções; da 11ª em diante, a alçada sobe um nível.</p></div>
        <div class="acoes">
          <button class="btn btn-claro" id="copiar" type="button">Copiar do mês anterior</button>
          <button class="btn btn-primario" id="salvar" type="button">${icone('check')} Salvar${pendentes ? ` (${pendentes})` : ''}</button>
        </div>
      </div>
      <div class="card"><div class="card-corpo" style="display:grid;gap:14px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="campo" style="margin:0;width:120px"><label for="ano">Ano</label>
            <select class="entrada" id="ano">${anos.map(a => html`<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`)}</select></div>
          <div class="campo" style="margin:0;width:160px"><label for="pct-todas">% para todas as salas</label>
            <input class="entrada" id="pct-todas" type="number" min="0" max="100" step="0.5" placeholder="Ex.: 10"></div>
          <button class="btn btn-claro" id="aplicar-pct" type="button">Aplicar em ${MESES_LONGOS[Number(mes) - 1]}</button>
        </div>
        <div class="chips" role="tablist" aria-label="Mês">${MESES.map((nome, i) => {
          const mm = String(i + 1).padStart(2, '0');
          const tem = dados.salas.some(s => (s.meses[`${ano}-${mm}`] || {}).meta);
          return html`<button type="button" role="tab" class="chip ${mm === mes ? 'ativo' : ''}" data-mes="${mm}" aria-selected="${mm === mes}">${nome}${tem ? ' ·' : ''}</button>`;
        })}</div>
      </div></div>
      <div class="espaco"></div>
      <div class="card">
        <div class="card-topo"><h3>${MESES_LONGOS[Number(mes) - 1].replace(/^./, c => c.toUpperCase())} de ${ano}</h3>
          <small>% vazio = usa o limite padrão da sala (definido em Estrutura)</small></div>
        <div class="tabela-wrap"><table class="tabela tabela-metas">
          <thead><tr><th>Sala</th><th style="width:150px">Meta de vendas</th><th style="width:150px">% fora do padrão</th><th class="num" style="width:170px">Máx. de exceções</th></tr></thead>
          <tbody>${dados.salas.map(s => html`<tr data-sala="${s.id}">
            <td><div class="forte">${s.nome}</div><div class="secundario">${s.regional || 'Sem regional'}</div></td>
            <td><input class="entrada" type="number" min="0" step="1" inputmode="numeric" aria-label="Meta de vendas de ${s.nome}"
              data-campo="meta_vendas" value="${valor(s, m, 'meta_vendas')}" placeholder="—"></td>
            <td><input class="entrada" type="number" min="0" max="100" step="0.5" inputmode="decimal" aria-label="% fora do padrão de ${s.nome}"
              data-campo="limite_pct" value="${valor(s, m, 'limite_pct')}" placeholder="${s.limite_padrao ? `${s.limite_padrao} (padrão)` : '—'}"></td>
            <td class="num" data-max>${celulaMax(s, m)}</td>
          </tr>`)}</tbody></table></div>
      </div>`;
  },

  montar(el, ctx) {
    const m = () => `${ano}-${mes}`;
    const recarregar = () => ctx.ir('metas?t=' + Date.now());
    const marcar = (salaId, campo, v) => {
      const k = chave(salaId, m());
      rascunho[k] = Object.assign(rascunho[k] || {}, { [campo]: v });
      const b = el.querySelector('#salvar');
      b.innerHTML = `${icone('check')} Salvar (${Object.keys(rascunho).length})`;
    };

    el.querySelector('tbody').addEventListener('input', ev => {
      const campo = ev.target.dataset.campo;
      if (!campo) return;
      const tr = ev.target.closest('tr');
      marcar(tr.dataset.sala, campo, ev.target.value);
      const s = dados.salas.find(x => x.id === tr.dataset.sala);
      tr.querySelector('[data-max]').innerHTML = celulaMax(s, m()).toString();
    });

    el.querySelector('#ano').addEventListener('change', ev => {
      if (Object.keys(rascunho).length) toast('Você tem metas não salvas. Salve antes de trocar o ano.', 'erro');
      else { ano = ev.target.value; recarregar(); }
      ev.target.value = ano;
    });
    el.querySelector('.chips').addEventListener('click', ev => {
      const b = ev.target.closest('[data-mes]');
      if (b) { mes = b.dataset.mes; recarregar(); } // o rascunho dos outros meses continua guardado
    });

    el.querySelector('#aplicar-pct').addEventListener('click', () => {
      const v = el.querySelector('#pct-todas').value;
      if (v === '' || Number(v) < 0 || Number(v) > 100) return toast('Informe um % entre 0 e 100.', 'erro');
      dados.salas.forEach(s => marcar(s.id, 'limite_pct', v));
      recarregar();
    });

    el.querySelector('#copiar').addEventListener('click', async ev => {
      const [a, mm] = [Number(ano), Number(mes)];
      const ant = mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, '0')}`;
      let origem = dados;
      if (mm === 1) { // janeiro copia dezembro do ano anterior
        try { origem = await ocupado(ev.currentTarget, () => api('metas.obter', { ano: String(a - 1) })); } catch (e) { return toast(e.message, 'erro'); }
      }
      let n = 0;
      dados.salas.forEach(s => {
        const src = (origem.salas.find(x => x.id === s.id) || { meses: {} }).meses[ant] || {};
        const r = rascunho[chave(s.id, ant)] || {};
        const meta = 'meta_vendas' in r ? r.meta_vendas : fmt(src.meta);
        const lim = 'limite_pct' in r ? r.limite_pct : fmt(src.limite_pct);
        if (meta === '' && lim === '') return;
        marcar(s.id, 'meta_vendas', meta); marcar(s.id, 'limite_pct', lim); n++;
      });
      const nomeAnt = MESES_LONGOS[(mm + 10) % 12];
      if (!n) return toast(`Nenhuma meta em ${nomeAnt} para copiar.`, 'info');
      toast(`${n} sala(s) copiadas de ${nomeAnt}. Confira e clique em Salvar.`, 'ok');
      recarregar();
    });

    el.querySelector('#salvar').addEventListener('click', async ev => {
      const itens = Object.entries(rascunho).map(([k, v]) => {
        const [sala_id, mesItem] = k.split('|');
        const s = dados.salas.find(x => x.id === sala_id);
        const salvo = (s && s.meses[mesItem]) || {};
        return {
          sala_id, mes: mesItem,
          meta_vendas: 'meta_vendas' in v ? v.meta_vendas : fmt(salvo.meta),
          limite_pct: 'limite_pct' in v ? v.limite_pct : fmt(salvo.limite_pct),
        };
      });
      if (!itens.length) return toast('Nenhuma alteração para salvar.', 'info');
      try {
        const r = await ocupado(ev.currentTarget, () => api('metas.salvar', { itens }));
        rascunho = {};
        toast(`${r.salvas} meta(s) salva(s). Já valem para os próximos pedidos.`, 'ok');
        recarregar();
      } catch (e) { toast(e.message, 'erro'); }
    });
  },
};
