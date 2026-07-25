import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';

export interface MilitarDiario {
  posto_graduacao: string;
  nome_guerra: string;
  militar_nome: string;
  matricula: string;
  diarias: number;
}

export interface GrupoRelatorioDiario {
  data: string;
  total: number;
  militares: MilitarDiario[];
  operacao?: string;
  tipo?: string;
}

export interface RelatorioDiarioResponse {
  mes: string;
  ano: string;
  agrupar: 'data' | 'operacao';
  total_mes: number;
  grupos: GrupoRelatorioDiario[];
}

export function useRelatorioDiario(mes: string, ano: string, agrupar: 'data' | 'operacao') {
  const [dados, setDados] = useState<RelatorioDiarioResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;
    async function buscar() {
      setCarregando(true);
      try {
        const res = await apiFetch(`/api/relatorio-diario?mes=${mes}&ano=${ano}&agrupar=${agrupar}`);
        const corpo = (await res.json()) as RelatorioDiarioResponse & { error?: string };
        if (cancelado) return;
        if (!res.ok) {
          setErro(corpo.error || 'Falha ao carregar o relatório diário.');
          setDados(null);
        } else {
          setErro('');
          setDados(corpo);
        }
      } catch (erroFetch) {
        console.error('Erro ao carregar relatório diário:', erroFetch);
        if (!cancelado) {
          setErro('Falha ao carregar o relatório diário.');
          setDados(null);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      cancelado = true;
    };
  }, [mes, ano, agrupar]);

  return { dados, carregando, erro };
}
