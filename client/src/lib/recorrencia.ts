// Tipos e rótulos da recorrência de operações. A GERAÇÃO das datas NÃO vive aqui:
// o servidor (`lib/recorrencia.js` + POST /api/operacoes/preview-recorrencia) é a
// única autoridade. Duplicar o motor em TS daria preview instantâneo, mas as duas
// cópias divergiriam com o tempo e o preview passaria a mentir sobre o que será
// gravado — que é justamente o que este módulo precisa garantir.

/** 'nenhuma' existe só na UI (= operação avulsa, sem grupo). O banco nunca vê esse valor. */
export type TipoRecorrencia = 'nenhuma' | 'diaria' | 'semanal' | 'intervalo' | 'avulsa';

export interface RecorrenciaRegra {
  tipo: Exclude<TipoRecorrencia, 'nenhuma'>;
  data_inicio?: string;
  data_fim?: string;
  /** Domingo = 0 … sábado = 6 (padrão Date.getDay()), igual ao motor do servidor. */
  dias_semana?: number[];
  intervalo_dias?: number;
  /** Só em 'avulsa': as datas escolhidas a dedo. */
  datas?: string[];
  datas_excluidas?: string[];
  total_ocorrencias?: number;
}

export const OPCOES_RECORRENCIA: { valor: TipoRecorrencia; rotulo: string }[] = [
  { valor: 'nenhuma', rotulo: '— Nenhuma —' },
  { valor: 'diaria', rotulo: 'Diária' },
  { valor: 'semanal', rotulo: 'Dias da semana' },
  { valor: 'intervalo', rotulo: 'A cada N dias' },
  { valor: 'avulsa', rotulo: 'Datas avulsas' },
];

// Exibidos começando na segunda (S T Q Q S S D), mas o VALOR segue o padrão
// Date.getDay() — domingo é 0 e fica por último. As iniciais se repetem (três "S",
// dois "Q"), por isso cada botão carrega o nome inteiro em aria-label/title.
export const DIAS_SEMANA: { valor: number; curto: string; nome: string }[] = [
  { valor: 1, curto: 'S', nome: 'Segunda-feira' },
  { valor: 2, curto: 'T', nome: 'Terça-feira' },
  { valor: 3, curto: 'Q', nome: 'Quarta-feira' },
  { valor: 4, curto: 'Q', nome: 'Quinta-feira' },
  { valor: 5, curto: 'S', nome: 'Sexta-feira' },
  { valor: 6, curto: 'S', nome: 'Sábado' },
  { valor: 0, curto: 'D', nome: 'Domingo' },
];

/** Espelha LIMITES em lib/recorrencia.js — aqui só para a UI avisar antes; quem
 *  decide é sempre o servidor, que revalida e devolve 400. */
export const LIMITES_RECORRENCIA = { MAX_OCORRENCIAS: 92, MAX_MESES_JANELA: 12 };

export function ehRecorrente(tipo: TipoRecorrencia): boolean {
  return tipo !== 'nenhuma';
}

/** Com recorrência, o campo Data de Término deixa de ser "o fim desta operação" e
 *  passa a ser o fim do período que gera as ocorrências (cada uma de um dia só). */
export function rotuloDataTermino(tipo: TipoRecorrencia): string {
  return ehRecorrente(tipo) ? 'Fim da Recorrência *' : 'Data de Término';
}

export interface FormRecorrencia {
  tipo: TipoRecorrencia;
  diasSemana: number[];
  intervaloDias: string;
  datasAvulsas: string[];
  datasExcluidas: string[];
}

export function formRecorrenciaVazio(): FormRecorrencia {
  return { tipo: 'nenhuma', diasSemana: [], intervaloDias: '2', datasAvulsas: [], datasExcluidas: [] };
}

/**
 * Monta a regra enviada ao servidor. É a MESMA função usada pelo preview e pelo
 * salvamento — é isso que garante que a lista conferida na tela seja exatamente o
 * que vai ser criado.
 *
 * `comExclusoes = false` no preview: assim as datas desmarcadas continuam
 * aparecendo na lista (marcadas como fora) e podem ser remarcadas. Se fossem
 * enviadas como excluídas, sumiriam do retorno e não teria como desfazer.
 */
export function montarRegra(
  form: FormRecorrencia,
  datas: { dataInicio: string; dataTermino: string },
  comExclusoes: boolean,
): RecorrenciaRegra | null {
  if (!ehRecorrente(form.tipo)) return null;
  const tipo = form.tipo as RecorrenciaRegra['tipo'];
  const regra: RecorrenciaRegra = { tipo };

  if (tipo === 'avulsa') {
    regra.datas = [...form.datasAvulsas].sort();
  } else {
    regra.data_inicio = datas.dataInicio;
    regra.data_fim = datas.dataTermino;
    if (tipo === 'semanal') regra.dias_semana = [...form.diasSemana].sort((a, b) => a - b);
    if (tipo === 'intervalo') regra.intervalo_dias = parseInt(form.intervaloDias, 10) || 0;
  }

  if (comExclusoes && form.datasExcluidas.length > 0) {
    regra.datas_excluidas = [...form.datasExcluidas].sort();
  }
  return regra;
}

/** Faltando dado obrigatório do próprio tipo, nem chega a chamar o preview —
 *  evita um 400 previsível a cada tecla digitada. */
export function regraPronta(form: FormRecorrencia, dataInicio: string, dataTermino: string): boolean {
  if (!ehRecorrente(form.tipo)) return false;
  if (form.tipo === 'avulsa') return form.datasAvulsas.length > 0;
  if (!dataInicio || !dataTermino) return false;
  if (form.tipo === 'semanal') return form.diasSemana.length > 0;
  if (form.tipo === 'intervalo') return (parseInt(form.intervaloDias, 10) || 0) >= 1;
  return true;
}

const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_NOMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// Data ISO é lida como UTC de propósito: `new Date('2026-08-03')` já é meia-noite
// UTC, e usar getDay() local jogaria o dia para trás em qualquer fuso a oeste de
// Greenwich — o Brasil inteiro.
function diaDaSemanaDe(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** "2026-08-03" → "seg, 03/08" (rótulo visível, curto por caber na grade). */
export function rotuloDataCurto(iso: string): string {
  const [, mes, dia] = iso.split('-').map(Number);
  return `${DIAS_ABREV[diaDaSemanaDe(iso)]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/** "2026-08-03" → "Segunda-feira, 03/08/2026". Vai no aria-label do checkbox: o
 *  rótulo curto da grade é ambíguo lido em voz alta ("seg 03 barra 08"), e sem
 *  nome acessível explícito o leitor de tela anuncia só "caixa de seleção, on". */
export function rotuloDataCompleto(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return `${DIAS_NOMES[diaDaSemanaDe(iso)]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}
