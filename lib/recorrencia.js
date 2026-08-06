'use strict';

// -------------------------------------------------------------
// MOTOR DE RECORRÊNCIA DE OPERAÇÕES
// -------------------------------------------------------------
// Módulo PURO e sem I/O, separado do server.js de propósito: `require('../server')`
// subiria o Express e o cliente Supabase junto, o que impede testar a geração de
// datas isoladamente. Aqui não há Supabase, Date.now() nem fuso — só aritmética
// sobre strings ISO. Testes em `test/recorrencia.test.js` (`npm test`).
//
// Toda data é string 'YYYY-MM-DD' e toda conta é feita em milissegundos UTC.
// Motivo: a Vercel roda em UTC e a máquina do batalhão em America/Fortaleza; usar
// `new Date('2026-08-06')` + getDate() local faria a mesma regra gerar datas
// diferentes nos dois ambientes (o clássico erro de "um dia a menos").

const DIA_MS = 86400000;
const FORMATO_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Limites de segurança do lote — validados AQUI (server-side), nunca só na UI.
const LIMITES = { MAX_OCORRENCIAS: 92, MAX_MESES_JANELA: 12 };

// `tipo` da recorrencia_regra. NÃO confundir com a coluna `operacoes.tipo_recorrencia`
// (diaria|fim_de_semana|dia_unico), que é rótulo descritivo pré-existente e continua
// valendo — são campos distintos, com valores parecidos e semânticas diferentes.
const TIPOS_REGRA = ['diaria', 'semanal', 'intervalo', 'avulsa'];

// Guarda contra laço infinito por regra malformada que escape da validação.
// Nenhuma regra válida passa da janela de 12 meses (≤ 366 dias varridos).
const MAX_DIAS_VARRIDOS = 400;

// Dias da semana no padrão Date.getDay()/getUTCDay():
// domingo = 0, segunda = 1, terça = 2, quarta = 3, quinta = 4, sexta = 5, sábado = 6.
// Ex.: "segunda, quarta e sexta" => dias_semana: [1, 3, 5].
const DIAS_SEMANA_VALIDOS = [0, 1, 2, 3, 4, 5, 6];

function paraUTC(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function paraIso(ms) {
  const d = new Date(ms);
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mes}-${dia}`;
}

// Valida formato E calendário: '2026-02-30' passa no regex mas o round-trip
// devolve '2026-03-02', então é rejeitado.
function ehDataIso(valor) {
  if (typeof valor !== 'string' || !FORMATO_ISO.test(valor)) return false;
  const ms = paraUTC(valor);
  return Number.isFinite(ms) && paraIso(ms) === valor;
}

function ordenarUnicas(datas) {
  // String ISO ordena lexicograficamente = cronologicamente.
  return [...new Set(datas)].sort();
}

function listaDeDatas(valor) {
  return Array.isArray(valor) ? valor.filter(ehDataIso) : [];
}

/**
 * Gera as datas de um grupo de recorrência. Função PURA: mesma regra, mesmas datas,
 * em qualquer máquina e qualquer horário. Devolve [] para regra inválida — quem
 * precisa de mensagem de erro legível usa validarRegraRecorrencia().
 *
 * regra = {
 *   tipo: 'diaria' | 'semanal' | 'intervalo' | 'avulsa',
 *   data_inicio: 'YYYY-MM-DD',   // exigido, exceto em 'avulsa'
 *   data_fim: 'YYYY-MM-DD',      // exigido, exceto em 'avulsa'
 *   dias_semana: [1, 3, 5],      // só em 'semanal' — domingo=0 ... sábado=6
 *   intervalo_dias: 2,           // só em 'intervalo' — inteiro >= 1
 *   datas: ['YYYY-MM-DD', ...],  // só em 'avulsa' — as datas escolhidas a dedo
 *   datas_excluidas: [...]       // feriados / dias sem efetivo, removidos do resultado
 * }
 *
 * @returns {string[]} datas ISO, ordenadas e sem repetição
 */
function gerarDatasRecorrencia(regra) {
  if (!regra || typeof regra !== 'object' || Array.isArray(regra)) return [];
  if (!TIPOS_REGRA.includes(regra.tipo)) return [];

  const excluidas = new Set(listaDeDatas(regra.datas_excluidas));

  // 'avulsa' não varre janela: as datas vêm escolhidas uma a uma.
  if (regra.tipo === 'avulsa') {
    return ordenarUnicas(listaDeDatas(regra.datas).filter((d) => !excluidas.has(d)));
  }

  if (!ehDataIso(regra.data_inicio) || !ehDataIso(regra.data_fim)) return [];
  const inicioMs = paraUTC(regra.data_inicio);
  const fimMs = paraUTC(regra.data_fim);
  if (fimMs < inicioMs) return [];

  let passoDias = 1;
  if (regra.tipo === 'intervalo') {
    passoDias = Math.trunc(Number(regra.intervalo_dias));
    if (!Number.isFinite(passoDias) || passoDias < 1) return [];
  }

  let diasSemana = null;
  if (regra.tipo === 'semanal') {
    diasSemana = new Set(
      (Array.isArray(regra.dias_semana) ? regra.dias_semana : [])
        .map(Number)
        .filter((n) => DIAS_SEMANA_VALIDOS.includes(n))
    );
    if (diasSemana.size === 0) return [];
  }

  const datas = [];
  let varridos = 0;
  for (let ms = inicioMs; ms <= fimMs; ms += passoDias * DIA_MS) {
    if (++varridos > MAX_DIAS_VARRIDOS) break;
    const iso = paraIso(ms);
    if (diasSemana && !diasSemana.has(new Date(ms).getUTCDay())) continue;
    if (excluidas.has(iso)) continue;
    datas.push(iso);
  }
  return datas;
}

// Soma `meses` a uma data ISO. Date.UTC normaliza o estouro de mês sozinho
// (mês 12 vira janeiro do ano seguinte).
function somarMeses(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1 + meses, dia);
}

/**
 * Valida a regra e já devolve as datas geradas. É a porta de entrada usada pelas
 * rotas — nunca confiar na UI para os limites de 92 ocorrências / 12 meses.
 *
 * @returns {{ok: true, datas: string[], regra: object} | {ok: false, erro: string}}
 */
function validarRegraRecorrencia(regra) {
  if (!regra || typeof regra !== 'object' || Array.isArray(regra)) {
    return { ok: false, erro: 'Regra de recorrência ausente ou inválida.' };
  }
  if (!TIPOS_REGRA.includes(regra.tipo)) {
    return { ok: false, erro: `Tipo de recorrência inválido. Valores aceitos: ${TIPOS_REGRA.join(', ')}.` };
  }

  const excluidas = ordenarUnicas(listaDeDatas(regra.datas_excluidas));

  if (regra.tipo === 'avulsa') {
    const informadas = Array.isArray(regra.datas) ? regra.datas : [];
    if (informadas.length === 0) {
      return { ok: false, erro: 'Informe ao menos uma data para a recorrência de datas avulsas.' };
    }
    if (informadas.some((d) => !ehDataIso(d))) {
      return { ok: false, erro: 'Há data inválida na lista de datas avulsas. Use o formato AAAA-MM-DD.' };
    }
  } else {
    if (!ehDataIso(regra.data_inicio)) {
      return { ok: false, erro: 'Data de início da recorrência inválida. Use o formato AAAA-MM-DD.' };
    }
    if (!ehDataIso(regra.data_fim)) {
      return { ok: false, erro: 'Fim da recorrência é obrigatório e deve estar no formato AAAA-MM-DD.' };
    }
    if (paraUTC(regra.data_fim) < paraUTC(regra.data_inicio)) {
      return { ok: false, erro: 'O fim da recorrência não pode ser anterior à data de início.' };
    }
    if (regra.tipo === 'semanal') {
      const dias = (Array.isArray(regra.dias_semana) ? regra.dias_semana : []).map(Number);
      if (dias.length === 0 || dias.some((n) => !DIAS_SEMANA_VALIDOS.includes(n))) {
        return { ok: false, erro: 'Selecione ao menos um dia da semana válido (0 = domingo a 6 = sábado).' };
      }
    }
    if (regra.tipo === 'intervalo') {
      const passo = Number(regra.intervalo_dias);
      if (!Number.isInteger(passo) || passo < 1) {
        return { ok: false, erro: 'O intervalo em dias deve ser um número inteiro maior ou igual a 1.' };
      }
    }
  }

  const datas = gerarDatasRecorrencia(regra);
  if (datas.length === 0) {
    return { ok: false, erro: 'A regra informada não gerou nenhuma data. Revise o período, os dias da semana e as datas desmarcadas.' };
  }

  // Janela máxima: medida sobre o período efetivamente coberto. Em 'avulsa' isso é
  // da primeira à última data escolhida.
  const janelaInicio = regra.tipo === 'avulsa' ? datas[0] : regra.data_inicio;
  const janelaFim = regra.tipo === 'avulsa' ? datas[datas.length - 1] : regra.data_fim;
  if (paraUTC(janelaFim) > somarMeses(janelaInicio, LIMITES.MAX_MESES_JANELA)) {
    return {
      ok: false,
      erro: `A recorrência não pode passar de ${LIMITES.MAX_MESES_JANELA} meses. Divida em lotes menores.`
    };
  }

  if (datas.length > LIMITES.MAX_OCORRENCIAS) {
    return {
      ok: false,
      erro: `A regra geraria ${datas.length} operações, acima do limite de ${LIMITES.MAX_OCORRENCIAS} por lote. Reduza o período ou desmarque datas.`
    };
  }

  // Regra normalizada — é ESTE objeto que vai gravado, idêntico, em todas as
  // ocorrências do grupo (só os campos que fazem sentido para o tipo).
  const normalizada = {
    tipo: regra.tipo,
    data_inicio: janelaInicio,
    data_fim: janelaFim,
    datas_excluidas: excluidas,
    total_ocorrencias: datas.length
  };
  if (regra.tipo === 'semanal') {
    normalizada.dias_semana = [...new Set(regra.dias_semana.map(Number))].sort((a, b) => a - b);
  }
  if (regra.tipo === 'intervalo') normalizada.intervalo_dias = Number(regra.intervalo_dias);
  if (regra.tipo === 'avulsa') normalizada.datas = datas;

  return { ok: true, datas, regra: normalizada };
}

module.exports = {
  LIMITES,
  TIPOS_REGRA,
  DIAS_SEMANA_VALIDOS,
  ehDataIso,
  gerarDatasRecorrencia,
  validarRegraRecorrencia
};
