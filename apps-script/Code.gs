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
  VERSAO: '1.0.0',
  MASTER_EMAIL: 'seu-email@gmail.com',   // e-mail de login do usuário master
  MASTER_NOME: 'Master',
  APP_URL: 'https://SEU-USUARIO.github.io/SEU-REPOSITORIO/', // endereço do GitHub Pages (com / no final)
  TZ: 'America/Sao_Paulo',
  SESSAO_HORAS: 12,          // duração do login
  LOG_MAX_LINHAS: 5000,      // linhas mantidas na aba Logs
  BACKUP_MANTER: 14,         // cópias de backup mantidas no Drive
  LOGIN_TENTATIVAS: 5,       // tentativas erradas antes de bloquear por 15 min
};

const PERFIS = ['master', 'superintendente', 'regional', 'gerente', 'assistente', 'consultor'];
const NIVEL = { consultor: 0, assistente: 0, gerente: 1, regional: 2, superintendente: 3, master: 9 };
const ALCADAS = ['gerente', 'regional', 'superintendente'];
const PERFIS_DE_SALA = ['gerente', 'assistente', 'consultor'];

const ABAS = {
  Usuarios: ['id', 'nome', 'email', 'telefone', 'perfil', 'sala_id', 'ativo', 'senha_hash', 'salt', 'trocar_senha', 'criado_em', 'ultimo_acesso'],
  Diretorias: ['id', 'nome', 'superintendente_id', 'ativo', 'criado_em'],
  Regionais: ['id', 'nome', 'diretoria_id', 'gestor_id', 'ativo', 'criado_em'],
  Salas: ['id', 'nome', 'regional_id', 'limite_pct', 'ativo', 'criado_em'],
  Tipos: ['id', 'nome', 'descricao', 'alcada', 'campos', 'ativo', 'criado_em'],
  Solicitacoes: ['id', 'codigo', 'tipo_id', 'tipo_nome', 'sala_id', 'consultor_id', 'consultor_nome', 'cliente', 'cpf',
    'empreendimento', 'valor', 'campos', 'justificativa', 'status', 'alcada', 'alcada_motivo', 'aprovador_id',
    'aprovador_nome', 'resposta', 'respondido_em', 'desfecho', 'contrato', 'desfecho_justificativa', 'desfecho_por',
    'desfecho_em', 'criado_em', 'atualizado_em'],
  VendasMes: ['id', 'sala_id', 'mes', 'total_vendas', 'atualizado_por', 'atualizado_em'],
  Notificacoes: ['id', 'usuario_id', 'titulo', 'mensagem', 'link', 'lida', 'criado_em'],
  Sessoes: ['token_hash', 'usuario_id', 'criado_em', 'expira_em', 'ativo'],
  Auditoria: ['id', 'data', 'usuario_id', 'usuario_nome', 'acao', 'entidade', 'entidade_id', 'detalhes'],
  Logs: ['id', 'data', 'nivel', 'origem', 'acao', 'usuario', 'mensagem', 'local', 'detalhes', 'duracao_ms'],
};

const TIPOS_PADRAO = [
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
const APROVADORES = ['gerente', 'regional', 'superintendente', 'master'];
const ROTAS = {
  'app.config': { publica: true, silenciosa: true, fn: configPublica_ },
  'auth.login': { publica: true, escrita: true, fn: login_ },
  'auth.logout': { escrita: true, trocaPendente: true, fn: logout_ },
  'auth.eu': { silenciosa: true, trocaPendente: true, fn: (d, u) => perfilPublico_(u) },
  'auth.trocarSenha': { escrita: true, trocaPendente: true, fn: trocarSenha_ },

  'dashboard.obter': { fn: dashboard_ },
  'vendas.salvar': { escrita: true, perfis: ['assistente', 'gerente', 'regional', 'superintendente', 'master'], fn: salvarVendasMes_ },

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

  'tipos.listar': { fn: listarTipos_ },
  'tipos.salvar': { escrita: true, perfis: ['master'], fn: salvarTipo_ },

  'notificacoes.listar': { silenciosa: true, trocaPendente: true, fn: listarNotificacoes_ },
  'notificacoes.marcarLidas': { escrita: true, silenciosa: true, fn: marcarNotificacoesLidas_ },

  'monitor.status': { perfis: ['master'], silenciosa: true, fn: monitorStatus_ },
  'monitor.erroFront': { publica: true, silenciosa: true, fn: registrarErroFront_ },
  'monitor.testarErro': { perfis: ['master'], fn: testarErro_ },
  'monitor.limparLogs': { escrita: true, perfis: ['master'], fn: limparLogs_ },
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

function formatarCpf_(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  return c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9);
}

// ============================================================================
// AUTENTICAÇÃO
// ============================================================================
function configPublica_() {
  const p = PropertiesService.getScriptProperties();
  return { versao: CONFIG.VERSAO, onesignal_app_id: p.getProperty('ONESIGNAL_APP_ID') || '' };
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
  if (!u || !bool_(u.ativo) || hashSenha_(String(d.senha || ''), u.salt) !== u.senha_hash) {
    cache.put(chave, String(tentativas + 1), 900);
    throw falha_('E-mail ou senha incorretos.', 'LOGIN');
  }
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
  } else if (u.perfil === 'superintendente') {
    ids = Object.keys(e.sala).filter(id => { const c = cadeiaSala_(id); return c.dir && c.dir.superintendente_id === u.id; });
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
  if (nivel === 'superintendente') return c.dir && c.dir.superintendente_id ? ativos.filter(u => u.id === c.dir.superintendente_id) : [];
  return ativos.filter(u => u.perfil === 'master');
}

/** Quem deve ser avisado: o nível da alçada; se estiver vago, sobe até achar alguém. */
function destinatariosDaAlcada_(salaId, alcada) {
  const ordem = ['gerente', 'regional', 'superintendente', 'master'];
  for (let i = Math.max(0, ordem.indexOf(alcada)); i < ordem.length; i++) {
    const lista = aprovadoresDoNivel_(salaId, ordem[i]);
    if (lista.length) return lista;
  }
  return [];
}

function calcularAlcada_(tipo, salaId) {
  let alcada = ALCADAS.indexOf(tipo.alcada) >= 0 ? tipo.alcada : 'gerente';
  let motivo = 'Definida pelo tipo de exceção';
  const sala = estrutura_().sala[salaId];
  const limite = Number(sala && sala.limite_pct || 0);
  if (limite > 0 && alcada !== 'superintendente') {
    const ind = indicadorSala_(salaId, mesAtual_());
    if (ind.vendas > 0 && ind.pct >= limite) {
      alcada = ALCADAS[ALCADAS.indexOf(alcada) + 1];
      motivo = 'Elevada: a sala está com ' + ind.pct.toFixed(1) + '% de exceções no mês (limite ' + limite + '%)';
    }
  }
  return { alcada: alcada, motivo: motivo };
}

function indicadorSala_(salaId, mes) {
  const vm = ler_('VendasMes').find(v => v.sala_id === salaId && v.mes === mes);
  const vendas = Number(vm ? vm.total_vendas : 0) || 0;
  const excecoes = ler_('Solicitacoes').filter(s =>
    s.sala_id === salaId && mesDe_(s.criado_em) === mes && s.status === 'aprovada' && s.desfecho !== 'sem_venda').length;
  return { vendas: vendas, excecoes: excecoes, pct: vendas > 0 ? (excecoes * 100) / vendas : 0 };
}

function vinculoTexto_(u) {
  const e = estrutura_();
  if (u.perfil === 'master') return 'Acesso total';
  if (u.perfil === 'superintendente') {
    const l = Object.keys(e.dir).map(k => e.dir[k]).filter(d => d.superintendente_id === u.id).map(d => d.nome);
    return l.length ? 'Diretoria: ' + l.join(', ') : 'Sem diretoria vinculada';
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
    trocar_senha: bool_(u.trocar_senha), ativo: bool_(u.ativo),
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
      || (digitos.length >= 3 && s.cpf.replace(/\D/g, '').indexOf(digitos) >= 0));
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
  o.pode_cancelar = s.status === 'pendente' && (s.consultor_id === u.id || u.perfil === 'master');
  o.pode_desfecho = ['aprovada', 'negada'].indexOf(s.status) >= 0 && !s.desfecho
    && ['assistente', 'gerente', 'regional', 'superintendente', 'master'].indexOf(u.perfil) >= 0
    && (u.perfil === 'master' || podeVerSala_(u, s.sala_id));
  o.aguardando = s.status === 'pendente'
    ? destinatariosDaAlcada_(s.sala_id, s.alcada).map(x => ({ nome: x.nome, perfil: x.perfil }))
    : [];
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

  const cliente = texto_(d.cliente, 'Nome do cliente', 3, 120);
  if (!cpfValido_(d.cpf)) throw falha_('CPF inválido. Confira os números.');
  const valor = d.valor === '' || d.valor === null || d.valor === undefined ? '' : Number(d.valor);
  if (valor !== '' && (isNaN(valor) || valor < 0)) throw falha_('Valor da venda inválido.');
  const justificativa = texto_(d.justificativa, 'Justificativa', 10, 2000);
  const camposTipo = json_(tipo.campos, []);
  const campos = {};
  camposTipo.forEach(rotulo => {
    campos[rotulo] = texto_((d.campos || {})[rotulo], rotulo, 1, 300);
  });

  const alc = calcularAlcada_(tipo, salaId);
  const seq = ler_('Solicitacoes').length + 1;
  const id = novoId_('S');
  const codigo = 'GAV-' + ('00000' + seq).slice(-6) + '-' + sha_(id).slice(0, 4).toUpperCase();
  const s = inserir_('Solicitacoes', {
    id: id, codigo: codigo, tipo_id: tipo.id, tipo_nome: tipo.nome, sala_id: salaId,
    consultor_id: u.id, consultor_nome: u.nome, cliente: cliente, cpf: formatarCpf_(d.cpf),
    empreendimento: String(d.empreendimento || '').trim().slice(0, 120), valor: valor,
    campos: JSON.stringify(campos), justificativa: justificativa, status: 'pendente',
    alcada: alc.alcada, alcada_motivo: alc.motivo, criado_em: agora_(), atualizado_em: agora_(),
  });
  auditar_(u, 'criou', 'solicitacao', s.id, 'Alçada: ' + alc.alcada + ' — ' + alc.motivo);
  const destinos = destinatariosDaAlcada_(salaId, alc.alcada).filter(x => x.id !== u.id);
  notificar_(destinos.map(x => x.id), 'Nova exceção para aprovar',
    tipo.nome + ' — ' + cliente + ' (' + sala.nome + ')', '#/solicitacao/' + s.id);
  return solicitacaoPublica_(s, u);
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
  if (decisao === 'aprovada') {
    const assistentes = ler_('Usuarios').filter(x => x.perfil === 'assistente' && x.sala_id === s.sala_id && bool_(x.ativo));
    notificar_(assistentes.map(x => x.id), 'Autorização liberada', s.codigo + ' — ' + s.cliente + ' pode seguir para contrato', link);
  }
  return solicitacaoPublica_(novo, u);
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
      id: id, nome: e.sala[id].nome, regional: c.reg ? c.reg.nome : '', limite_pct: Number(e.sala[id].limite_pct || 0),
      vendas: ind.vendas, excecoes: ind.excecoes, pct: Math.round(ind.pct * 10) / 10,
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
      id: x.id, nome: x.nome, superintendente_id: x.superintendente_id, superintendente_nome: nome(x.superintendente_id), ativo: bool_(x.ativo),
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
    regionais: Object.keys(e.reg).map(k => e.reg[k]).map(x => ({
      id: x.id, nome: x.nome, diretoria_id: x.diretoria_id, diretoria_nome: (e.dir[x.diretoria_id] || {}).nome || '',
      gestor_id: x.gestor_id, gestor_nome: nome(x.gestor_id), ativo: bool_(x.ativo),
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
    salas: salasOut,
    usuarios: usuarios.map(p => ({ id: p.id, nome: p.nome, perfil: p.perfil, ativo: bool_(p.ativo) })),
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
  const sup = d.superintendente_id ? buscar_('Usuarios', d.superintendente_id) : null;
  if (d.superintendente_id && (!sup || sup.perfil !== 'superintendente')) throw falha_('Selecione um usuário com perfil Superintendente.');
  const r = salvarRegistro_('Diretorias', d.id, { nome: nome, superintendente_id: sup ? sup.id : '', ativo: boolTxt_(d.ativo) }, 'D');
  auditar_(u, d.id ? 'editou' : 'criou', 'diretoria', r.id, nome);
  return limpo_(r);
}

function salvarRegional_(d, u) {
  const nome = texto_(d.nome, 'Nome da regional', 2, 80);
  nomeUnico_('Regionais', nome, d.id);
  if (d.diretoria_id && !estrutura_().dir[d.diretoria_id]) throw falha_('Diretoria inválida.');
  const gestor = d.gestor_id ? buscar_('Usuarios', d.gestor_id) : null;
  if (d.gestor_id && (!gestor || gestor.perfil !== 'regional')) throw falha_('Selecione um usuário com perfil Regional.');
  const r = salvarRegistro_('Regionais', d.id, {
    nome: nome, diretoria_id: d.diretoria_id || '', gestor_id: gestor ? gestor.id : '', ativo: boolTxt_(d.ativo),
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
  if (u.perfil === 'superintendente') return ler_('Diretorias').filter(x => x.superintendente_id === u.id).map(x => x.id);
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
      criado_em: agora_(), ultimo_acesso: '',
    }, dados));
  }
  aplicarVinculos_(registro, Array.isArray(d.vinculo_ids) ? d.vinculo_ids : null);
  auditar_(u, d.id ? 'editou' : 'criou', 'usuario', registro.id, nome + ' — ' + perfil);
  return { usuario: Object.assign(perfilPublico_(registro), { vinculo_ids: vinculosDe_(registro) }), senha_temporaria: senhaTemp };
}

/** Superintendente → diretorias; Regional → regionais. Ao mudar de perfil, os vínculos antigos são removidos. */
function aplicarVinculos_(reg, ids) {
  const ehSup = reg.perfil === 'superintendente';
  const ehReg = reg.perfil === 'regional';
  ler_('Diretorias').forEach(x => {
    const deve = ehSup && (ids ? ids.indexOf(x.id) >= 0 : x.superintendente_id === reg.id);
    if (deve && x.superintendente_id !== reg.id) atualizar_('Diretorias', x, { superintendente_id: reg.id });
    if (!deve && x.superintendente_id === reg.id) atualizar_('Diretorias', x, { superintendente_id: '' });
  });
  ler_('Regionais').forEach(x => {
    const deve = ehReg && (ids ? ids.indexOf(x.id) >= 0 : x.gestor_id === reg.id);
    if (deve && x.gestor_id !== reg.id) atualizar_('Regionais', x, { gestor_id: reg.id });
    if (!deve && x.gestor_id === reg.id) atualizar_('Regionais', x, { gestor_id: '' });
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
  if (ALCADAS.indexOf(d.alcada) < 0) throw falha_('Selecione a alçada: gerente, regional ou superintendente.');
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
  const appId = p.getProperty('ONESIGNAL_APP_ID');
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
      push_configurado: !!(p.getProperty('ONESIGNAL_APP_ID') && p.getProperty('ONESIGNAL_REST_KEY')),
      app_url: CONFIG.APP_URL,
      abas: ss_().getSheets().map(s => ({ nome: s.getName(), linhas: Math.max(0, s.getLastRow() - 1) })),
      ultimo_erro: erros.length ? erros[erros.length - 1] : null,
      tempo_leitura_ms: Date.now() - inicio,
    },
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
  }

  let mensagem = '';
  if (!ler_('Usuarios').some(u => u.perfil === 'master')) {
    if (/seu-email/.test(CONFIG.MASTER_EMAIL)) throw new Error('Troque CONFIG.MASTER_EMAIL pelo seu e-mail antes de rodar setup().');
    const senha = senhaTemporaria_();
    const salt = Utilities.getUuid();
    inserir_('Usuarios', {
      id: novoId_('U'), nome: CONFIG.MASTER_NOME, email: CONFIG.MASTER_EMAIL.toLowerCase(), telefone: '', perfil: 'master',
      sala_id: '', ativo: 'true', senha_hash: hashSenha_(senha, salt), salt: salt, trocar_senha: 'true', criado_em: agora_(), ultimo_acesso: '',
    });
    mensagem = 'USUÁRIO MASTER CRIADO → e-mail: ' + CONFIG.MASTER_EMAIL + ' | senha provisória: ' + senha;
  } else {
    mensagem = 'O usuário master já existia (nenhuma senha alterada).';
  }

  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'manutencao') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('manutencao').timeBased().everyDays(1).atHour(3).create();

  log_('INFO', 'backend', 'setup', 'editor', 'Instalação/atualização executada', '', '', '');
  Logger.log('✅ Setup concluído. ' + mensagem);
  return mensagem;
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
