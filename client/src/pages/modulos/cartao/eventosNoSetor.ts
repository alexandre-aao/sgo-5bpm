import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';

/** Eventos da pauta que ocorrem na data do cartão dentro do setor da viatura —
 * espelha eventosNoSetorDaVtr() em public/app.js. */
export function eventosNoSetorDaVtr(
  setorVtr: string,
  dataCartao: string,
  eventos: Tables<'eventos'>[],
): Tables<'eventos'>[] {
  const setorNorm = normalizarTexto(setorVtr);
  if (!setorNorm) return [];

  return eventos.filter((evt) => {
    const fim = evt.data_termino || evt.data_inicio;
    if (!(evt.data_inicio <= dataCartao && dataCartao <= fim)) return false;

    const bairroNorm = normalizarTexto(evt.bairro);
    if (!bairroNorm) return false;

    // Casa "PONTA NEGRA" com "Ponta Negra" e "CANDELÁRIA / PARQUE DAS COLINAS" com "Candelária"
    return setorNorm.includes(bairroNorm) || bairroNorm.includes(setorNorm);
  });
}
