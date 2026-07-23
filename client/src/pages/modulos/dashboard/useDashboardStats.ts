import { useMemo } from 'react';
import type { AppData } from '../../../context/app-data-context';

export interface DashboardStats {
  eventosSemana: number;
  eventosSemanaAnterior: number;
  consumidoMes: number;
  cota: number;
  operacoesMes: number;
  operacoesMesExecutadas: number;
}

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Espelha updateStats() em public/app.js: eventos da semana corrente (segunda a
 * domingo) vs. semana anterior, diárias consumidas no mês vs. cota, operações do
 * mês. Tudo derivado de AppData já carregado — sem chamada nova ao backend. */
export function useDashboardStats(dados: AppData): DashboardStats {
  return useMemo(() => {
    const hoje = new Date();
    const primeiroDiaSemana = new Date(hoje);
    primeiroDiaSemana.setDate(hoje.getDate() - hoje.getDay() + (hoje.getDay() === 0 ? -6 : 1));
    primeiroDiaSemana.setHours(0, 0, 0, 0);

    const ultimoDiaSemana = new Date(primeiroDiaSemana);
    ultimoDiaSemana.setDate(primeiroDiaSemana.getDate() + 6);
    ultimoDiaSemana.setHours(23, 59, 59, 999);

    const primeiroDiaSemanaAnterior = new Date(primeiroDiaSemana);
    primeiroDiaSemanaAnterior.setDate(primeiroDiaSemana.getDate() - 7);
    const ultimoDiaSemanaAnterior = new Date(ultimoDiaSemana);
    ultimoDiaSemanaAnterior.setDate(ultimoDiaSemana.getDate() - 7);

    const eventosSemana = dados.eventos.filter((e) => {
      const dataEvt = new Date(e.data_inicio + 'T00:00:00');
      return dataEvt >= primeiroDiaSemana && dataEvt <= ultimoDiaSemana;
    }).length;
    const eventosSemanaAnterior = dados.eventos.filter((e) => {
      const dataEvt = new Date(e.data_inicio + 'T00:00:00');
      return dataEvt >= primeiroDiaSemanaAnterior && dataEvt <= ultimoDiaSemanaAnterior;
    }).length;

    const prefixoMesAtual = getLocalDateStr().slice(0, 7); // "YYYY-MM"
    const idsOperacoesMes = new Set(
      dados.operacoes.filter((o) => o.data_inicio.startsWith(prefixoMesAtual)).map((o) => o.id),
    );
    const consumidoMes = dados.escalas
      .filter((s) => idsOperacoesMes.has(s.operacao_id))
      .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

    const operacoesMesLista = dados.operacoes.filter((o) => o.data_inicio.startsWith(prefixoMesAtual));
    const operacoesMesExecutadas = operacoesMesLista.filter((o) => o.situacao === 'Executada').length;

    return {
      eventosSemana,
      eventosSemanaAnterior,
      consumidoMes,
      cota: dados.config.cota_mensal_diarias || 0,
      operacoesMes: operacoesMesLista.length,
      operacoesMesExecutadas,
    };
  }, [dados]);
}
