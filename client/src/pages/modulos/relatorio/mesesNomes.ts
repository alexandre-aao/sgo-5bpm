export const MESES_NOMES = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

export function nomeMes(mm: string): string {
  return MESES_NOMES[parseInt(mm, 10)] || '';
}

export function dataBrHifen(iso: string): string {
  return (iso || '').split('-').reverse().join('-');
}
