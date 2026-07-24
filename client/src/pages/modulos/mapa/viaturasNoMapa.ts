import L from 'leaflet';
import type { CartaoItem, CartaoViatura } from '../../../lib/cartaoConflitos';
import { horaParaMinutos } from '../../../lib/cartaoConflitos';

// Cor do marcador de viatura por categoria — reaproveita as mesmas cores dos
// badges do Cartão Programa. Espelha CORES_CATEGORIA_VIATURA em public/app.js.
const CORES_CATEGORIA_VIATURA: Record<string, string> = {
  'Força Tática': '#ef4444',
  Suplementar: '#f59e0b',
  Ordinária: '#2563eb',
};

export function criarIconeViatura(categoria: string): L.DivIcon {
  const cor = CORES_CATEGORIA_VIATURA[categoria] || CORES_CATEGORIA_VIATURA['Ordinária'];
  return L.divIcon({
    className: 'mapa-icone-viatura',
    html: `<div style="background:${cor};width:16px;height:16px;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

// Acha o item de roteiro ativo de uma viatura no horário atual (mesma lógica de
// janela usada nos alertas de conflito do Cartão Programa), com fallback pro
// setor se nada estiver ativo agora. Espelha itemAtivoAgora() em public/app.js.
export function itemAtivoAgora(vtr: CartaoViatura): CartaoItem | null {
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  return (
    (vtr.itens || []).find((item) => {
      if (!item.fim) return false;
      const ini = horaParaMinutos(item.inicio);
      let fim = horaParaMinutos(item.fim);
      if (fim <= ini) fim += 24 * 60;
      let atual = minutosAgora;
      if (atual < ini) atual += 24 * 60;
      return atual >= ini && atual < fim;
    }) || null
  );
}
