/** Minúsculas, sem acentos, espaço vira hífen — usado para gerar classes CSS de
 * badge a partir de um texto livre (tipo de evento, atividade, categoria).
 * Espelha o slug usado em public/app.js para as classes `.badge.<slug>`. */
export function slugBadge(valor: string): string {
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
