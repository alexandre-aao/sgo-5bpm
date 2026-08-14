const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const criarRouterCartoes = require('../routes/cartoes');
const criarRouterEventos = require('../routes/eventos');
const criarRouterRelatorios = require('../routes/relatorios');
const { validarCampos, diariaDaOperacao } = require('../lib/dominio');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const exigirP3 = (req, _res, next) => { req.user = { usuario: 'p3-teste', nome: 'P3 Teste', role: 'P3' }; next(); };

async function requisitar(app, caminho, opcoes = {}) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  try { return await fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`, opcoes); }
  finally { await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve())); }
}

test('interface não oferece seleção semana/fim de semana para modelos ou cartão diário', () => {
  const raiz = path.join(__dirname, '..', 'client', 'src', 'pages', 'modulos', 'cartao');
  const modal = fs.readFileSync(path.join(raiz, 'ModalNovoTemplate.tsx'), 'utf8');
  const header = fs.readFileSync(path.join(raiz, 'CartaoHeader.tsx'), 'utf8');
  assert.doesNotMatch(modal, /template-tipo-periodo|Fim de Semana|Dia Útil/);
  assert.doesNotMatch(header, /cartao-tipo-periodo|Fim de Semana|Dia Útil/);
});

test('migration garante um único Modelo Ordinário ativo sem depender de período', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '015_cartao_ordinario_operacoes_evento_vinculo.sql'), 'utf8');
  assert.match(sql, /ux_cartoes_padrao_ordinario_unico/);
  assert.match(sql, /tipo_modelo = 'ordinario'/);
  assert.match(sql, /drop index if exists ux_cartoes_padrao_unico_periodo/);
  assert.doesNotMatch(sql, /create unique index[^;]+tipo_periodo/is);
});

test('Cartão de Operação publicado é clonado no cartão do dia sem alterar o modelo', async () => {
  const cartao = { id: 'dia-1', data: '2026-08-14', is_template: false, atualizado_em: 'v1', viaturas: [{ id: 'ord-1', prefixo: '0501', itens: [] }] };
  const modelo = { id: 'mod-op-1', is_template: true, tipo_modelo: 'operacao', estado_template: 'publicado', nome_template: 'Sentinela', viaturas: [{ id: 'orig-vtr', prefixo: 'OP-1', setor: 'Área A', itens: [{ id: 'orig-item', inicio: '20:00', fim: '22:00', local: 'Ponto 1', atividade: 'Saturação' }] }] };
  let gravado;
  let sequencia = 0;
  const router = criarRouterCartoes({
    CATEGORIAS_VIATURA: [], COMPANHIAS_VIATURA: [], MAX_AVISOS_POR_CARTAO: 3, asyncRoute,
    buscarCartaoPorId: async (id) => structuredClone(id === cartao.id ? cartao : modelo),
    buscarCartoesFiltrados: async () => [], buscarPadraoAtivo: async () => null,
    deleteRowSeVersao: async () => false, dentroDaJanelaExclusaoAdjunto: () => true,
    exigirEdicaoCartao: exigirP3, exigirP3, formatarDataBr: (v) => v,
    generateId: (p) => `${p}-${++sequencia}`, ordenarPorTurno: (itens) => itens,
    proximoDiaISO: (v) => v, readTabela: async () => [], supabase: {}, validarCampos,
    writeRow: async () => null, writeRowSeVersao: async (_t, linha) => { gravado = structuredClone(linha); return linha; },
    registrarAuditoria: async () => null,
  });
  const app = express(); app.use(express.json()); app.use('/api', router);
  const res = await requisitar(app, '/api/cartoes/dia-1/aplicar-modelo-operacao/mod-op-1', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cartao-Atualizado-Em': 'v1' }, body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(gravado.viaturas.length, 2);
  assert.strictEqual(gravado.viaturas[1].modelo_operacao_nome, 'Sentinela');
  assert.notStrictEqual(gravado.viaturas[1].id, modelo.viaturas[0].id);
  assert.strictEqual(modelo.viaturas[0].id, 'orig-vtr', 'o modelo publicado permanece intacto');
});

test('trocar o Modelo Ordinário ativo não reescreve cartões do dia já criados', async () => {
  const template = { id: 'modelo-novo', is_template: true, tipo_modelo: 'ordinario', estado_template: 'publicado', nome_template: 'Ordinário v2' };
  const cartaoHistorico = { id: 'dia-antigo', data: '2026-08-13', origem_template_id: 'modelo-antigo', viaturas: [{ id: 'v1' }] };
  let rpc;
  let gravacoes = 0;
  const router = criarRouterCartoes({
    CATEGORIAS_VIATURA: [], COMPANHIAS_VIATURA: [], MAX_AVISOS_POR_CARTAO: 3, asyncRoute,
    buscarCartaoPorId: async () => structuredClone(template), buscarCartoesFiltrados: async () => [], buscarPadraoAtivo: async () => null,
    deleteRowSeVersao: async () => false, dentroDaJanelaExclusaoAdjunto: () => true,
    exigirEdicaoCartao: exigirP3, exigirP3, formatarDataBr: (v) => v, generateId: (p) => p,
    ordenarPorTurno: (itens) => itens, proximoDiaISO: (v) => v, readTabela: async () => [], validarCampos,
    supabase: { rpc: async (nome, args) => { rpc = { nome, args }; return { error: null }; } },
    writeRow: async () => { gravacoes += 1; }, writeRowSeVersao: async () => null, registrarAuditoria: async () => null,
  });
  const app = express(); app.use(express.json()); app.use('/api', router);
  const res = await requisitar(app, '/api/cartoes/modelo-novo/padrao-ativo', { method: 'PUT' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(rpc, { nome: 'ativar_cartao_padrao', args: { p_id: 'modelo-novo' } });
  assert.strictEqual(gravacoes, 0);
  assert.deepStrictEqual(cartaoHistorico, { id: 'dia-antigo', data: '2026-08-13', origem_template_id: 'modelo-antigo', viaturas: [{ id: 'v1' }] });
});

test('conversão Evento → Operação preserva vínculo e não exclui o evento', async () => {
  const evento = { id: 'evt-1', nome_evento: 'Pedal Seguro', data_inicio: '2026-08-14', operacao_gerada_id: null };
  let chamadaRpc;
  const router = criarRouterEventos({
    asyncRoute, buscarRow: async () => evento, deleteRow: async () => null, exigirP3,
    generateId: () => 'op-1', readTabela: async () => [evento], validarCampos, writeRow: async () => null,
    registrarAuditoria: async () => null,
    supabase: { rpc: async (_nome, args) => { chamadaRpc = args; return { data: { id: 'op-1', evento_origem_id: 'evt-1', nome_operacao: 'Pedal Seguro' }, error: null }; } },
  });
  const app = express(); app.use(express.json()); app.use('/api', router);
  const res = await requisitar(app, '/api/eventos/evt-1/converter-em-operacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).evento_origem_id, 'evt-1');
  assert.strictEqual(chamadaRpc.p_evento_id, 'evt-1');
  assert.strictEqual(evento.id, 'evt-1');
});

test('Dashboard expõe cota, consumidas, planejadas, comprometidas e saldo usando total registrado', async () => {
  const tabelas = {
    eventos: [], pessoal: [], usuarios: [], alocacoes: [],
    operacoes: [
      { id: 'op-real', data_inicio: '2026-08-14', qtd_diarias_estimada: 99, nome_operacao: 'Real' },
      { id: 'op-plan', data_inicio: '2026-08-15', qtd_diarias_estimada: 4, nome_operacao: 'Planejada', diaria_definida: true },
    ],
    escalas: [{ id: 'e1', operacao_id: 'op-real', total_diarias: 3, militar_nome: 'A' }],
    cartoes: [],
  };
  const router = criarRouterRelatorios({
    asyncRoute, buscarConfig: async () => ({ cota_mensal_diarias: 20 }), diariaDaOperacao, exigirP3,
    getLocalDateStrServer: () => '2026-08-14', indexarPor: (lista, campo) => { const m = new Map(); lista.forEach((x) => m.set(x[campo], [...(m.get(x[campo]) || []), x])); return m; },
    readTabela: async (nome) => tabelas[nome] || [],
  });
  const app = express(); app.use('/api', router);
  const res = await requisitar(app, '/api/dashboard-resumo?mes=08&ano=2026');
  assert.strictEqual(res.status, 200);
  const corpo = await res.json();
  assert.deepStrictEqual(corpo.diarias, { total_pago_periodo: 3, planejado_periodo: 4, comprometido_periodo: 7, saldo_cota_periodo: 13, cota_mensal: 20 });
  assert.strictEqual(corpo.operacional.cartao_hoje_pronto, false);
});
