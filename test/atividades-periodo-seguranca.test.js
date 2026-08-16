const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { registerHooks } = require('node:module');

const criarRouterOperacoes = require('../routes/operacoes');
const { validarCampos } = require('../lib/dominio');

registerHooks({
  resolve(especificador, contexto, seguinte) {
    try {
      return seguinte(especificador, contexto);
    } catch (erro) {
      if (especificador.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(especificador)) {
        for (const extensao of ['.ts', '.tsx']) {
          try { return seguinte(`${especificador}${extensao}`, contexto); } catch { /* tenta a próxima */ }
        }
      }
      throw erro;
    }
  },
});

const urlCliente = (...partes) => pathToFileURL(path.join(__dirname, '..', 'client', 'src', ...partes)).href;
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

async function requisitar(app, caminho, opcoes = {}) {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  try { return await fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`, opcoes); }
  finally { await new Promise((resolve, reject) => servidor.close((erro) => erro ? reject(erro) : resolve())); }
}

test('período: dia único, vários dias, pontas inclusivas e término ausente', async () => {
  const { ocorreNaData } = await import(urlCliente('lib', 'periodo.ts'));
  assert.strictEqual(ocorreNaData('2026-08-15', '2026-08-15', '2026-08-15'), true);
  assert.strictEqual(ocorreNaData('2026-08-15', '2026-08-15', '2026-08-16'), false);
  for (const dia of ['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17']) {
    assert.strictEqual(ocorreNaData('2026-08-14', '2026-08-17', dia), true, dia);
  }
  assert.strictEqual(ocorreNaData('2026-08-14', '2026-08-17', '2026-08-13'), false);
  assert.strictEqual(ocorreNaData('2026-08-14', null, '2026-08-14'), true);
  assert.strictEqual(ocorreNaData('2026-08-14', null, '2026-08-15'), false);
});

test('filtros de Eventos e Operações usam interseção de períodos', async () => {
  const { getEventosFiltrados } = await import(urlCliente('pages', 'modulos', 'eventos', 'filtros.ts'));
  const { getOperacoesFiltradas } = await import(urlCliente('pages', 'modulos', 'operacoes', 'filtros.ts'));
  const evento = { id: 'evt-1', nome_evento: 'Evento prolongado', data_inicio: '2026-08-14', data_termino: '2026-08-17' };
  const operacao = { id: 'op-1', nome_operacao: 'Operação prolongada', data_inicio: '2026-08-14', data_termino: '2026-08-17', situacao: 'Planejada' };
  assert.deepStrictEqual(getEventosFiltrados([evento], { dataInicio: '2026-08-15', dataFim: '2026-08-15', busca: '' }).map((item) => item.id), ['evt-1']);
  assert.deepStrictEqual(getOperacoesFiltradas([operacao], [], { dataInicio: '2026-08-15', dataFim: '2026-08-15', busca: '', situacao: '' }).map((item) => item.id), ['op-1']);
});

test('GET de Operações entrega projeção sem diárias ao perfil operacional e linha completa à P3', async () => {
  const operacao = {
    id: 'op-1', nome_operacao: 'Operação Segura', tipo_operacao: 'Ostensiva',
    data_inicio: '2026-08-15', data_termino: '2026-08-17', horario_inicio: '18:00',
    bairro: 'Centro', endereco: 'Rua A', local_itinerario: 'Setor 1', num_os_manual: 'OS-1',
    qtd_diarias_estimada: 12, diaria_definida: true,
  };
  const exigirP3 = (req, res, next) => req.user?.role === 'P3'
    ? next()
    : res.status(403).json({ error: 'Apenas P3.' });
  const router = criarRouterOperacoes({
    LIMITES_RECORRENCIA: {}, asyncRoute, buscarRow: async () => operacao,
    deleteRow: async () => null, deleteRows: async () => null, diariaDaOperacao: () => 0,
    exigirP3, generateId: () => 'id', indexarPor: () => new Map(),
    readTabela: async () => [operacao], readTabelaIn: async () => [],
    supabase: {}, validarCampos, validarRegraRecorrencia: () => ({ ok: false }),
    writeRow: async () => null, writeRows: async () => null, registrarAuditoria: async () => null,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { role: req.header('x-role') || 'Adjunto' }; next(); });
  app.use('/api', router);

  const respostaAdjunto = await requisitar(app, '/api/operacoes', { headers: { 'x-role': 'Adjunto' } });
  assert.strictEqual(respostaAdjunto.status, 200);
  const [operacional] = await respostaAdjunto.json();
  assert.strictEqual(operacional.nome_operacao, 'Operação Segura');
  assert.strictEqual(operacional.local_itinerario, 'Setor 1');
  assert.strictEqual(Object.hasOwn(operacional, 'qtd_diarias_estimada'), false);
  assert.strictEqual(Object.hasOwn(operacional, 'diaria_definida'), false);

  const respostaP3 = await requisitar(app, '/api/operacoes', { headers: { 'x-role': 'P3' } });
  assert.strictEqual((await respostaP3.json())[0].qtd_diarias_estimada, 12);

  const escritaAdjunto = await requisitar(app, '/api/operacoes/op-1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-role': 'Adjunto' }, body: JSON.stringify({ situacao: 'Executada' }),
  });
  assert.strictEqual(escritaAdjunto.status, 403);
});
