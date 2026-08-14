const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const criarRouterEscalas = require('../routes/escalas');
const { validarCampos } = require('../lib/dominio');

function criarAplicacao(escalaInicial = null) {
  const linhas = new Map(escalaInicial ? [[escalaInicial.id, structuredClone(escalaInicial)]] : []);
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const exigirP3 = (req, _res, next) => { req.user = { usuario: 'p3-teste', role: 'P3', nome: 'P3 Teste' }; next(); };
  const router = criarRouterEscalas({
    asyncRoute,
    buscarConfig: async () => ({ cota_mensal_diarias: 100 }),
    buscarRow: async (tabela, id) => tabela === 'operacoes'
      ? { id, data_inicio: '2026-08-14', situacao: 'Planejada' }
      : linhas.get(id) || null,
    chaveMilitar: (matricula, nome) => matricula ? `re:${matricula}` : `nome:${String(nome).toLowerCase()}`,
    deleteRow: async () => null,
    deleteRows: async () => null,
    exigirP3,
    generateId: () => 'esc-nova',
    indexarPor: () => new Map(),
    readTabela: async () => [],
    readTabelaIn: async () => [],
    validarCampos,
    writeRow: async (_tabela, linha) => { linhas.set(linha.id, structuredClone(linha)); },
    writeRows: async (_tabela, novas) => novas.forEach((linha) => linhas.set(linha.id, structuredClone(linha))),
    registrarAuditoria: async () => null,
  });
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return { app, linhas };
}

async function requisitar(app, caminho, opcoes) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  try {
    return await fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`, opcoes);
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
}

const corpoBase = { operacao_id: 'op-1', militar_nome: 'POLICIAL TESTE', militar_id: '123', qtd_aparicoes: 1 };

test('nova escala começa com 2 diárias', async () => {
  const { app } = criarAplicacao();
  const res = await requisitar(app, '/api/escalas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoBase) });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).total_diarias, 2);
});

for (const total of [0, 1, 3]) {
  test(`P3 pode registrar ${total} diária(s)`, async () => {
    const { app } = criarAplicacao();
    const res = await requisitar(app, '/api/escalas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpoBase, total_diarias: total }) });
    assert.strictEqual(res.status, 201);
    assert.strictEqual((await res.json()).total_diarias, total);
  });
}

test('valor negativo de diárias é rejeitado', async () => {
  const { app } = criarAplicacao();
  const res = await requisitar(app, '/api/escalas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpoBase, total_diarias: -1 }) });
  assert.strictEqual(res.status, 400);
});

test('alterar aparições não recalcula as diárias registradas', async () => {
  const atual = { id: 'esc-1', ...corpoBase, total_diarias: 3, data: '2026-08-14' };
  const { app } = criarAplicacao(atual);
  const res = await requisitar(app, '/api/escalas/esc-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qtd_aparicoes: 4 }) });
  assert.strictEqual(res.status, 200);
  const linha = await res.json();
  assert.strictEqual(linha.qtd_aparicoes, 4);
  assert.strictEqual(linha.total_diarias, 3);
});
