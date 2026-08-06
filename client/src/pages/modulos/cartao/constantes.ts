import { slugBadge } from '../../../lib/slug';
import { ATIVIDADE_MADRUGADA_SEGURA } from '../../../lib/quadroResumo';

// Lista da UI apenas: o servidor aceita `atividade` como texto livre (max 100),
// sem lista fechada e sem CHECK no banco — não há espelho a manter em server.js.
// 'Madrugada Segura' entra como atividade para o horário ser lançado como item de
// roteiro com início/fim, igual aos QTLs, e alimentar a coluna do Quadro Resumo.
export const ATIVIDADES_CARTAO = [
  'PB',
  'Patrulhamento',
  'Itinerário',
  'QTL Almoço',
  'QTL Jantar',
  ATIVIDADE_MADRUGADA_SEGURA,
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
