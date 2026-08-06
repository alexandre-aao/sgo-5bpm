import type { Tables } from '../../../types/supabase';

export type PeriodoMapa = 'hoje' | 'semana' | 'mes';

export const OPCOES_PERIODO: { valor: PeriodoMapa; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mês' },
];

/** Data local em ISO. Local, e não UTC, porque a comparação é com `data_inicio`
 *  (DATE) do jeito que o usuário lê o calendário — em UTC-3 o `toISOString()`
 *  vira o dia seguinte a partir das 21h. */
function isoLocal(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Faixa fechada [de, ate] do período, em ISO. Semana é segunda a domingo. */
export function faixaDoPeriodo(periodo: PeriodoMapa, hoje = new Date()): { de: string; ate: string } {
  if (periodo === 'hoje') {
    const dia = isoLocal(hoje);
    return { de: dia, ate: dia };
  }

  if (periodo === 'mes') {
    const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { de: isoLocal(primeiro), ate: isoLocal(ultimo) };
  }

  // Semana corrente, segunda a domingo. getDay(): domingo = 0, então domingo
  // pertence à semana que começou na segunda anterior (-6), não à seguinte.
  const primeiroDia = new Date(hoje);
  primeiroDia.setDate(hoje.getDate() - hoje.getDay() + (hoje.getDay() === 0 ? -6 : 1));
  const ultimoDia = new Date(primeiroDia);
  ultimoDia.setDate(primeiroDia.getDate() + 6);
  return { de: isoLocal(primeiroDia), ate: isoLocal(ultimoDia) };
}

/** Eventos que ACONTECEM dentro do período — um evento de vários dias entra se
 *  qualquer parte dele cair na faixa, não só se começar nela. */
export function eventosDoPeriodo(
  eventos: Tables<'eventos'>[],
  periodo: PeriodoMapa,
  hoje = new Date(),
): Tables<'eventos'>[] {
  const { de, ate } = faixaDoPeriodo(periodo, hoje);
  return eventos.filter((e) => {
    const inicio = e.data_inicio;
    const fim = e.data_termino || e.data_inicio;
    return inicio <= ate && fim >= de;
  });
}
