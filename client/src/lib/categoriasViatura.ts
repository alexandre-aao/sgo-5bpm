import { slugBadge } from './slug';

/** Categoria de viatura — espelha CATEGORIAS_VIATURA em server.js. Usado no
 * Cadastro de Viaturas e no form de viatura do Cartão Programa. */
export const CATEGORIAS_VIATURA = ['Ordinária', 'Força Tática', 'Suplementar'];

/** Companhias que podem emprestar viatura — espelha COMPANHIAS_VIATURA em
 *  server.js. Inclui a PCS, que também emprega viatura no patrulhamento.
 *  Usada no Cadastro de Viaturas e no Cartão Programa. */
export const COMPANHIAS_VIATURA = ['PCS', '1ª Companhia', '2ª Companhia', '3ª Companhia'];

/** Escopo de Companhia dos Alertas Operacionais — espelha COMPANHIAS_VALIDAS em
 *  server.js. **Sem PCS de propósito:** o banco tem o CHECK `avisos_companhia_check`
 *  restrito às três companhias, e incluir PCS aqui faria o Postgres recusar a
 *  gravação depois de o formulário ter aceitado. Ampliar exige migration. */
export const COMPANHIAS = ['1ª Companhia', '2ª Companhia', '3ª Companhia'];

/** Rótulo curto para botões estreitos: "1ª Companhia" → "1ª CIA". A PCS (Pelotão
 *  de Comando e Serviços) **não** é companhia — sai como "PCS", nunca "PCS CIA". */
export function rotuloCurtoCompanhia(companhia: string): string {
  if (!companhia.includes('Companhia')) return companhia;
  return `${companhia.split(' ')[0]} CIA`;
}

/** Classe de badge do status da viatura (Ativa/Manutenção) — espelha
 * statusViaturaBadgeClass() em public/app.js. */
export function statusViaturaBadgeClass(status: string): string {
  return `status-${slugBadge(status || 'Ativa')}`;
}
