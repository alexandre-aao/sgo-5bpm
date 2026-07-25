const ABREV_POSTO: Record<string, string> = {
  'Soldado PM': 'Sd',
  'Cabo PM': 'Cb',
  '3º Sargento PM': '3º Sgt',
  '2º Sargento PM': '2º Sgt',
  '1º Sargento PM': '1º Sgt',
  'Subtenente PM': 'Subten',
  'Aspirante a Oficial PM': 'Asp',
  '2º Tenente PM': '2º Ten',
  '1º Tenente PM': '1º Ten',
  'Capitão PM': 'Cap',
  'Major PM': 'Maj',
  'Tenente-Coronel PM': 'Ten Cel',
  'Coronel PM': 'Cel',
};

export function abreviarPosto(posto: string): string {
  return ABREV_POSTO[posto] || posto || '';
}
