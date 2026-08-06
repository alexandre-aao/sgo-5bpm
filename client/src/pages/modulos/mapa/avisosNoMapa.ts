import L from 'leaflet';
import type { Tables } from '../../../types/supabase';

/** Raio do halo de alerta, em metros. Bairro da Zona Sul de Natal tem ordem de
 *  1–2 km de diâmetro; 600 m marca a área sem cobrir os vizinhos — a coordenada
 *  cadastrada é um centróide aproximado, não o polígono real do bairro. */
export const RAIO_AVISO_METROS = 600;

/** Cores das prioridades. Literais, e não `var(--...)`, porque o Leaflet pinta em
 *  SVG/canvas fora da cascata do componente e não resolve custom property.
 *  Mesma exceção já documentada para os marcadores de viatura. */
const CORES_PRIORIDADE: Record<string, string> = {
  critica: '#b91c1c',
  alta: '#ea580c',
  atencao: '#ca8a04',
  informativa: '#0369a1',
};

/** Da mais grave para a mais branda — é a ordem que decide a cor do halo quando
 *  o bairro tem vários alertas. */
const ORDEM_GRAVIDADE = ['critica', 'alta', 'atencao', 'informativa'];

export function corDaPrioridade(avisos: Tables<'avisos'>[]): string {
  for (const prioridade of ORDEM_GRAVIDADE) {
    if (avisos.some((a) => a.prioridade === prioridade)) return CORES_PRIORIDADE[prioridade];
  }
  return CORES_PRIORIDADE.informativa;
}

/**
 * Marcador de eventos com a contagem do bairro. Um só evento continua com o pino
 * padrão do Leaflet — a bolha com "1" não informaria nada e só poluiria o mapa.
 */
export function criarIconeEventos(quantidade: number): L.Icon | L.DivIcon {
  if (quantidade <= 1) return new L.Icon.Default();

  return L.divIcon({
    className: 'mapa-icone-eventos',
    html: `<div class="mapa-badge-eventos">${quantidade}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}
