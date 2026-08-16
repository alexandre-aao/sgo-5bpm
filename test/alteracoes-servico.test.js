const test = require('node:test');
const assert = require('node:assert/strict');
const {
  alteracaoAfetaData,
  calcularImpactoOperacional,
  quantidadeDiasCorridos,
  projetarCiclo24x72,
} = require('../lib/alteracoes-servico');
const { _internals: permissoes } = require('../routes/alteracoes-servico');

test('período é inclusivo e projeta os serviços 24x72 do exemplo operacional', () => {
  const resultado = projetarCiclo24x72('2026-08-15', '2026-08-15', '2026-08-21');
  assert.equal(quantidadeDiasCorridos('2026-08-15', '2026-08-21'), 7);
  assert.deepEqual(resultado.servicosAfetados, ['2026-08-15', '2026-08-19']);
  assert.equal(resultado.quantidadeServicosAfetados, 2);
  assert.equal(resultado.proximoServicoProjetado, '2026-08-23');
});

test('inclui serviço exatamente no início e exatamente no fim', () => {
  assert.deepEqual(projetarCiclo24x72('2026-08-15', '2026-08-15', '2026-08-19').servicosAfetados, ['2026-08-15', '2026-08-19']);
});

test('período entre dois serviços não produz serviço afetado', () => {
  const resultado = projetarCiclo24x72('2026-08-15', '2026-08-16', '2026-08-18');
  assert.deepEqual(resultado.servicosAfetados, []);
  assert.equal(resultado.proximoServicoProjetado, '2026-08-19');
});

test('projeta vários serviços atravessando virada de mês', () => {
  assert.deepEqual(
    projetarCiclo24x72('2026-08-29', '2026-08-29', '2026-09-07').servicosAfetados,
    ['2026-08-29', '2026-09-02', '2026-09-06'],
  );
});

test('projeta corretamente na virada do ano', () => {
  const resultado = projetarCiclo24x72('2026-12-30', '2026-12-31', '2027-01-04');
  assert.deepEqual(resultado.servicosAfetados, ['2027-01-03']);
  assert.equal(resultado.proximoServicoProjetado, '2027-01-07');
});

test('sem referência confiável não inventa serviços do ciclo', () => {
  const resultado = projetarCiclo24x72(null, '2026-08-15', '2026-08-21');
  assert.equal(resultado.referenciaConfiavel, false);
  assert.deepEqual(resultado.servicosAfetados, []);
});

const composicao = { qtd_viaturas_previstas: 3, policiais_por_viatura: 3, qtd_extras: 0 };
const base = {
  data_inicio: '2026-08-15', data_fim: '2026-08-15', turno: '24H',
  situacao: 'INFORMADA', policial_pessoal_id: 'p1', substituto_pessoal_id: null,
};

test('impacto operacional: 9 policiais formam 3 viaturas', () => {
  const impacto = calcularImpactoOperacional(composicao, [], '2026-08-15');
  assert.equal(impacto.policiaisDisponiveisProjetados, 9);
  assert.equal(impacto.viaturasCompletasPossiveis, 3);
  assert.equal(impacto.policiaisRemanescentes, 0);
});

test('impacto operacional: 8 policiais formam 2 viaturas e sobram 2', () => {
  const impacto = calcularImpactoOperacional(composicao, [{ ...base, tipo: 'ATESTADO' }], '2026-08-15');
  assert.equal(impacto.policiaisDisponiveisProjetados, 8);
  assert.equal(impacto.viaturasCompletasPossiveis, 2);
  assert.equal(impacto.policiaisRemanescentes, 2);
});

test('impacto operacional: 7 policiais formam 2 viaturas e sobra 1', () => {
  const alteracoes = [{ ...base, tipo: 'ATESTADO' }, { ...base, policial_pessoal_id: 'p2', tipo: 'LICENÇA' }];
  const impacto = calcularImpactoOperacional(composicao, alteracoes, '2026-08-15');
  assert.equal(impacto.policiaisDisponiveisProjetados, 7);
  assert.equal(impacto.viaturasCompletasPossiveis, 2);
  assert.equal(impacto.policiaisRemanescentes, 1);
});

test('permuta e substituição posterior mantêm o total', () => {
  const permuta = { ...base, tipo: 'PERMUTA', substituto_pessoal_id: 'p2' };
  const ausenciaSubstituida = { ...base, tipo: 'ATESTADO', substituto_pessoal_id: 'p3' };
  for (const alteracao of [permuta, ausenciaSubstituida]) {
    assert.equal(calcularImpactoOperacional(composicao, [alteracao], '2026-08-15').policiaisDisponiveisProjetados, 9);
  }
});

test('cancelamento preserva o registro, mas remove seu impacto', () => {
  const cancelada = { ...base, tipo: 'ATESTADO', situacao: 'CANCELADA' };
  assert.equal(alteracaoAfetaData(cancelada, '2026-08-15'), false);
  assert.equal(calcularImpactoOperacional(composicao, [cancelada], '2026-08-15').policiaisDisponiveisProjetados, 9);
});

test('Sargenteante consulta somente a própria unidade; P3 consulta todas', () => {
  const sargenteante = { user: { role: 'Sargenteante', unidade: '3ª Companhia' } };
  assert.equal(permissoes.podeConsultar(sargenteante, '3ª Companhia'), true);
  assert.equal(permissoes.podeConsultar(sargenteante, '2ª Companhia'), false);
  assert.equal(permissoes.podeConsultar({ user: { role: 'P3' } }, '2ª Companhia'), true);
});

test('Adjunto e Oficial não passam pela autorização de edição da Sargenteação', () => {
  for (const role of ['Adjunto', 'Oficial', 'P3']) {
    let status = null;
    const res = { status(codigo) { status = codigo; return this; }, json() { return this; } };
    assert.equal(permissoes.exigirSargenteante({ user: { role } }, res), false);
    assert.equal(status, 403);
  }
  const res = { status() { throw new Error('não deveria negar'); } };
  assert.equal(permissoes.exigirSargenteante({ user: { role: 'Sargenteante', unidade: 'PCS' } }, res), true);
});
