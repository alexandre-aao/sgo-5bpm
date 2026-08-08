import type { Tables } from '../types/supabase';

type LocalizacaoEvento = Pick<Tables<'eventos'>, 'endereco' | 'local_itinerario' | 'bairro'>;

/** Localização mais útil para leitores operacionais e relatórios.
 * Eventos anteriores à migration 005 não têm endereço preenchido. */
export function enderecoEvento(evento: LocalizacaoEvento): string {
  return evento.endereco?.trim()
    || evento.local_itinerario?.trim()
    || evento.bairro?.trim()
    || '';
}
