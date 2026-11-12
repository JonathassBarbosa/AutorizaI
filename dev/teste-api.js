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
// No Apps Script, RegrasPagamento é um segundo arquivo do projeto; aqui roda no mesmo contexto.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'regras-pagamento.js'), 'utf8'), ctx, { filename: 'RegrasPagamento.gs' });
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
falha('solicitacoes.criar', { tipo_id: tipoGer.id, id_casal: 'abc', justificativa: 'x'.repeat(12) }, tc);
const campos = {}; tipoGer.campos.forEach(c => { campos[c] = '7x'; });
const s1 = ok('solicitacoes.criar', {
  tipo_id: tipoGer.id, id_casal: '1234538', empreendimento: 'SALINAS PARK', valor: 120000,
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
  tipo_id: tipoSup.id, id_casal: '1234539', valor: 90000,
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
  tipo_id: tipoGer.id, id_casal: '1234540', campos, justificativa: 'Mais uma condição especial.',
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

// --- meta do mês: o % passa a ser sobre a meta, com limite próprio do mês
falha('metas.salvar', { itens: [{ sala_id: sala.id, mes, meta_vendas: 100, limite_pct: 5 }] }, tg, 'PERMISSAO');
falha('metas.salvar', { itens: [{ sala_id: sala.id, mes, meta_vendas: 10.5, limite_pct: 5 }] }, tm);
falha('metas.salvar', { itens: [{ sala_id: sala.id, mes, meta_vendas: 100, limite_pct: 150 }] }, tm);
let metas = ok('metas.salvar', { itens: [{ sala_id: sala.id, mes, meta_vendas: 100, limite_pct: 5 }] }, tm);
assert.strictEqual(metas.salvas, 1);
assert.strictEqual(metas.salas.find(x => x.id === sala.id).meses[mes].meta, 100);
assert.strictEqual(metas.salas.find(x => x.id === sala.id).meses[mes].vendas, 10, 'a meta não apaga as vendas lançadas');
const s3b = ok('solicitacoes.criar', { tipo_id: tipoGer.id, id_casal: '1234543', campos, justificativa: 'Teste com meta do mês.' }, tc);
assert.strictEqual(s3b.alcada, 'gerente', '1 exceção sobre meta 100 (1%) fica abaixo de 5%');
ok('solicitacoes.cancelar', { id: s3b.id }, tc);
ok('metas.salvar', { itens: [{ sala_id: sala.id, mes, meta_vendas: 20, limite_pct: 5 }] }, tm);
const s3c = ok('solicitacoes.criar', { tipo_id: tipoGer.id, id_casal: '1234544', campos, justificativa: 'Teste com meta do mês.' }, tc);
assert.strictEqual(s3c.alcada, 'regional', '1 exceção sobre meta 20 (5%) atinge o limite de 5%');
assert.match(s3c.alcada_motivo, /meta de 20 vendas/);
ok('solicitacoes.cancelar', { id: s3c.id }, tc);
const dashM = ok('dashboard.obter', { mes }, tm).salas.find(x => x.id === sala.id);
assert.strictEqual(dashM.meta, 20);
assert.strictEqual(dashM.max_excecoes, 1);
ok('metas.salvar', { itens: [{ sala_id: sala.id, mes, meta_vendas: '', limite_pct: '' }] }, tm);
assert.strictEqual(ok('dashboard.obter', { mes }, tm).salas.find(x => x.id === sala.id).limite_pct, 10, 'sem % no mês volta ao limite padrão da sala');
passo('metas do mês: o master define meta e % por sala; o limite passa a contar sobre a meta');

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
const s4 = ok('solicitacoes.criar', { tipo_id: tipoGer.id, id_casal: '1234541', campos, justificativa: 'Mais uma exceção de teste.' }, tc);
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
const s5 = ok('solicitacoes.criar', { tipo_id: tipoGer.id, id_casal: '1234542', campos, justificativa: 'Teste do aviso por WhatsApp.' }, tc);
// a sala está acima do limite do mês, então a alçada sobe para o regional
assert.strictEqual(s5.alcada, 'regional');
assert.deepStrictEqual(s5.aguardando.map(a => a.whatsapp), [''], 'regional ainda sem celular');
ok('auth.atualizarTelefone', { telefone: '(81) 97777-6666' }, tr);
assert.strictEqual(ok('solicitacoes.obter', { id: s5.id }, tc).aguardando[0].whatsapp, '5581977776666');
const r5 = ok('solicitacoes.responder', { id: s5.id, decisao: 'aprovada', resposta: 'Pode seguir.' }, tr);
assert.strictEqual(r5.consultor_whatsapp, '5581911112222');
assert.strictEqual(s5.cliente, 'ID Casal 1234542');
assert.strictEqual(ok('solicitacoes.listar', { busca: '1234542' }, tc).total, 1);
passo('ID Casal: identifica o cliente (sem nome e CPF) e entra na busca');
passo('WhatsApp: celular obrigatório no cadastro; aprovador e solicitante com número no formato wa.me');

// --- 1.6: alçada automática pelas regras de comercialização
const con3 = novoUsuario('Marcos Muro Alto', 'con3@gav.dev', 'consultor', { sala_id: sala2.id });
const tc3 = entrar(con3.email, con3.senha, 'Consultor3');
const tipoAuto = ok('tipos.listar', {}, tc3).find(t => t.alcada === 'auto');
assert.ok(tipoAuto, 'setup cria o tipo com alçada automática');
const cfgRegras = ok('regras.obter', {}, tc3);
assert.strictEqual(cfgRegras.config.params.diasReg, 150);
assert.strictEqual(cfgRegras.editavel, false);
const ctxSala = ok('regras.contexto', {}, tc3);
assert.strictEqual(ctxSala.sala_id, sala2.id);
assert.strictEqual(ctxSala.vagos.gerente, true, 'Muro Alto não tem gerente');
assert.strictEqual(ctxSala.vagos.regional, false);
const cotaBase = extra => Object.assign({
  emp: 'SALINAS PARK RESORT', valorCota: 49900, e1Valor: 1330, e1Forma: 'PIX', e1Parc: 1, temE2: false,
  temR: true, rForma: 'Boleto', rData: '2026-12-10', rParc: 2, sDia: 10, sMes: 1, sAno: 2027, sParc: 6, sdParc: 72,
  sForma: 'Boleto', sdForma: 'Boleto',
  sValor: 1, sdValor: 1, // valores do navegador são ignorados: o servidor recalcula
}, extra || {});
const pedidoAuto = (extraCota, extraNeg) => ({
  tipo_id: tipoAuto.id, id_casal: '7654321', justificativa: 'Cliente pediu o sinal mais para frente.',
  negociacao: Object.assign({ modelo: 'padrao', venda: '2026-11-11', aceite: false, cotas: [cotaBase(extraCota)] }, extraNeg || {}),
});
falha('solicitacoes.criar', pedidoAuto(), tc3, 'DENTRO_DA_REGRA');
falha('solicitacoes.criar', pedidoAuto({ e1Valor: 800 }), tc3, 'BLOQUEADA');
falha('solicitacoes.criar', pedidoAuto({ e1Valor: 500, temE2: true, e2Valor: 500, e2Forma: 'CartaoCredito', e2Parc: 2 }), tc3, 'BLOQUEADA');
falha('solicitacoes.criar', pedidoAuto({ sDia: 5, sMes: 0, rParc: 2 }), tc3, 'ACEITE');
const sa = ok('solicitacoes.criar', pedidoAuto({ rParc: 5, sMes: 4 }), tc3);
assert.strictEqual(sa.alcada, 'regional', 'sinal em ~6 meses vai para o Regional');
assert.match(sa.alcada_motivo, /^Regras: /);
assert.strictEqual(sa.valor, 49900);
assert.strictEqual(sa.empreendimento, 'SALINAS PARK RESORT');
assert.deepStrictEqual(sa.regras.map(g => g.id).sort(), ['rest_gerente', 'sinal_reg']);
assert.strictEqual(sa.aguardando[0].nome, 'Rafael Regional');
const saDet = ok('solicitacoes.obter', { id: sa.id }, tr);
assert.strictEqual(saDet.negociacao.cotas.length, 1);
assert.strictEqual(saDet.negociacao.cotas[0].sValor, '1', 'guarda o que o consultor enviou; os valores certos são recalculados na tela');
assert.strictEqual(saDet.pode_aprovar, true);
const sb = ok('solicitacoes.criar', pedidoAuto({ sDia: 5, sMes: 0, e1Valor: 1000 }, { aceite: true }), tc3);
assert.strictEqual(sb.alcada, 'gerente');
assert.strictEqual(sb.aceite_cliente, true);
ok('solicitacoes.responder', { id: sa.id, decisao: 'aprovada', resposta: 'Aprovado pelo regional.' }, tr);
passo('alçada automática: dentro da regra não envia, proibido bloqueia, choque pede aceite, servidor recalcula e define o Regional');

// --- regras editáveis pelo master
falha('regras.salvar', { acoes: { sinal_reg: 'gerente' } }, tr, 'PERMISSAO');
falha('regras.salvar', { params: { diasReg: 300 } }, tm);
ok('regras.salvar', { params: cfgRegras.config.params, acoes: Object.assign({}, cfgRegras.config.acoes, { sinal_reg: 'superintendente' }) }, tm);
const sc = ok('solicitacoes.criar', pedidoAuto({ rParc: 5, sMes: 4 }), tc3);
assert.strictEqual(sc.alcada, 'superintendente');
ok('solicitacoes.cancelar', { id: sc.id }, tc3);
ok('regras.salvar', cfgRegras.config, tm);
assert.strictEqual(ok('solicitacoes.obter', { id: sc.id }, tc3).negociacao.cfg.acoes.sinal_reg, 'superintendente', 'o pedido guarda as regras usadas no envio');
passo('regras: só o master edita, a alçada passa a valer na hora e cada pedido guarda as regras do envio');

// --- painel e relatório por escopo
const relM = ok('relatorio.obter', { de: mes, ate: mes }, tm);
assert.ok(relM.kpis.total >= 8);
assert.ok(relM.por_tipo.some(t => t.nome === 'Sinal após o prazo padrão'));
assert.ok(relM.por_tipo.some(t => t.nome === tipoGer.nome));
assert.strictEqual(relM.por_alcada.find(a => a.alcada === 'regional').aprovadas >= 1, true);
assert.ok(relM.matriz.salas.length >= 2);
assert.ok(relM.aprovadores.some(a => a.nome === 'Rafael Regional' && a.perfil === 'regional'));
const relC = ok('relatorio.obter', { de: mes, ate: mes }, tc3);
assert.strictEqual(relC.kpis.total, 3, 'consultor vê só as próprias');
const relG = ok('relatorio.obter', { de: mes, ate: mes }, tg);
assert.ok(relG.salas.every(s => s.id === sala.id), 'gerente vê só a sala dele');
const exp = ok('relatorio.exportar', { de: mes, ate: mes }, tm);
assert.ok(exp.colunas.indexOf('Solicitante') >= 0 && exp.colunas.indexOf('Autorizador') >= 0);
const linhaA = exp.linhas.find(l => l[0] === sa.codigo);
assert.strictEqual(linhaA[exp.colunas.indexOf('Solicitante')], 'Marcos Muro Alto');
assert.strictEqual(linhaA[exp.colunas.indexOf('Autorizador')], 'Rafael Regional');
assert.strictEqual(linhaA[exp.colunas.indexOf('Perfil do autorizador')], 'Regional');
falha('relatorio.exportar', { de: mes, ate: mes }, tc3, 'PERMISSAO');
assert.ok(ok('relatorio.exportar', { de: mes, ate: mes }, tg).linhas.length >= 1);
passo('painel: escopo por perfil, tipos e motivos, alçadas, aprovadores; exportação só para a gestão');

// --- alertas de erro crítico
const emailsAntes = estado.emails.filter(e => /Erro crítico/.test(e.subject)).length;
assert.ok(emailsAntes >= 1, 'o teste de erro já gerou um e-mail de alerta');
falha('monitor.testarErro', {}, tm, 'ERRO');
assert.strictEqual(estado.emails.filter(e => /Erro crítico/.test(e.subject)).length, emailsAntes, 'o mesmo erro não repete o e-mail em seguida');
let st = ok('monitor.status', {}, tm);
const alTeste = st.alertas.find(a => a.acao === 'monitor.testarErro');
assert.ok(alTeste && Number(alTeste.ocorrencias) >= 2);
assert.match(alTeste.solucao, /Testar erro/);
assert.ok(ok('notificacoes.listar', {}, tm).itens.some(n => /Erro crítico/.test(n.titulo) && /alerta=/.test(n.link)));
for (let i = 0; i < 3; i++) ok('monitor.erroFront', { mensagem: 'Failed to fetch dynamically imported module', arquivo: 'https://site/js/views/painel.js', linha: 1, rota: '#/painel' });
st = ok('monitor.status', {}, tm);
const alFront = st.alertas.find(a => a.origem === 'frontend');
assert.ok(alFront, 'erro do navegador repetido 3x vira alerta');
assert.strictEqual(alFront.tipo, 'Arquivo do app não carregou');
ok('monitor.resolverAlerta', { id: alTeste.id }, tm);
assert.ok(!ok('monitor.status', {}, tm).alertas.some(a => a.id === alTeste.id));
assert.strictEqual(ctx.diagnosticarErro_('backend', 'x', 'Aba "Alertas" não encontrada. Rode a função setup()', '').tipo, 'Aba da planilha faltando');
assert.strictEqual(ctx.diagnosticarErro_('backend', 'x', 'ReferenceError: RegrasPagamento is not defined', '').tipo, 'Arquivo de regras ausente no Apps Script');
assert.strictEqual(ctx.diagnosticarErro_('backend', 'x', 'Lock timeout: another process was holding the lock for too long', '').tipo, 'Sistema ocupado (acessos simultâneos)');
assert.notStrictEqual(ctx.diagnosticarErro_('backend', 'x', 'Request blocked by the server', '').tipo, 'Sistema ocupado (acessos simultâneos)');
vm.runInContext("MEMO_ = {}; atualizar_('Alertas', buscar_('Alertas', '" + alTeste.id + "'), { resolvido_em: '2020-01-01T00:00:00.000Z' }); MEMO_ = {}; limparAlertasResolvidos_(); MEMO_ = {};", ctx);
assert.ok(!ctx.buscar_('Alertas', alTeste.id), 'alerta resolvido há mais de 30 dias é apagado');
assert.ok(ctx.buscar_('Alertas', alFront.id), 'alerta em aberto continua');
passo('alertas: e-mail e notificação ao master com tipo, local e como resolver; sem repetir o mesmo erro; resolver no Monitor');

console.info('\nTodos os testes passaram.');
