/**
 * Preenche o ambiente LOCAL (node dev/server.js) com dados de demonstração.
 * Uso: node dev/popular-dev.js <senha-do-master-local>
 * Todos os usuários criados ficam com a senha "Teste1234".
 */
const API = 'http://localhost:8080/api';
const SENHA = 'Teste1234';
const senhaMaster = process.argv[2];
if (!senhaMaster) { console.error('Uso: node dev/popular-dev.js <senha-do-master-local>'); process.exit(1); }

async function chamar(action, data, token) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify({ action, data, token }) }).then(x => x.json());
  if (!r.ok) throw new Error(action + ': ' + r.error.message);
  return r.data;
}

(async () => {
  const tm = (await chamar('auth.login', { email: 'master@gav.dev', senha: senhaMaster })).token;
  const tokens = {};
  async function usuario(nome, email, perfil, extra = {}) {
    const telefone = `(81) 9${String(8000 + Object.keys(tokens).length).padStart(4, '0')}-${String(1000 + Object.keys(tokens).length * 7)}`;
    const r = await chamar('usuarios.salvar', { nome, email, perfil, ativo: true, telefone, ...extra }, tm);
    const l = await chamar('auth.login', { email, senha: r.senha_temporaria });
    await chamar('auth.trocarSenha', { senha_atual: r.senha_temporaria, nova_senha: SENHA }, l.token);
    tokens[email] = l.token;
    return r.usuario;
  }

  const sup = await usuario('Natássia Lima', 'superintendente@gav.dev', 'superintendente');
  const regPe = await usuario('Edson Rocha', 'regional.pe@gav.dev', 'regional');
  const regRs = await usuario('Krys Andrade', 'regional.rs@gav.dev', 'regional');
  const dir = await chamar('estrutura.salvarDiretoria', { nome: 'Diretoria Comercial', superintendente_id: sup.id, ativo: true }, tm);
  const rPe = await chamar('estrutura.salvarRegional', { nome: 'Regional Nordeste', diretoria_id: dir.id, gestor_id: regPe.id, ativo: true }, tm);
  const rRs = await chamar('estrutura.salvarRegional', { nome: 'Regional Sul', diretoria_id: dir.id, gestor_id: regRs.id, ativo: true }, tm);
  const salas = {};
  const existentes = (await chamar('cadastro.opcoes', {})).salas;
  for (const [nome, reg, lim] of [['Porto de Galinhas - Dia', rPe, 10], ['Muro Alto', rPe, 12.5], ['Maragogi - Dia', rPe, 8], ['Gramado - Dia', rRs, 15], ['Gramado - Noite', rRs, 10]]) {
    const id = existentes.find(s => s.nome === nome)?.id;
    salas[nome] = await chamar('estrutura.salvarSala', { id, nome, regional_id: reg.id, limite_pct: lim, ativo: true }, tm);
  }
  await usuario('Gabriela Souza', 'gerente@gav.dev', 'gerente', { sala_id: salas['Porto de Galinhas - Dia'].id });
  await usuario('Paulo Mendes', 'gerente.gramado@gav.dev', 'gerente', { sala_id: salas['Gramado - Dia'].id });
  await usuario('Ana Costa', 'assistente@gav.dev', 'assistente', { sala_id: salas['Porto de Galinhas - Dia'].id });
  await usuario('Carlos Mendes', 'consultor@gav.dev', 'consultor', { sala_id: salas['Porto de Galinhas - Dia'].id });
  await usuario('Yasmin Oliveira', 'yasmin@gav.dev', 'consultor', { sala_id: salas['Porto de Galinhas - Dia'].id });
  await usuario('Lucas Mira', 'lucas@gav.dev', 'consultor', { sala_id: salas['Gramado - Dia'].id });
  await usuario('Ricardo Gomes', 'ricardo@gav.dev', 'consultor', { sala_id: salas['Muro Alto'].id });

  const tipos = await chamar('tipos.listar', {}, tm);
  const tipo = n => tipos.find(t => t.nome.startsWith(n));
  const campos = (t, v) => Object.fromEntries(t.campos.map((c, i) => [c, v[i] || 'Conforme negociação']));
  const mes = (await chamar('dashboard.obter', {}, tm)).mes;
  await chamar('vendas.salvar', { sala_id: salas['Porto de Galinhas - Dia'].id, mes, total_vendas: 42 }, tm);
  await chamar('vendas.salvar', { sala_id: salas['Gramado - Dia'].id, mes, total_vendas: 55 }, tm);
  await chamar('vendas.salvar', { sala_id: salas['Muro Alto'].id, mes, total_vendas: 18 }, tm);

  const cpfs = ['529.982.247-25', '153.509.460-56', '862.883.667-57', '111.444.777-35', '390.533.447-05', '714.602.380-01'];
  const pedidos = [
    ['consultor@gav.dev', 'Parcelamento', 'João Silva', 98000, ['7x', '6x'], 'aprovar', 'gerente@gav.dev'],
    ['yasmin@gav.dev', 'Desconto', 'Maria Oliveira', 135000, ['15', '10'], 'negar', 'regional.pe@gav.dev'],
    ['consultor@gav.dev', 'Recebimento', 'Pedro Santos', 76000, ['SALINAS PARK RESORT', 'PORTO ALTO RESORT'], 'aprovar', 'gerente@gav.dev'],
    ['lucas@gav.dev', 'Parcelamento', 'Fernanda Lima', 112000, ['8x', '6x'], 'aprovar', 'gerente.gramado@gav.dev'],
    ['yasmin@gav.dev', 'Cliente sair', 'Antônio Ferreira', 88000, ['48 horas'], null],
    ['ricardo@gav.dev', 'Parcelamento', 'Beatriz Nunes', 64000, ['7x', '6x'], null],
  ];
  for (let i = 0; i < pedidos.length; i++) {
    const [quem, t, cliente, valor, vals, acao, aprovador] = pedidos[i];
    const tp = tipo(t);
    const s = await chamar('solicitacoes.criar', {
      tipo_id: tp.id, cliente, cpf: cpfs[i], empreendimento: 'SALINAS PARK RESORT', valor, campos: campos(tp, vals),
      justificativa: 'Cliente decidido a fechar hoje, condição necessária para concluir a venda.',
    }, tokens[quem]);
    if (acao) {
      await chamar('solicitacoes.responder', {
        id: s.id, decisao: acao === 'aprovar' ? 'aprovada' : 'negada',
        resposta: acao === 'aprovar' ? 'Aprovado excepcionalmente para este cliente.' : 'Desconto acima do teto da política comercial.',
      }, tokens[aprovador]);
    }
    if (i === 0) await chamar('solicitacoes.desfecho', { id: s.id, desfecho: 'venda_finalizada', contrato: 'CT-2026-0912' }, tokens['assistente@gav.dev']);
  }
  console.log('Dados de demonstração criados. Senha de todos os usuários de teste: ' + SENHA);
})().catch(e => { console.error(e.message); process.exit(1); });
