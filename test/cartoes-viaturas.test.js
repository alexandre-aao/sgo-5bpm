const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const criarRouterCartoes = require('../routes/cartoes');
const { validarCampos } = require('../lib/dominio');
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function criarAplicacao({ cartao, gravar, grupo = null }) {
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

test('criação do cartão não exige versão anterior e devolve o atualizado_em do banco', async () => {
  let persistido = null;
  const app = express();
  app.use(express.json());
  const permitirEdicao = (req, _res, next) => { req.user = { usuario: 'adj-teste', nome: 'Adjunto', role: 'Adjunto' }; next(); };
  const supabase = { rpc: async () => ({ data: 42, error: null }) };
  const router = criarRouterCartoes({
    CATEGORIAS_VIATURA: [], COMPANHIAS_VIATURA: [], MAX_AVISOS_POR_CARTAO: 3, asyncRoute,
    buscarCartaoPorId: async () => persistido && structuredClone(persistido), buscarCartoesFiltrados: async () => [], buscarPadraoAtivo: async () => null,
    deleteRowSeVersao: async () => false, dentroDaJanelaExclusaoAdjunto: () => true,
    exigirEdicaoCartao: permitirEdicao, exigirP3: permitirEdicao, formatarDataBr: (v) => v,
    generateId: () => 'cartao-novo', ordenarPorTurno: (itens) => itens, proximoDiaISO: (v) => v,
    readTabela: async () => [], supabase, validarCampos, writeRow: async (_tabela, linha) => { persistido = { ...structuredClone(linha), atualizado_em: 'v1' }; },
    writeRowSeVersao: async () => null, registrarAuditoria: async () => null,
  });
  app.use(permitirEdicao);
  app.use('/api', router);
  const servidor = await new Promise((resolve, reject) => {
    const ativo = app.listen(0, '127.0.0.1', () => resolve(ativo));
    ativo.once('error', reject);
  });
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/api/cartoes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: '2026-08-21' }),
    });
    assert.strictEqual(resposta.status, 201);
    assert.strictEqual((await resposta.json()).atualizado_em, 'v1');
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
});

test('mutação sem versão responde 428 e uma versão concorrente vencida responde 409', async () => {
  const cartao = { id: 'cp-1', is_template: false, atualizado_em: 'v1', viaturas: [{ id: 'vtr-1', prefixo: '0501', setor: 'A', bairros_ids: ['b1'] }] };
  let gravacoes = 0;
  const appSemVersao = criarAplicacao({ cartao, gravar: async () => { gravacoes += 1; return cartao; } });
  const servidorSemVersao = appSemVersao.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidorSemVersao.once('listening', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidorSemVersao.address().port}/api/cartoes/cp-1/viaturas/vtr-1`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixo: '0502' }),
    });
    assert.strictEqual(resposta.status, 428);
    assert.strictEqual(gravacoes, 0);
  } finally {
    await new Promise((resolve, reject) => servidorSemVersao.close((erro) => erro ? reject(erro) : resolve()));
  }

  const appConflito = criarAplicacao({ cartao, gravar: async () => null });
  const servidorConflito = appConflito.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidorConflito.once('listening', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidorConflito.address().port}/api/cartoes/cp-1/viaturas/vtr-1`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Cartao-Atualizado-Em': 'v1' }, body: JSON.stringify({ prefixo: '0502' }),
    });
    assert.strictEqual(resposta.status, 409);
    assert.strictEqual((await resposta.json()).code, 'CARTAO_DESATUALIZADO');
  } finally {
    await new Promise((resolve, reject) => servidorConflito.close((erro) => erro ? reject(erro) : resolve()));
  }
});

test('backend rejeita uma quarta bairro relacionado sem truncar silenciosamente', async () => {
  const app = criarAplicacao({
    cartao: { id: 'cp-1', is_template: false, viaturas: [{ id: 'vtr-1', prefixo: '0501', setor: 'A', bairros_ids: ['b1'] }] },
    gravar: async () => { throw new Error('não deveria gravar'); },
  });
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/api/cartoes/cp-1/viaturas/vtr-1`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Cartao-Atualizado-Em': 'v1' },
      body: JSON.stringify({ bairros_ids: ['b1', 'b2', 'b3', 'b4'] }),
    });
    assert.strictEqual(resposta.status, 400);
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
});
