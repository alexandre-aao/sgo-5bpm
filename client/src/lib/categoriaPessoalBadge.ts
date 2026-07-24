// Mapa fixo (em vez de transformar a string via slug) porque as 5 categorias
// têm preposições/acentos que não convertem de forma previsível pelo mesmo
// slug usado nos outros badges. Espelha CATEGORIA_PESSOAL_BADGE_MAP em public/app.js.
const CATEGORIA_PESSOAL_BADGE_MAP: Record<string, string> = {
  Adjunto: 'pcat-adjunto',
  'Fiscal de Operações': 'pcat-fiscal-de-operacoes',
  'Oficial de Operações': 'pcat-oficial-de-operacoes',
  'Oficial de Sobreaviso': 'pcat-oficial-de-sobreaviso',
  Executor: 'pcat-executor',
};

export function categoriaPessoalBadgeClass(categoria: string): string {
  return CATEGORIA_PESSOAL_BADGE_MAP[categoria] || 'outros';
}
