/** Escapa HTML — espelha esc() em public/app.js. Necessário só onde HTML é
 * montado como string fora do JSX (popups do Leaflet, que não renderizam
 * React); em todo o resto do app o JSX já escapa sozinho. */
export function esc(texto: string | null | undefined): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
