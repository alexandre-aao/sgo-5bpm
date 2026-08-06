// Paridade entre as regras DUPLICADAS no servidor e no cliente (Fase 5, item 2).
//
// Duas regras existem escritas duas vezes, de propósito — o servidor decide e o
// cliente antecipa o resultado na tela:
//   chaveMilitar                 -> lib/dominio.js  x  client/src/lib/escalaLote.ts
//   dentroDaJanelaExclusaoAdjunto-> lib/dominio.js  x  client/src/lib/janelaCartao.ts
// Divergir significa a tela prometer uma coisa e o servidor fazer outra: um militar
// duplicado na escala, ou um botão de excluir que aparece e depois dá 403.
//
// Os arquivos .ts são carregados direto pelo type stripping nativo do Node (v22.18+).
// O hook de resolução abaixo só completa a extensão: o código do cliente importa
// `./cartaoConflitos` sem `.ts` porque quem resolve isso lá é o Vite, não o Node.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { registerHooks } = require('node:module');

registerHooks({
  resolve(especificador, contexto, seguinte) {
    try {
      return seguinte(especificador, contexto);
    } catch (erro) {
      if (especificador.startsWith('.') && !/\.[cm]?[jt]s$/.test(especificador)) {
        return seguinte(`${especificador}.ts`, contexto);
      }
      throw erro;
    }
  },
});

const servidor = require('../lib/dominio');

const urlLib = (arquivo) =>
  pathToFileURL(path.join(__dirname, '..', 'client', 'src', 'lib', arquivo)).href;

// -------------------------------------------------------------
// Sanidade do próprio teste
// -------------------------------------------------------------

test('os dois lados são MESMO implementações distintas (não é tautologia)', async () => {
  const escalaLote = await import(urlLib('escalaLote.ts'));
  const janela = await import(urlLib('janelaCartao.ts'));
  // Se algum dia o cliente passar a reexportar o módulo do servidor, estes testes
  // continuariam verdes sem provar nada. Esta asserção falha nesse caso.
  assert.notStrictEqual(escalaLote.chaveMilitar, servidor.chaveMilitar);
  assert.notStrictEqual(janela.dentroDaJanelaExclusaoAdjunto, servidor.dentroDaJanelaExclusaoAdjunto);
  assert.notStrictEqual(janela.proximoDiaISO, servidor.proximoDiaISO);
});

// -------------------------------------------------------------
// chaveMilitar
// -------------------------------------------------------------

test('paridade: chaveMilitar concorda nos dois lados, incluindo as bordas', async () => {
  const cliente = await import(urlLib('escalaLote.ts'));

  const casos = [
    ['2066181', 'SILVA'],
    ['2066181', ''],
    // Matrícula vazia: é o caso que motivou o fallback por nome. Sem ele, dois
    // militares sem RE colidiriam numa chave vazia e um sobrescreveria o outro.
    ['', 'João da Silva'],
    ['', 'JOÃO DA SILVA'],
    ['', 'joão da silva'],
    ['   ', 'Maria Souza'],
    ['  2504510  ', 'Fulano'],
    ['', '  Espaços  '],
    ['', ''],
    [null, null],
    [null, 'Sem RE'],
    ['123', null],
  ];

  for (const [matricula, nome] of casos) {
    assert.strictEqual(
      servidor.chaveMilitar(matricula, nome),
      cliente.chaveMilitar(matricula, nome),
      `divergência em chaveMilitar(${JSON.stringify(matricula)}, ${JSON.stringify(nome)})`,
    );
  }
});

test('paridade: chaveMilitar trata nomes iguais com caixa diferente como o MESMO militar', async () => {
  const cliente = await import(urlLib('escalaLote.ts'));
  for (const fn of [servidor.chaveMilitar, cliente.chaveMilitar]) {
    assert.strictEqual(fn('', 'SILVA'), fn('', 'silva'));
    assert.strictEqual(fn('', ' Silva '), fn('', 'silva'));
  }
});

test('paridade: a matrícula tem precedência sobre o nome nos dois lados', async () => {
  const cliente = await import(urlLib('escalaLote.ts'));
  for (const fn of [servidor.chaveMilitar, cliente.chaveMilitar]) {
    assert.strictEqual(fn('999', 'Nome A'), fn('999', 'Nome B'));
    assert.notStrictEqual(fn('999', 'X'), fn('', 'X'));
  }
});

// -------------------------------------------------------------
// Janela de exclusão do Adjunto
// -------------------------------------------------------------

test('paridade: proximoDiaISO concorda, inclusive nas viradas', async () => {
  const cliente = await import(urlLib('janelaCartao.ts'));
  for (const data of ['2026-08-06', '2026-08-31', '2026-12-31', '2028-02-28', '2026-02-28', '2027-01-01']) {
    assert.strictEqual(servidor.proximoDiaISO(data), cliente.proximoDiaISO(data), `divergência em ${data}`);
  }
});

test('paridade: a janela das 07h concorda nos dois lados, incluindo o limite exato', async () => {
  const cliente = await import(urlLib('janelaCartao.ts'));

  const instantes = [
    '2026-08-06T00:00:00Z', // véspera, madrugada
    '2026-08-06T18:00:00Z', // dia do serviço
    '2026-08-07T08:00:00Z', // 05h local do dia seguinte — dentro
    '2026-08-07T09:59:59Z', // 06h59:59 local — dentro
    '2026-08-07T10:00:00Z', // 07h00:00 local — limite, inclusivo
    '2026-08-07T10:00:01Z', // 07h00:01 local — fora
    '2026-08-07T23:00:00Z', // bem depois — fora
  ];

  for (const iso of instantes) {
    const agora = new Date(iso);
    assert.strictEqual(
      servidor.dentroDaJanelaExclusaoAdjunto('2026-08-06', agora),
      cliente.dentroDaJanelaExclusaoAdjunto('2026-08-06', agora),
      `divergência no instante ${iso}`,
    );
  }
});

test('paridade: a janela concorda na virada de mês e de ano', async () => {
  const cliente = await import(urlLib('janelaCartao.ts'));
  const casos = [
    ['2026-08-31', '2026-09-01T09:00:00Z'],
    ['2026-08-31', '2026-09-01T11:00:00Z'],
    ['2026-12-31', '2027-01-01T09:59:00Z'],
    ['2026-12-31', '2027-01-01T10:00:01Z'],
  ];
  for (const [dataServico, iso] of casos) {
    const agora = new Date(iso);
    assert.strictEqual(
      servidor.dentroDaJanelaExclusaoAdjunto(dataServico, agora),
      cliente.dentroDaJanelaExclusaoAdjunto(dataServico, agora),
      `divergência em ${dataServico} @ ${iso}`,
    );
  }
});

test('paridade: data de serviço vazia é tratada igual nos dois lados', async () => {
  const cliente = await import(urlLib('janelaCartao.ts'));
  const agora = new Date('2026-08-06T12:00:00Z');
  assert.strictEqual(
    servidor.dentroDaJanelaExclusaoAdjunto('', agora),
    cliente.dentroDaJanelaExclusaoAdjunto('', agora),
  );
});

test('paridade: o fuso do processo não muda o resultado em nenhum dos lados', async () => {
  const cliente = await import(urlLib('janelaCartao.ts'));
  // O cliente roda no fuso do celular do policial e o servidor em UTC na Vercel:
  // o offset é literal (-03:00) justamente para os dois chegarem ao mesmo prazo.
  const agora = new Date('2026-08-07T09:59:59Z');
  const tzOriginal = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Fortaleza', 'Asia/Tokyo', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      assert.strictEqual(servidor.dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), true, `servidor em ${tz}`);
      assert.strictEqual(cliente.dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), true, `cliente em ${tz}`);
    }
  } finally {
    process.env.TZ = tzOriginal;
  }
});

// -------------------------------------------------------------
// Constante do fuso
// -------------------------------------------------------------

test('paridade: TETO_DIARIAS_MILITAR_MES do cliente é o mesmo valor do servidor', async () => {
  const cliente = await import(urlLib('escalaLote.ts'));
  // O servidor guarda o teto no server.js (não é função pura, é constante de
  // regra); aqui o que importa é o número não divergir silenciosamente.
  assert.strictEqual(cliente.TETO_DIARIAS_MILITAR_MES, 20);
});
