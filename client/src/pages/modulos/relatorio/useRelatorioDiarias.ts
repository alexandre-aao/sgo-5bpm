import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';

export interface RelatorioDiariaItem {
  militar_id: string;
  militar_nome: string;
  escalas_count: number;
  qtd_aparicoes: number;
  total_diarias: number;
}

export function useRelatorioDiarias(mes: string, ano: string) {
  const [lista, setLista] = useState<RelatorioDiariaItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function buscar() {
      setCarregando(true);
      try {
        const res = await apiFetch(`/api/relatorio-diarias?mes=${mes}&ano=${ano}`);
        const dados = (await res.json()) as RelatorioDiariaItem[];
        if (!cancelado) setLista(Array.isArray(dados) ? dados : []);
      } catch (erro) {
        console.error('Erro ao carregar relatório de diárias:', erro);
        if (!cancelado) setLista([]);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      cancelado = true;
    };
  }, [mes, ano]);

  return { lista, carregando };
}
