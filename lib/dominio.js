// Funções puras do domínio, extraídas do server.js (Fase 7).
//
// Por que um módulo separado, como já acontece com lib/recorrencia.js:
// `require('../server')` subiria o Express e o cliente Supabase junto, e o
// processo de teste ficaria pendurado esperando conexão. Aqui não há I/O nenhum
// — dá para testar cada regra isoladamente com `node --test`.
//
// Nada aqui lê `Date.now()` implicitamente: as funções que dependem do relógio
// recebem o instante por parâmetro, para o teste poder fixá-lo.

/** Fuso do batalhão. America/Fortaleza é UTC-3 FIXO — o Brasil aboliu o horário
 *  de verão em 2019 —, então o offset pode ser literal e não precisa de lib de
 *  fuso. Importa porque a Vercel roda a função serverless em UTC: sem isso, o
 *  prazo das 07h seria calculado 3 horas adiantado. */
const FUSO_BATALHAO = '-03:00';

/**
 * Valida e normaliza um payload contra um schema simples, sem biblioteca externa.
 * schema: { campo: { obrigatorio, tipo: 'string'|'number'|'boolean', max, valores: [...], label, padrao } }
 *
 * Campo ausente/vazio e não obrigatório recebe `padrao` (ou fica de fora). Strings
 * já voltam com trim aplicado. Campo ausente e sem `padrao` NÃO entra em `valores`
 * — é o que permite espalhar o resultado sobre um registro existente sem apagar
 * campos não enviados (updates parciais em PUT).
 *
 * @returns {{ok: true, valores: object} | {ok: false, erro: string}}
 */
function validarCampos(body, schema) {
  const valores = {};
  for (const [campo, regra] of Object.entries(schema)) {
    let valor = body[campo];
    if (valor === undefined || valor === null || valor === '') {
      if (regra.obrigatorio) {
        return { ok: false, erro: `O campo "${regra.label || campo}" é obrigatório.` };
      }
      if (regra.padrao !== undefined) valores[campo] = regra.padrao;
      continue;
    }
    if (regra.tipo === 'string') {
      valor = String(valor).trim();
      if (regra.max && valor.length > regra.max) {
        return { ok: false, erro: `O campo "${regra.label || campo}" deve ter no máximo ${regra.max} caracteres.` };
      }
    } else if (regra.tipo === 'number') {
      valor = Number(valor);
      if (isNaN(valor)) {
        return { ok: false, erro: `O campo "${regra.label || campo}" deve ser um número válido.` };
      }
    } else if (regra.tipo === 'boolean') {
      valor = !!valor;
    }
    if (regra.valores && !regra.valores.includes(valor)) {
      return { ok: false, erro: `Valor inválido para "${regra.label || campo}".` };
    }
    valores[campo] = valor;
  }
  return { ok: true, valores };
}

/** Dia seguinte em ISO. `Date.UTC` normaliza virada de mês/ano sozinho. */
function proximoDiaISO(dataISO) {
  const [ano, mes, dia] = String(dataISO).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

function formatarDataBr(dataISO) {
  return dataISO ? String(dataISO).split('-').reverse().join('/') : '';
}

/** O Adjunto pode excluir o cartão de um dia até as 07h00 do dia seguinte à data
 *  do serviço (horário do batalhão). Depois disso, só o P3. O limite é inclusivo:
 *  exatamente 07h00:00 ainda está dentro. */
function dentroDaJanelaExclusaoAdjunto(dataServico, agora = new Date()) {
  if (!dataServico) return false;
  const limite = new Date(`${proximoDiaISO(dataServico)}T07:00:00${FUSO_BATALHAO}`);
  return agora.getTime() <= limite.getTime();
}

/** Diária de uma operação: se já tem escala nominal lançada, vale a soma real das
 *  escalas; senão, vale a estimativa (reserva de cota). Evita contar a mesma
 *  diária duas vezes ao somar "planejado" (só operações sem escala) com
 *  "consumido" (operações com escala) no planejador. */
function diariaDaOperacao(op, escalasDaOp) {
  if (escalasDaOp.length > 0) {
    return escalasDaOp.reduce((sum, s) => sum + (s.total_diarias || 0), 0);
  }
  return op.qtd_diarias_estimada || 0;
}

/** Ordena os itens de roteiro pela distância circular do início do turno (07h por
 *  padrão), não em ordem alfabética: um item às 05h30 pertence ao FIM do turno,
 *  não ao começo. Não muta a lista recebida — a ordem do array persistido entra
 *  no hash de conteúdo do cartão. */
function ordenarPorTurno(itens, inicioTurno = '07:00') {
  const minutos = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const refMin = minutos(inicioTurno);
  return itens.slice().sort((a, b) => {
    const diffA = ((minutos(a.inicio) - refMin) + 1440) % 1440;
    const diffB = ((minutos(b.inicio) - refMin) + 1440) % 1440;
    return diffA - diffB;
  });
}

/** Identidade do militar numa escala. `escalas.militar_id` é a MATRÍCULA (RE),
 *  texto livre e possivelmente vazia — escalar quem não está no cadastro é
 *  permitido. Sem o fallback por nome, dois militares sem matrícula colidiriam
 *  numa chave vazia e um sobrescreveria o outro.
 *  DUPLICADA em client/src/lib/escalaLote.ts — ver test/paridade.test.js. */
function chaveMilitar(matricula, nome) {
  const re = String(matricula || '').trim();
  if (re) return `re:${re}`;
  return `nome:${String(nome || '').trim().toLowerCase()}`;
}

module.exports = {
  FUSO_BATALHAO,
  validarCampos,
  proximoDiaISO,
  formatarDataBr,
  dentroDaJanelaExclusaoAdjunto,
  diariaDaOperacao,
  ordenarPorTurno,
  chaveMilitar,
};
