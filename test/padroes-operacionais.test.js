const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const { criarRouterPadroesOperacionais } = require('../routes/padroes-operacionais');
const criarRouterCartoes = require('../routes/cartoes');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function criarSupabaseMock(tabelas) {
  function consultaTabela(nome) {
    let filtro = () => true;
    let ordenacao = null;
    let limite = null;
    let operacao = null;
    let valorOperacao = null;
    const consulta = {
      select() { return consulta; },
      eq(campo, valor) { const anterior = filtro; filtro = (item) => anterior(item) && item[campo] === valor; return consulta; },
      order(campo, opcoes = {}) { ordenacao = { campo, asc: opcoes.ascending !== false }; return consulta; },
      limit(valor) { limite = valor; return consulta; },
      maybeSingle() { operacao = operacao || 'select'; valorOperacao = { single: true }; return consulta; },
      single() { valorOperacao = { ...(valorOperacao || {}), single: true }; return consulta; },
      insert(payload) { operacao = 'insert'; valorOperacao = payload; return consulta; },
      update(payload) { operacao = 'update'; valorOperacao = payload; return consulta; },
      delete() { operacao = 'delete'; return consulta; },
      then(resolve, reject) {
        try {
          const lista = tabelas[nome] || (tabelas[nome] = []);
          let alvo = lista.filter(filtro);
          if (ordenacao) alvo = [...alvo].sort((a, b) => {
            const comparacao = String(a[ordenacao.campo] ?? '').localeCompare(String(b[ordenacao.campo] ?? ''));
            return ordenacao.asc ? comparacao : -comparacao;
          });
          if (limite != null) alvo = alvo.slice(0, limite);
          if (operacao === 'insert') {
            const linhas = Array.isArray(valorOperacao) ? valorOperacao : [valorOperacao];
            lista.push(...linhas.map(clone));
            alvo = linhas.map(clone);
          } else if (operacao === 'update') {
            alvo.forEach((item) => Object.assign(item, clone(valorOperacao)));
            alvo = alvo.map(clone);
          } else if (operacao === 'delete') {
            for (let i = lista.length - 1; i >= 0; i -= 1) if (filtro(lista[i])) lista.splice(i, 1);
            alvo = [];
          } else {
            alvo = alvo.map(clone);
          }
          const data = valorOperacao?.single ? (alvo[0] || null) : alvo;
          return Promise.resolve(resolve({ data, error: null }));
        } catch (erro) {
          return Promise.reject(reject ? reject(erro) : erro);
        }
      },
    };
    return consulta;
  }
  return {
    from(nome) { return consultaTabela(nome); },
    rpc: async () => ({ data: null, error: null }),
  };
}

function requisitar(router, caminho, opcoes = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return new Promise((resolve, reject) => {
    const servidor = app.listen(0, '127.0.0.1', async () => {
      try {
        const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`, opcoes);
        resolve(resposta);
      } catch (erro) {
        reject(erro);
      } finally {
        servidor.close();
      }
    });
  });
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const p3 = (req, _res, next) => { req.user = { usuario: 'p3-teste', nome: 'P3', role: 'P3' }; next(); };
const adjunto = (req, _res, next) => { req.user = { usuario: 'adj-teste', nome: 'Adjunto', role: 'Adjunto' }; next(); };

function routerPadroes(tabelas, editar = adjunto, administrar = p3) {
  return criarRouterPadroesOperacionais({
    asyncRoute,
    exigirEdicaoPadrao: editar,
    exigirP3: administrar,
    generateId: (prefixo) => `${prefixo}-teste-${Date.now()}`,
    registrarAuditoria: async () => null,
    supabase: criarSupabaseMock(tabelas),
  });
}

test('publicação cria fotografia versionada e detalhe expõe histórico', async () => {
  const tabelas = {
    cartao_grupos_modelo: [{ id: 'p-1', nome: 'Ronda Escolar', ativo: true, publicado: false, versao: 0, componentes: [{ id: 'c-1', setor: 'Escola' }], configuracao: {}, metadados: {} }],
    cartao_grupos_modelo_versoes: [],
  };
  const router = routerPadroes(tabelas, p3, p3);
  const resposta = await requisitar(router, '/api/padroes-operacionais/p-1/publicar', { method: 'POST' });
  assert.strictEqual(resposta.status, 200);
  const corpo = await resposta.json();
  assert.strictEqual(corpo.versao, 1);
  assert.strictEqual(corpo.publicado, true);
  assert.strictEqual(tabelas.cartao_grupos_modelo_versoes.length, 1);
  assert.deepStrictEqual(tabelas.cartao_grupos_modelo_versoes[0].snapshot.componentes, [{ id: 'c-1', setor: 'Escola' }]);

  const detalhe = await requisitar(router, '/api/padroes-operacionais/p-1?detalhe=1');
  assert.strictEqual(detalhe.status, 200);
  assert.strictEqual((await detalhe.json()).versoes.length, 1);
});

test('P3 atualiza seletivamente e Adjunto/Oficial não editam o padrão mestre', async () => {
  const tabelas = { cartao_grupos_modelo: [{ id: 'p-1', nome: 'Ronda', tipo: 'Especial', ativo: true, publicado: true, versao: 1, componentes: [], configuracao: {}, metadados: {} }] };
  const resposta = await requisitar(routerPadroes(tabelas, p3, p3), '/api/padroes-operacionais/p-1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descricao: 'Só a descrição' }),
  });
  assert.strictEqual(resposta.status, 200);
  assert.strictEqual(tabelas.cartao_grupos_modelo[0].descricao, 'Só a descrição');
  assert.strictEqual(tabelas.cartao_grupos_modelo[0].nome, 'Ronda');

  const adjuntoSemEdicao = (req, res) => { req.user = { usuario: 'adjunto', role: 'Adjunto' }; res.status(403).json({ error: 'negado' }); };
  const negado = await requisitar(routerPadroes(tabelas, adjuntoSemEdicao, adjuntoSemEdicao), '/api/padroes-operacionais/p-1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descricao: 'não' }),
  });
  assert.strictEqual(negado.status, 403);
});

test('adicionar padrão copia snapshot e metadados para viatura sem diárias e valida operação por data', async () => {
  const tabelas = {
    cartao_grupos_modelo: [{ id: 'p-1', nome: 'Ronda Escolar', ativo: true, publicado: true, versao: 4, publicado_em: '2026-08-16T10:00:00Z', componentes: [{ id: 'comp-1', prefixo: '0501', setor: 'Escolas', itens: [{ inicio: '08:00', fim: '10:00', local: 'Escola A', atividade: 'Presença' }], metadados: { prioridade: 'alta', qtd_diarias: 99 } }], metadados: { origem: 'P3', total_diarias: 10 }, configuracao: {} }],
    cartao_grupos_modelo_versoes: [{ id: 'v-4', grupo_id: 'p-1', versao: 4, snapshot: { id: 'p-1', nome: 'Ronda Escolar', versao: 4, publicado: true, publicado_em: '2026-08-16T10:00:00Z', componentes: [{ id: 'comp-1', prefixo: '0501', setor: 'Escolas', itens: [{ inicio: '08:00', fim: '10:00', local: 'Escola A', atividade: 'Presença' }], metadados: { prioridade: 'alta', qtd_diarias: 99 } }], metadados: { origem: 'P3', total_diarias: 10 } } }],
    operacoes: [{ id: 'op-1', data_inicio: '2026-08-16', data_termino: '2026-08-16', qtd_diarias_estimada: 99 }],
  };
  const cartao = { id: 'c-1', data: '2026-08-16', is_template: false, atualizado_em: 'v1', viaturas: [] };
  let gravado;
  const supabase = criarSupabaseMock(tabelas);
  const router = criarRouterCartoes({
    CATEGORIAS_VIATURA: [], COMPANHIAS_VIATURA: [], MAX_AVISOS_POR_CARTAO: 3, asyncRoute,
    buscarCartaoPorId: async () => clone(cartao), buscarCartoesFiltrados: async () => [], buscarPadraoAtivo: async () => null,
    deleteRowSeVersao: async () => false, dentroDaJanelaExclusaoAdjunto: () => true,
    exigirEdicaoCartao: adjunto, exigirP3: p3, formatarDataBr: (v) => v, generateId: (prefixo) => `${prefixo}-${Math.random()}`,
    ordenarPorTurno: (itens) => itens, proximoDiaISO: (v) => v, readTabela: async () => [], supabase,
    validarCampos: () => ({ ok: true, valores: {} }), writeRow: async () => null,
    writeRowSeVersao: async (_tabela, linha) => { gravado = clone(linha); return linha; }, registrarAuditoria: async () => null,
  });
  const resposta = await requisitar(router, '/api/cartoes/c-1/componentes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cartao-Atualizado-Em': 'v1' },
    body: JSON.stringify({ padrao_id: 'p-1', operacao_id: 'op-1' }),
  });
  assert.strictEqual(resposta.status, 200);
  const viatura = gravado.viaturas[0];
  assert.strictEqual(viatura.padrao_operacional_versao, 4);
  assert.strictEqual(viatura.operacao_id, 'op-1');
  assert.strictEqual(viatura.padrao_operacional_metadados.qtd_diarias, undefined);
  assert.strictEqual(viatura.padrao_operacional_snapshot.metadados.total_diarias, undefined);

  const foraDaData = await requisitar(router, '/api/cartoes/c-1/componentes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cartao-Atualizado-Em': 'v1' },
    body: JSON.stringify({ padrao_id: 'p-1', operacao_id: 'op-inexistente' }),
  });
  assert.strictEqual(foraDaData.status, 400);
});

test('novo cartão do dia nasce vazio mesmo sem padrão ativo', async () => {
  let gravado;
  let consultouPadrao = false;
  const supabase = criarSupabaseMock({});
  supabase.rpc = async () => ({ data: 12, error: null });
  const router = criarRouterCartoes({
    CATEGORIAS_VIATURA: [], COMPANHIAS_VIATURA: [], MAX_AVISOS_POR_CARTAO: 3, asyncRoute,
    buscarCartaoPorId: async () => null, buscarCartoesFiltrados: async () => [],
    buscarPadraoAtivo: async () => { consultouPadrao = true; return null; },
    deleteRowSeVersao: async () => false, dentroDaJanelaExclusaoAdjunto: () => true,
    exigirEdicaoCartao: adjunto, exigirP3: p3, formatarDataBr: (v) => v,
    generateId: (prefixo) => `${prefixo}-novo`, ordenarPorTurno: (itens) => itens,
    proximoDiaISO: (v) => v, readTabela: async () => [], supabase,
    validarCampos: () => ({ ok: true, valores: {} }), writeRow: async (_tabela, linha) => { gravado = clone(linha); },
    writeRowSeVersao: async () => null, registrarAuditoria: async () => null,
  });
  const routerAutenticado = express.Router();
  routerAutenticado.use(adjunto);
  routerAutenticado.use(router);
  const resposta = await requisitar(routerAutenticado, '/api/cartoes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: '2026-08-17' }),
  });
  assert.strictEqual(resposta.status, 201);
  assert.deepStrictEqual(gravado.viaturas, []);
  assert.strictEqual(gravado.origem_template_id, null);
  assert.strictEqual(consultouPadrao, false);
});
