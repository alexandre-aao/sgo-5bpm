'use strict';

// Testes do motor de recorrência (`node --test`, sem dependência externa — o projeto
// não tem framework de teste e não é hora de introduzir um). Rodar: `npm test`.
// O módulo é puro, então não precisa de Supabase nem de servidor no ar.

const test = require('node:test');
const assert = require('node:assert');
const { gerarDatasRecorrencia, validarRegraRecorrencia, LIMITES } = require('../lib/recorrencia');

test('diária: gera todos os dias do intervalo, inclusive as pontas', () => {
  const datas = gerarDatasRecorrencia({
    tipo: 'diaria', data_inicio: '2026-08-06', data_fim: '2026-08-10'
  });
  assert.deepStrictEqual(datas, ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']);
});

test('diária: dia único (início = fim) gera uma ocorrência', () => {
  const datas = gerarDatasRecorrencia({ tipo: 'diaria', data_inicio: '2026-08-06', data_fim: '2026-08-06' });
  assert.deepStrictEqual(datas, ['2026-08-06']);
});

test('semanal: segunda (1), quarta (3) e sexta (5) de agosto/2026', () => {
  const datas = gerarDatasRecorrencia({
    tipo: 'semanal', dias_semana: [1, 3, 5], data_inicio: '2026-08-01', data_fim: '2026-08-31'
  });
  // Agosto/2026 começa num sábado. Confere o dia da semana de cada data gerada.
  assert.deepStrictEqual(datas, [
    '2026-08-03', '2026-08-05', '2026-08-07',
    '2026-08-10', '2026-08-12', '2026-08-14',
    '2026-08-17', '2026-08-19', '2026-08-21',
    '2026-08-24', '2026-08-26', '2026-08-28',
    '2026-08-31'
  ]);
  for (const d of datas) {
    const [a, m, dia] = d.split('-').map(Number);
    assert.ok([1, 3, 5].includes(new Date(Date.UTC(a, m - 1, dia)).getUTCDay()), `${d} não é seg/qua/sex`);
  }
});

test('semanal: fim de semana (sábado 6 e domingo 0)', () => {
  const datas = gerarDatasRecorrencia({
    tipo: 'semanal', dias_semana: [0, 6], data_inicio: '2026-08-01', data_fim: '2026-08-16'
  });
  assert.deepStrictEqual(datas, ['2026-08-01', '2026-08-02', '2026-08-08', '2026-08-09', '2026-08-15', '2026-08-16']);
});

test('intervalo: a cada 3 dias', () => {
  const datas = gerarDatasRecorrencia({
    tipo: 'intervalo', intervalo_dias: 3, data_inicio: '2026-08-06', data_fim: '2026-08-20'
  });
  assert.deepStrictEqual(datas, ['2026-08-06', '2026-08-09', '2026-08-12', '2026-08-15', '2026-08-18']);
});

test('intervalo: a cada 2 dias atravessando a virada de mês', () => {
  const datas = gerarDatasRecorrencia({
    tipo: 'intervalo', intervalo_dias: 2, data_inicio: '2026-08-29', data_fim: '2026-09-04'
  });
  assert.deepStrictEqual(datas, ['2026-08-29', '2026-08-31', '2026-09-02', '2026-09-04']);
});

test('avulsa: usa só as datas escolhidas, ordenadas e sem repetição', () => {
  const datas = gerarDatasRecorrencia({
    tipo: 'avulsa', datas: ['2026-09-15', '2026-08-06', '2026-09-15', '2026-08-20']
  });
  assert.deepStrictEqual(datas, ['2026-08-06', '2026-08-20', '2026-09-15']);
});

test('datas_excluidas são respeitadas em todos os tipos', () => {
  const diaria = gerarDatasRecorrencia({
    tipo: 'diaria', data_inicio: '2026-09-05', data_fim: '2026-09-09', datas_excluidas: ['2026-09-07']
  });
  assert.deepStrictEqual(diaria, ['2026-09-05', '2026-09-06', '2026-09-08', '2026-09-09']);

  const semanal = gerarDatasRecorrencia({
    tipo: 'semanal', dias_semana: [1], data_inicio: '2026-08-01', data_fim: '2026-08-31',
    datas_excluidas: ['2026-08-17']
  });
  assert.deepStrictEqual(semanal, ['2026-08-03', '2026-08-10', '2026-08-24', '2026-08-31']);

  const avulsa = gerarDatasRecorrencia({
    tipo: 'avulsa', datas: ['2026-08-06', '2026-08-07'], datas_excluidas: ['2026-08-07']
  });
  assert.deepStrictEqual(avulsa, ['2026-08-06']);
});

test('ano bissexto: fevereiro de 2028 tem 29 dias', () => {
  const datas = gerarDatasRecorrencia({ tipo: 'diaria', data_inicio: '2028-02-27', data_fim: '2028-03-01' });
  assert.deepStrictEqual(datas, ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
});

test('regra inválida gera lista vazia, sem lançar exceção', () => {
  assert.deepStrictEqual(gerarDatasRecorrencia(null), []);
  assert.deepStrictEqual(gerarDatasRecorrencia({ tipo: 'mensal', data_inicio: '2026-08-06', data_fim: '2026-08-10' }), []);
  assert.deepStrictEqual(gerarDatasRecorrencia({ tipo: 'diaria', data_inicio: '2026-08-10', data_fim: '2026-08-06' }), []);
  assert.deepStrictEqual(gerarDatasRecorrencia({ tipo: 'diaria', data_inicio: '2026-02-30', data_fim: '2026-03-05' }), []);
  assert.deepStrictEqual(gerarDatasRecorrencia({ tipo: 'semanal', dias_semana: [], data_inicio: '2026-08-01', data_fim: '2026-08-31' }), []);
  assert.deepStrictEqual(gerarDatasRecorrencia({ tipo: 'intervalo', intervalo_dias: 0, data_inicio: '2026-08-01', data_fim: '2026-08-31' }), []);
});

test('validação: limite de 92 ocorrências é rejeitado com mensagem legível', () => {
  // 2026-08-06 + 92 dias = 2026-11-06 (93 ocorrências no modo diário).
  const r = validarRegraRecorrencia({ tipo: 'diaria', data_inicio: '2026-08-06', data_fim: '2026-11-06' });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /93 operações/);
  assert.match(r.erro, new RegExp(String(LIMITES.MAX_OCORRENCIAS)));
});

test('validação: exatamente 92 ocorrências passa', () => {
  const r = validarRegraRecorrencia({ tipo: 'diaria', data_inicio: '2026-08-06', data_fim: '2026-11-05' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.datas.length, LIMITES.MAX_OCORRENCIAS);
  assert.strictEqual(r.regra.total_ocorrencias, LIMITES.MAX_OCORRENCIAS);
});

test('validação: janela acima de 12 meses é rejeitada', () => {
  // Semanal em 13 meses: poucas ocorrências, mas janela longa demais.
  const r = validarRegraRecorrencia({
    tipo: 'semanal', dias_semana: [1], data_inicio: '2026-08-06', data_fim: '2027-09-06'
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /12 meses/);
});

test('validação: janela de exatamente 12 meses passa', () => {
  const r = validarRegraRecorrencia({
    tipo: 'semanal', dias_semana: [1], data_inicio: '2026-08-06', data_fim: '2027-08-06'
  });
  assert.strictEqual(r.ok, true);
});

test('validação: mensagens por tipo', () => {
  assert.match(validarRegraRecorrencia(null).erro, /ausente ou inválida/);
  assert.match(validarRegraRecorrencia({ tipo: 'mensal' }).erro, /Tipo de recorrência inválido/);
  assert.match(validarRegraRecorrencia({ tipo: 'avulsa', datas: [] }).erro, /ao menos uma data/);
  assert.match(
    validarRegraRecorrencia({ tipo: 'semanal', dias_semana: [], data_inicio: '2026-08-01', data_fim: '2026-08-31' }).erro,
    /dia da semana/
  );
  assert.match(
    validarRegraRecorrencia({ tipo: 'intervalo', intervalo_dias: 0, data_inicio: '2026-08-01', data_fim: '2026-08-31' }).erro,
    /inteiro maior ou igual a 1/
  );
  assert.match(
    validarRegraRecorrencia({ tipo: 'diaria', data_inicio: '2026-08-10', data_fim: '2026-08-06' }).erro,
    /anterior à data de início/
  );
  assert.match(
    validarRegraRecorrencia({ tipo: 'diaria', data_inicio: '2026-08-06' }).erro,
    /Fim da recorrência é obrigatório/
  );
});

test('validação: desmarcar todas as datas é rejeitado', () => {
  const r = validarRegraRecorrencia({
    tipo: 'diaria', data_inicio: '2026-08-06', data_fim: '2026-08-07',
    datas_excluidas: ['2026-08-06', '2026-08-07']
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /não gerou nenhuma data/);
});

test('validação: regra normalizada carrega só os campos do tipo', () => {
  const semanal = validarRegraRecorrencia({
    tipo: 'semanal', dias_semana: [5, 1, 3, 1], data_inicio: '2026-08-01', data_fim: '2026-08-31',
    datas_excluidas: ['2026-08-17'], intervalo_dias: 99
  });
  assert.strictEqual(semanal.ok, true);
  assert.deepStrictEqual(semanal.regra.dias_semana, [1, 3, 5], 'ordena e remove repetição');
  assert.strictEqual(semanal.regra.intervalo_dias, undefined, 'não carrega campo de outro tipo');
  assert.deepStrictEqual(semanal.regra.datas_excluidas, ['2026-08-17']);

  const avulsa = validarRegraRecorrencia({ tipo: 'avulsa', datas: ['2026-09-15', '2026-08-06'] });
  assert.strictEqual(avulsa.ok, true);
  assert.deepStrictEqual(avulsa.regra.datas, ['2026-08-06', '2026-09-15']);
  assert.strictEqual(avulsa.regra.data_inicio, '2026-08-06', 'janela derivada da primeira data');
  assert.strictEqual(avulsa.regra.data_fim, '2026-09-15', 'janela derivada da última data');
});

test('pureza: o mesmo input devolve o mesmo output independente do fuso do processo', () => {
  const regra = { tipo: 'semanal', dias_semana: [1, 3, 5], data_inicio: '2026-08-01', data_fim: '2026-08-31' };
  const original = process.env.TZ;
  const resultados = [];
  for (const tz of ['UTC', 'America/Fortaleza', 'Pacific/Kiritimati']) {
    process.env.TZ = tz;
    resultados.push(JSON.stringify(gerarDatasRecorrencia(regra)));
  }
  process.env.TZ = original;
  assert.strictEqual(new Set(resultados).size, 1, 'geração variou com o fuso do processo');
});
