// Regras puras do módulo Alterações do Serviço.
// Datas civis são calculadas em UTC para que o resultado seja igual na Vercel
// e no computador do batalhão. Horários de jornadas de 12h também são
// convertidos em UTC, sem depender do fuso local do processo.

const TIPOS_ALTERACAO = [
  'PERMUTA', 'ATESTADO', 'DISPENSA/FOLGA', 'FÉRIAS', 'CURSO',
  'LICENÇA', 'AFASTAMENTO', 'FALTA PREVISTA', 'OUTRO',
];
// Mantida somente para compatibilidade com registros/migrations antigos. A
// interface não usa mais situação como etapa do fluxo operacional.
const SITUACOES_ALTERACAO = ['INFORMADA', 'CONFIRMADA', 'CANCELADA'];
const JORNADAS_SERVICO = ['24H', '12H'];
const TURNOS_SERVICO = ['24H', 'DIURNO', 'NOTURNO'];
const UNIDADES_SERVICO = ['1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS'];
const MILISSEGUNDOS_DIA = 86400000;

function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function horarioValido(valor) {
  if (!/^\d{2}:\d{2}$/.test(String(valor || ''))) return false;
  const [hora, minuto] = String(valor).split(':').map(Number);
  return hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59;
}

function minutosHorario(valor) {
  if (!horarioValido(valor)) return null;
  const [hora, minuto] = String(valor).split(':').map(Number);
  return hora * 60 + minuto;
}

function normalizarJornada(jornada, turno = '') {
  const valor = String(jornada || '').trim().toUpperCase();
  if (valor === '12H' || valor === '12 HORAS') return '12H';
  if (valor === '24H' || valor === '24X72' || valor === '24 HORAS') return '24H';
  const turnoNormalizado = String(turno || '').trim().toUpperCase();
  return turnoNormalizado.includes('12') || ['DIURNO', 'NOTURNO'].includes(turnoNormalizado) ? '12H' : '24H';
}

function normalizarTurno(turno, jornada = '') {
  const valor = String(turno || '').trim().toUpperCase();
  if (normalizarJornada(jornada, valor) === '24H') return '24H';
  if (valor.includes('NOT') || valor.includes('NOITE')) return 'NOTURNO';
  return 'DIURNO';
}

function diaUtc(dataIso) {
  if (!dataIsoValida(dataIso)) throw new Error('Data inválida. Use o formato YYYY-MM-DD.');
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / MILISSEGUNDOS_DIA);
}

function isoDoDia(dia) {
  return new Date(dia * MILISSEGUNDOS_DIA).toISOString().slice(0, 10);
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
  return diaUtc(dataFim) - diaUtc(dataInicio) + 1;
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

function intervaloCivil(dataInicio, dataFim) {
  return { inicio: diaUtc(dataInicio) * MILISSEGUNDOS_DIA, fim: (diaUtc(dataFim) + 1) * MILISSEGUNDOS_DIA };
}

function intervaloComHorario(data, horarioInicio, horarioFim) {
  const base = diaUtc(data) * MILISSEGUNDOS_DIA;
  const inicio = base + minutosHorario(horarioInicio) * 60000;
  let fim = base + minutosHorario(horarioFim) * 60000;
  // 19:00–07:00 atravessa a meia-noite.
  if (fim <= inicio) fim += MILISSEGUNDOS_DIA;
  return { inicio, fim };
}

function intervaloDaAlteracao(alteracao) {
  const inicio = alteracao.data_inicio;
  const fim = alteracao.data_fim || inicio;
  if (normalizarJornada(alteracao.jornada, alteracao.turno) === '12H'
    && horarioValido(alteracao.horario_inicio) && horarioValido(alteracao.horario_fim)) {
    const intervaloInicio = intervaloComHorario(inicio, alteracao.horario_inicio, alteracao.horario_fim).inicio;
    const intervaloFim = intervaloComHorario(fim, alteracao.horario_inicio, alteracao.horario_fim).fim;
    return { inicio: intervaloInicio, fim: intervaloFim };
  }
  return intervaloCivil(inicio, fim);
}

function intervaloDoServico(servico) {
  const data = servico.data || servico.data_servico;
  const jornada = normalizarJornada(servico.jornada, servico.turno);
  if (jornada === '12H' && horarioValido(servico.horario_inicio) && horarioValido(servico.horario_fim)) {
    return intervaloComHorario(data, servico.horario_inicio, servico.horario_fim);
  }
  return intervaloCivil(data, data);
}

function intervalosSeSobrepoem(a, b) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

function calcularServicosAfetados(alteracao) {
  const dataInicio = alteracao.data_inicio;
  const dataFim = alteracao.data_fim || dataInicio;
  const jornada = normalizarJornada(alteracao.jornada, alteracao.turno);
  if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim)) return [];

  if (jornada === '24H') {
    if (!dataIsoValida(alteracao.data_referencia_servico) && dataInicio === dataFim) {
      return [{ data: dataInicio, jornada: '24H', turno: '24H', horario_inicio: null, horario_fim: null }];
    }
    const ciclo = projetarCiclo24x72(alteracao.data_referencia_servico, dataInicio, dataFim);
    return ciclo.servicosAfetados.map((data) => ({ data, jornada: '24H', turno: '24H', horario_inicio: null, horario_fim: null }));
  }

  const servicos = [];
  for (let dia = diaUtc(dataInicio); dia <= diaUtc(dataFim); dia += 1) {
    const data = isoDoDia(dia);
    servicos.push({
      data, jornada: '12H', turno: normalizarTurno(alteracao.turno, jornada),
      horario_inicio: alteracao.horario_inicio || null, horario_fim: alteracao.horario_fim || null,
    });
  }
  return servicos;
}

function servicoProjetado(alteracao, servico) {
  if (alteracao.situacao === 'CANCELADA' || !servico || !dataIsoValida(servico.data || servico.data_servico)) return false;
  const data = servico.data || servico.data_servico;
  const jornadaAlteracao = normalizarJornada(alteracao.jornada, alteracao.turno);
  const jornadaServico = normalizarJornada(servico.jornada, servico.turno);
  if (jornadaAlteracao !== jornadaServico) return false;

  if (jornadaAlteracao === '24H') return calcularServicosAfetados(alteracao).some((item) => item.data === data);

  const turnoAlteracao = normalizarTurno(alteracao.turno, jornadaAlteracao);
  const turnoServico = normalizarTurno(servico.turno, jornadaServico);
  if (turnoAlteracao !== turnoServico) return false;
  const inicio = diaUtc(alteracao.data_inicio);
  const fim = diaUtc(alteracao.data_fim || alteracao.data_inicio);
  if (diaUtc(data) < inicio || diaUtc(data) > fim) return false;

  // Sem horários no legado, a data e o turno ainda são a melhor informação
  // disponível. Registros novos de 12h são obrigados a informar horários.
  if (!horarioValido(alteracao.horario_inicio) || !horarioValido(alteracao.horario_fim)
    || !horarioValido(servico.horario_inicio) || !horarioValido(servico.horario_fim)) return true;
  return intervalosSeSobrepoem(intervaloDaAlteracao(alteracao), intervaloDoServico({ ...servico, data }));
}

function enriquecerProjecao(alteracao) {
  const dataInicio = alteracao.data_inicio;
  const dataFim = alteracao.data_fim || dataInicio;
  const jornada = normalizarJornada(alteracao.jornada, alteracao.turno);
  const servicos = calcularServicosAfetados(alteracao);
  const ciclo = jornada === '24H'
    ? { ...projetarCiclo24x72(alteracao.data_referencia_servico, dataInicio, dataFim), servicosAfetados: servicos.map((item) => item.data), quantidadeServicosAfetados: servicos.length }
    : { servicosAfetados: servicos.map((item) => item.data), quantidadeServicosAfetados: servicos.length, proximoServicoProjetado: null, referenciaConfiavel: true };
  return {
    ...ciclo,
    jornada,
    turno: normalizarTurno(alteracao.turno, jornada),
    horarioInicio: alteracao.horario_inicio || null,
    horarioFim: alteracao.horario_fim || null,
    quantidadeDiasCorridos: quantidadeDiasCorridos(dataInicio, dataFim),
  };
}

function alteracaoAfetaServico(alteracao, servicoOuData) {
  if (typeof servicoOuData === 'string') return alteracaoAfetaData(alteracao, servicoOuData);
  return servicoProjetado(alteracao, servicoOuData);
}

function alteracaoAfetaData(alteracao, data) {
  if (alteracao.situacao === 'CANCELADA' || !dataIsoValida(data)) return false;
  const inicio = alteracao.data_inicio;
  const fim = alteracao.data_fim || inicio;
  if (!dataIsoValida(inicio) || !dataIsoValida(fim) || diaUtc(data) < diaUtc(inicio) || diaUtc(data) > diaUtc(fim)) return false;
  return calcularServicosAfetados(alteracao).some((item) => item.data === data);
}

function numeroCapacidade(composicao, campo) {
  const valor = composicao?.[campo];
  return valor == null || valor === '' ? null : Math.max(0, Number(valor) || 0);
}

function chavePolicial(alteracao) {
  return String(alteracao.policial_pessoal_id || alteracao.policial_id || alteracao.policial_matricula || alteracao.policial_nome || '').trim().toLocaleLowerCase('pt-BR');
}

function calcularImpactoOperacional(composicao, alteracoes, data = null, servico = null) {
  if (!composicao) return null;
  const viaturasPrevistas = Number(composicao.qtd_viaturas_previstas) || 0;
  const policiaisPorViatura = Number(composicao.policiais_por_viatura) || 0;
  const extras = Number(composicao.qtd_extras) || 0;
  const totalPrevisto = viaturasPrevistas * policiaisPorViatura + extras;
  const aplicaveis = (alteracoes || []).filter((a) => a.situacao !== 'CANCELADA' && (!data
    ? true
    : (servico ? alteracaoAfetaServico(a, servico) : alteracaoAfetaData(a, data))));
  const permutas = aplicaveis.filter((a) => a.tipo === 'PERMUTA').length;
  const ausentes = new Set();
  aplicaveis.forEach((a) => {
    if (a.tipo !== 'PERMUTA' && !a.substituto_pessoal_id && !a.substituto_id) ausentes.add(chavePolicial(a));
  });
  const ausenciasSemSubstituicao = [...ausentes].filter(Boolean).length;
  const capacidadeManual = numeroCapacidade(composicao, 'qtd_viaturas_completas') != null
    || numeroCapacidade(composicao, 'qtd_policiais_disponiveis') != null;
  const viaturasCompletasPossiveis = capacidadeManual
    ? (numeroCapacidade(composicao, 'qtd_viaturas_completas') ?? 0)
    : policiaisPorViatura > 0 ? Math.floor(Math.max(0, totalPrevisto - ausenciasSemSubstituicao) / policiaisPorViatura) : 0;
  const policiaisRemanescentes = capacidadeManual
    ? (numeroCapacidade(composicao, 'qtd_policiais_disponiveis') ?? 0)
    : policiaisPorViatura > 0 ? Math.max(0, totalPrevisto - ausenciasSemSubstituicao) % policiaisPorViatura : Math.max(0, totalPrevisto - ausenciasSemSubstituicao);
  return {
    totalPrevisto,
    totalAlteracoes: aplicaveis.length,
    permutas,
    ausenciasSemSubstituicao,
    policiaisDisponiveisProjetados: viaturasCompletasPossiveis * policiaisPorViatura + policiaisRemanescentes,
    viaturasCompletasPossiveis,
    policiaisRemanescentes,
    capacidadeManual,
  };
}

module.exports = {
  JORNADAS_SERVICO,
  SITUACOES_ALTERACAO,
  TIPOS_ALTERACAO,
  TURNOS_SERVICO,
  UNIDADES_SERVICO,
  alteracaoAfetaData,
  alteracaoAfetaServico,
  calcularImpactoOperacional,
  calcularServicosAfetados,
  dataIsoValida,
  enriquecerProjecao,
  horarioValido,
  normalizarJornada,
  normalizarTurno,
  quantidadeDiasCorridos,
  projetarCiclo24x72,
  validarPeriodo,
};
