const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const { criarRouterUsuarios } = require('../routes/usuarios');

function criarAplicacao({ usuarios, acoes = [] }) {
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const exigirP3 = (req, _res, next) => {
    req.user = { usuario: 'admin', nome: 'Administrador', role: 'P3' };
    next();
  };
  const router = criarRouterUsuarios({
    asyncRoute,
    deleteRow: async () => { acoes.push('excluir-usuario'); },
    exigirP3,
    hashSenha: (senha) => `hash:${senha}`,
    readTabela: async () => structuredClone(usuarios),
    supabase: {
      from(tabela) {
        assert.strictEqual(tabela, 'sessoes');
        const consulta = {
          delete() { return consulta; },
          async eq() { acoes.push('revogar-sessoes'); return { error: null }; },
        };
        return consulta;
      },
    },
    validarCampos: () => ({ ok: true, valores: {} }),
    writeRow: async () => { acoes.push('gravar-usuario'); },
    registrarAuditoria: async () => null,
  });

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

async function requisitar(app, caminho, init) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    servidor.once('listening', resolve);
    servidor.once('error', reject);
  });
  try {
    const { port } = servidor.address();
    return await fetch(`http://127.0.0.1:${port}/api${caminho}`, init);
  } finally {
    await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve()));
  }
}

test('não permite rebaixar o único P3 ativo quando existe apenas outro P3 inativo', async () => {
  const acoes = [];
  const app = criarAplicacao({
    usuarios: [
      { usuario: 'alvo', nome: 'Alvo', role: 'P3', ativo: true },
      { usuario: 'reserva', nome: 'Reserva', role: 'P3', ativo: false },
    ],
    acoes,
  });
  const resposta = await requisitar(app, '/usuarios/alvo', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'Adjunto' }),
  });
  assert.strictEqual(resposta.status, 400);
  assert.deepStrictEqual(acoes, []);
});

test('mudança de perfil revoga sessões antes de gravar o usuário', async () => {
  const acoes = [];
  const app = criarAplicacao({
    usuarios: [
      { usuario: 'alvo', nome: 'Alvo', role: 'P3', ativo: true },
      { usuario: 'outro', nome: 'Outro', role: 'P3', ativo: true },
    ],
    acoes,
  });
  const resposta = await requisitar(app, '/usuarios/alvo', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'Adjunto' }),
  });
  assert.strictEqual(resposta.status, 200);
  assert.deepStrictEqual(acoes.slice(0, 2), ['revogar-sessoes', 'gravar-usuario']);
});

test('não permite excluir o único P3 ativo contando P3 inativo como reserva', async () => {
  const acoes = [];
  const app = criarAplicacao({
    usuarios: [
      { usuario: 'alvo', nome: 'Alvo', role: 'P3', ativo: true },
      { usuario: 'reserva', nome: 'Reserva', role: 'P3', ativo: false },
    ],
    acoes,
  });
  const resposta = await requisitar(app, '/usuarios/alvo', { method: 'DELETE' });
  assert.strictEqual(resposta.status, 400);
  assert.deepStrictEqual(acoes, []);
});
