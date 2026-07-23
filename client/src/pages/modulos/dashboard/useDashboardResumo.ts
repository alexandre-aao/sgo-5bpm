import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';

export interface DashboardResumo {
  periodo: { mes: string; ano: string };
  eventos: { total_periodo: number; proximos_7_dias: number };
  diarias: {
    total_pago_periodo: number;
    planejado_periodo: number;
    saldo_cota_periodo: number;
    cota_mensal: number;
  };
  planejador: { operacoes_planejadas: number };
  efetivo_total_periodo: number;
  distribuicao_tipo: { tipo_evento: string; total_eventos: number; total_policiais: number; total_viaturas: number }[];
  top_militares: { militar_nome: string; posto_graduacao: string; escalas_count: number; total_diarias: number }[];
  pessoal: { total: number; pracas: number; oficiais: number };
  usuarios: { total: number };
}

interface UseDashboardResumo {
  resumo: DashboardResumo | null;
  carregando: boolean;
}

/** Busca GET /api/dashboard-resumo?mes=&ano= — espelha renderDashboardResumo() em
 * public/app.js. Refaz a busca sempre que mes/ano mudam (filtro de período). */
export function useDashboardResumo(mes: string, ano: string): UseDashboardResumo {
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      setCarregando(true);
      try {
        const res = await apiFetch(`/api/dashboard-resumo?mes=${mes}&ano=${ano}`);
        const dados = (await res.json()) as DashboardResumo | { error: string };
        if (!res.ok) throw new Error('error' in dados ? dados.error : 'Falha ao carregar o resumo do Dashboard.');
        if (!cancelado) setResumo(dados as DashboardResumo);
      } catch (erro) {
        console.error('Erro ao carregar o resumo do Dashboard:', erro);
        if (!cancelado) setResumo(null);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, [mes, ano]);

  return { resumo, carregando };
}
