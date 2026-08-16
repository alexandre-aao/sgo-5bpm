// Regras puras do módulo Alterações do Serviço.
// Datas são dias civis ISO (YYYY-MM-DD) e sempre calculadas em UTC para que o
// resultado seja igual na Vercel e no computador do batalhão.

const TIPOS_ALTERACAO = [
  'PERMUTA', 'ATESTADO', 'DISPENSA/FOLGA', 'FÉRIAS', 'CURSO',
  'LICENÇA', 'AFASTAMENTO', 'FALTA PREVISTA', 'OUTRO',
];
const SITUACOES_ALTERACAO = ['INFORMADA', 'CONFIRMADA', 'CANCELADA'];
const UNIDADES_SERVICO = ['1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS'];

function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function diaUtc(dataIso) {
  if (!dataIsoValida(dataIso)) throw new Error('Data inválida. Use o formato YYYY-MM-DD.');
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86400000);
}

function isoDoDia(dia) {
  return new Date(dia * 86400000).toISOString().slice(0, 10);
}

function validarPeriodo(dataInicio, dataFim) {
  if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim)) {
    return { ok: false, erro: 'Informe datas inicial e final válidas.' };
  }
  if (diaUtc(dataFim) < diaUtc(dataInicio)) {
    return { ok: false, erro: 'A data final não pode ser anterior à data inicial.' };
  }
  return { ok: true };
}

function quantidadeDiasCorridos(dataInicio, dataFim) {
  const periodo = validarPeriodo(dataInicio, dataFim);
  if (!periodo.ok) throw new Error(periodo.erro);
  return diaUtc(dataFim) - diaUtc(dataInicio) + 1; // período inclusivo nas duas pontas
}

function projetarCiclo24x72(dataReferenciaServico, dataInicio, dataFim) {
  const periodo = validarPeriodo(dataInicio, dataFim);
  if (!periodo.ok) throw new Error(periodo.erro);
  if (!dataIsoValida(dataReferenciaServico)) {
    return { servicosAfetados: [], quantidadeServicosAfetados: 0, proximoServicoProjetado: null, referenciaConfiavel: false };
  }

  const referencia = diaUtc(dataReferenciaServico);
  const inicio = diaUtc(dataInicio);
  const fim = diaUtc(dataFim);
  const primeiroMultiplo = Math.ceil((inicio - referencia) / 4);
  let diaServico = referencia + primeiroMultiplo * 4;
  const servicosAfetados = [];
  while (diaServico <= fim) {
    servicosAfetados.push(isoDoDia(diaServico));
    diaServico += 4;
  }
  const primeiroDepoisDoFim = referencia + (Math.floor((fim - referencia) / 4) + 1) * 4;
  return {
    servicosAfetados,
    quantidadeServicosAfetados: servicosAfetados.length,
    proximoServicoProjetado: isoDoDia(primeiroDepoisDoFim),
    referenciaConfiavel: true,
  };
}

function enriquecerProjecao(alteracao) {
  const dataInicio = alteracao.data_inicio;
  const dataFim = alteracao.data_fim || dataInicio;
  const ciclo = projetarCiclo24x72(alteracao.data_referencia_servico, dataInicio, dataFim);
  return { ...ciclo, quantidadeDiasCorridos: quantidadeDiasCorridos(dataInicio, dataFim) };
}

function alteracaoAfetaData(alteracao, data) {
  if (alteracao.situacao === 'CANCELADA' || !dataIsoValida(data)) return false;
  const inicio = alteracao.data_inicio;
  const fim = alteracao.data_fim || inicio;
  if (diaUtc(data) < diaUtc(inicio) || diaUtc(data) > diaUtc(fim)) return false;
  if (alteracao.data_referencia_servico) {
    return projetarCiclo24x72(alteracao.data_referencia_servico, inicio, fim).servicosAfetados.includes(data);
  }
  // Sem referência, só aceitamos com segurança um registro de um único dia.
  return inicio === fim && data === inicio;
}

function calcularImpactoOperacional(composicao, alteracoes, data = null) {
  if (!composicao) return null;
  const viaturasPrevistas = Number(composicao.qtd_viaturas_previstas) || 0;
  const policiaisPorViatura = Number(composicao.policiais_por_viatura) || 0;
  const extras = Number(composicao.qtd_extras) || 0;
  const totalPrevisto = viaturasPrevistas * policiaisPorViatura + extras;
  const aplicaveis = (alteracoes || []).filter((a) =>
    a.situacao !== 'CANCELADA' && (!data || alteracaoAfetaData(a, data)));
  const permutas = aplicaveis.filter((a) => a.tipo === 'PERMUTA').length;
  const ausenciasSemSubstituicao = aplicaveis.filter((a) => a.tipo !== 'PERMUTA' && !a.substituto_pessoal_id).length;
  const policiaisDisponiveisProjetados = Math.max(0, totalPrevisto - ausenciasSemSubstituicao);
  const viaturasCompletasPossiveis = policiaisPorViatura > 0
    ? Math.floor(policiaisDisponiveisProjetados / policiaisPorViatura)
    : 0;
  const policiaisRemanescentes = policiaisPorViatura > 0
    ? policiaisDisponiveisProjetados % policiaisPorViatura
    : policiaisDisponiveisProjetados;
  return {
    totalPrevisto,
    totalAlteracoes: aplicaveis.length,
    permutas,
    ausenciasSemSubstituicao,
    policiaisDisponiveisProjetados,
    viaturasCompletasPossiveis,
    policiaisRemanescentes,
  };
}

module.exports = {
  SITUACOES_ALTERACAO,
  TIPOS_ALTERACAO,
  UNIDADES_SERVICO,
  alteracaoAfetaData,
  calcularImpactoOperacional,
  dataIsoValida,
  enriquecerProjecao,
  quantidadeDiasCorridos,
  projetarCiclo24x72,
  validarPeriodo,
};
