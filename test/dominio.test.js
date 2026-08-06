const test = require('node:test');
const assert = require('node:assert');

const {
  validarCampos,
  proximoDiaISO,
  formatarDataBr,
  dentroDaJanelaExclusaoAdjunto,
  diariaDaOperacao,
  ordenarPorTurno,
} = require('../lib/dominio');

// -------------------------------------------------------------
// validarCampos
// -------------------------------------------------------------

test('validarCampos: campo obrigatório ausente é rejeitado com o label legível', () => {
  const r = validarCampos({}, { nome: { obrigatorio: true, tipo: 'string', label: 'Nome do Evento' } });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /Nome do Evento/);
});

test('validarCampos: string vazia conta como ausente, não como valor', () => {
  const r = validarCampos({ nome: '' }, { nome: { obrigatorio: true, tipo: 'string', label: 'Nome' } });
  assert.strictEqual(r.ok, false);
});

test('validarCampos: aplica trim nas strings', () => {
  const r = validarCampos({ nome: '  Blitz  ' }, { nome: { obrigatorio: true, tipo: 'string' } });
  assert.strictEqual(r.valores.nome, 'Blitz');
});

test('validarCampos: campo ausente SEM padrao não entra em valores (permite PUT parcial)', () => {
  const r = validarCampos({}, { obs: { obrigatorio: false, tipo: 'string' } });
  assert.strictEqual(r.ok, true);
  assert.ok(!('obs' in r.valores), 'campo sem padrao não pode aparecer, senão o PUT apagaria o valor existente');
});

test('validarCampos: campo ausente COM padrao entra com o padrao', () => {
  const r = validarCampos({}, { situacao: { obrigatorio: false, tipo: 'string', padrao: 'Planejada' } });
  assert.strictEqual(r.valores.situacao, 'Planejada');
});

test('validarCampos: max é medido DEPOIS do trim', () => {
  const r = validarCampos({ nome: '   abc   ' }, { nome: { tipo: 'string', max: 3 } });
  assert.strictEqual(r.ok, true, 'os espaços não deveriam contar para o limite');
  assert.strictEqual(r.valores.nome, 'abc');
});

test('validarCampos: string acima do max é rejeitada', () => {
  const r = validarCampos({ nome: 'abcd' }, { nome: { tipo: 'string', max: 3, label: 'Nome' } });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /no máximo 3/);
});

test('validarCampos: number aceita string numérica e rejeita texto', () => {
  assert.strictEqual(validarCampos({ q: '12' }, { q: { tipo: 'number' } }).valores.q, 12);
  assert.strictEqual(validarCampos({ q: 'doze' }, { q: { tipo: 'number' } }).ok, false);
});

test('validarCampos: zero é valor legítimo, não "vazio"', () => {
  const r = validarCampos({ q: 0 }, { q: { tipo: 'number', padrao: 99 } });
  assert.strictEqual(r.valores.q, 0, '0 não pode cair no padrão — é uma quantidade válida');
});

test('validarCampos: lista fechada rejeita valor fora dela', () => {
  const schema = { tipo: { tipo: 'string', valores: ['Blitz', 'Cerco'], label: 'Tipo' } };
  assert.strictEqual(validarCampos({ tipo: 'Cerco' }, schema).ok, true);
  assert.strictEqual(validarCampos({ tipo: 'Outro' }, schema).ok, false);
});

test('validarCampos: boolean normaliza para true/false', () => {
  assert.strictEqual(validarCampos({ b: 'sim' }, { b: { tipo: 'boolean' } }).valores.b, true);
  // string vazia cai no ramo de "ausente" antes de virar boolean
  assert.ok(!('b' in validarCampos({ b: '' }, { b: { tipo: 'boolean' } }).valores));
});

// -------------------------------------------------------------
// proximoDiaISO / formatarDataBr
// -------------------------------------------------------------

test('proximoDiaISO: vira o mês, o ano e o ano bissexto', () => {
  assert.strictEqual(proximoDiaISO('2026-08-06'), '2026-08-07');
  assert.strictEqual(proximoDiaISO('2026-08-31'), '2026-09-01');
  assert.strictEqual(proximoDiaISO('2026-12-31'), '2027-01-01');
  assert.strictEqual(proximoDiaISO('2028-02-28'), '2028-02-29');
  assert.strictEqual(proximoDiaISO('2026-02-28'), '2026-03-01');
});

test('formatarDataBr: ISO vira dd/mm/aaaa e vazio continua vazio', () => {
  assert.strictEqual(formatarDataBr('2026-08-06'), '06/08/2026');
  assert.strictEqual(formatarDataBr(''), '');
  assert.strictEqual(formatarDataBr(null), '');
});

// -------------------------------------------------------------
// dentroDaJanelaExclusaoAdjunto
// -------------------------------------------------------------
// O limite é 07h00 do dia seguinte no fuso do batalhão (UTC-3 fixo).
// 07h00 em America/Fortaleza = 10h00 UTC.

test('janela: no próprio dia do serviço o Adjunto pode excluir', () => {
  const agora = new Date('2026-08-06T18:00:00Z');
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), true);
});

test('janela: exatamente 07h00 do dia seguinte ainda está DENTRO (limite inclusivo)', () => {
  const agora = new Date('2026-08-07T10:00:00Z');
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), true);
});

test('janela: um segundo depois das 07h00 do dia seguinte já está FORA', () => {
  const agora = new Date('2026-08-07T10:00:01Z');
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), false);
});

test('janela: 06h59 do dia seguinte ainda está dentro', () => {
  const agora = new Date('2026-08-07T09:59:00Z');
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), true);
});

test('janela: o offset -03:00 é aplicado — 08h00 UTC do dia seguinte é 05h00 local, dentro', () => {
  const agora = new Date('2026-08-07T08:00:00Z');
  assert.strictEqual(
    dentroDaJanelaExclusaoAdjunto('2026-08-06', agora), true,
    'se o fuso fosse ignorado, 08h UTC seria lido como 08h local e cairia fora',
  );
});

test('janela: data de serviço vazia nunca está na janela', () => {
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('', new Date()), false);
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto(null, new Date()), false);
});

test('janela: vale na virada de mês', () => {
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('2026-08-31', new Date('2026-09-01T09:00:00Z')), true);
  assert.strictEqual(dentroDaJanelaExclusaoAdjunto('2026-08-31', new Date('2026-09-01T11:00:00Z')), false);
});

test('janela: o resultado não depende do fuso do processo', () => {
  // Fixa o instante em UTC; o cálculo usa offset literal, então o TZ da máquina
  // não pode influenciar. A Vercel roda em UTC e o batalhão em America/Fortaleza.
  const agora = new Date('2026-08-07T09:59:59Z');
  const tzOriginal = process.env.TZ;
  const resultados = [];
  for (const tz of ['UTC', 'America/Fortaleza', 'Asia/Tokyo']) {
    process.env.TZ = tz;
    resultados.push(dentroDaJanelaExclusaoAdjunto('2026-08-06', agora));
  }
  process.env.TZ = tzOriginal;
  assert.deepStrictEqual(resultados, [true, true, true]);
});

// -------------------------------------------------------------
// diariaDaOperacao
// -------------------------------------------------------------

test('diariaDaOperacao: sem escala, vale a estimativa', () => {
  assert.strictEqual(diariaDaOperacao({ qtd_diarias_estimada: 12 }, []), 12);
});

test('diariaDaOperacao: com escala, a soma real SUBSTITUI a estimativa (nunca soma as duas)', () => {
  const op = { qtd_diarias_estimada: 100 };
  const escalas = [{ total_diarias: 4 }, { total_diarias: 6 }];
  assert.strictEqual(
    diariaDaOperacao(op, escalas), 10,
    'somar estimativa + real contaria a mesma diária duas vezes no planejador',
  );
});

test('diariaDaOperacao: estimativa ausente vale 0', () => {
  assert.strictEqual(diariaDaOperacao({}, []), 0);
});

test('diariaDaOperacao: escala sem total_diarias conta como 0, não quebra', () => {
  assert.strictEqual(diariaDaOperacao({ qtd_diarias_estimada: 5 }, [{}, { total_diarias: 2 }]), 2);
});

// -------------------------------------------------------------
// ordenarPorTurno
// -------------------------------------------------------------

test('ordenarPorTurno: a madrugada vem DEPOIS da noite (âncora nas 07h)', () => {
  const itens = [
    { id: 'a', inicio: '06:30' },
    { id: 'b', inicio: '23:00' },
    { id: 'c', inicio: '07:00' },
    { id: 'd', inicio: '13:00' },
  ];
  assert.deepStrictEqual(ordenarPorTurno(itens).map((i) => i.id), ['c', 'd', 'b', 'a']);
});

test('ordenarPorTurno: 07h00 é o primeiro item do turno', () => {
  const itens = [{ id: 'x', inicio: '08:00' }, { id: 'y', inicio: '07:00' }];
  assert.deepStrictEqual(ordenarPorTurno(itens).map((i) => i.id), ['y', 'x']);
});

test('ordenarPorTurno: NÃO muta o array recebido', () => {
  const itens = [{ id: 'a', inicio: '23:00' }, { id: 'b', inicio: '08:00' }];
  const copia = itens.map((i) => i.id);
  ordenarPorTurno(itens);
  assert.deepStrictEqual(
    itens.map((i) => i.id), copia,
    'a ordem do array persistido entra no hash de conteúdo do cartão — mutar aqui jogaria viaturas enviadas para "alterado"',
  );
});

test('ordenarPorTurno: aceita outro início de turno', () => {
  const itens = [{ id: 'a', inicio: '07:00' }, { id: 'b', inicio: '19:00' }];
  assert.deepStrictEqual(ordenarPorTurno(itens, '19:00').map((i) => i.id), ['b', 'a']);
});

test('ordenarPorTurno: horário ausente ou inválido não quebra a ordenação', () => {
  const itens = [{ id: 'a', inicio: '13:00' }, { id: 'b' }, { id: 'c', inicio: '' }];
  const ordenados = ordenarPorTurno(itens);
  assert.strictEqual(ordenados.length, 3);
  // 00:00 fica a 17h de distância das 07h; 13:00 fica a 6h — o válido vem antes.
  assert.strictEqual(ordenados[0].id, 'a');
});
