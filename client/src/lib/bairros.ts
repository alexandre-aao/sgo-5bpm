import type { Tables } from '../types/supabase';

/** Bairro que pode ir para o mapa: desde a migration 001 a coordenada é
 *  opcional (um bairro pode existir só para receber Aviso Operacional / vincular
 *  viatura, sem estar plotado). */
export type BairroComCoordenada = Tables<'bairros_coordenadas'> & {
  latitude: number;
  longitude: number;
};

export function temCoordenada(bairro: Tables<'bairros_coordenadas'>): bairro is BairroComCoordenada {
  return typeof bairro.latitude === 'number' && typeof bairro.longitude === 'number';
}

export function bairrosPlotaveis(bairros: Tables<'bairros_coordenadas'>[]): BairroComCoordenada[] {
  return bairros.filter(temCoordenada);
}
