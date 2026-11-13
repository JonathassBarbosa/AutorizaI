/**
 * GAV Resorts — Autorizações de Vendas Fora da Regra
 * Backend (Google Apps Script) — API JSON sobre Google Sheets.
 *
 * Instalação: veja o README.md, seção "2. Apps Script".
 * Depois de qualquer alteração neste arquivo: Implantar → Gerenciar implantações →
 * editar (lápis) → Versão: "Nova versão" → Implantar. A URL continua a mesma.
 */

// ============================================================================
// CONFIGURAÇÃO — ajuste antes de rodar setup()
// ============================================================================
const CONFIG = {
  VERSAO: '1.7.1',
  MASTER_EMAIL: 'treinamentoadmcomercial@gmail.com',   // e-mail de login do usuário master
  MASTER_NOME: 'Master',
  APP_URL: 'https://jonathassbarbosa.github.io/AutorizaI/', // endereço do GitHub Pages (com / no final)
  NOME_REMETENTE: 'GAV Autorizações',    // nome que aparece nos e-mails enviados
  ONESIGNAL_APP_ID: '1565517a-2ebe-43bb-bedf-815a35efe73a', // a chave REST fica só nas Propriedades do script
  TZ: 'America/Sao_Paulo',
  SESSAO_HORAS: 12,          // duração do login
  LOG_MAX_LINHAS: 5000,      // linhas mantidas na aba Logs
  BACKUP_MANTER: 14,         // cópias de backup mantidas no Drive
  LOGIN_TENTATIVAS: 5,       // tentativas erradas antes de bloquear por 15 min
  ALERTA_EMAILS_DIA: 20,     // e-mails de alerta de erro crítico por dia (a conta Gmail envia ~100 e-mails/dia no total)
  ALERTA_REPETIR_MIN: 30,    // o mesmo erro só gera novo e-mail depois deste intervalo
  ALERTA_MANTER_DIAS: 30,    // alertas resolvidos são apagados pela rotina diária depois deste prazo
};

// Hierarquia: Diretoria → Superintendente → Regional → Gerente de Sala → Consultor de Vendas → Assistente de Contratos
const PERFIS = ['master', 'diretor', 'superintendente', 'regional', 'gerente', 'consultor', 'assistente'];
const NIVEL = { consultor: 0, assistente: 0, gerente: 1, regional: 2, superintendente: 3, diretor: 4, master: 9 };
const ALCADAS = ['gerente', 'regional', 'superintendente', 'diretor'];
const PERFIS_DE_SALA = ['gerente', 'assistente', 'consultor'];
const PERFIS_AUTOCADASTRO = ['diretor', 'superintendente', 'regional', 'gerente', 'consultor', 'assistente'];

// Salas de vendas cadastradas automaticamente pelo setup (o master vincula cada uma à sua regional).
const SALAS_PADRAO = [
  'Gran Valley Hotel', 'Gunga', 'Gramado - Nasa', 'Praia do Francês', 'Gramado - Dia', 'Porto 2 Life Hotel',
  'Gramado - Noite', 'Beach Hotel', 'Gramado - Luguito', 'Porto de Galinhas - Noite', 'Muro Alto',
  'Porto de Galinhas - Dia', 'Pyrenéus Hotel', 'Park Hotel', 'Gramado - Casa Lugano', 'Porto Alto Hotel', 'Cupe',
  'Jericoacoara - Lagoa', 'Jericoacoara - Vila', 'Maragogi - Noite', 'Vendas Digitais', 'Pipa - Dia', 'Pipa - Noite',
  'Maragogi - Dia',
];

// Colunas novas entram sempre no FINAL de cada aba, para não desalinhar dados existentes.
const ABAS = {
  Usuarios: ['id', 'nome', 'email', 'telefone', 'perfil', 'sala_id', 'ativo', 'senha_hash', 'salt', 'trocar_senha', 'criado_em', 'ultimo_acesso', 'cadastro'],
  Diretorias: ['id', 'nome', 'superintendente_id', 'ativo', 'criado_em', 'diretores'],
  Regionais: ['id', 'nome', 'diretoria_id', 'gestor_id', 'ativo', 'criado_em', 'superintendente_id'],
  Salas: ['id', 'nome', 'regional_id', 'limite_pct', 'ativo', 'criado_em'],
  Tipos: ['id', 'nome', 'descricao', 'alcada', 'campos', 'ativo', 'criado_em'],
  Solicitacoes: ['id', 'codigo', 'tipo_id', 'tipo_nome', 'sala_id', 'consultor_id', 'consultor_nome', 'cliente', 'cpf',
    'empreendimento', 'valor', 'campos', 'justificativa', 'status', 'alcada', 'alcada_motivo', 'aprovador_id',
    'aprovador_nome', 'resposta', 'respondido_em', 'desfecho', 'contrato', 'desfecho_justificativa', 'desfecho_por',
    'desfecho_em', 'criado_em', 'atualizado_em', 'id_casal', 'negociacao', 'regras', 'aceite_cliente'],
  VendasMes: ['id', 'sala_id', 'mes', 'total_vendas', 'atualizado_por', 'atualizado_em', 'meta_vendas', 'limite_pct'],
  Notificacoes: ['id', 'usuario_id', 'titulo', 'mensagem', 'link', 'lida', 'criado_em'],
  Sessoes: ['token_hash', 'usuario_id', 'criado_em', 'expira_em', 'ativo'],
  Auditoria: ['id', 'data', 'usuario_id', 'usuario_nome', 'acao', 'entidade', 'entidade_id', 'detalhes'],
  Logs: ['id', 'data', 'nivel', 'origem', 'acao', 'usuario', 'mensagem', 'local', 'detalhes', 'duracao_ms'],
  Alertas: ['id', 'data', 'chave', 'tipo', 'mensagem', 'local', 'solucao', 'origem', 'acao', 'usuario', 'ocorrencias',
    'ultima_vez', 'resolvido', 'resolvido_por', 'resolvido_em'],
};

// Tipo com alçada calculada pelas regras de comercialização (arquivo RegrasPagamento no Apps Script).
const ALCADA_AUTO = 'auto';
const TIPO_AUTO_NOME = 'Condição de pagamento fora da regra';

const TIPOS_PADRAO = [
  [TIPO_AUTO_NOME, 'Entrada, sinal ou saldo fora das regras de comercialização. O sistema calcula a alçada pelas condições informadas.', ALCADA_AUTO, []],
  ['Parcelamento de entrada acima do limite', 'Entrada parcelada em mais vezes do que a política permite.', 'gerente', ['Parcelas da entrada', 'Limite da política']],
  ['Desconto acima da política', 'Desconto maior que o permitido para a sala.', 'regional', ['Desconto solicitado (%)', 'Desconto máximo permitido (%)']],
  ['Recebimento em empreendimento diferente', 'Pagamento recebido em empreendimento diferente do contratado.', 'gerente', ['Empreendimento onde foi recebido', 'Empreendimento correto']],
  ['Cliente sair sem assinar contrato', 'Cliente precisa sair da sala antes de assinar.', 'gerente', ['Prazo para retorno']],
  ['Outra condição fora do padrão', 'Qualquer outra condição comercial fora da regra.', 'superintendente', ['Condição solicitada', 'Regra padrão']],
];

// ============================================================================
// ROTAS DA API
// publica: não exige login | escrita: roda com trava (LockService)
// silenciosa: não gera log de sucesso | trocaPendente: liberada mesmo com troca de senha pendente
// ============================================================================
const APROVADORES = ['gerente', 'regional', 'superintendente', 'diretor', 'master'];
const ROTAS = {
  'app.config': { publica: true, silenciosa: true, fn: configPublica_ },
  'auth.login': { publica: true, escrita: true, fn: login_ },
  'auth.esqueciSenha': { publica: true, fn: esqueciSenha_ },
  'auth.redefinirComCodigo': { publica: true, escrita: true, fn: redefinirComCodigo_ },
  'cadastro.opcoes': { publica: true, silenciosa: true, fn: opcoesCadastro_ },
  'cadastro.solicitar': { publica: true, escrita: true, fn: solicitarCadastro_ },
  'auth.logout': { escrita: true, trocaPendente: true, fn: logout_ },
  'auth.eu': { silenciosa: true, trocaPendente: true, fn: (d, u) => perfilPublico_(u) },
  'auth.trocarSenha': { escrita: true, trocaPendente: true, fn: trocarSenha_ },
  'auth.atualizarTelefone': { escrita: true, fn: atualizarTelefone_ },

  'dashboard.obter': { fn: dashboard_ },
  'vendas.salvar': { escrita: true, perfis: ['assistente', 'gerente', 'regional', 'superintendente', 'master'], fn: salvarVendasMes_ },
  'metas.obter': { perfis: ['master'], fn: obterMetas_ },
  'metas.salvar': { escrita: true, perfis: ['master'], fn: salvarMetas_ },

  'solicitacoes.listar': { fn: listarSolicitacoes_ },
  'solicitacoes.obter': { fn: obterSolicitacao_ },
  'solicitacoes.criar': { escrita: true, perfis: ['consultor', 'gerente', 'regional', 'superintendente', 'master'], fn: criarSolicitacao_ },
  'solicitacoes.responder': { escrita: true, perfis: APROVADORES, fn: responderSolicitacao_ },
  'solicitacoes.cancelar': { escrita: true, fn: cancelarSolicitacao_ },
  'solicitacoes.desfecho': { escrita: true, perfis: ['assistente', 'gerente', 'regional', 'superintendente', 'master'], fn: registrarDesfecho_ },
  'solicitacoes.verificar': { fn: verificarAutorizacao_ },

  'estrutura.obter': { fn: obterEstrutura_ },
  'estrutura.salvarDiretoria': { escrita: true, perfis: ['master'], fn: salvarDiretoria_ },
  'estrutura.salvarRegional': { escrita: true, perfis: ['master'], fn: salvarRegional_ },
  'estrutura.salvarSala': { escrita: true, perfis: ['master'], fn: salvarSala_ },

  'usuarios.listar': { perfis: ['master'], fn: listarUsuarios_ },
  'usuarios.salvar': { escrita: true, perfis: ['master'], fn: salvarUsuario_ },
  'usuarios.redefinirSenha': { escrita: true, perfis: ['master'], fn: redefinirSenha_ },
  'usuarios.aprovarCadastro': { escrita: true, perfis: ['master'], fn: aprovarCadastro_ },
  'usuarios.recusarCadastro': { escrita: true, perfis: ['master'], fn: recusarCadastro_ },

  'tipos.listar': { fn: listarTipos_ },
  'tipos.salvar': { escrita: true, perfis: ['master'], fn: salvarTipo_ },

  'regras.obter': { silenciosa: true, fn: obterRegras_ },
  'regras.salvar': { escrita: true, perfis: ['master'], fn: salvarRegras_ },
  'regras.contexto': { silenciosa: true, fn: contextoSala_ },

  'relatorio.obter': { fn: relatorio_ },
  'relatorio.exportar': { escrita: true, perfis: ['gerente', 'regional', 'superintendente', 'diretor', 'master'], fn: exportarRelatorio_ },

  'notificacoes.listar': { silenciosa: true, trocaPendente: true, fn: listarNotificacoes_ },
  'notificacoes.marcarLidas': { escrita: true, silenciosa: true, fn: marcarNotificacoesLidas_ },

  'monitor.status': { perfis: ['master'], silenciosa: true, fn: monitorStatus_ },
  'monitor.erroFront': { publica: true, silenciosa: true, fn: registrarErroFront_ },
  'monitor.testarErro': { perfis: ['master'], fn: testarErro_ },
  'monitor.limparLogs': { escrita: true, perfis: ['master'], fn: limparLogs_ },
  'monitor.resolverAlerta': { escrita: true, perfis: ['master'], fn: resolverAlerta_ },
};

// ============================================================================
// ENTRADA HTTP
// ============================================================================
function doGet() {
  return saida_({ ok: true, app: 'GAV Autorizações — API', versao: CONFIG.VERSAO, hora: agora_() });
}

function doPost(e) {
  return saida_(processar_(e));
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

let MEMO_ = {};

function processar_(e) {
  MEMO_ = {};
  const inicio = Date.now();
  let req = {};
  let usuario = null;
  try {
    try {
      req = JSON.parse(e && e.postData ? e.postData.contents : '{}') || {};
    } catch (x) {
      throw falha_('Requisição inválida (JSON malformado).', 'REQUISICAO');
    }
    const rota = ROTAS[req.action];
    if (!rota) throw falha_('Ação desconhecida: ' + req.action, 'ACAO');
    if (!rota.publica) {
      usuario = autenticar_(req.token);
      if (usuario.trocar_senha === 'true' && !rota.trocaPendente) {
        throw falha_('Troque sua senha provisória para continuar.', 'TROCAR_SENHA');
      }
      if (rota.perfis && rota.perfis.indexOf(usuario.perfil) < 0) {
        throw falha_('Seu perfil não tem permissão para esta ação.', 'PERMISSAO');
      }
    }
    const dados = req.data || {};
    const resultado = rota.escrita
      ? comTrava_(() => rota.fn(dados, usuario))
      : rota.fn(dados, usuario);
    if (!rota.silenciosa) {
      const quem = usuario || (resultado && resultado.usuario) || null; // no login, identifica pelo usuário que entrou
      log_('INFO', 'backend', req.action, nomeLog_(quem, dados), 'OK', '', '', Date.now() - inicio);
    }
    return { ok: true, data: resultado };
  } catch (err) {
    const esperado = !!err.esperado;
    const local = esperado ? '' : localDoErro_(err);
    try {
      log_(esperado ? 'WARN' : 'ERROR', 'backend', req.action || '-', nomeLog_(usuario, req.data || {}),
        err.message, local, esperado ? '' : resumoDoErro_(req, err), Date.now() - inicio);
    } catch (x) { /* a planilha pode estar indisponível; a resposta segue mesmo assim */ }
    return {
      ok: false,
      error: { message: esperado ? err.message : 'Erro interno: ' + err.message, code: err.code || 'ERRO', local: local },
    };
  }
}

function comTrava_(fn) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) throw falha_('Sistema ocupado, tente novamente em instantes.', 'OCUPADO');
  try {
    MEMO_ = { ss: MEMO_.ss }; // relê as abas dentro da trava
    return fn();
  } finally {
    trava.releaseLock();
  }
}

function falha_(mensagem, codigo) {
  const e = new Error(mensagem);
  e.esperado = true;
  e.code = codigo || 'VALIDACAO';
  return e;
}

function nomeLog_(u, dados) {
  if (u) return u.nome + ' (' + u.perfil + ')';
  return dados && dados.email ? String(dados.email) : '-';
}

// ============================================================================
// ACESSO À PLANILHA
// ============================================================================
function ss_() {
  if (MEMO_.ss) return MEMO_.ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  MEMO_.ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return MEMO_.ss;
}

function aba_(nome) {
  const sh = ss_().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada. Rode a função setup() no editor do Apps Script.');
  return sh;
}

function celula_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function ler_(nome) {
  const chave = 't_' + nome;
  if (MEMO_[chave]) return MEMO_[chave];
  const sh = aba_(nome);
  const cab = ABAS[nome];
  const ultima = sh.getLastRow();
  const lista = [];
  if (ultima >= 2) {
    sh.getRange(2, 1, ultima - 1, cab.length).getValues().forEach((linha, i) => {
      const o = { _linha: i + 2 };
      cab.forEach((c, j) => { o[c] = celula_(linha[j]); });
      if (o[cab[0]] !== '') lista.push(o);
    });
  }
  MEMO_[chave] = lista;
  return lista;
}

function invalidar_(nome) {
  delete MEMO_['t_' + nome];
  delete MEMO_.estrutura;
  MEMO_.escopo = {};
}

function inserir_(nome, obj) {
  const sh = aba_(nome);
  const cab = ABAS[nome];
  const linha = sh.getLastRow() + 1;
  const rg = sh.getRange(linha, 1, 1, cab.length);
  rg.setNumberFormat('@');
  rg.setValues([cab.map(c => celula_(obj[c]))]);
  invalidar_(nome);
  return Object.assign({ _linha: linha }, obj);
}

function atualizar_(nome, registro, alteracoes) {
  const cab = ABAS[nome];
  const novo = Object.assign({}, registro, alteracoes);
  const rg = aba_(nome).getRange(registro._linha, 1, 1, cab.length);
  rg.setNumberFormat('@');
  rg.setValues([cab.map(c => celula_(novo[c]))]);
  invalidar_(nome);
  return novo;
}

function buscar_(nome, valor, campo) {
  const c = campo || 'id';
  return ler_(nome).find(r => r[c] === String(valor)) || null;
}

function salvarRegistro_(nome, id, dados, prefixo) {
  if (id) {
    const atual = buscar_(nome, id);
    if (!atual) throw falha_('Registro não encontrado.');
    return atualizar_(nome, atual, dados);
  }
  return inserir_(nome, Object.assign({ id: novoId_(prefixo), criado_em: agora_() }, dados));
}

function limpo_(o) {
  const c = Object.assign({}, o);
  delete c._linha;
  return c;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================
function agora_() { return new Date().toISOString(); }
function novoId_(prefixo) { return prefixo + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
function mesDe_(iso) { return iso ? Utilities.formatDate(new Date(iso), CONFIG.TZ, 'yyyy-MM') : ''; }
function mesAtual_() { return mesDe_(agora_()); }
function bool_(v) { return v === true || v === 'true'; }
function boolTxt_(v) { return v === false || v === 'false' ? 'false' : 'true'; }
function json_(txt, padrao) { try { return txt ? JSON.parse(txt) : padrao; } catch (e) { return padrao; } }

function normalizar_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function texto_(v, rotulo, min, max) {
  const t = String(v === undefined || v === null ? '' : v).trim();
  if (t.length < (min || 1)) throw falha_(rotulo + ': informe pelo menos ' + (min || 1) + ' caractere(s).');
  if (max && t.length > max) throw falha_(rotulo + ': máximo de ' + max + ' caracteres.');
  return t;
}

function hex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function sha_(txt) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt), Utilities.Charset.UTF_8));
}

function hashSenha_(senha, salt) {
  let h = String(senha);
  for (let i = 0; i < 300; i++) h = hex_(Utilities.computeHmacSha256Signature(h + i, salt));
  return h;
}

function senhaTemporaria_() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  return s + Math.floor(Math.random() * 10);
}

function validarNovaSenha_(senha) {
  const s = String(senha || '');
  if (s.length < 8 || !/[a-zA-Z]/.test(s) || !/\d/.test(s)) {
    throw falha_('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
  }
  return s;
}

function cpfValido_(cpf) {
  const c = String(cpf || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c.charAt(i)) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(c.charAt(t))) return false;
  }
  return true;
}

/** Celular brasileiro no formato do wa.me (55 + DDD + número) ou '' se inválido. */
function telefoneWa_(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55[1-9]\d{9,10}$/.test(d) ? d : '';
}

function contatoWhatsApp_(u) {
  return { nome: u.nome, perfil: u.perfil, whatsapp: telefoneWa_(u.telefone) };
}

function formatarCpf_(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  return c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9);
}

// ============================================================================
// AUTENTICAÇÃO
// ============================================================================
function configPublica_() {
  const p = PropertiesService.getScriptProperties();
  return { versao: CONFIG.VERSAO, onesignal_app_id: p.getProperty('ONESIGNAL_APP_ID') || CONFIG.ONESIGNAL_APP_ID || '' };
}

function login_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const chave = 'tent_' + sha_(email).slice(0, 24);
  const tentativas = Number(cache.get(chave) || 0);
  if (tentativas >= CONFIG.LOGIN_TENTATIVAS) {
    throw falha_('Muitas tentativas erradas. Aguarde 15 minutos e tente novamente.', 'BLOQUEADO');
  }
  const u = ler_('Usuarios').find(x => x.email.toLowerCase() === email);
  if (!u || hashSenha_(String(d.senha || ''), u.salt) !== u.senha_hash) {
    cache.put(chave, String(tentativas + 1), 900);
    throw falha_('E-mail ou senha incorretos.', 'LOGIN');
  }
  if (u.cadastro === 'pendente') throw falha_('Seu cadastro está aguardando a aprovação do master. Você receberá um e-mail quando for liberado.', 'CADASTRO_PENDENTE');
  if (u.cadastro === 'recusado') throw falha_('Seu cadastro não foi aprovado. Fale com o administrador do sistema.', 'CADASTRO_RECUSADO');
  if (!bool_(u.ativo)) throw falha_('Seu acesso está desativado. Fale com o administrador do sistema.', 'LOGIN');
  cache.remove(chave);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const tokenHash = sha_(token);
  const expira = new Date(Date.now() + CONFIG.SESSAO_HORAS * 3600 * 1000).toISOString();
  inserir_('Sessoes', { token_hash: tokenHash, usuario_id: u.id, criado_em: agora_(), expira_em: expira, ativo: 'true' });
  const atualizado = atualizar_('Usuarios', u, { ultimo_acesso: agora_() });
  cache.put('s_' + tokenHash, JSON.stringify({ id: u.id, exp: expira }), 21600);
  auditar_(u, 'login', 'usuario', u.id, '');
  return { token: token, expira_em: expira, usuario: perfilPublico_(atualizado) };
}

function autenticar_(token) {
  if (!token) throw falha_('Sessão expirada. Faça login novamente.', 'SESSAO');
  const th = sha_(String(token));
  const cache = CacheService.getScriptCache();
  let s = json_(cache.get('s_' + th), null);
  if (!s) {
    const reg = ler_('Sessoes').find(x => x.token_hash === th && bool_(x.ativo));
    if (reg) {
      s = { id: reg.usuario_id, exp: reg.expira_em };
      cache.put('s_' + th, JSON.stringify(s), 21600);
    }
  }
  if (!s || new Date(s.exp) < new Date()) throw falha_('Sessão expirada. Faça login novamente.', 'SESSAO');
  const u = buscar_('Usuarios', s.id);
  if (!u || !bool_(u.ativo)) throw falha_('Usuário desativado.', 'SESSAO');
  u._token_hash = th;
  return u;
}

function logout_(d, u) {
  encerrarSessoes_(u.id, u._token_hash);
  return { saiu: true };
}

function encerrarSessoes_(usuarioId, somenteTokenHash) {
  const cache = CacheService.getScriptCache();
  ler_('Sessoes')
    .filter(s => s.usuario_id === usuarioId && bool_(s.ativo) && (!somenteTokenHash || s.token_hash === somenteTokenHash))
    .forEach(s => {
      atualizar_('Sessoes', s, { ativo: 'false' });
      cache.remove('s_' + s.token_hash);
    });
}

function trocarSenha_(d, u) {
  if (hashSenha_(String(d.senha_atual || ''), u.salt) !== u.senha_hash) throw falha_('A senha atual está incorreta.');
  const nova = validarNovaSenha_(d.nova_senha);
  if (nova === d.senha_atual) throw falha_('A nova senha precisa ser diferente da atual.');
  const salt = Utilities.getUuid();
  const atual = buscar_('Usuarios', u.id);
  const novo = atualizar_('Usuarios', atual, { senha_hash: hashSenha_(nova, salt), salt: salt, trocar_senha: 'false' });
  auditar_(u, 'trocar_senha', 'usuario', u.id, '');
  return perfilPublico_(novo);
}

function atualizarTelefone_(d, u) {
  if (!telefoneWa_(d.telefone)) throw falha_('Informe um celular com DDD, por exemplo (81) 99999-9999.');
  const novo = atualizar_('Usuarios', buscar_('Usuarios', u.id), { telefone: String(d.telefone).trim().slice(0, 30) });
  return perfilPublico_(novo);
}

// ============================================================================
// HIERARQUIA E ESCOPO
// ============================================================================
function estrutura_() {
  if (MEMO_.estrutura) return MEMO_.estrutura;
  const m = { dir: {}, reg: {}, sala: {} };
  ler_('Diretorias').forEach(x => { m.dir[x.id] = x; });
  ler_('Regionais').forEach(x => { m.reg[x.id] = x; });
  ler_('Salas').forEach(x => { m.sala[x.id] = x; });
  MEMO_.estrutura = m;
  return m;
}

function cadeiaSala_(salaId) {
  const e = estrutura_();
  const sala = e.sala[salaId] || null;
  const reg = sala ? e.reg[sala.regional_id] || null : null;
  const dir = reg ? e.dir[reg.diretoria_id] || null : null;
  return { sala: sala, reg: reg, dir: dir };
}

/** Salas que o usuário enxerga. */
function salasDoUsuario_(u) {
  MEMO_.escopo = MEMO_.escopo || {};
  if (MEMO_.escopo[u.id]) return MEMO_.escopo[u.id];
  const e = estrutura_();
  let ids;
  if (u.perfil === 'master') {
    ids = Object.keys(e.sala);
  } else if (u.perfil === 'diretor') {
    ids = Object.keys(e.sala).filter(id => { const c = cadeiaSala_(id); return c.dir && listaIds_(c.dir.diretores).indexOf(u.id) >= 0; });
  } else if (u.perfil === 'superintendente') {
    ids = Object.keys(e.sala).filter(id => { const c = cadeiaSala_(id); return c.reg && c.reg.superintendente_id === u.id; });
  } else if (u.perfil === 'regional') {
    ids = Object.keys(e.sala).filter(id => { const c = cadeiaSala_(id); return c.reg && c.reg.gestor_id === u.id; });
  } else {
    ids = u.sala_id && e.sala[u.sala_id] ? [u.sala_id] : [];
  }
  MEMO_.escopo[u.id] = ids;
  return ids;
}

function podeVerSala_(u, salaId) { return salasDoUsuario_(u).indexOf(salaId) >= 0; }

function podeVer_(u, s) {
  if (s.consultor_id === u.id) return true;
  if (u.perfil === 'consultor') return false;
  return podeVerSala_(u, s.sala_id);
}

function podeAprovar_(u, s) {
  if (s.status !== 'pendente') return false;
  if (u.perfil === 'master') return true;
  if (s.consultor_id === u.id) return false; // ninguém aprova o próprio pedido
  if (NIVEL[u.perfil] < 1 || NIVEL[u.perfil] < NIVEL[s.alcada]) return false;
  return podeVerSala_(u, s.sala_id);
}

function aprovadoresDoNivel_(salaId, nivel) {
  const c = cadeiaSala_(salaId);
  const ativos = ler_('Usuarios').filter(u => bool_(u.ativo));
  if (nivel === 'gerente') return ativos.filter(u => u.perfil === 'gerente' && u.sala_id === salaId);
  if (nivel === 'regional') return c.reg && c.reg.gestor_id ? ativos.filter(u => u.id === c.reg.gestor_id) : [];
  if (nivel === 'superintendente') return c.reg && c.reg.superintendente_id ? ativos.filter(u => u.id === c.reg.superintendente_id) : [];
  if (nivel === 'diretor') return c.dir ? ativos.filter(u => u.perfil === 'diretor' && listaIds_(c.dir.diretores).indexOf(u.id) >= 0) : [];
  return ativos.filter(u => u.perfil === 'master');
}

function listaIds_(txt) { return String(txt || '').split(',').map(s => s.trim()).filter(Boolean); }

/** Quem deve ser avisado: o nível da alçada; se estiver vago, sobe até achar alguém. */
function destinatariosDaAlcada_(salaId, alcada) {
  const ordem = ['gerente', 'regional', 'superintendente', 'diretor', 'master'];
  for (let i = Math.max(0, ordem.indexOf(alcada)); i < ordem.length; i++) {
    const lista = aprovadoresDoNivel_(salaId, ordem[i]);
    if (lista.length) return lista;
  }
  return [];
}

function calcularAlcada_(tipo, salaId, motivoBase, sobeSala) {
  let alcada = ALCADAS.indexOf(tipo.alcada) >= 0 ? tipo.alcada : 'gerente';
  let motivo = motivoBase || 'Definida pelo tipo de exceção';
  if (sobeSala !== false && alcada !== ALCADAS[ALCADAS.length - 1]) {
    const ind = indicadorSala_(salaId, mesAtual_());
    if (ind.acima) {
      alcada = ALCADAS[ALCADAS.indexOf(alcada) + 1];
      motivo = (motivoBase ? motivoBase + ' · ' : '') + 'Elevada: a sala já tem ' + ind.excecoes + ' exceção(ões) no mês, ' +
        ind.pct.toFixed(1) + '% ' + (ind.base_tipo === 'meta' ? 'da meta de ' + ind.meta + ' vendas' : 'das ' + ind.vendas + ' vendas lançadas') +
        ' (limite ' + ind.limite + '%)';
    }
  }
  return { alcada: alcada, motivo: motivo };
}

/**
 * Exceções da sala no mês e o limite que vale.
 * Com meta do mês cadastrada, o % é calculado sobre a meta (ex.: meta 100 e limite 10% → até 10 exceções).
 * Sem meta, vale o jeito antigo: % sobre as vendas lançadas. O % do mês, se vazio, usa o limite padrão da sala.
 */
function indicadorSala_(salaId, mes) {
  const vm = ler_('VendasMes').find(v => v.sala_id === salaId && v.mes === mes);
  const sala = estrutura_().sala[salaId];
  const vendas = Number(vm ? vm.total_vendas : 0) || 0;
  const meta = Number(vm ? vm.meta_vendas : 0) || 0;
  const limiteMes = vm && vm.limite_pct !== '' ? Number(vm.limite_pct) : NaN;
  const limitePadrao = Number(sala && sala.limite_pct || 0);
  const limite = isNaN(limiteMes) ? limitePadrao : limiteMes;
  const excecoes = ler_('Solicitacoes').filter(s =>
    s.sala_id === salaId && mesDe_(s.criado_em) === mes && s.status === 'aprovada' && s.desfecho !== 'sem_venda').length;
  const base = meta > 0 ? meta : vendas;
  const pct = base > 0 ? (excecoes * 100) / base : 0;
  return {
    vendas: vendas, meta: meta, excecoes: excecoes, pct: pct, limite: limite, limite_padrao: limitePadrao,
    limite_do_mes: !isNaN(limiteMes), base_tipo: meta > 0 ? 'meta' : 'vendas',
    max_excecoes: base > 0 && limite > 0 ? Math.round(base * limite) / 100 : null,
    acima: limite > 0 && base > 0 && pct >= limite,
  };
}

function vinculoTexto_(u) {
  const e = estrutura_();
  if (u.perfil === 'master') return 'Acesso total';
  if (u.cadastro === 'pendente') return 'Aguardando aprovação';
  if (u.perfil === 'diretor') {
    const l = Object.keys(e.dir).map(k => e.dir[k]).filter(d => listaIds_(d.diretores).indexOf(u.id) >= 0).map(d => d.nome);
    return l.length ? 'Diretoria: ' + l.join(', ') : 'Sem diretoria vinculada';
  }
  if (u.perfil === 'superintendente') {
    const l = Object.keys(e.reg).map(k => e.reg[k]).filter(r => r.superintendente_id === u.id).map(r => r.nome);
    return l.length ? 'Regionais: ' + l.join(', ') : 'Sem regional vinculada';
  }
  if (u.perfil === 'regional') {
    const l = Object.keys(e.reg).map(k => e.reg[k]).filter(r => r.gestor_id === u.id).map(r => r.nome);
    return l.length ? 'Regional: ' + l.join(', ') : 'Sem regional vinculada';
  }
  const s = e.sala[u.sala_id];
  return s ? 'Sala: ' + s.nome : 'Sem sala vinculada';
}

function perfilPublico_(u) {
  const c = u.sala_id ? cadeiaSala_(u.sala_id) : {};
  return {
    id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, perfil: u.perfil,
    sala_id: u.sala_id, sala_nome: c.sala ? c.sala.nome : '', vinculo: vinculoTexto_(u),
    trocar_senha: bool_(u.trocar_senha), ativo: bool_(u.ativo), cadastro: u.cadastro || 'aprovado',
    criado_em: u.criado_em, ultimo_acesso: u.ultimo_acesso,
  };
}

// ============================================================================
// SOLICITAÇÕES
// ============================================================================
function solicitacaoPublica_(s, u) {
  const c = cadeiaSala_(s.sala_id);
  const o = limpo_(s);
  o.valor = s.valor !== '' ? Number(s.valor) : null;
  o.campos = json_(s.campos, {});
  o.regras = json_(s.regras, []);
  o.aceite_cliente = bool_(s.aceite_cliente);
  delete o.negociacao; // a negociação completa só vai no detalhe (solicitacoes.obter)
  o.sala_nome = c.sala ? c.sala.nome : '';
  o.regional_nome = c.reg ? c.reg.nome : '';
  o.diretoria_nome = c.dir ? c.dir.nome : '';
  o.pode_aprovar = podeAprovar_(u, s);
  return o;
}

function listarSolicitacoes_(d, u) {
  let l = ler_('Solicitacoes').filter(s => podeVer_(u, s));
  if (d.status) l = l.filter(s => s.status === d.status);
  if (d.sala_id) l = l.filter(s => s.sala_id === d.sala_id);
  if (d.mes) l = l.filter(s => mesDe_(s.criado_em) === d.mes);
  if (d.para_mim) l = l.filter(s => podeAprovar_(u, s));
  if (d.busca) {
    const b = normalizar_(d.busca);
    const digitos = String(d.busca).replace(/\D/g, '');
    l = l.filter(s => normalizar_([s.codigo, s.cliente, s.consultor_nome, s.tipo_nome, s.empreendimento].join(' ')).indexOf(b) >= 0
      || (digitos.length >= 3 && (s.cpf.replace(/\D/g, '') + ' ' + s.id_casal).indexOf(digitos) >= 0));
  }
  l.sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  return { total: l.length, itens: l.slice(0, Number(d.limite) || 300).map(s => solicitacaoPublica_(s, u)) };
}

function obterSolicitacao_(d, u) {
  const s = buscar_('Solicitacoes', d.id);
  if (!s || !podeVer_(u, s)) throw falha_('Solicitação não encontrada ou sem permissão de acesso.', 'NAO_ENCONTRADO');
  const o = solicitacaoPublica_(s, u);
  const tipo = buscar_('Tipos', s.tipo_id);
  o.tipo_descricao = tipo ? tipo.descricao : '';
  o.negociacao = json_(s.negociacao, null);
  o.pode_cancelar = s.status === 'pendente' && (s.consultor_id === u.id || u.perfil === 'master');
  o.pode_desfecho = ['aprovada', 'negada'].indexOf(s.status) >= 0 && !s.desfecho
    && ['assistente', 'gerente', 'regional', 'superintendente', 'master'].indexOf(u.perfil) >= 0
    && (u.perfil === 'master' || podeVerSala_(u, s.sala_id));
  o.aguardando = s.status === 'pendente'
    ? destinatariosDaAlcada_(s.sala_id, s.alcada).filter(x => x.id !== s.consultor_id).map(contatoWhatsApp_)
    : [];
  const solicitante = buscar_('Usuarios', s.consultor_id);
  o.consultor_whatsapp = solicitante ? telefoneWa_(solicitante.telefone) : '';
  o.historico = ler_('Auditoria')
    .filter(a => a.entidade === 'solicitacao' && a.entidade_id === s.id)
    .map(a => ({ data: a.data, usuario: a.usuario_nome, acao: a.acao, detalhes: a.detalhes }));
  return o;
}

function criarSolicitacao_(d, u) {
  const tipo = buscar_('Tipos', d.tipo_id);
  if (!tipo || !bool_(tipo.ativo)) throw falha_('Selecione um tipo de exceção válido.');
  let salaId = u.sala_id;
  if (PERFIS_DE_SALA.indexOf(u.perfil) < 0) {
    salaId = String(d.sala_id || '');
    if (!podeVerSala_(u, salaId)) throw falha_('Selecione uma sala de vendas sob sua responsabilidade.');
  }
  const sala = estrutura_().sala[salaId];
  if (!sala || !bool_(sala.ativo)) throw falha_('Seu usuário não está vinculado a uma sala de vendas ativa. Fale com o master.');

  // O cliente é identificado pelo ID Casal da ficha de atendimento (sem nome nem CPF).
  const idCasal = String(d.id_casal || '').replace(/\D/g, '');
  if (!/^\d{3,12}$/.test(idCasal)) throw falha_('Informe o ID Casal da ficha de atendimento (só números).');
  const cliente = 'ID Casal ' + idCasal;
  const valor = d.valor === '' || d.valor === null || d.valor === undefined ? '' : Number(d.valor);
  if (valor !== '' && (isNaN(valor) || valor < 0)) throw falha_('Valor da venda inválido.');
  const justificativa = texto_(d.justificativa, 'Justificativa', 10, 2000);
  const camposTipo = json_(tipo.campos, []);
  let campos = {};
  camposTipo.forEach(rotulo => {
    campos[rotulo] = texto_((d.campos || {})[rotulo], rotulo, 1, 300);
  });

  let alc;
  let extra = {};
  let empreendimento = String(d.empreendimento || '').trim().slice(0, 120);
  let valorVenda = valor;
  if (tipo.alcada === ALCADA_AUTO) {
    // A alçada sai das regras de comercialização, recalculadas aqui (o navegador não decide nada).
    const neg = negociacaoLimpa_(d.negociacao);
    const cfg = regrasConfig_();
    const aval = RegrasPagamento.avaliarVenda(neg, cfg);
    if (aval.incompleto) throw falha_(aval.incompleto);
    if (aval.bloqueios.length) {
      throw falha_('A política não permite esta negociação: ' + aval.bloqueios.map(b => b.titulo).join('; ') + '.', 'BLOQUEADA');
    }
    if (aval.faltaAceite) throw falha_('Há choque de parcelas. Confirme que o cliente está de acordo antes de enviar.', 'ACEITE');
    if (!aval.gatilhos.length) {
      throw falha_('Esta negociação está dentro da regra e não precisa de autorização. Siga com a venda normalmente.', 'DENTRO_DA_REGRA');
    }
    const motivos = aval.gatilhos.map(g => g.titulo);
    alc = calcularAlcada_({ alcada: aval.alcadaRegras }, salaId, 'Regras: ' + motivos.join('; '), cfg.params.sobeSala !== false);
    const fs = aval.cotas;
    empreendimento = fs.map(f => f.emp).filter((e, i, a) => e && a.indexOf(e) === i).join(' + ').slice(0, 120);
    valorVenda = Math.round(fs.reduce((t, f) => t + f.valorCota, 0) * 100) / 100;
    campos = {
      'Modelo de venda': RegrasPagamento.MODELOS[neg.modelo] || neg.modelo,
      'Cotas': String(fs.length),
      'Regras que pediram autorização': motivos.join('; ').slice(0, 300),
    };
    if (aval.ciencia.length) campos['Choque de parcelas (aceite do cliente)'] = aval.ciencia.map(g => g.titulo).join('; ').slice(0, 300);
    extra = {
      // As regras usadas ficam no pedido: o detalhe mostra os mesmos valores mesmo se o master mudar as regras depois.
      negociacao: JSON.stringify(Object.assign({}, neg, { cfg: cfg })),
      regras: JSON.stringify(aval.gatilhos.concat(aval.ciencia).map(g => ({ id: g.id, titulo: g.titulo, det: g.det, acao: g.acao, cota: g.cota }))),
      aceite_cliente: aval.ciencia.length ? 'true' : '',
    };
  } else {
    alc = calcularAlcada_(tipo, salaId);
  }
  const seq = ler_('Solicitacoes').length + 1;
  const id = novoId_('S');
  const codigo = 'GAV-' + ('00000' + seq).slice(-6) + '-' + sha_(id).slice(0, 4).toUpperCase();
  const s = inserir_('Solicitacoes', Object.assign({
    id: id, codigo: codigo, tipo_id: tipo.id, tipo_nome: tipo.nome, sala_id: salaId,
    consultor_id: u.id, consultor_nome: u.nome, cliente: cliente, cpf: '', id_casal: idCasal,
    empreendimento: empreendimento, valor: valorVenda,
    campos: JSON.stringify(campos), justificativa: justificativa, status: 'pendente',
    alcada: alc.alcada, alcada_motivo: alc.motivo, criado_em: agora_(), atualizado_em: agora_(),
  }, extra));
  auditar_(u, 'criou', 'solicitacao', s.id, 'Alçada: ' + alc.alcada + ' — ' + alc.motivo);
  const destinos = destinatariosDaAlcada_(salaId, alc.alcada).filter(x => x.id !== u.id);
  notificar_(destinos.map(x => x.id), 'Nova exceção para aprovar',
    tipo.nome + ' — ' + cliente + ' (' + sala.nome + ')', '#/solicitacao/' + s.id);
  const saida = solicitacaoPublica_(s, u);
  saida.aguardando = destinos.map(contatoWhatsApp_); // o app monta o aviso por WhatsApp (wa.me)
  return saida;
}

function responderSolicitacao_(d, u) {
  const s = buscar_('Solicitacoes', d.id);
  if (!s) throw falha_('Solicitação não encontrada.');
  if (s.status !== 'pendente') throw falha_('Esta solicitação já foi respondida por ' + (s.aprovador_nome || 'outra pessoa') + '.');
  if (!podeAprovar_(u, s)) throw falha_('Você não tem alçada para responder esta solicitação.', 'PERMISSAO');
  const decisao = d.decisao === 'aprovada' ? 'aprovada' : d.decisao === 'negada' ? 'negada' : '';
  if (!decisao) throw falha_('Decisão inválida.');
  const resposta = texto_(d.resposta, decisao === 'negada' ? 'Motivo da negativa' : 'Comentário', decisao === 'negada' ? 10 : 2, 2000);
  const novo = atualizar_('Solicitacoes', s, {
    status: decisao, aprovador_id: u.id, aprovador_nome: u.nome, resposta: resposta,
    respondido_em: agora_(), atualizado_em: agora_(),
  });
  auditar_(u, decisao === 'aprovada' ? 'aprovou' : 'negou', 'solicitacao', s.id, resposta);
  const link = '#/solicitacao/' + s.id;
  notificar_([s.consultor_id], decisao === 'aprovada' ? 'Exceção aprovada ✅' : 'Exceção negada ❌',
    s.codigo + ' — ' + s.cliente + (decisao === 'negada' ? ' · revise a negociação' : ''), link);
  // O assistente de contratos não solicita: ele recebe o retorno de toda decisão da sala.
  const assistentes = ler_('Usuarios').filter(x => x.perfil === 'assistente' && x.sala_id === s.sala_id && bool_(x.ativo));
  notificar_(assistentes.map(x => x.id),
    decisao === 'aprovada' ? 'Autorização liberada ✅' : 'Exceção negada ❌',
    s.codigo + ' — ' + s.cliente + (decisao === 'aprovada' ? ' pode seguir para contrato' : ' · venda só dentro da regra'), link);
  const saida = solicitacaoPublica_(novo, u);
  const solicitante = buscar_('Usuarios', s.consultor_id);
  saida.consultor_whatsapp = solicitante ? telefoneWa_(solicitante.telefone) : '';
  return saida;
}

function cancelarSolicitacao_(d, u) {
  const s = buscar_('Solicitacoes', d.id);
  if (!s || !podeVer_(u, s)) throw falha_('Solicitação não encontrada.');
  if (s.status !== 'pendente') throw falha_('Só é possível cancelar solicitações pendentes.');
  if (s.consultor_id !== u.id && u.perfil !== 'master') throw falha_('Só quem criou pode cancelar.', 'PERMISSAO');
  const novo = atualizar_('Solicitacoes', s, { status: 'cancelada', atualizado_em: agora_() });
  auditar_(u, 'cancelou', 'solicitacao', s.id, String(d.motivo || '').slice(0, 500));
  return solicitacaoPublica_(novo, u);
}

function registrarDesfecho_(d, u) {
  const s = buscar_('Solicitacoes', d.id);
  if (!s || (u.perfil !== 'master' && !podeVerSala_(u, s.sala_id))) throw falha_('Solicitação não encontrada.');
  if (['aprovada', 'negada'].indexOf(s.status) < 0) throw falha_('O desfecho só pode ser registrado depois da resposta.');
  if (s.desfecho) throw falha_('O desfecho desta solicitação já foi registrado.');
  const alteracoes = { desfecho_por: u.nome, desfecho_em: agora_(), atualizado_em: agora_() };
  if (d.desfecho === 'venda_finalizada') {
    alteracoes.desfecho = 'venda_finalizada';
    alteracoes.contrato = texto_(d.contrato, 'Número do contrato', 1, 60);
  } else if (d.desfecho === 'sem_venda') {
    alteracoes.desfecho = 'sem_venda';
    alteracoes.desfecho_justificativa = texto_(d.justificativa, 'Justificativa da perda', 10, 1000);
  } else {
    throw falha_('Informe o desfecho: venda finalizada ou sem venda.');
  }
  const novo = atualizar_('Solicitacoes', s, alteracoes);
  auditar_(u, alteracoes.desfecho === 'sem_venda' ? 'registrou perda' : 'finalizou venda', 'solicitacao', s.id,
    alteracoes.contrato ? 'Contrato ' + alteracoes.contrato : alteracoes.desfecho_justificativa);
  return solicitacaoPublica_(novo, u);
}

function verificarAutorizacao_(d, u) {
  const codigo = String(d.codigo || '').trim().toUpperCase();
  if (codigo.length < 6) throw falha_('Digite o código completo da autorização.');
  const s = ler_('Solicitacoes').find(x => x.codigo === codigo || x.codigo.replace(/-[A-Z0-9]{4}$/, '') === codigo);
  if (!s) throw falha_('Nenhuma autorização encontrada com este código.', 'NAO_ENCONTRADO');
  if (s.codigo !== codigo) throw falha_('Código incompleto: inclua as 4 letras/números do final (ex.: GAV-000123-AB12).');
  if (!podeVer_(u, s)) throw falha_('Esta autorização pertence a uma sala fora do seu acesso.', 'PERMISSAO');
  return solicitacaoPublica_(s, u);
}

// ============================================================================
// REGRAS DE COMERCIALIZAÇÃO (alçada automática)
// O cálculo fica no arquivo RegrasPagamento (mesmo conteúdo de js/regras-pagamento.js).
// ============================================================================
const CAMPOS_COTA_ = ['emp', 'valorCota', 'valorEntrada', 'e1Valor', 'e1Forma', 'e1Parc', 'temE2', 'e2Valor', 'e2Forma', 'e2Parc',
  'temR', 'rForma', 'rData', 'rParc', 'sDia', 'sMes', 'sAno', 'sParc', 'sdParc', 'sdManual', 'sdData', 'sValor', 'sdValor',
  'desc', 'sForma', 'sdForma'];

/** Guarda só os campos conhecidos da negociação, com tamanho limitado. */
function negociacaoLimpa_(neg) {
  if (!neg || typeof neg !== 'object' || !Array.isArray(neg.cotas) || !neg.cotas.length) {
    throw falha_('Preencha as condições de pagamento da venda.');
  }
  if (neg.cotas.length > 20) throw falha_('Máximo de 20 cotas por solicitação.');
  if (!RegrasPagamento.MODELOS[neg.modelo]) throw falha_('Selecione o modelo de venda.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(neg.venda || ''))) throw falha_('Informe a data da venda.');
  return {
    modelo: neg.modelo,
    venda: String(neg.venda),
    aceite: neg.aceite === true || neg.aceite === 'true',
    cotas: neg.cotas.map((c, i) => {
      const o = {};
      CAMPOS_COTA_.forEach(k => {
        const v = c ? c[k] : undefined;
        if (v === undefined || v === null) return;
        o[k] = typeof v === 'boolean' ? v : String(v).slice(0, 60);
      });
      if (!o.emp) throw falha_('Informe o empreendimento da cota ' + (i + 1) + '.');
      if (!(Number(o.valorCota) > 0)) throw falha_('Informe o valor da cota ' + (i + 1) + '.');
      return o;
    }),
  };
}

function regrasConfig_() {
  if (MEMO_.regras) return MEMO_.regras;
  const salva = json_(PropertiesService.getScriptProperties().getProperty('REGRAS_PAGAMENTO'), {});
  MEMO_.regras = RegrasPagamento.config(salva);
  return MEMO_.regras;
}

function obterRegras_(d, u) {
  return { config: regrasConfig_(), editavel: u.perfil === 'master' };
}

function salvarRegras_(d, u) {
  const cfg = RegrasPagamento.config({ params: d.params || {}, acoes: d.acoes || {} });
  const p = cfg.params;
  ['diasReg', 'diasDir', 'p1Cons', 'p1Ger', 'restMin', 'base', 'baseGran', 'pctSinal'].forEach(k => {
    p[k] = Number(p[k]);
    if (!(p[k] >= 0)) throw falha_('Parâmetro inválido: ' + k + '.');
  });
  p.tol = p.tol === true || p.tol === 'true';
  p.sobeSala = p.sobeSala === true || p.sobeSala === 'true';
  if (p.diasReg >= p.diasDir) throw falha_('O prazo do sinal sem autorização precisa ser menor que o prazo do Regional.');
  if (p.p1Ger > p.p1Cons) throw falha_('O mínimo da 1ª parcela com o Gerente não pode ser maior que o mínimo sem autorização.');
  PropertiesService.getScriptProperties().setProperty('REGRAS_PAGAMENTO', JSON.stringify(cfg));
  delete MEMO_.regras;
  auditar_(u, 'editou regras de comercialização', 'sistema', 'regras', JSON.stringify(cfg).slice(0, 1000));
  return { config: regrasConfig_(), editavel: true };
}

/** O que a tela precisa para mostrar quem aprova: % de exceções da sala e cargos vagos. */
function contextoSala_(d, u) {
  const salaId = PERFIS_DE_SALA.indexOf(u.perfil) >= 0 ? u.sala_id : String(d.sala_id || '');
  if (!salaId || !podeVerSala_(u, salaId)) return { sala_id: '', pct: 0, limite: 0, vendas: 0, vagos: {} };
  const sala = estrutura_().sala[salaId];
  const ind = indicadorSala_(salaId, mesAtual_());
  const vagos = {};
  ALCADAS.forEach(n => { vagos[n] = !aprovadoresDoNivel_(salaId, n).filter(x => x.id !== u.id).length; });
  return {
    // "vendas" é a base do % (a meta do mês, ou as vendas lançadas quando não há meta)
    sala_id: salaId, pct: Math.round(ind.pct * 10) / 10, limite: ind.limite,
    vendas: ind.base_tipo === 'meta' ? ind.meta : ind.vendas, vagos: vagos,
  };
}

// ============================================================================
// DASHBOARD E VENDAS DO MÊS
// ============================================================================
function dashboard_(d, u) {
  const mes = /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes : mesAtual_();
  const salasIds = salasDoUsuario_(u);
  let sols = ler_('Solicitacoes').filter(s => podeVer_(u, s) && mesDe_(s.criado_em) === mes);
  if (u.perfil === 'consultor') sols = sols.filter(s => s.consultor_id === u.id);
  const conta = f => sols.filter(f).length;
  const respondidas = sols.filter(s => s.respondido_em);
  const tempoMedio = respondidas.length
    ? Math.round(respondidas.reduce((t, s) => t + (new Date(s.respondido_em) - new Date(s.criado_em)), 0) / respondidas.length / 60000)
    : null;

  const kpis = {
    total: sols.length,
    pendentes: conta(s => s.status === 'pendente'),
    aprovadas: conta(s => s.status === 'aprovada'),
    negadas: conta(s => s.status === 'negada'),
    canceladas: conta(s => s.status === 'cancelada'),
    finalizadas: conta(s => s.desfecho === 'venda_finalizada'),
    sem_venda: conta(s => s.desfecho === 'sem_venda'),
    tempo_medio_min: tempoMedio,
    para_mim: ler_('Solicitacoes').filter(s => podeAprovar_(u, s)).length,
  };

  const e = estrutura_();
  const salas = u.perfil === 'consultor' ? [] : salasIds.map(id => {
    const c = cadeiaSala_(id);
    const ind = indicadorSala_(id, mes);
    const daSala = sols.filter(s => s.sala_id === id);
    return {
      id: id, nome: e.sala[id].nome, regional: c.reg ? c.reg.nome : '', limite_pct: ind.limite,
      vendas: ind.vendas, meta: ind.meta, base_tipo: ind.base_tipo, max_excecoes: ind.max_excecoes,
      excecoes: ind.excecoes, pct: Math.round(ind.pct * 10) / 10,
      total: daSala.length, pendentes: daSala.filter(s => s.status === 'pendente').length,
      negadas: daSala.filter(s => s.status === 'negada').length,
    };
  }).sort((a, b) => b.pct - a.pct || b.total - a.total);

  const porConsultor = {};
  sols.forEach(s => {
    const k = s.consultor_id;
    porConsultor[k] = porConsultor[k] || { nome: s.consultor_nome, sala: (e.sala[s.sala_id] || {}).nome || '', total: 0, aprovadas: 0, negadas: 0, sem_venda: 0 };
    porConsultor[k].total++;
    if (s.status === 'aprovada') porConsultor[k].aprovadas++;
    if (s.status === 'negada') porConsultor[k].negadas++;
    if (s.desfecho === 'sem_venda') porConsultor[k].sem_venda++;
  });
  const porTipo = {};
  sols.forEach(s => { porTipo[s.tipo_nome] = (porTipo[s.tipo_nome] || 0) + 1; });

  const totais = salas.reduce((t, s) => ({ vendas: t.vendas + s.vendas, excecoes: t.excecoes + s.excecoes }), { vendas: 0, excecoes: 0 });
  return {
    mes: mes,
    kpis: kpis,
    taxa_geral: totais.vendas ? Math.round((totais.excecoes * 1000) / totais.vendas) / 10 : null,
    vendas_total: totais.vendas,
    salas: salas,
    consultores: Object.keys(porConsultor).map(k => porConsultor[k]).sort((a, b) => b.total - a.total).slice(0, 10),
    tipos: Object.keys(porTipo).map(k => ({ nome: k, total: porTipo[k] })).sort((a, b) => b.total - a.total),
    recentes: sols.slice().sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)).slice(0, 6).map(s => solicitacaoPublica_(s, u)),
    pode_editar_vendas: ['assistente', 'gerente', 'regional', 'superintendente', 'master'].indexOf(u.perfil) >= 0,
  };
}

function salvarVendasMes_(d, u) {
  if (!podeVerSala_(u, d.sala_id)) throw falha_('Sala fora do seu acesso.', 'PERMISSAO');
  if (!/^\d{4}-\d{2}$/.test(String(d.mes || ''))) throw falha_('Mês inválido.');
  const total = Number(d.total_vendas);
  if (!(total >= 0) || Math.floor(total) !== total) throw falha_('Informe o total de vendas como número inteiro.');
  const atual = ler_('VendasMes').find(v => v.sala_id === d.sala_id && v.mes === d.mes);
  const dados = { sala_id: d.sala_id, mes: d.mes, total_vendas: total, atualizado_por: u.nome, atualizado_em: agora_() };
  if (atual) atualizar_('VendasMes', atual, dados);
  else inserir_('VendasMes', Object.assign({ id: novoId_('V') }, dados));
  auditar_(u, 'vendas do mês', 'sala', d.sala_id, d.mes + ': ' + total);
  return indicadorSala_(d.sala_id, d.mes);
}

// ============================================================================
// METAS DO MÊS (o master define, por sala e mês, a meta de vendas e o % máximo fora do padrão)
// ============================================================================
function obterMetas_(d) {
  const ano = /^\d{4}$/.test(String(d.ano || '')) ? String(d.ano) : mesAtual_().slice(0, 4);
  const e = estrutura_();
  const linhas = ler_('VendasMes').filter(v => v.mes.slice(0, 4) === ano);
  const salas = Object.keys(e.sala).map(k => e.sala[k]).filter(s => bool_(s.ativo)).map(s => {
    const c = cadeiaSala_(s.id);
    const meses = {};
    linhas.filter(v => v.sala_id === s.id).forEach(v => {
      const ind = indicadorSala_(s.id, v.mes);
      meses[v.mes] = {
        meta: v.meta_vendas === '' ? null : Number(v.meta_vendas), limite_pct: v.limite_pct === '' ? null : Number(v.limite_pct),
        vendas: Number(v.total_vendas || 0) || 0, excecoes: ind.excecoes,
      };
    });
    return { id: s.id, nome: s.nome, regional: c.reg ? c.reg.nome : '', limite_padrao: Number(s.limite_pct || 0), meses: meses };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  // Exceções dos meses sem linha na aba (para mostrar o realizado mesmo sem meta)
  salas.forEach(s => {
    for (let m = 1; m <= 12; m++) {
      const mes = ano + '-' + ('0' + m).slice(-2);
      if (!s.meses[mes]) {
        const exc = indicadorSala_(s.id, mes).excecoes;
        if (exc) s.meses[mes] = { meta: null, limite_pct: null, vendas: 0, excecoes: exc };
      }
    }
  });
  return { ano: ano, salas: salas };
}

function salvarMetas_(d, u) {
  const itens = Array.isArray(d.itens) ? d.itens : [];
  if (!itens.length) throw falha_('Nenhuma meta para salvar.');
  if (itens.length > 400) throw falha_('Salve no máximo 400 metas por vez.');
  const e = estrutura_();
  const numero = (v, rotulo, max, inteiro) => {
    if (v === '' || v === null || v === undefined) return '';
    const n = Number(String(v).replace(',', '.'));
    if (isNaN(n) || n < 0 || n > max || (inteiro && Math.floor(n) !== n)) throw falha_(rotulo);
    return n;
  };
  let n = 0;
  itens.forEach(it => {
    const sala = e.sala[it.sala_id];
    if (!sala) throw falha_('Sala inválida.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(it.mes || ''))) throw falha_('Mês inválido.');
    const meta = numero(it.meta_vendas, 'Meta de ' + sala.nome + ': use um número inteiro de vendas.', 100000, true);
    const limite = numero(it.limite_pct, '% fora do padrão de ' + sala.nome + ': use um valor entre 0 e 100.', 100, false);
    const atual = ler_('VendasMes').find(v => v.sala_id === it.sala_id && v.mes === it.mes);
    if (!atual && meta === '' && limite === '') return;
    const dados = { meta_vendas: meta, limite_pct: limite, atualizado_por: u.nome, atualizado_em: agora_() };
    if (atual) {
      if (String(atual.meta_vendas) === String(meta) && String(atual.limite_pct) === String(limite)) return;
      atualizar_('VendasMes', atual, dados);
    } else {
      inserir_('VendasMes', Object.assign({ id: novoId_('V'), sala_id: it.sala_id, mes: it.mes, total_vendas: '' }, dados));
    }
    n++;
  });
  auditar_(u, 'metas do mês', 'sistema', 'metas', n + ' meta(s) salva(s): ' + itens.map(i => i.mes).filter((m, i, a) => a.indexOf(m) === i).join(', '));
  return Object.assign({ salvas: n }, obterMetas_({ ano: String(itens[0].mes).slice(0, 4) }));
}

// ============================================================================
// PAINEL DE SOLICITAÇÕES E RELATÓRIO
// Cada perfil vê só o seu escopo: consultor (as próprias), gerente (a sala), regional e superintendente
// (as salas das regionais), diretoria (as salas das diretorias) e master (tudo).
// ============================================================================
function periodoRelatorio_(d) {
  const de = /^\d{4}-\d{2}$/.test(String(d.de || '')) ? d.de : mesAtual_();
  let ate = /^\d{4}-\d{2}$/.test(String(d.ate || '')) ? d.ate : de;
  if (ate < de) ate = de;
  return { de: de, ate: ate };
}

function solicitacoesDoRelatorio_(d, u) {
  const per = periodoRelatorio_(d);
  let l = ler_('Solicitacoes').filter(s => podeVer_(u, s));
  if (u.perfil === 'consultor') l = l.filter(s => s.consultor_id === u.id);
  l = l.filter(s => { const m = mesDe_(s.criado_em); return m >= per.de && m <= per.ate; });
  if (d.sala_id) l = l.filter(s => s.sala_id === d.sala_id);
  if (d.status) l = l.filter(s => s.status === d.status);
  if (d.alcada) l = l.filter(s => s.alcada === d.alcada);
  if (d.tipo) l = l.filter(s => motivosDe_(s).indexOf(d.tipo) >= 0);
  l.sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  return { periodo: per, itens: l };
}

/** "Tipo de solicitação" para o painel: no tipo automático, as regras que pediram autorização; nos demais, o próprio tipo. */
function motivosDe_(s) {
  const regras = json_(s.regras, []).filter(g => ALCADAS.indexOf(g.acao) >= 0);
  if (!regras.length) return [s.tipo_nome];
  const nomes = {};
  (typeof RegrasPagamento !== 'undefined' ? RegrasPagamento.META : []).forEach(m => { nomes[m.id] = m.nome; });
  return regras.map(g => nomes[g.id] || g.titulo).filter((v, i, a) => a.indexOf(v) === i);
}

function relatorio_(d, u) {
  const r = solicitacoesDoRelatorio_(d, u);
  const sols = r.itens;
  const e = estrutura_();
  const usuarios = {};
  ler_('Usuarios').forEach(x => { usuarios[x.id] = x; });
  const conta = f => sols.filter(f).length;
  const respondidas = sols.filter(s => s.respondido_em);
  const minutos = s => Math.round((new Date(s.respondido_em) - new Date(s.criado_em)) / 60000);

  const porAlcada = ALCADAS.map(a => {
    const l = sols.filter(s => s.alcada === a);
    return { alcada: a, total: l.length, pendentes: l.filter(s => s.status === 'pendente').length,
      aprovadas: l.filter(s => s.status === 'aprovada').length, negadas: l.filter(s => s.status === 'negada').length };
  });

  const tipos = {};
  sols.forEach(s => motivosDe_(s).forEach(t => {
    const x = tipos[t] = tipos[t] || { nome: t, total: 0, aprovadas: 0, negadas: 0, pendentes: 0 };
    x.total++;
    if (s.status === 'aprovada') x.aprovadas++;
    if (s.status === 'negada') x.negadas++;
    if (s.status === 'pendente') x.pendentes++;
  }));
  const porTipo = Object.keys(tipos).map(k => tipos[k]).sort((a, b) => b.total - a.total);

  const salas = {};
  sols.forEach(s => {
    const c = cadeiaSala_(s.sala_id);
    const x = salas[s.sala_id] = salas[s.sala_id] || {
      id: s.sala_id, nome: c.sala ? c.sala.nome : '—', regional: c.reg ? c.reg.nome : '', diretoria: c.dir ? c.dir.nome : '',
      total: 0, pendentes: 0, aprovadas: 0, negadas: 0, por_alcada: {}, por_tipo: {},
    };
    x.total++;
    if (s.status === 'pendente') x.pendentes++;
    if (s.status === 'aprovada') x.aprovadas++;
    if (s.status === 'negada') x.negadas++;
    x.por_alcada[s.alcada] = (x.por_alcada[s.alcada] || 0) + 1;
    motivosDe_(s).forEach(t => { x.por_tipo[t] = (x.por_tipo[t] || 0) + 1; });
  });
  const porSala = Object.keys(salas).map(k => salas[k]).sort((a, b) => b.total - a.total);

  const aprov = {};
  respondidas.forEach(s => {
    const x = aprov[s.aprovador_id] = aprov[s.aprovador_id] || {
      nome: s.aprovador_nome, perfil: (usuarios[s.aprovador_id] || {}).perfil || '', aprovadas: 0, negadas: 0, soma_min: 0, n: 0,
    };
    if (s.status === 'aprovada') x.aprovadas++;
    if (s.status === 'negada') x.negadas++;
    x.soma_min += minutos(s); x.n++;
  });
  const solic = {};
  sols.forEach(s => {
    const x = solic[s.consultor_id] = solic[s.consultor_id] || {
      nome: s.consultor_nome, perfil: (usuarios[s.consultor_id] || {}).perfil || '', sala: (e.sala[s.sala_id] || {}).nome || '',
      total: 0, aprovadas: 0, negadas: 0,
    };
    x.total++;
    if (s.status === 'aprovada') x.aprovadas++;
    if (s.status === 'negada') x.negadas++;
  });

  return {
    de: r.periodo.de, ate: r.periodo.ate,
    kpis: {
      total: sols.length, pendentes: conta(s => s.status === 'pendente'), aprovadas: conta(s => s.status === 'aprovada'),
      negadas: conta(s => s.status === 'negada'), canceladas: conta(s => s.status === 'cancelada'),
      finalizadas: conta(s => s.desfecho === 'venda_finalizada'), sem_venda: conta(s => s.desfecho === 'sem_venda'),
      tempo_medio_min: respondidas.length ? Math.round(respondidas.reduce((t, s) => t + minutos(s), 0) / respondidas.length) : null,
    },
    por_alcada: porAlcada,
    por_tipo: porTipo,
    salas: porSala,
    // Sala × tipo: diretoria e master veem todas as salas do escopo; os demais, as salas que acompanham
    matriz: { tipos: porTipo.slice(0, 10).map(t => t.nome), salas: porSala.map(s => ({ nome: s.nome, regional: s.regional, por_tipo: s.por_tipo, total: s.total })) },
    aprovadores: Object.keys(aprov).map(k => aprov[k]).map(x => ({
      nome: x.nome, perfil: x.perfil, aprovadas: x.aprovadas, negadas: x.negadas, tempo_medio_min: x.n ? Math.round(x.soma_min / x.n) : null,
    })).sort((a, b) => (b.aprovadas + b.negadas) - (a.aprovadas + a.negadas)),
    solicitantes: Object.keys(solic).map(k => solic[k]).sort((a, b) => b.total - a.total).slice(0, 30),
    filtros: {
      salas: salasDoUsuario_(u).map(id => ({ id: id, nome: (e.sala[id] || {}).nome || id })).sort((a, b) => a.nome.localeCompare(b.nome)),
    },
  };
}

/** Relatório completo, linha a linha, com quem pediu e quem autorizou. */
function exportarRelatorio_(d, u) {
  const r = solicitacoesDoRelatorio_(d, u);
  const usuarios = {};
  ler_('Usuarios').forEach(x => { usuarios[x.id] = x; });
  const rotAlcada = { gerente: 'Gerente de Sala', regional: 'Regional', superintendente: 'Superintendente', diretor: 'Diretoria' };
  const rotStatus = { pendente: 'Pendente', aprovada: 'Aprovada', negada: 'Negada', cancelada: 'Cancelada' };
  const rotDesfecho = { venda_finalizada: 'Venda finalizada', sem_venda: 'Sem venda' };
  const dataBr = iso => (iso ? Utilities.formatDate(new Date(iso), CONFIG.TZ, 'dd/MM/yyyy HH:mm') : '');
  const colunas = ['Código', 'Criada em', 'Mês', 'Sala', 'Regional', 'Diretoria', 'Tipo de exceção', 'Regras / motivos',
    'Alçada', 'Motivo da alçada', 'Status', 'Solicitante', 'Perfil do solicitante', 'E-mail do solicitante', 'ID Casal',
    'Empreendimento', 'Valor (R$)', 'Modelo de venda', 'Cotas', 'Choque com aceite do cliente', 'Justificativa',
    'Autorizador', 'Perfil do autorizador', 'E-mail do autorizador', 'Respondida em', 'Tempo de resposta (min)',
    'Comentário do autorizador', 'Desfecho', 'Contrato', 'Desfecho registrado por', 'Desfecho em', 'Justificativa do desfecho'];
  const linhas = r.itens.slice(0, 5000).map(s => {
    const c = cadeiaSala_(s.sala_id);
    const sol = usuarios[s.consultor_id] || {};
    const apr = usuarios[s.aprovador_id] || {};
    const campos = json_(s.campos, {});
    return [
      s.codigo, dataBr(s.criado_em), mesDe_(s.criado_em), c.sala ? c.sala.nome : '', c.reg ? c.reg.nome : '', c.dir ? c.dir.nome : '',
      s.tipo_nome, motivosDe_(s).join('; '), rotAlcada[s.alcada] || s.alcada, s.alcada_motivo, rotStatus[s.status] || s.status,
      s.consultor_nome, rotuloPerfil_(sol.perfil || ''), sol.email || '', s.id_casal, s.empreendimento,
      s.valor === '' ? '' : Number(s.valor), campos['Modelo de venda'] || '', campos['Cotas'] || '',
      bool_(s.aceite_cliente) ? 'Sim' : '', s.justificativa,
      s.aprovador_nome || '', s.aprovador_id ? rotuloPerfil_(apr.perfil || '') : '', apr.email || '', dataBr(s.respondido_em),
      s.respondido_em ? Math.round((new Date(s.respondido_em) - new Date(s.criado_em)) / 60000) : '', s.resposta || '',
      rotDesfecho[s.desfecho] || '', s.contrato || '', s.desfecho_por || '', dataBr(s.desfecho_em), s.desfecho_justificativa || '',
    ];
  });
  auditar_(u, 'exportou relatório', 'relatorio', '', r.periodo.de + ' a ' + r.periodo.ate + ' · ' + linhas.length + ' linha(s)');
  return { de: r.periodo.de, ate: r.periodo.ate, colunas: colunas, linhas: linhas, total: r.itens.length };
}

// ============================================================================
// ESTRUTURA (diretorias → regionais → salas)
// ============================================================================
function obterEstrutura_(d, u) {
  const e = estrutura_();
  const usuarios = ler_('Usuarios');
  const nome = id => { const x = usuarios.find(k => k.id === id); return x ? x.nome : ''; };
  let salas = Object.keys(e.sala).map(k => e.sala[k]);
  if (u.perfil !== 'master') {
    const ids = salasDoUsuario_(u);
    salas = salas.filter(s => ids.indexOf(s.id) >= 0 && bool_(s.ativo));
  }
  const salasOut = salas.map(s => {
    const c = cadeiaSala_(s.id);
    const pessoas = usuarios.filter(p => p.sala_id === s.id && bool_(p.ativo));
    return {
      id: s.id, nome: s.nome, regional_id: s.regional_id, regional_nome: c.reg ? c.reg.nome : '',
      diretoria_nome: c.dir ? c.dir.nome : '', limite_pct: Number(s.limite_pct || 0), ativo: bool_(s.ativo),
      gerentes: pessoas.filter(p => p.perfil === 'gerente').map(p => p.nome),
      assistentes: pessoas.filter(p => p.perfil === 'assistente').map(p => p.nome),
      consultores: pessoas.filter(p => p.perfil === 'consultor').map(p => p.nome),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  if (u.perfil !== 'master') return { salas: salasOut };
  return {
    diretorias: Object.keys(e.dir).map(k => e.dir[k]).map(x => ({
      id: x.id, nome: x.nome, ativo: bool_(x.ativo),
      diretores: listaIds_(x.diretores).map(nome).filter(Boolean), diretores_ids: listaIds_(x.diretores),
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
    regionais: Object.keys(e.reg).map(k => e.reg[k]).map(x => ({
      id: x.id, nome: x.nome, diretoria_id: x.diretoria_id, diretoria_nome: (e.dir[x.diretoria_id] || {}).nome || '',
      gestor_id: x.gestor_id, gestor_nome: nome(x.gestor_id), ativo: bool_(x.ativo),
      superintendente_id: x.superintendente_id || '', superintendente_nome: nome(x.superintendente_id),
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
    salas: salasOut,
    usuarios: usuarios.filter(p => p.cadastro !== 'pendente' && p.cadastro !== 'recusado')
      .map(p => ({ id: p.id, nome: p.nome, perfil: p.perfil, ativo: bool_(p.ativo) })),
  };
}

function nomeUnico_(aba, nome, id) {
  if (ler_(aba).some(x => normalizar_(x.nome) === normalizar_(nome) && x.id !== String(id || ''))) {
    throw falha_('Já existe um cadastro com o nome "' + nome + '".');
  }
}

function salvarDiretoria_(d, u) {
  const nome = texto_(d.nome, 'Nome da diretoria', 2, 80);
  nomeUnico_('Diretorias', nome, d.id);
  const dados = { nome: nome, ativo: boolTxt_(d.ativo) };
  if (Array.isArray(d.diretores_ids)) {
    const usuarios = ler_('Usuarios');
    const ids = d.diretores_ids.map(String).filter((v, i, a) => v && a.indexOf(v) === i);
    ids.forEach(id => {
      const x = usuarios.find(k => k.id === id);
      if (!x || x.perfil !== 'diretor') throw falha_('Selecione só usuários com perfil Diretoria.');
    });
    dados.diretores = ids.join(',');
  }
  const r = salvarRegistro_('Diretorias', d.id, dados, 'D');
  auditar_(u, d.id ? 'editou' : 'criou', 'diretoria', r.id, nome);
  return limpo_(r);
}

function salvarRegional_(d, u) {
  const nome = texto_(d.nome, 'Nome da regional', 2, 80);
  nomeUnico_('Regionais', nome, d.id);
  if (d.diretoria_id && !estrutura_().dir[d.diretoria_id]) throw falha_('Diretoria inválida.');
  const gestor = d.gestor_id ? buscar_('Usuarios', d.gestor_id) : null;
  if (d.gestor_id && (!gestor || gestor.perfil !== 'regional')) throw falha_('Selecione um usuário com perfil Regional.');
  const sup = d.superintendente_id ? buscar_('Usuarios', d.superintendente_id) : null;
  if (d.superintendente_id && (!sup || sup.perfil !== 'superintendente')) throw falha_('Selecione um usuário com perfil Superintendente.');
  const r = salvarRegistro_('Regionais', d.id, {
    nome: nome, diretoria_id: d.diretoria_id || '', gestor_id: gestor ? gestor.id : '',
    superintendente_id: sup ? sup.id : '', ativo: boolTxt_(d.ativo),
  }, 'R');
  auditar_(u, d.id ? 'editou' : 'criou', 'regional', r.id, nome);
  return limpo_(r);
}

function salvarSala_(d, u) {
  const nome = texto_(d.nome, 'Nome da sala', 2, 80);
  nomeUnico_('Salas', nome, d.id);
  if (d.regional_id && !estrutura_().reg[d.regional_id]) throw falha_('Regional inválida.');
  const limite = Number(d.limite_pct || 0);
  if (isNaN(limite) || limite < 0 || limite > 100) throw falha_('O limite de exceções deve ficar entre 0 e 100%.');
  const r = salvarRegistro_('Salas', d.id, { nome: nome, regional_id: d.regional_id || '', limite_pct: limite, ativo: boolTxt_(d.ativo) }, 'L');
  auditar_(u, d.id ? 'editou' : 'criou', 'sala', r.id, nome + ' (limite ' + limite + '%)');
  return limpo_(r);
}

// ============================================================================
// USUÁRIOS
// ============================================================================
function vinculosDe_(u) {
  if (u.perfil === 'diretor') return ler_('Diretorias').filter(x => listaIds_(x.diretores).indexOf(u.id) >= 0).map(x => x.id);
  if (u.perfil === 'superintendente') return ler_('Regionais').filter(x => x.superintendente_id === u.id).map(x => x.id);
  if (u.perfil === 'regional') return ler_('Regionais').filter(x => x.gestor_id === u.id).map(x => x.id);
  return [];
}

function listarUsuarios_() {
  return ler_('Usuarios').map(u => Object.assign(perfilPublico_(u), { vinculo_ids: vinculosDe_(u) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function salvarUsuario_(d, u) {
  const nome = texto_(d.nome, 'Nome', 3, 120);
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha_('E-mail inválido.');
  const perfil = String(d.perfil || '');
  if (PERFIS.indexOf(perfil) < 0) throw falha_('Perfil inválido.');
  if (ler_('Usuarios').some(x => x.email.toLowerCase() === email && x.id !== String(d.id || ''))) {
    throw falha_('Já existe um usuário com este e-mail.');
  }
  let salaId = '';
  if (PERFIS_DE_SALA.indexOf(perfil) >= 0) {
    if (!estrutura_().sala[d.sala_id]) throw falha_('Selecione a sala de vendas deste usuário.');
    salaId = d.sala_id;
  }
  if (d.telefone && !telefoneWa_(d.telefone)) throw falha_('Celular inválido. Use DDD + número, por exemplo (81) 99999-9999.');
  const ativo = boolTxt_(d.ativo);
  const dados = { nome: nome, email: email, telefone: String(d.telefone || '').trim().slice(0, 30), perfil: perfil, sala_id: salaId, ativo: ativo };
  let registro;
  let senhaTemp = null;
  if (d.id) {
    const atual = buscar_('Usuarios', d.id);
    if (!atual) throw falha_('Usuário não encontrado.');
    if (atual.id === u.id && (perfil !== 'master' || ativo !== 'true')) throw falha_('Você não pode remover o seu próprio acesso master.');
    registro = atualizar_('Usuarios', atual, dados);
    if (ativo === 'false') encerrarSessoes_(atual.id);
  } else {
    senhaTemp = senhaTemporaria_();
    const salt = Utilities.getUuid();
    registro = inserir_('Usuarios', Object.assign({
      id: novoId_('U'), senha_hash: hashSenha_(senhaTemp, salt), salt: salt, trocar_senha: 'true',
      criado_em: agora_(), ultimo_acesso: '', cadastro: 'aprovado',
    }, dados));
  }
  aplicarVinculos_(registro, Array.isArray(d.vinculo_ids) ? d.vinculo_ids : null);
  auditar_(u, d.id ? 'editou' : 'criou', 'usuario', registro.id, nome + ' — ' + perfil);
  return { usuario: Object.assign(perfilPublico_(registro), { vinculo_ids: vinculosDe_(registro) }), senha_temporaria: senhaTemp };
}

/** Diretoria → diretorias; Superintendente e Regional → regionais. Ao mudar de perfil, os vínculos antigos são removidos. */
function aplicarVinculos_(reg, ids) {
  const ehSup = reg.perfil === 'superintendente';
  const ehReg = reg.perfil === 'regional';
  const ehDir = reg.perfil === 'diretor';
  ler_('Diretorias').forEach(x => {
    const alt = {};
    const diretores = listaIds_(x.diretores);
    const tem = diretores.indexOf(reg.id) >= 0;
    const deveDir = ehDir && (ids ? ids.indexOf(x.id) >= 0 : tem);
    if (deveDir && !tem) alt.diretores = diretores.concat(reg.id).join(',');
    if (!deveDir && tem) alt.diretores = diretores.filter(i => i !== reg.id).join(',');
    if (Object.keys(alt).length) atualizar_('Diretorias', x, alt);
  });
  ler_('Regionais').forEach(x => {
    const alt = {};
    const deve = ehReg && (ids ? ids.indexOf(x.id) >= 0 : x.gestor_id === reg.id);
    if (deve && x.gestor_id !== reg.id) alt.gestor_id = reg.id;
    if (!deve && x.gestor_id === reg.id) alt.gestor_id = '';
    const deveSup = ehSup && (ids ? ids.indexOf(x.id) >= 0 : x.superintendente_id === reg.id);
    if (deveSup && x.superintendente_id !== reg.id) alt.superintendente_id = reg.id;
    if (!deveSup && x.superintendente_id === reg.id) alt.superintendente_id = '';
    if (Object.keys(alt).length) atualizar_('Regionais', x, alt);
  });
}

function redefinirSenha_(d, u) {
  const alvo = buscar_('Usuarios', d.id);
  if (!alvo) throw falha_('Usuário não encontrado.');
  const senha = senhaTemporaria_();
  const salt = Utilities.getUuid();
  atualizar_('Usuarios', alvo, { senha_hash: hashSenha_(senha, salt), salt: salt, trocar_senha: 'true' });
  encerrarSessoes_(alvo.id);
  auditar_(u, 'redefiniu senha', 'usuario', alvo.id, alvo.nome);
  return { senha_temporaria: senha };
}

// ============================================================================
// AUTOCADASTRO (o usuário se cadastra e o master aprova)
// ============================================================================
function opcoesCadastro_() {
  return {
    perfis: PERFIS_AUTOCADASTRO,
    salas: ler_('Salas').filter(s => bool_(s.ativo)).map(s => ({ id: s.id, nome: s.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

function solicitarCadastro_(d) {
  const cache = CacheService.getScriptCache();
  const chave = 'cad_' + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(chave) || 0);
  if (n >= 30) throw falha_('Muitos cadastros em pouco tempo. Tente novamente mais tarde.', 'LIMITE');
  const nome = texto_(d.nome, 'Nome completo', 5, 120);
  if (nome.split(/\s+/).length < 2) throw falha_('Informe o nome completo (nome e sobrenome).');
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha_('E-mail inválido.');
  const perfil = String(d.perfil || '');
  if (PERFIS_AUTOCADASTRO.indexOf(perfil) < 0) throw falha_('Selecione a função que você ocupa.');
  if (!telefoneWa_(d.telefone)) throw falha_('Informe seu celular com DDD e WhatsApp, por exemplo (81) 99999-9999.');
  const existente = ler_('Usuarios').find(x => x.email.toLowerCase() === email);
  if (existente) {
    throw falha_(existente.cadastro === 'pendente'
      ? 'Já existe um cadastro com este e-mail aguardando aprovação.'
      : 'Este e-mail já está cadastrado. Use "Esqueci minha senha" se não lembrar a senha.');
  }
  let salaId = '';
  if (PERFIS_DE_SALA.indexOf(perfil) >= 0) {
    const sala = estrutura_().sala[d.sala_id];
    if (!sala || !bool_(sala.ativo)) throw falha_('Selecione a sua sala de vendas.');
    salaId = sala.id;
  }
  const senha = validarNovaSenha_(d.senha);
  const salt = Utilities.getUuid();
  const reg = inserir_('Usuarios', {
    id: novoId_('U'), nome: nome, email: email, telefone: String(d.telefone || '').trim().slice(0, 30), perfil: perfil,
    sala_id: salaId, ativo: 'false', senha_hash: hashSenha_(senha, salt), salt: salt, trocar_senha: 'false',
    criado_em: agora_(), ultimo_acesso: '', cadastro: 'pendente',
  });
  cache.put(chave, String(n + 1), 3700);
  auditar_({ id: reg.id, nome: nome }, 'solicitou cadastro', 'usuario', reg.id, perfil + (salaId ? ' — ' + estrutura_().sala[salaId].nome : ''));
  const masters = ler_('Usuarios').filter(x => x.perfil === 'master' && bool_(x.ativo));
  notificar_(masters.map(x => x.id), 'Novo cadastro para aprovar', nome + ' — ' + rotuloPerfil_(perfil), '#/usuarios');
  masters.forEach(m => enviarEmail_(m.email, 'Novo cadastro aguardando aprovação', 'Novo cadastro para aprovar',
    '<p><strong>' + esc_(nome) + '</strong> (' + esc_(email) + ') pediu acesso como <strong>' + rotuloPerfil_(perfil) + '</strong>' +
    (salaId ? ' na sala <strong>' + esc_(estrutura_().sala[salaId].nome) + '</strong>' : '') + '.</p>',
    'Revisar cadastro', CONFIG.APP_URL + '#/usuarios'));
  return { enviado: true };
}

function aprovarCadastro_(d, u) {
  const alvo = buscar_('Usuarios', d.id);
  if (!alvo || alvo.cadastro !== 'pendente') throw falha_('Cadastro não encontrado ou já analisado.');
  const perfil = PERFIS_AUTOCADASTRO.indexOf(d.perfil) >= 0 ? d.perfil : alvo.perfil;
  let salaId = '';
  if (PERFIS_DE_SALA.indexOf(perfil) >= 0) {
    salaId = d.sala_id || alvo.sala_id;
    if (!estrutura_().sala[salaId]) throw falha_('Selecione a sala de vendas deste usuário.');
  }
  // O vínculo pode ficar para depois: o master liga a pessoa em Estrutura (diretoria ou regional).
  const ids = Array.isArray(d.vinculo_ids) ? d.vinculo_ids : [];
  const reg = atualizar_('Usuarios', alvo, { perfil: perfil, sala_id: salaId, ativo: 'true', cadastro: 'aprovado' });
  aplicarVinculos_(reg, ids);
  auditar_(u, 'aprovou cadastro', 'usuario', alvo.id, alvo.nome + ' — ' + perfil);
  enviarEmail_(alvo.email, 'Seu acesso foi liberado', 'Cadastro aprovado ✅',
    '<p>Olá, <strong>' + esc_(alvo.nome.split(' ')[0]) + '</strong>! Seu acesso ao sistema de autorizações da GAV foi aprovado como <strong>' +
    rotuloPerfil_(perfil) + '</strong>.</p><p>Entre com o e-mail e a senha que você cadastrou.</p>', 'Acessar o sistema', CONFIG.APP_URL);
  return { usuario: Object.assign(perfilPublico_(reg), { vinculo_ids: vinculosDe_(reg) }) };
}

function recusarCadastro_(d, u) {
  const alvo = buscar_('Usuarios', d.id);
  if (!alvo || alvo.cadastro !== 'pendente') throw falha_('Cadastro não encontrado ou já analisado.');
  atualizar_('Usuarios', alvo, { ativo: 'false', cadastro: 'recusado' });
  auditar_(u, 'recusou cadastro', 'usuario', alvo.id, alvo.nome + (d.motivo ? ' — ' + String(d.motivo).slice(0, 300) : ''));
  enviarEmail_(alvo.email, 'Cadastro não aprovado', 'Cadastro não aprovado',
    '<p>Olá, ' + esc_(alvo.nome.split(' ')[0]) + '. Seu pedido de acesso não foi aprovado.</p>' +
    (d.motivo ? '<p><strong>Motivo:</strong> ' + esc_(String(d.motivo).slice(0, 300)) + '</p>' : '') +
    '<p>Em caso de dúvida, fale com o administrador do sistema.</p>', '', '');
  return { recusado: true };
}

function rotuloPerfil_(p) {
  return { master: 'Master', diretor: 'Diretoria', superintendente: 'Superintendente', regional: 'Regional', gerente: 'Gerente de Sala',
    consultor: 'Consultor de Vendas', assistente: 'Assistente de Contratos' }[p] || p;
}

// ============================================================================
// RECUPERAÇÃO DE SENHA POR E-MAIL (código de 6 dígitos, válido por 15 minutos)
// ============================================================================
function esqueciSenha_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha_('Informe um e-mail válido.');
  const resposta = { enviado: true, mensagem: 'Se o e-mail estiver cadastrado, você vai receber um código em instantes. Confira também a caixa de spam.' };
  const cache = CacheService.getScriptCache();
  const chaveEnvios = 'rse_' + sha_(email).slice(0, 24);
  const envios = Number(cache.get(chaveEnvios) || 0);
  if (envios >= 3) throw falha_('Já enviamos 3 códigos na última hora. Aguarde um pouco e confira a caixa de spam.', 'LIMITE');
  const u = ler_('Usuarios').find(x => x.email.toLowerCase() === email && x.cadastro !== 'pendente' && x.cadastro !== 'recusado' && bool_(x.ativo));
  if (!u) return resposta; // não revela se o e-mail existe
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('rs_' + sha_(email).slice(0, 24), JSON.stringify({ h: sha_(codigo + email), t: 0 }), 900);
  cache.put(chaveEnvios, String(envios + 1), 3600);
  const ok = enviarEmail_(u.email, 'Código para redefinir sua senha: ' + codigo, 'Redefinição de senha',
    '<p>Olá, ' + esc_(u.nome.split(' ')[0]) + '. Use o código abaixo para criar uma nova senha:</p>' +
    '<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#0B306B;margin:18px 0">' + codigo + '</p>' +
    '<p style="color:#5F6B80">O código vale por 15 minutos. Se não foi você que pediu, ignore este e-mail.</p>', '', '');
  if (!ok) throw falha_('Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.', 'EMAIL');
  log_('INFO', 'backend', 'auth.esqueciSenha', u.nome + ' (' + u.perfil + ')', 'Código de recuperação enviado', '', '', '');
  return resposta;
}

function redefinirComCodigo_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const chave = 'rs_' + sha_(email).slice(0, 24);
  const reg = json_(cache.get(chave), null);
  if (!reg) throw falha_('Código expirado ou inexistente. Peça um novo código.', 'CODIGO');
  if (reg.t >= 5) { cache.remove(chave); throw falha_('Muitas tentativas. Peça um novo código.', 'CODIGO'); }
  if (sha_(String(d.codigo || '').trim() + email) !== reg.h) {
    reg.t++;
    cache.put(chave, JSON.stringify(reg), 900);
    throw falha_('Código incorreto. Confira o e-mail e tente de novo.', 'CODIGO');
  }
  const nova = validarNovaSenha_(d.nova_senha);
  const u = ler_('Usuarios').find(x => x.email.toLowerCase() === email);
  if (!u) throw falha_('Usuário não encontrado.');
  const salt = Utilities.getUuid();
  atualizar_('Usuarios', u, { senha_hash: hashSenha_(nova, salt), salt: salt, trocar_senha: 'false' });
  encerrarSessoes_(u.id);
  cache.remove(chave);
  cache.remove('tent_' + sha_(email).slice(0, 24));
  auditar_(u, 'redefiniu a senha por e-mail', 'usuario', u.id, '');
  return { redefinida: true };
}

// ============================================================================
// E-MAIL (MailApp: ~100 e-mails/dia numa conta Gmail)
// ============================================================================
function esc_(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function enviarEmail_(para, assunto, titulo, corpoHtml, textoBotao, linkBotao) {
  try {
    const botao = textoBotao && linkBotao
      ? '<p style="margin:26px 0 8px"><a href="' + linkBotao + '" style="background:#0B306B;color:#FEF9E0;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">' + textoBotao + '</a></p>'
      : '';
    const html = '<div style="background:#F7F3E6;padding:28px 12px;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E1CC">' +
      '<div style="background:#0B306B;color:#FEF9E0;padding:20px 26px;font-family:Georgia,serif;font-size:26px;letter-spacing:1px">GAV' +
      '<div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:4px;margin-top:4px">HOTÉIS E RESORTS</div></div>' +
      '<div style="padding:26px;color:#0E2447;font-size:15px;line-height:1.55"><h2 style="font-family:Georgia,serif;color:#0B306B;margin:0 0 12px">' +
      titulo + '</h2>' + corpoHtml + botao + '</div>' +
      '<div style="padding:14px 26px;background:#FCFAF2;color:#98A0AE;font-size:12px">Mensagem automática do sistema de autorizações GAV.</div></div></div>';
    MailApp.sendEmail({ to: para, subject: assunto, htmlBody: html, name: CONFIG.NOME_REMETENTE });
    return true;
  } catch (e) {
    log_('ERROR', 'backend', 'email', '-', 'Falha ao enviar e-mail para ' + para + ': ' + e.message, localDoErro_(e),
      'Se o erro for de permissão, rode a função setup() no editor para autorizar o envio de e-mails.', '');
    return false;
  }
}

/** Rode no editor para testar o envio de e-mails (e autorizar a permissão de e-mail). */
function testarEmail() {
  MEMO_ = {};
  const dono = Session.getEffectiveUser().getEmail();
  Logger.log('Conta dona do script (remetente dos e-mails): ' + (dono || 'não identificada'));
  Logger.log('Cota de e-mails restante hoje: ' + MailApp.getRemainingDailyQuota());
  const destinos = [CONFIG.MASTER_EMAIL, dono].filter((e, i, a) => e && !/seu-email/.test(e) && a.indexOf(e) === i);
  if (!destinos.length) { Logger.log('❌ Preencha CONFIG.MASTER_EMAIL com o seu e-mail.'); return; }
  destinos.forEach(destino => {
    try {
      MailApp.sendEmail({ to: destino, subject: 'Teste de e-mail — GAV Autorizações', name: CONFIG.NOME_REMETENTE,
        htmlBody: '<p>O envio de e-mails do sistema GAV Autorizações está funcionando.</p><p>Remetente: ' + esc_(dono) + '</p>' });
      Logger.log('✅ Enviado para ' + destino + ' (confira também a caixa de spam)');
    } catch (e) {
      Logger.log('❌ Falhou para ' + destino + ': ' + e.message);
    }
  });
}

// ============================================================================
// TIPOS DE EXCEÇÃO
// ============================================================================
function tipoPublico_(t) {
  return { id: t.id, nome: t.nome, descricao: t.descricao, alcada: t.alcada, campos: json_(t.campos, []), ativo: bool_(t.ativo) };
}

function listarTipos_(d, u) {
  return ler_('Tipos').filter(t => u.perfil === 'master' || bool_(t.ativo)).map(tipoPublico_)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function salvarTipo_(d, u) {
  const nome = texto_(d.nome, 'Nome do tipo', 3, 100);
  nomeUnico_('Tipos', nome, d.id);
  if (ALCADAS.indexOf(d.alcada) < 0 && d.alcada !== ALCADA_AUTO) {
    throw falha_('Selecione a alçada: gerente, regional, superintendente, diretoria ou automática pelas regras.');
  }
  const campos = (Array.isArray(d.campos) ? d.campos : []).map(c => String(c).trim()).filter(Boolean).slice(0, 8);
  const r = salvarRegistro_('Tipos', d.id, {
    nome: nome, descricao: String(d.descricao || '').trim().slice(0, 300), alcada: d.alcada,
    campos: JSON.stringify(campos), ativo: boolTxt_(d.ativo),
  }, 'T');
  auditar_(u, d.id ? 'editou' : 'criou', 'tipo', r.id, nome + ' — alçada ' + d.alcada);
  return tipoPublico_(r);
}

// ============================================================================
// NOTIFICAÇÕES (no app + push OneSignal)
// ============================================================================
function notificar_(usuarioIds, titulo, mensagem, link) {
  const ids = usuarioIds.filter((v, i, a) => v && a.indexOf(v) === i);
  if (!ids.length) return;
  ids.forEach(id => inserir_('Notificacoes', {
    id: novoId_('N'), usuario_id: id, titulo: titulo, mensagem: mensagem, link: link || '', lida: 'false', criado_em: agora_(),
  }));
  enviarPush_(ids, titulo, mensagem, link);
}

function enviarPush_(usuarioIds, titulo, mensagem, link) {
  const p = PropertiesService.getScriptProperties();
  const appId = p.getProperty('ONESIGNAL_APP_ID') || CONFIG.ONESIGNAL_APP_ID;
  const chave = p.getProperty('ONESIGNAL_REST_KEY');
  if (!appId || !chave) return;
  try {
    const r = UrlFetchApp.fetch('https://api.onesignal.com/notifications?c=push', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { Authorization: 'Key ' + chave },
      payload: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: usuarioIds },
        headings: { en: titulo, pt: titulo },
        contents: { en: mensagem, pt: mensagem },
        url: CONFIG.APP_URL + (link || ''),
      }),
    });
    if (r.getResponseCode() >= 300) {
      log_('WARN', 'push', 'onesignal', '-', 'OneSignal respondeu HTTP ' + r.getResponseCode(),
        'Code.gs › enviarPush_()', r.getContentText().slice(0, 1500), '');
    }
  } catch (e) {
    log_('ERROR', 'push', 'onesignal', '-', e.message, localDoErro_(e), '', '');
  }
}

function listarNotificacoes_(d, u) {
  const minhas = ler_('Notificacoes').filter(n => n.usuario_id === u.id)
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  return {
    nao_lidas: minhas.filter(n => !bool_(n.lida)).length,
    para_aprovar: APROVADORES.indexOf(u.perfil) >= 0 ? ler_('Solicitacoes').filter(s => podeAprovar_(u, s)).length : 0,
    cadastros_pendentes: u.perfil === 'master' ? ler_('Usuarios').filter(x => x.cadastro === 'pendente').length : 0,
    itens: minhas.slice(0, 30).map(n => ({ id: n.id, titulo: n.titulo, mensagem: n.mensagem, link: n.link, lida: bool_(n.lida), criado_em: n.criado_em })),
  };
}

function marcarNotificacoesLidas_(d, u) {
  const ids = Array.isArray(d.ids) ? d.ids : null;
  let n = 0;
  ler_('Notificacoes').forEach(x => {
    if (x.usuario_id === u.id && !bool_(x.lida) && (!ids || ids.indexOf(x.id) >= 0)) {
      atualizar_('Notificacoes', x, { lida: 'true' });
      n++;
    }
  });
  return { marcadas: n };
}

// ============================================================================
// AUDITORIA, LOGS E MONITOR
// ============================================================================
function auditar_(u, acao, entidade, entidadeId, detalhes) {
  inserir_('Auditoria', {
    id: novoId_('A'), data: agora_(), usuario_id: u ? u.id : '', usuario_nome: u ? u.nome : '-',
    acao: acao, entidade: entidade, entidade_id: entidadeId, detalhes: String(detalhes || '').slice(0, 1000),
  });
}

function log_(nivel, origem, acao, usuario, mensagem, local, detalhes, duracaoMs) {
  aba_('Logs').appendRow([
    Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000), agora_(), nivel, origem, String(acao || '-'),
    String(usuario || '-'), String(mensagem || '').slice(0, 500), String(local || ''),
    String(detalhes || '').slice(0, 5000), duracaoMs === '' || duracaoMs === undefined ? '' : String(duracaoMs),
  ]);
  if (nivel === 'ERROR') {
    try { alertarErro_(origem, acao, usuario, mensagem, local); } catch (e) { /* o alerta nunca pode derrubar a resposta */ }
  }
}

// ============================================================================
// ALERTAS DE ERRO CRÍTICO (e-mail + notificação no app do master)
// ============================================================================
let ALERTANDO_ = false; // evita laço: se o próprio e-mail de alerta falhar, não gera outro alerta

/** Traduz o erro em tipo e "como resolver". A ordem importa: do mais específico para o mais genérico. */
function diagnosticarErro_(origem, acao, mensagem, local) {
  const m = String(mensagem || '');
  const regras = [
    [/RegrasPagamento is not defined|RegrasPagamento não está definid/i, 'Arquivo de regras ausente no Apps Script',
      'No editor do Apps Script, clique em + → Script, crie o arquivo "RegrasPagamento", cole o conteúdo de js/regras-pagamento.js e publique uma nova versão (Implantar → Gerenciar implantações → Nova versão).'],
    [/Aba "(.+)" não encontrada/, 'Aba da planilha faltando',
      'Rode a função setup() no editor do Apps Script. Ela recria as abas e colunas que faltam sem apagar nenhum dado.'],
    [/permission|permiss|authoriz|autoriza[cç][aã]o necess|Required permissions/i, 'Permissão do Google pendente',
      'Abra o editor do Apps Script, rode setup() e aceite as permissões pedidas. Depois publique uma nova versão.'],
    [/Service invoked too many times|too many times|quota|Limit Exceeded|limite.*excedid/i, 'Cota diária do Google excedida',
      'O Google limita e-mails e chamadas por dia na conta. O serviço volta sozinho em até 24 h. Se repetir, reduza os e-mails automáticos ou use uma conta Google Workspace.'],
    [/Exceeded maximum execution time|tempo m[aá]ximo de execu/i, 'Tempo limite do Apps Script',
      'A planilha está pesada para responder. No Monitor, use "Limpar logs" e confira se a rotina diária (manutencao) está ativa em Acionadores no editor do Apps Script.'],
    [/\block\b|trava|ocupado/i, 'Sistema ocupado (acessos simultâneos)',
      'Muitas gravações ao mesmo tempo. Normalmente passa sozinho; se repetir com frequência, avise quem mantém o sistema.'],
    [/Service Spreadsheets|Spreadsheet|planilha.*(n[aã]o|indispon)|Document .* is missing|could not find/i, 'Planilha indisponível',
      'Confira se a planilha "GAV Autorizações" existe, não foi movida para a lixeira e se a conta dona do script ainda tem acesso. Se trocou a planilha, rode setup() a partir dela.'],
    [/OneSignal|HTTP 4\d\d/i, 'Push (OneSignal) recusado',
      'Confira a chave ONESIGNAL_REST_KEY em Configurações do projeto → Propriedades do script e se o app do OneSignal continua ativo.'],
  ];
  for (let i = 0; i < regras.length; i++) if (regras[i][0].test(m)) return { tipo: regras[i][1], solucao: regras[i][2] };
  if (acao === 'email') return { tipo: 'Envio de e-mail falhou', solucao: 'Rode testarEmail() no editor do Apps Script. Se pedir permissão, aceite; se a cota do dia acabou, os e-mails voltam em até 24 h.' };
  if (/backup/.test(String(acao))) return { tipo: 'Backup diário falhou', solucao: 'Confira o espaço livre no Google Drive da conta dona do sistema e se a pasta "Backups - GAV Autorizações" existe.' };
  if (acao === 'monitor.testarErro') return { tipo: 'Teste do monitor (erro proposital)', solucao: 'Nada a fazer: foi o botão "Testar erro". Marque como resolvido.' };
  if (origem === 'frontend') {
    if (/dynamically imported module|Failed to fetch|Loading (chunk|module)|import/i.test(m)) {
      return { tipo: 'Arquivo do app não carregou', solucao: 'Confira se o arquivo indicado está publicado no GitHub Pages. Se acabou de atualizar o site, peça para fechar e abrir o app de novo.' };
    }
    return { tipo: 'Erro no app (navegador)', solucao: 'O erro se repetiu no navegador dos usuários. Veja o local e o stack no Monitor e corrija o arquivo indicado no repositório.' };
  }
  if (/Cannot read|is not a function|is not defined|undefined|null/i.test(m)) {
    return { tipo: 'Erro de código no servidor', solucao: 'Falha no Code.gs no local indicado. Veja os dados enviados e o stack no Monitor e corrija o trecho (ou envie para quem mantém o sistema).' };
  }
  return { tipo: 'Erro inesperado no servidor', solucao: 'Veja o local, os dados enviados e o stack no Monitor. Se o erro continuar, avise quem mantém o sistema com o código do alerta.' };
}

function podeEnviarAlertaEmail_() {
  try { if (MailApp.getRemainingDailyQuota() < 10) return false; } catch (e) { return false; }
  const p = PropertiesService.getScriptProperties();
  const hoje = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  const [dia, n] = String(p.getProperty('ALERTA_EMAILS') || '').split('|');
  const enviados = dia === hoje ? Number(n || 0) : 0;
  if (enviados >= CONFIG.ALERTA_EMAILS_DIA) return false;
  p.setProperty('ALERTA_EMAILS', hoje + '|' + (enviados + 1));
  return true;
}

function alertarErro_(origem, acao, usuario, mensagem, local) {
  if (ALERTANDO_) return;
  ALERTANDO_ = true;
  try {
    const cache = CacheService.getScriptCache();
    const chave = sha_(origem + '|' + (local || '') + '|' + String(mensagem || '').replace(/\d+/g, '#').slice(0, 200)).slice(0, 16);
    if (origem === 'frontend') {
      // erro no navegador de uma pessoa só vira alerta quando se repete (3 vezes em 15 minutos)
      const k = 'afr_' + chave;
      const n = Number(cache.get(k) || 0) + 1;
      cache.put(k, String(n), 900);
      if (n < 3) return;
    }
    const diag = diagnosticarErro_(origem, acao, mensagem, local);
    const agora = agora_();
    let alerta = null;
    try {
      const aberto = ler_('Alertas').find(a => a.chave === chave && a.resolvido !== 'true');
      alerta = aberto
        ? atualizar_('Alertas', aberto, { ocorrencias: String(Number(aberto.ocorrencias || 1) + 1), ultima_vez: agora, mensagem: String(mensagem || '').slice(0, 500) })
        : inserir_('Alertas', {
          id: novoId_('E'), data: agora, chave: chave, tipo: diag.tipo, mensagem: String(mensagem || '').slice(0, 500), local: local || '',
          solucao: diag.solucao, origem: origem, acao: String(acao || ''), usuario: String(usuario || ''), ocorrencias: '1',
          ultima_vez: agora, resolvido: 'false', resolvido_por: '', resolvido_em: '',
        });
    } catch (e) { /* aba Alertas ainda não existe (rode setup); o aviso segue mesmo assim */ }

    const kAviso = 'alv_' + chave;
    if (cache.get(kAviso)) return; // o mesmo erro já foi avisado há pouco
    cache.put(kAviso, '1', CONFIG.ALERTA_REPETIR_MIN * 60);
    const link = '#/monitor' + (alerta ? '?alerta=' + alerta.id : '');
    let masters = [];
    try { masters = ler_('Usuarios').filter(x => x.perfil === 'master' && bool_(x.ativo)); } catch (e) { masters = []; }
    try {
      notificar_(masters.map(x => x.id), '⚠️ Erro crítico: ' + diag.tipo, (local || 'local não identificado') + ' — ' + diag.solucao.slice(0, 160), link);
    } catch (e) { /* segue para o e-mail */ }
    const destinos = masters.map(x => x.email).concat([CONFIG.MASTER_EMAIL])
      .map(x => String(x || '').toLowerCase()).filter((x, i, a) => x && !/seu-email/.test(x) && a.indexOf(x) === i);
    if (!destinos.length || !podeEnviarAlertaEmail_()) return;
    const linha = (k, v) => '<tr><td style="padding:6px 10px 6px 0;color:#5F6B80;vertical-align:top;white-space:nowrap">' + k +
      '</td><td style="padding:6px 0">' + esc_(v) + '</td></tr>';
    const corpo = '<p>O monitor encontrou um erro que pode afetar o sistema.</p>' +
      '<table style="border-collapse:collapse;font-size:14px">' +
      linha('Tipo', diag.tipo) + linha('Local', local || 'não identificado') + linha('Mensagem', mensagem) +
      linha('Ação', acao || '-') + linha('Usuário', usuario || '-') + linha('Origem', origem) +
      linha('Quando', Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM/yyyy HH:mm:ss')) +
      (alerta ? linha('Ocorrências', alerta.ocorrencias) + linha('Código do alerta', alerta.id) : '') + '</table>' +
      '<div style="margin-top:18px;padding:14px 16px;background:#FCF0D9;border-radius:10px"><strong>Como resolver:</strong><br>' +
      esc_(diag.solucao) + '</div>' +
      '<p style="color:#5F6B80;font-size:13px">Se o mesmo erro continuar, você recebe outro aviso depois de ' + CONFIG.ALERTA_REPETIR_MIN +
      ' minutos (no máximo ' + CONFIG.ALERTA_EMAILS_DIA + ' e-mails de alerta por dia).</p>';
    destinos.forEach(email => enviarEmail_(email, '⚠️ Erro crítico no GAV Autorizações: ' + diag.tipo, 'Erro crítico detectado', corpo,
      'Abrir o Monitor', CONFIG.APP_URL + link));
  } finally {
    ALERTANDO_ = false;
  }
}

/** Apaga alertas resolvidos há mais de ALERTA_MANTER_DIAS; os abertos ficam sempre. */
function limparAlertasResolvidos_() {
  const sh = ss_().getSheetByName('Alertas');
  if (!sh || sh.getLastRow() < 2) return;
  const cab = ABAS.Alertas;
  const iRes = cab.indexOf('resolvido'), iEm = cab.indexOf('resolvido_em');
  const limite = new Date(Date.now() - CONFIG.ALERTA_MANTER_DIAS * 864e5);
  const valores = sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).getValues();
  const manter = valores.filter(r => celula_(r[iRes]) !== 'true' || !(new Date(celula_(r[iEm])) < limite));
  if (manter.length === valores.length) return;
  sh.deleteRows(2, valores.length);
  if (manter.length) {
    const rg = sh.getRange(2, 1, manter.length, cab.length);
    rg.setNumberFormat('@');
    rg.setValues(manter.map(r => r.map(celula_)));
  }
}

function alertasAbertos_() {
  try {
    return ler_('Alertas').filter(a => a.resolvido !== 'true')
      .sort((a, b) => (a.ultima_vez < b.ultima_vez ? 1 : -1)).slice(0, 30).map(limpo_);
  } catch (e) {
    return [];
  }
}

function resolverAlerta_(d, u) {
  const a = buscar_('Alertas', d.id);
  if (!a) throw falha_('Alerta não encontrado.');
  atualizar_('Alertas', a, { resolvido: 'true', resolvido_por: u.nome, resolvido_em: agora_() });
  auditar_(u, 'resolveu alerta', 'alerta', a.id, a.tipo + ' — ' + a.local);
  return { resolvido: true, alertas: alertasAbertos_() };
}

/** Extrai "Code.gs › função() › linha N" do stack trace. */
function localDoErro_(err) {
  const linhas = String(err && err.stack || '').split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (/__GS_INTERNAL|node:|internal\/|<anonymous>/.test(l)) continue;
    const m = l.match(/^at\s+(?:(.+?)\s+\()?([^()\s]+?):(\d+)(?::(\d+))?\)?$/);
    if (m) {
      const arquivo = m[2].split('/').pop().replace(/\.gs$/, '') + '.gs';
      const funcao = String(m[1] || 'anônima').replace(/\s*\[as [^\]]+\]/, '').replace(/^(Object|new)\.?\s*/, '');
      return arquivo + ' › ' + funcao + '() › linha ' + m[3] + (m[4] ? ', coluna ' + m[4] : '');
    }
  }
  return 'local não identificado';
}

function resumoDoErro_(req, err) {
  const dados = json_(JSON.stringify(req.data || {}), {});
  ['senha', 'senha_atual', 'nova_senha'].forEach(k => { if (dados[k]) dados[k] = '***'; });
  return JSON.stringify({
    acao: req.action,
    dados: dados,
    stack: String(err.stack || '').split('\n').slice(0, 10).join('\n'),
  });
}

function registrarErroFront_(d) {
  const cache = CacheService.getScriptCache();
  const chave = 'ef_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(chave) || 0);
  if (n >= 60) return { ignorado: true };
  cache.put(chave, String(n + 1), 120);
  const arquivo = String(d.arquivo || '').split('/').pop().split('?')[0];
  const local = arquivo
    ? arquivo + ' › ' + (d.funcao ? d.funcao + '() › ' : '') + 'linha ' + (d.linha || '?') + (d.coluna ? ', coluna ' + d.coluna : '')
    : 'local não identificado';
  log_(d.tipo === 'aviso' ? 'WARN' : 'ERROR', 'frontend', String(d.rota || '-').slice(0, 80), String(d.usuario || '-').slice(0, 80),
    String(d.mensagem || 'Erro desconhecido').slice(0, 500), local,
    JSON.stringify({ tipo: d.tipo, stack: String(d.stack || '').slice(0, 3000), url: d.url, navegador: String(d.navegador || '').slice(0, 250) }),
    '');
  return { registrado: true };
}

function monitorStatus_(d) {
  const inicio = Date.now();
  const sh = aba_('Logs');
  const cab = ABAS.Logs;
  const ultima = sh.getLastRow();
  const n = Math.min(800, Math.max(0, ultima - 1));
  const logs = n ? sh.getRange(ultima - n + 1, 1, n, cab.length).getValues().map(r => {
    const o = {};
    cab.forEach((c, i) => { o[c] = celula_(r[i]); });
    o.ts = Number(String(o.id).split('-')[0]) || Date.parse(o.data) || 0;
    return o;
  }) : [];

  const agora = Date.now();
  const janela = logs.filter(l => agora - l.ts <= 15 * 60 * 1000);
  const backend = janela.filter(l => l.origem === 'backend');
  const duracoes = backend.map(l => Number(l.duracao_ms)).filter(x => !isNaN(x) && x >= 0).sort((a, b) => a - b);
  const serie = [];
  for (let i = 14; i >= 0; i--) {
    const fim = agora - i * 60000;
    const doMinuto = janela.filter(l => l.ts > fim - 60000 && l.ts <= fim);
    serie.push({ t: fim, total: doMinuto.length, erros: doMinuto.filter(l => l.nivel === 'ERROR').length });
  }
  const acoes = {};
  backend.forEach(l => {
    const a = acoes[l.acao] = acoes[l.acao] || { acao: l.acao, total: 0, erros: 0, soma_ms: 0 };
    a.total++;
    if (l.nivel === 'ERROR') a.erros++;
    a.soma_ms += Number(l.duracao_ms) || 0;
  });
  const usuarios = {};
  janela.forEach(l => { if (l.usuario && l.usuario !== '-') usuarios[l.usuario] = true; });
  const erros = logs.filter(l => l.nivel === 'ERROR');
  const p = PropertiesService.getScriptProperties();
  const desde = Number(d.desde || 0);

  return {
    agora: new Date(agora).toISOString(),
    logs: logs.filter(l => l.ts >= desde).slice(-250),
    metricas: {
      operacoes: backend.length,
      erros: janela.filter(l => l.nivel === 'ERROR').length,
      avisos: janela.filter(l => l.nivel === 'WARN').length,
      latencia_media: duracoes.length ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : 0,
      latencia_p95: duracoes.length ? duracoes[Math.min(duracoes.length - 1, Math.floor(duracoes.length * 0.95))] : 0,
      usuarios_ativos: Object.keys(usuarios).length,
      serie: serie,
      acoes: Object.keys(acoes).map(k => acoes[k]).sort((a, b) => b.total - a.total).slice(0, 10)
        .map(a => ({ acao: a.acao, total: a.total, erros: a.erros, media_ms: Math.round(a.soma_ms / a.total) })),
    },
    saude: {
      versao: CONFIG.VERSAO,
      push_configurado: !!((p.getProperty('ONESIGNAL_APP_ID') || CONFIG.ONESIGNAL_APP_ID) && p.getProperty('ONESIGNAL_REST_KEY')),
      app_url: CONFIG.APP_URL,
      abas: ss_().getSheets().map(s => ({ nome: s.getName(), linhas: Math.max(0, s.getLastRow() - 1) })),
      ultimo_erro: erros.length ? erros[erros.length - 1] : null,
      tempo_leitura_ms: Date.now() - inicio,
      regras_instaladas: typeof RegrasPagamento !== 'undefined',
    },
    alertas: alertasAbertos_(),
  };
}

function testarErro_() {
  const registro = null;
  return registro.campoInexistente; // erro proposital para validar o monitor
}

function limparLogs_(d, u) {
  const sh = aba_('Logs');
  const ultima = sh.getLastRow();
  if (ultima > 1) sh.deleteRows(2, ultima - 1);
  auditar_(u, 'limpou logs', 'sistema', '', '');
  return { limpo: true };
}

// ============================================================================
// INSTALAÇÃO E MANUTENÇÃO — rode pelo editor do Apps Script
// ============================================================================

/** Cria as abas, os tipos padrão, o usuário master e a rotina diária. Pode rodar de novo sem perder dados. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abra o Apps Script a partir da planilha (Extensões → Apps Script) e rode setup() de novo.');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  MEMO_ = { ss: ss };

  Object.keys(ABAS).forEach(nome => {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    const cab = ABAS[nome];
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#0B1A2E').setFontColor('#D4A945');
    sh.setFrozenRows(1);
  });
  ss.getSheets().forEach(sh => {
    if (!ABAS[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  if (!ler_('Tipos').length) {
    TIPOS_PADRAO.forEach(t => inserir_('Tipos', {
      id: novoId_('T'), nome: t[0], descricao: t[1], alcada: t[2], campos: JSON.stringify(t[3]), ativo: 'true', criado_em: agora_(),
    }));
  } else if (!ler_('Tipos').some(t => t.alcada === ALCADA_AUTO)) {
    // Atualização 1.6: cria o tipo com alçada automática nas instalações que já existiam
    const t = TIPOS_PADRAO[0];
    inserir_('Tipos', { id: novoId_('T'), nome: t[0], descricao: t[1], alcada: t[2], campos: JSON.stringify(t[3]), ativo: 'true', criado_em: agora_() });
  }
  if (typeof RegrasPagamento === 'undefined') {
    Logger.log('⚠️ Falta o arquivo RegrasPagamento: crie no editor (+ → Script) e cole o conteúdo de js/regras-pagamento.js.');
  }

  const novasSalas = importarSalasPadrao_();

  let mensagem = novasSalas ? novasSalas + ' sala(s) de vendas cadastrada(s). ' : '';
  if (!ler_('Usuarios').some(u => u.perfil === 'master')) {
    if (/seu-email/.test(CONFIG.MASTER_EMAIL)) throw new Error('Troque CONFIG.MASTER_EMAIL pelo seu e-mail antes de rodar setup().');
    const senha = senhaTemporaria_();
    const salt = Utilities.getUuid();
    inserir_('Usuarios', {
      id: novoId_('U'), nome: CONFIG.MASTER_NOME, email: CONFIG.MASTER_EMAIL.toLowerCase(), telefone: '', perfil: 'master',
      sala_id: '', ativo: 'true', senha_hash: hashSenha_(senha, salt), salt: salt, trocar_senha: 'true', criado_em: agora_(), ultimo_acesso: '',
      cadastro: 'aprovado',
    });
    mensagem += 'USUÁRIO MASTER CRIADO → e-mail: ' + CONFIG.MASTER_EMAIL + ' | senha provisória: ' + senha;
  } else {
    mensagem += 'O usuário master já existia (nenhuma senha alterada).';
  }

  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'manutencao') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('manutencao').timeBased().everyDays(1).atHour(3).create();

  log_('INFO', 'backend', 'setup', 'editor', 'Instalação/atualização executada', '', '', '');
  Logger.log('✅ Setup concluído. ' + mensagem);
  return mensagem;
}

/** Cadastra as salas de SALAS_PADRAO que ainda não existem (compara o nome sem acentos). */
function importarSalasPadrao_() {
  const existentes = ler_('Salas').map(s => normalizar_(s.nome));
  let n = 0;
  SALAS_PADRAO.forEach(nome => {
    if (existentes.indexOf(normalizar_(nome)) >= 0) return;
    inserir_('Salas', { id: novoId_('L'), nome: nome, regional_id: '', limite_pct: 0, ativo: 'true', criado_em: agora_() });
    n++;
  });
  return n;
}

/** Gera uma nova senha provisória para o master (use se esquecer a senha). */
function redefinirSenhaMaster() {
  MEMO_ = {};
  const master = ler_('Usuarios').find(u => u.perfil === 'master' && u.email === CONFIG.MASTER_EMAIL.toLowerCase())
    || ler_('Usuarios').find(u => u.perfil === 'master');
  if (!master) throw new Error('Nenhum master encontrado. Rode setup().');
  const senha = senhaTemporaria_();
  const salt = Utilities.getUuid();
  atualizar_('Usuarios', master, { senha_hash: hashSenha_(senha, salt), salt: salt, trocar_senha: 'true', ativo: 'true' });
  CacheService.getScriptCache().remove('tent_' + sha_(master.email).slice(0, 24));
  Logger.log('🔑 Nova senha provisória do master (' + master.email + '): ' + senha);
  return senha;
}

/** Rotina diária (gatilho criado pelo setup): limpa logs antigos e sessões vencidas, e faz backup. */
function manutencao() {
  MEMO_ = {};
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const logs = aba_('Logs');
    const excesso = logs.getLastRow() - 1 - CONFIG.LOG_MAX_LINHAS;
    if (excesso > 0) logs.deleteRows(2, excesso);

    const ses = aba_('Sessoes');
    const valores = ses.getDataRange().getValues();
    const agora = new Date();
    const manter = valores.slice(1).filter(r => celula_(r[4]) === 'true' && new Date(celula_(r[3])) > agora);
    if (manter.length < valores.length - 1) {
      if (valores.length > 1) ses.deleteRows(2, valores.length - 1);
      if (manter.length) {
        const rg = ses.getRange(2, 1, manter.length, ABAS.Sessoes.length);
        rg.setNumberFormat('@');
        rg.setValues(manter.map(r => r.map(celula_)));
      }
    }
    limparAlertasResolvidos_();
  } finally {
    trava.releaseLock();
  }
  try {
    backup_();
  } catch (e) {
    log_('ERROR', 'backend', 'manutencao.backup', 'gatilho', e.message, localDoErro_(e), String(e.stack || ''), '');
  }
  log_('INFO', 'backend', 'manutencao', 'gatilho', 'Manutenção diária concluída', '', '', '');
}

function backup_() {
  const ss = ss_();
  const nomePasta = 'Backups - GAV Autorizações';
  const it = DriveApp.getFoldersByName(nomePasta);
  const pasta = it.hasNext() ? it.next() : DriveApp.createFolder(nomePasta);
  DriveApp.getFileById(ss.getId()).makeCopy('Backup ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm') + ' — ' + ss.getName(), pasta);
  const arquivos = [];
  const fi = pasta.getFiles();
  while (fi.hasNext()) arquivos.push(fi.next());
  arquivos.sort((a, b) => b.getDateCreated() - a.getDateCreated())
    .slice(CONFIG.BACKUP_MANTER)
    .forEach(f => f.setTrashed(true));
}
