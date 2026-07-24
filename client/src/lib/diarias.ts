import type { Tables } from '../types/supabase';

/** Diária de uma operação: soma real das escalas se houver militares escalados,
 * senão a estimativa (`qtd_diarias_estimada`). Nunca soma as duas fontes — regra
 * invólável 5 da migração. Espelha diariaDaOperacao() em server.js. */
export function diariaDaOperacao(
  operacao: Pick<Tables<'operacoes'>, 'qtd_diarias_estimada'>,
  escalasDaOperacao: Pick<Tables<'escalas'>, 'total_diarias'>[],
): number {
  if (escalasDaOperacao.length > 0) {
    return escalasDaOperacao.reduce((soma, e) => soma + (e.total_diarias || 0), 0);
  }
  return operacao.qtd_diarias_estimada || 0;
}
