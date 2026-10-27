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
  .replace(/MASTER_EMAIL: '[^']*'/, "MASTER_EMAIL: 'master@gav.dev'");
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
const dir = ok('estrutura.salvarDiretoria', { nome: 'Diretoria Nordeste', ativo: true }, tm);
const rgl = ok('estrutura.salvarRegional', { nome: 'Regional Pernambuco', diretoria_id: dir.id, gestor_id: reg.id, superintendente_id: sup.id, ativo: true }, tm);
const idSala = n => ok('cadastro.opcoes', {}).salas.find(x => x.nome === n).id;
const sala = ok('estrutura.salvarSala', { id: idSala('Porto de Galinhas - Dia'), nome: 'Porto de Galinhas - Dia', regional_id: rgl.id, limite_pct: 10, ativo: true }, tm);
const sala2 = ok('estrutura.salvarSala', { id: idSala('Muro Alto'), nome: 'Muro Alto', regional_id: rgl.id, limite_pct: 0, ativo: true }, tm);
falha('estrutura.salvarSala', { nome: 'muro alto', regional_id: rgl.id }, tm);
const ger = novoUsuario('Gabriela Gerente', 'ger@gav.dev', 'gerente', { sala_id: sala.id });
const ass = novoUsuario('Ana Assistente', 'ass@gav.dev', 'assistente', { sala_id: sala.id });
const con = novoUsuario('Carlos Consultor', 'con@gav.dev', 'consultor', { sala_id: sala.id });
const con2 = novoUsuario('Cíntia Consultora', 'con2@gav.dev', 'consultor', { sala_id: sala2.id });
falha('usuarios.salvar', { nome: 'Sem sala', email: 'x@gav.dev', perfil: 'consultor' }, tm);
const est = ok('estrutura.obter', {}, tm);
assert.strictEqual(est.salas.filter(x => x.regional_id === rgl.id).length, 2);
assert.strictEqual(est.regionais[0].gestor_nome, 'Rafael Regional');
assert.strictEqual(est.regionais[0].superintendente_nome, 'Sofia Superintendente');
assert.ok(ok('usuarios.listar', {}, tm).find(x => x.id === sup.id).vinculo.startsWith('Regionais: Regional Pernambuco'));
passo('estrutura: diretoria → superintendente → regional → salas com gerente, consultores e assistente');

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


// --- autocadastro com aprovação do master
const opc = ok('cadastro.opcoes', {});
assert.ok(opc.salas.length >= 24, 'salas padrão devem existir');
assert.ok(opc.salas.some(x => x.nome === 'Porto de Galinhas - Dia'));
const salaGunga = opc.salas.find(x => x.nome === 'Gunga');
falha('cadastro.solicitar', { nome: 'Teste Sem Sala', email: 'semsala@gav.dev', perfil: 'consultor', senha: 'Senha1234' });
falha('cadastro.solicitar', { nome: 'Teste Master', email: 'm2@gav.dev', perfil: 'master', senha: 'Senha1234' });
ok('cadastro.solicitar', { nome: 'Paula Pereira', email: 'paula@gav.dev', perfil: 'consultor', sala_id: salaGunga.id, telefone: '(82) 99876-5432', senha: 'Paula1234' });
falha('cadastro.solicitar', { nome: 'Paula Pereira', email: 'paula@gav.dev', perfil: 'consultor', sala_id: salaGunga.id, telefone: '(82) 99876-5432', senha: 'Paula1234' });
falha('auth.login', { email: 'paula@gav.dev', senha: 'Paula1234' }, null, 'CADASTRO_PENDENTE');
assert.strictEqual(ok('notificacoes.listar', {}, tm).cadastros_pendentes, 1);
assert.ok(estado.emails.some(e => e.to === 'master@gav.dev' && /aguardando/.test(e.subject)));
const paula = ok('usuarios.listar', {}, tm).find(x => x.email === 'paula@gav.dev');
assert.strictEqual(paula.cadastro, 'pendente');
ok('usuarios.aprovarCadastro', { id: paula.id }, tm);
assert.ok(estado.emails.some(e => e.to === 'paula@gav.dev' && /liberado/.test(e.subject)));
const tp = ok('auth.login', { email: 'paula@gav.dev', senha: 'Paula1234' }).token;
assert.strictEqual(ok('auth.eu', {}, tp).sala_nome, 'Gunga');
ok('cadastro.solicitar', { nome: 'Rui Recusado', email: 'rui@gav.dev', perfil: 'gerente', sala_id: salaGunga.id, telefone: '82998765400', senha: 'Rui12345' });
ok('usuarios.recusarCadastro', { id: ok('usuarios.listar', {}, tm).find(x => x.email === 'rui@gav.dev').id, motivo: 'Não faz parte da equipe' }, tm);
falha('auth.login', { email: 'rui@gav.dev', senha: 'Rui12345' }, null, 'CADASTRO_RECUSADO');
passo('autocadastro: escolhe função e sala, entra só depois da aprovação do master (e-mails enviados)');

// --- diretoria: o master aponta as diretorias na aprovação
ok('cadastro.solicitar', { nome: 'Diana Diretora', email: 'diana@gav.dev', perfil: 'diretor', telefone: '(11) 91234-5678', senha: 'Diana1234' });
const diana = ok('usuarios.listar', {}, tm).find(x => x.email === 'diana@gav.dev');
falha('usuarios.aprovarCadastro', { id: diana.id }, tm);
ok('usuarios.aprovarCadastro', { id: diana.id, vinculo_ids: [dir.id] }, tm);
const tdd = ok('auth.login', { email: 'diana@gav.dev', senha: 'Diana1234' }).token;
assert.strictEqual(ok('dashboard.obter', {}, tdd).salas.length, 2);
assert.match(ok('auth.eu', {}, tdd).vinculo, /Diretoria Nordeste/);
passo('diretoria: só enxerga as diretorias que o master vinculou');

// --- assistente recebe retorno também das negativas
const antes = ok('notificacoes.listar', {}, ta).nao_lidas;
const s4 = ok('solicitacoes.criar', { tipo_id: tipoGer.id, cliente: 'Lia Souza', cpf: '11144477735', campos, justificativa: 'Mais uma exceção de teste.' }, tc);
ok('solicitacoes.responder', { id: s4.id, decisao: 'negada', resposta: 'Fora da política, sem exceção.' }, tr);
assert.strictEqual(ok('notificacoes.listar', {}, ta).nao_lidas, antes + 1);
passo('assistente de contratos recebe o retorno de aprovadas e negadas');

// --- recuperação de senha por e-mail
const nEmails = estado.emails.length;
ok('auth.esqueciSenha', { email: 'naoexiste@gav.dev' });
assert.strictEqual(estado.emails.length, nEmails, 'não envia para e-mail inexistente');
ok('auth.esqueciSenha', { email: 'paula@gav.dev' });
const mail = estado.emails[estado.emails.length - 1];
assert.strictEqual(mail.to, 'paula@gav.dev');
const codigoEmail = mail.subject.match(/(\d{6})$/)[1];
falha('auth.redefinirComCodigo', { email: 'paula@gav.dev', codigo: '000000', nova_senha: 'NovaPaula1' }, null, 'CODIGO');
ok('auth.redefinirComCodigo', { email: 'paula@gav.dev', codigo: codigoEmail, nova_senha: 'NovaPaula1' });
falha('dashboard.obter', {}, tp, 'SESSAO');
ok('auth.login', { email: 'paula@gav.dev', senha: 'NovaPaula1' });
falha('auth.redefinirComCodigo', { email: 'paula@gav.dev', codigo: codigoEmail, nova_senha: 'Outra1234' }, null, 'CODIGO');
passo('recuperação de senha: código por e-mail, uso único, derruba sessões antigas');


// --- WhatsApp (wa.me): contatos para avisar aprovador e solicitante
falha('cadastro.solicitar', { nome: 'Sem Celular', email: 'semcel@gav.dev', perfil: 'consultor', sala_id: salaGunga.id, telefone: '1234', senha: 'Senha1234' });
falha('cadastro.solicitar', { nome: 'Fulano', email: 'umnome@gav.dev', perfil: 'consultor', sala_id: salaGunga.id, telefone: '(82) 99999-0000', senha: 'Senha1234' });
ok('auth.atualizarTelefone', { telefone: '(81) 98765-4321' }, tg);
falha('auth.atualizarTelefone', { telefone: '999' }, tg);
ok('auth.atualizarTelefone', { telefone: '81 91111-2222' }, tc);
const s5 = ok('solicitacoes.criar', { tipo_id: tipoGer.id, cliente: 'Caio Prado', cpf: '39053344705', campos, justificativa: 'Teste do aviso por WhatsApp.' }, tc);
// a sala está acima do limite do mês, então a alçada sobe para o regional
assert.strictEqual(s5.alcada, 'regional');
assert.deepStrictEqual(s5.aguardando.map(a => a.whatsapp), [''], 'regional ainda sem celular');
ok('auth.atualizarTelefone', { telefone: '(81) 97777-6666' }, tr);
assert.strictEqual(ok('solicitacoes.obter', { id: s5.id }, tc).aguardando[0].whatsapp, '5581977776666');
const r5 = ok('solicitacoes.responder', { id: s5.id, decisao: 'aprovada', resposta: 'Pode seguir.' }, tr);
assert.strictEqual(r5.consultor_whatsapp, '5581911112222');
passo('WhatsApp: celular obrigatório no cadastro; aprovador e solicitante com número no formato wa.me');

console.info('\nTodos os testes passaram.');
