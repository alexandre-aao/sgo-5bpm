const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const criarRouterCartoes = require('../routes/cartoes');
const { validarCampos } = require('../lib/dominio');

function criarAplicacao({ cartao, gravar, grupo = null }) {
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
    supabase: {
      from(tabela) {
        if (tabela !== 'cartao_grupos_modelo') throw new Error(`Tabela não simulada: ${tabela}`);
        const consulta = {
          select: () => consulta,
          eq: () => consulta,
          maybeSingle: async () => ({ data: grupo, error: null }),
        };
        return consulta;
      },
    },
    validarCampos,
    writeRow: async () => null,
    writeRowSeVersao: gravar,
    registrarAuditoria: async () => null,
  });

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

async function requisitarAplicacaoGrupo(app, viaturasIds) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    servidor.once('listening', resolve);
    servidor.once('error', reject);
  });

  try {
    const { port } = servidor.address();
    return await fetch(`http://127.0.0.1:${port}/api/cartoes/cp-1/aplicar-grupo-modelo/gm-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cartao-Atualizado-Em': '2026-08-08T12:00:00.000Z' },
      body: JSON.stringify({ viaturas_ids: viaturasIds }),
    });
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
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

test('aplicar grupo sem viatura selecionada não altera todas as viaturas', async () => {
  let gravacoes = 0;
  const app = criarAplicacao({
    cartao: {
      id: 'cp-1', is_template: false,
      viaturas: [{ id: 'vtr-1', itens: [{ id: 'antigo-1' }] }, { id: 'vtr-2', itens: [{ id: 'antigo-2' }] }],
    },
    grupo: { id: 'gm-1', nome: 'Grupo teste', ativo: true, horario_inicio: '08:00', horario_fim: '09:00', area: 'Setor A', missao: 'Patrulhamento', configuracao: {} },
    gravar: async () => { gravacoes += 1; return {}; },
  });

  const resposta = await requisitarAplicacaoGrupo(app, []);
  assert.strictEqual(resposta.status, 400);
  assert.strictEqual(gravacoes, 0);
});

test('aplicar grupo altera somente as viaturas explicitamente selecionadas', async () => {
  let cartaoGravado = null;
  const app = criarAplicacao({
    cartao: {
      id: 'cp-1', is_template: false,
      viaturas: [{ id: 'vtr-1', itens: [{ id: 'antigo-1' }] }, { id: 'vtr-2', itens: [{ id: 'antigo-2' }] }],
    },
    grupo: { id: 'gm-1', nome: 'Grupo teste', ativo: true, horario_inicio: '08:00', horario_fim: '09:00', area: 'Setor A', missao: 'Patrulhamento', configuracao: {} },
    gravar: async (_tabela, cartaoAtualizado) => { cartaoGravado = cartaoAtualizado; return cartaoAtualizado; },
  });

  const resposta = await requisitarAplicacaoGrupo(app, ['vtr-2']);
  assert.strictEqual(resposta.status, 200);
  assert.deepStrictEqual(cartaoGravado.viaturas[0].itens, [{ id: 'antigo-1' }]);
  assert.strictEqual(cartaoGravado.viaturas[1].itens[0].local, 'Setor A');
});
