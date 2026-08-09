const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const criarRouterCartoes = require('../routes/cartoes');

function criarAplicacao({ cartao, gravar }) {
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const permitirEdicao = (req, _res, next) => {
    req.user = { usuario: 'p3-teste', nome: 'P3 Teste', role: 'P3' };
    next();
  };

  const router = criarRouterCartoes({
    CATEGORIAS_VIATURA: [],
    COMPANHIAS_VIATURA: [],
    MAX_AVISOS_POR_CARTAO: 3,
    asyncRoute,
    buscarCartaoPorId: async () => structuredClone(cartao),
    buscarCartoesFiltrados: async () => [],
    buscarPadraoAtivo: async () => null,
    deleteRowSeVersao: async () => false,
    dentroDaJanelaExclusaoAdjunto: () => true,
    exigirEdicaoCartao: permitirEdicao,
    exigirP3: permitirEdicao,
    formatarDataBr: (valor) => valor,
    generateId: () => 'id-teste',
    ordenarPorTurno: (itens) => itens,
    proximoDiaISO: (valor) => valor,
    readTabela: async () => [],
    supabase: {},
    validarCampos: () => [],
    writeRow: async () => null,
    writeRowSeVersao: gravar,
  });

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

async function requisitarDelete(app, viaturaId) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    servidor.once('listening', resolve);
    servidor.once('error', reject);
  });

  try {
    const { port } = servidor.address();
    return await fetch(`http://127.0.0.1:${port}/api/cartoes/cp-1/viaturas/${viaturaId}`, {
      method: 'DELETE',
      headers: { 'X-Cartao-Atualizado-Em': '2026-08-08T12:00:00.000Z' },
    });
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
}

test('DELETE de viatura inexistente responde 404 sem gravar o cartão', async () => {
  let gravacoes = 0;
  const app = criarAplicacao({
    cartao: { id: 'cp-1', is_template: false, viaturas: [{ id: 'vtr-1' }] },
    gravar: async () => { gravacoes += 1; return {}; },
  });

  const resposta = await requisitarDelete(app, 'vtr-inexistente');
  assert.strictEqual(resposta.status, 404);
  assert.deepStrictEqual(await resposta.json(), { error: 'Viatura não encontrada neste cartão' });
  assert.strictEqual(gravacoes, 0);
});

test('DELETE de viatura existente continua removendo e gravando o cartão', async () => {
  let cartaoGravado = null;
  const app = criarAplicacao({
    cartao: { id: 'cp-1', is_template: false, viaturas: [{ id: 'vtr-1' }, { id: 'vtr-2' }] },
    gravar: async (_tabela, cartaoAtualizado) => {
      cartaoGravado = cartaoAtualizado;
      return cartaoAtualizado;
    },
  });

  const resposta = await requisitarDelete(app, 'vtr-1');
  assert.strictEqual(resposta.status, 200);
  assert.deepStrictEqual(await resposta.json(), { message: 'Viatura removida do cartão' });
  assert.deepStrictEqual(cartaoGravado.viaturas, [{ id: 'vtr-2' }]);
});
