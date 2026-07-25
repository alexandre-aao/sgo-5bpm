import { slugBadge } from './slug';

/** Categoria de viatura — espelha CATEGORIAS_VIATURA em server.js. Usado no
 * Cadastro de Viaturas e no form de viatura do Cartão Programa. */
export const CATEGORIAS_VIATURA = ['Ordinária', 'Força Tática', 'Suplementar'];

/** Companhias operacionais — espelha COMPANHIAS_VALIDAS em server.js. */
export const COMPANHIAS = ['1ª Companhia', '2ª Companhia', '3ª Companhia'];

/** Classe de badge do status da viatura (Ativa/Manutenção) — espelha
 * statusViaturaBadgeClass() em public/app.js. */
export function statusViaturaBadgeClass(status: string): string {
  return `status-${slugBadge(status || 'Ativa')}`;
}
