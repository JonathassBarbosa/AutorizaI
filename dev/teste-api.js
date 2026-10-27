/**
 * Teste automatizado do fluxo completo da API (roda o Code.gs real, em memória).
 * Uso: node dev/teste-api.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { criarServicos } = require('./gas-mock');

const estado = { abas: {}, props: {} };
const ctx = vm.createContext(Object.assign({ console: { log() {} } }, criarServicos(estado)));
const codigo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8')
  .replace("'seu-email@gmail.com'", "'master@gav.dev'");
vm.runInContext(codigo, ctx, { filename: 'Code.gs' });

const senhaMaster = ctx.setup().split('senha provisória: ')[1];

function chamar(action, data, token) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, data, token }) } }).getContent());
}
function ok(action, data, token) {
  const r = chamar(action, data, token);
  if (!r.ok) throw new Error(action + ' falhou: ' + JSON.stringify(r.error));
  return r.data;
}
function falha(action, data, token, codigoEsperado) {
  const r = chamar(action, data, token);
  assert.strictEqual(r.ok, false, action + ' deveria falhar');
  if (codigoEsperado) assert.strictEqual(r.error.code, codigoEsperado, action + ': ' + JSON.stringify(r.error));
  return r.error;
}
function entrar(email, senhaProvisoria, novaSenha) {
  const l = ok('auth.login', { email, senha: senhaProvisoria });
  if (l.usuario.trocar_senha) {
    falha('dashboard.obter', {}, l.token, 'TROCAR_SENHA');
    ok('auth.trocarSenha', { senha_atual: senhaProvisoria, nova_senha: novaSenha }, l.token);
  }
  return l.token;
}
const passo = t => console.info('✔ ' + t);

// --- master e estrutura
falha('auth.login', { email: 'master@gav.dev', senha: 'errada' }, null, 'LOGIN');
const tm = entrar('master@gav.dev', senhaMaster, 'Master2026');
passo('login do master + troca de senha obrigatória');

const novoUsuario = (nome, email, perfil, extra) => {
  const r = ok('usuarios.salvar', Object.assign({ nome, email, perfil, ativo: true }, extra || {}), tm);
  return { id: r.usuario.id, senha: r.senha_temporaria, email };
};
const sup = novoUsuario('Sofia Superintendente', 'sup@gav.dev', 'superintendente');
const reg = novoUsuario('Rafael Regional', 'reg@gav.dev', 'regional');
const dir = ok('estrutura.salvarDiretoria', { nome: 'Diretoria Nordeste', superintendente_id: sup.id, ativo: true }, tm);
const rgl = ok('estrutura.salvarRegional', { nome: 'Regional Pernambuco', diretoria_id: dir.id, gestor_id: reg.id, ativo: true }, tm);
const sala = ok('estrutura.salvarSala', { nome: 'Porto de Galinhas - Dia', regional_id: rgl.id, limite_pct: 10, ativo: true }, tm);
const sala2 = ok('estrutura.salvarSala', { nome: 'Muro Alto', regional_id: rgl.id, limite_pct: 0, ativo: true }, tm);
falha('estrutura.salvarSala', { nome: 'muro alto', regional_id: rgl.id }, tm);
const ger = novoUsuario('Gabriela Gerente', 'ger@gav.dev', 'gerente', { sala_id: sala.id });
const ass = novoUsuario('Ana Assistente', 'ass@gav.dev', 'assistente', { sala_id: sala.id });
const con = novoUsuario('Carlos Consultor', 'con@gav.dev', 'consultor', { sala_id: sala.id });
const con2 = novoUsuario('Cíntia Consultora', 'con2@gav.dev', 'consultor', { sala_id: sala2.id });
falha('usuarios.salvar', { nome: 'Sem sala', email: 'x@gav.dev', perfil: 'consultor' }, tm);
const est = ok('estrutura.obter', {}, tm);
assert.strictEqual(est.salas.length, 2);
assert.strictEqual(est.regionais[0].gestor_nome, 'Rafael Regional');
passo('estrutura: diretoria → regional → salas com superintendente, regional, gerente, assistente e consultores');

const tc = entrar(con.email, con.senha, 'Consultor1');
const tg = entrar(ger.email, ger.senha, 'Gerente1');
const ta = entrar(ass.email, ass.senha, 'Assistente1');
const tr = entrar(reg.email, reg.senha, 'Regional1');
const ts = entrar(sup.email, sup.senha, 'Superint1');
const tc2 = entrar(con2.email, con2.senha, 'Consultor2');

// --- permissões
falha('usuarios.listar', {}, tc, 'PERMISSAO');
falha('monitor.status', {}, tg, 'PERMISSAO');
falha('solicitacoes.criar', {}, ta, 'PERMISSAO');
passo('permissões por perfil');

// --- solicitação na alçada do gerente
const tipos = ok('tipos.listar', {}, tc);
const tipoGer = tipos.find(t => t.alcada === 'gerente' && t.campos.length === 2);
const tipoSup = tipos.find(t => t.alcada === 'superintendente');
falha('solicitacoes.criar', { tipo_id: tipoGer.id, cliente: 'João', cpf: '111.111.111-11', justificativa: 'x'.repeat(12) }, tc);
const campos = {}; tipoGer.campos.forEach(c => { campos[c] = '7x'; });
const s1 = ok('solicitacoes.criar', {
  tipo_id: tipoGer.id, cliente: 'João da Silva', cpf: '529.982.247-25', empreendimento: 'SALINAS PARK', valor: 120000,
  campos, justificativa: 'Cliente investidor, fecha hoje se parcelar a entrada.',
}, tc);
assert.strictEqual(s1.status, 'pendente');
assert.strictEqual(s1.alcada, 'gerente');
assert.match(s1.codigo, /^GAV-000001-[A-F0-9]{4}$/);
assert.strictEqual(ok('notificacoes.listar', {}, tg).nao_lidas, 1);
assert.strictEqual(ok('solicitacoes.listar', {}, tc2).total, 0);
falha('solicitacoes.obter', { id: s1.id }, tc2, 'NAO_ENCONTRADO');
passo('consultor cria exceção → gerente da sala é notificado; outra sala não enxerga');

falha('solicitacoes.responder', { id: s1.id, decisao: 'aprovada', resposta: 'ok' }, tc, 'PERMISSAO');
const r1 = ok('solicitacoes.responder', { id: s1.id, decisao: 'aprovada', resposta: 'Aprovado excepcionalmente.' }, tg);
assert.strictEqual(r1.status, 'aprovada');
falha('solicitacoes.responder', { id: s1.id, decisao: 'negada', resposta: 'tarde demais...' }, tr);
assert.ok(ok('notificacoes.listar', {}, tc).itens[0].titulo.includes('aprovada'));
assert.strictEqual(ok('notificacoes.listar', {}, ta).nao_lidas, 1);
passo('gerente aprova → consultor e assistente de contratos são notificados');

const v = ok('solicitacoes.verificar', { codigo: s1.codigo.toLowerCase() }, ta);
assert.strictEqual(v.status, 'aprovada');
falha('solicitacoes.verificar', { codigo: s1.codigo.slice(0, 10) }, ta);
const d1 = ok('solicitacoes.desfecho', { id: s1.id, desfecho: 'venda_finalizada', contrato: 'CT-998877' }, ta);
assert.strictEqual(d1.desfecho, 'venda_finalizada');
falha('solicitacoes.desfecho', { id: s1.id, desfecho: 'sem_venda', justificativa: 'cliente desistiu do negócio' }, ta);
passo('assistente verifica pelo código e registra a venda finalizada');

// --- alçada do superintendente + negativa + perda
const s2 = ok('solicitacoes.criar', {
  tipo_id: tipoSup.id, cliente: 'Maria Souza', cpf: '15350946056', valor: 90000,
  campos: Object.fromEntries(tipoSup.campos.map(c => [c, 'Condição X'])), justificativa: 'Pedido especial do cliente com histórico.',
}, tc);
assert.strictEqual(s2.alcada, 'superintendente');
falha('solicitacoes.responder', { id: s2.id, decisao: 'aprovada', resposta: 'ok' }, tg, 'PERMISSAO');
falha('solicitacoes.responder', { id: s2.id, decisao: 'negada', resposta: 'curto' }, ts);
ok('solicitacoes.responder', { id: s2.id, decisao: 'negada', resposta: 'Fora da política comercial vigente.' }, ts);
falha('solicitacoes.desfecho', { id: s2.id, desfecho: 'sem_venda', justificativa: 'curta' }, ta);
ok('solicitacoes.desfecho', { id: s2.id, desfecho: 'sem_venda', justificativa: 'Cliente não aceitou as condições padrão.' }, ta);
passo('alçada de superintendente respeitada; negativa e perda com justificativa obrigatória');

// --- limite % da sala eleva a alçada
const mes = ok('dashboard.obter', {}, tm).mes;
ok('vendas.salvar', { sala_id: sala.id, mes, total_vendas: 10 }, ta);
const s3 = ok('solicitacoes.criar', {
  tipo_id: tipoGer.id, cliente: 'Pedro Lima', cpf: '86288366757', campos, justificativa: 'Mais uma condição especial.',
}, tc);
assert.strictEqual(s3.alcada, 'regional', 'sala em 10% com limite 10% deve subir para regional');
assert.match(s3.alcada_motivo, /Elevada/);
ok('solicitacoes.cancelar', { id: s3.id }, tc);
passo('sala acima do limite de exceções sobe a alçada automaticamente');

// --- dashboards por escopo
const dm = ok('dashboard.obter', {}, tm);
assert.strictEqual(dm.kpis.total, 3);
assert.strictEqual(dm.salas.find(s => s.id === sala.id).pct, 10);
assert.strictEqual(ok('dashboard.obter', {}, tr).salas.length, 2);
assert.strictEqual(ok('dashboard.obter', {}, tg).salas.length, 1);
assert.strictEqual(ok('dashboard.obter', {}, tc2).kpis.total, 0);
passo('dashboards respeitam o escopo de cada perfil');

// --- monitor
const erro = falha('monitor.testarErro', {}, tm, 'ERRO');
assert.match(erro.local, /Code\.gs › testarErro_\(\) › linha \d+/);
ok('monitor.erroFront', { mensagem: 'x is not defined', arquivo: 'https://site/js/app.js', linha: 10, coluna: 5, funcao: 'navegar', rota: '#/inicio' });
const mon = ok('monitor.status', {}, tm);
const front = mon.logs.find(l => l.origem === 'frontend');
assert.strictEqual(front.local, 'app.js › navegar() › linha 10, coluna 5');
assert.ok(mon.metricas.erros >= 2);
passo('monitor: erro do backend aponta "' + erro.local + '"; erro do front aponta "' + front.local + '"');

// --- desativação derruba a sessão
ok('usuarios.salvar', { id: con2.id, nome: 'Cíntia Consultora', email: con2.email, perfil: 'consultor', sala_id: sala2.id, ativo: false }, tm);
falha('dashboard.obter', {}, tc2, 'SESSAO');
falha('usuarios.salvar', { id: ok('auth.eu', {}, tm).id, nome: 'Master', email: 'master@gav.dev', perfil: 'gerente', sala_id: sala.id }, tm);
passo('usuário desativado perde o acesso na hora; master não remove o próprio acesso');

console.info('\nTodos os testes passaram.');
