import type { Tables } from '../types/supabase';

// Regras do escalonamento em lote no lado do cliente. Tudo aqui espelha server.js
// (chaveMilitar, TETO_DIARIAS_MILITAR_MES, resumoCotaEteto) — o servidor continua
// sendo a autoridade; isto existe para a tela mostrar o impacto ANTES de confirmar.

/** Teto informativo, igual ao TETO_DIARIAS_MILITAR_MES do servidor. Nunca bloqueia. */
export const TETO_DIARIAS_MILITAR_MES = 20;

export type EscopoReplicacao = 'somente_esta' | 'esta_e_futuras' | 'todas';

export const ESCOPOS: { valor: EscopoReplicacao; rotulo: string }[] = [
  { valor: 'somente_esta', rotulo: 'Somente esta' },
  { valor: 'esta_e_futuras', rotulo: 'Esta e as futuras' },
  { valor: 'todas', rotulo: 'Todas as ocorrências' },
];

export interface MilitarDoLote {
  chave: string;
  /** MATRÍCULA (RE). É o que `escalas.militar_id` guarda — não o `pessoal.id`. Pode
   *  ser vazia: escalar militar fora do cadastro é permitido. */
  militar_id: string;
  militar_nome: string;
  qtd_aparicoes: number;
  total_diarias: number;
}

/** Espelha chaveMilitar() do server.js: sem matrícula, a identidade cai no nome, senão
 *  dois militares não cadastrados colidiriam numa chave vazia. */
export function chaveMilitar(matricula: string | null, nome: string | null): string {
  const mat = (matricula || '').trim();
  return mat ? `re:${mat}` : `nome:${(nome || '').trim().toLowerCase()}`;
}

export function mesDe(dataIso: string | null): string {
  return (dataIso || '').slice(0, 7);
}

export interface OperacaoDoGrupo extends Tables<'operacoes'> {
  escalas: Tables<'escalas'>[];
  militares_escalados: number;
  total_diarias: number;
}

/**
 * Ocorrências que a replicação vai realmente atingir. Já remove as EXECUTADAS —
 * o servidor as ignora, então incluí-las na contagem faria a tela prometer mais do
 * que grava. Sem grupo, o alvo é sempre a própria operação.
 */
export function operacoesDoEscopo(
  grupo: OperacaoDoGrupo[] | null,
  operacaoAtual: Tables<'operacoes'>,
  escopo: EscopoReplicacao,
): Tables<'operacoes'>[] {
  if (!grupo || grupo.length === 0 || escopo === 'somente_esta') {
    return operacaoAtual.situacao === 'Executada' ? [] : [operacaoAtual];
  }
  const naoExecutadas = grupo.filter((o) => o.situacao !== 'Executada');
  if (escopo === 'todas') return naoExecutadas;
  // Comparação de string ISO já é cronológica.
  return naoExecutadas.filter((o) => o.data_inicio >= operacaoAtual.data_inicio);
}

export interface ImpactoLote {
  totalOperacoes: number;
  /** Diárias que a escala passa a somar (valor registrado × ocorrências). */
  totalDiarias: number;
  porMes: { mes: string; consumidoAtual: number; delta: number; saldoApos: number }[];
  acimaDoTeto: { militar_nome: string; mes: string; total_diarias: number }[];
}

/**
 * Impacto do lote, em diárias, por mês e por militar. Trabalha em DELTA, não em soma:
 * um militar já escalado naquela operação tem a escala ATUALIZADA pelo servidor, não
 * duplicada — contar as novas diárias inteiras inflaria o consumo mostrado.
 */
export function calcularImpacto(
  operacoesAlvo: Tables<'operacoes'>[],
  militares: MilitarDoLote[],
  escalasTodas: Tables<'escalas'>[],
  operacoesTodas: Tables<'operacoes'>[],
  cotaMensal: number,
): ImpactoLote {
  const operacaoPorId = new Map(operacoesTodas.map((o) => [o.id, o]));
  // Data da escala: a coluna quando preenchida, senão a data_inicio da operação —
  // escalas anteriores à migration 004 têm `data` nula (mesmo fallback do servidor).
  const mesDaEscala = (e: Tables<'escalas'>) => mesDe(e.data || operacaoPorId.get(e.operacao_id)?.data_inicio || '');

  const escalaPorPar = new Map<string, Tables<'escalas'>>();
  for (const esc of escalasTodas) {
    const par = `${esc.operacao_id}|${chaveMilitar(esc.militar_id, esc.militar_nome)}`;
    const atual = escalaPorPar.get(par);
    if (!atual || esc.id < atual.id) escalaPorPar.set(par, esc);
  }

  const deltaPorMes = new Map<string, number>();
  const totalPorMilitarMes = new Map<string, { militar_nome: string; mes: string; total_diarias: number }>();
  let totalDiarias = 0;

  // Diárias já existentes por militar/mês, ponto de partida do teto.
  for (const esc of escalasTodas) {
    const mes = mesDaEscala(esc);
    const k = `${mes}|${chaveMilitar(esc.militar_id, esc.militar_nome)}`;
    const atual = totalPorMilitarMes.get(k);
    if (atual) atual.total_diarias += esc.total_diarias || 0;
    else totalPorMilitarMes.set(k, { militar_nome: esc.militar_nome, mes, total_diarias: esc.total_diarias || 0 });
  }

  for (const op of operacoesAlvo) {
    const mes = mesDe(op.data_inicio);
    for (const militar of militares) {
      const novo = militar.total_diarias;
      const existente = escalaPorPar.get(`${op.id}|${militar.chave}`);
      const antigo = existente?.total_diarias || 0;
      totalDiarias += novo;
      deltaPorMes.set(mes, (deltaPorMes.get(mes) || 0) + (novo - antigo));

      const k = `${mes}|${militar.chave}`;
      const atual = totalPorMilitarMes.get(k);
      if (atual) {
        atual.total_diarias += novo - antigo;
        atual.militar_nome = militar.militar_nome;
      } else {
        totalPorMilitarMes.set(k, { militar_nome: militar.militar_nome, mes, total_diarias: novo });
      }
    }
  }

  const chavesDoLote = new Set(militares.map((m) => m.chave));
  const mesesAlvo = [...new Set(operacoesAlvo.map((o) => mesDe(o.data_inicio)))].sort();

  const porMes = mesesAlvo.map((mes) => {
    const consumidoAtual = escalasTodas
      .filter((e) => mesDaEscala(e) === mes)
      .reduce((soma, e) => soma + (e.total_diarias || 0), 0);
    const delta = deltaPorMes.get(mes) || 0;
    return { mes, consumidoAtual, delta, saldoApos: cotaMensal - consumidoAtual - delta };
  });

  return {
    totalOperacoes: operacoesAlvo.length,
    totalDiarias,
    porMes,
    // Só quem está no lote: quem já estourava o teto antes não é problema desta ação.
    acimaDoTeto: [...totalPorMilitarMes.entries()]
      .filter(([k, v]) => v.total_diarias > TETO_DIARIAS_MILITAR_MES && chavesDoLote.has(k.split('|')[1]))
      .map(([, v]) => v)
      .sort((a, b) => b.total_diarias - a.total_diarias),
  };
}

/** Em quantas ocorrências do grupo este militar está escalado. Alimenta o selo da
 *  lista de efetivo ("em 18 ocorrências") e o botão de remover do grupo inteiro. */
export function ocorrenciasDoMilitar(grupo: OperacaoDoGrupo[] | null, chave: string): number {
  if (!grupo) return 1;
  return grupo.filter((op) => op.escalas.some((e) => chaveMilitar(e.militar_id, e.militar_nome) === chave)).length;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-09" → "set/2026". */
export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  return `${MESES_CURTOS[parseInt(m, 10) - 1] || m}/${ano}`;
}

/** Matrículas coladas (vírgula, ponto e vírgula ou quebra de linha) resolvidas contra
 *  o cadastro. As não encontradas voltam para a tela avisar, em vez de sumirem. */
export function resolverMatriculasColadas(
  texto: string,
  pessoal: Tables<'pessoal'>[],
): { encontrados: Tables<'pessoal'>[]; naoEncontradas: string[] } {
  const porMatricula = new Map(pessoal.filter((p) => p.matricula).map((p) => [p.matricula!.trim(), p]));
  const encontrados: Tables<'pessoal'>[] = [];
  const naoEncontradas: string[] = [];
  const vistas = new Set<string>();

  for (const bruta of texto.split(/[\s,;]+/)) {
    const matricula = bruta.trim();
    if (!matricula || vistas.has(matricula)) continue;
    vistas.add(matricula);
    const pessoa = porMatricula.get(matricula);
    if (pessoa) encontrados.push(pessoa);
    else naoEncontradas.push(matricula);
  }
  return { encontrados, naoEncontradas };
}
