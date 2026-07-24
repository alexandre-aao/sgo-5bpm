import type { Tables } from '../../../types/supabase';

export interface FiltrosEventos {
  dataInicio: string;
  dataFim: string;
  busca: string;
}

export function filtrosVazios(): FiltrosEventos {
  return { dataInicio: '', dataFim: '', busca: '' };
}

/** Filtra a lista de eventos por período + texto — espelha getEventosFiltrados()
 * em public/app.js. Usado tanto pela tabela quanto pelo Relatório (PDF). */
export function getEventosFiltrados(eventos: Tables<'eventos'>[], filtros: FiltrosEventos): Tables<'eventos'>[] {
  const termo = filtros.busca.toLowerCase().trim();
  let lista = eventos;
  if (filtros.dataInicio) lista = lista.filter((e) => e.data_inicio >= filtros.dataInicio);
  if (filtros.dataFim) lista = lista.filter((e) => e.data_inicio <= filtros.dataFim);
  if (termo) {
    lista = lista.filter((e) =>
      (e.nome_evento || '').toLowerCase().includes(termo) ||
      (e.bairro || '').toLowerCase().includes(termo) ||
      (e.local_itinerario || '').toLowerCase().includes(termo) ||
      (e.demandante || '').toLowerCase().includes(termo) ||
      (e.num_os_manual || '').toLowerCase().includes(termo) ||
      (e.num_sei || '').toLowerCase().includes(termo),
    );
  }
  return lista;
}
