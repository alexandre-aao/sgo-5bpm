import { slugBadge } from '../../../lib/slug';

// Espelha ATIVIDADES_CARTAO em public/app.js.
export const ATIVIDADES_CARTAO = [
  'PB',
  'Patrulhamento',
  'QTL Almoço',
  'QTL Jantar',
  'Corredor Seguro',
  'Barreira Itinerante',
  'Outros',
];

export function atividadeBadgeClass(atividade: string): string {
  return `atv-${slugBadge(atividade || 'Outros')}`;
}

export function categoriaBadgeClass(categoria: string): string {
  return `cat-${slugBadge(categoria || 'Ordinária')}`;
}
