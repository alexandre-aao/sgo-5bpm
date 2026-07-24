import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/api';

export interface OperacaoDoMes {
  id: string;
  nome_operacao: string;
  tipo_operacao: string;
  situacao: string;
  data_inicio: string;
  militares_escalados: number;
  qtd_diarias_estimada: number;
  tem_escala: boolean;
  total_diarias: number;
}

export interface PlanejadorResumo {
  cota_mensal: number;
  total_consumido: number;
  total_planejado: number;
  saldo: number;
  operacoes: OperacaoDoMes[];
}

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

const RESUMO_VAZIO: PlanejadorResumo = {
  cota_mensal: 0,
  total_consumido: 0,
  total_planejado: 0,
  saldo: 0,
  operacoes: [],
};

/** Busca o resumo do Planejador de Diárias (cota × consumido × planejado +
 * operações do mês) — espelha renderPlanejadorTab() em public/app.js. */
export function usePlanejadorDiarias(mes: string, ano: string) {
  const [resumo, setResumo] = useState<PlanejadorResumo>(RESUMO_VAZIO);
  const [carregando, setCarregando] = useState(true);

  // Token de execução: mudar mês e ano em sequência rápida (dois selects, dois
  // effects) dispara duas buscas em paralelo — sem isso, a resposta do período
  // antigo pode chegar depois e sobrescrever a do período novo. Mesmo padrão de
  // calendarioDiariasToken em public/app.js (renderCalendarioDiarias).
  const tokenRef = useRef(0);

  const recarregar = useCallback(async () => {
    const meuToken = ++tokenRef.current;
    setCarregando(true);
    try {
      const res = await apiFetch(`/api/planejador-diarias?mes=${mes}&ano=${ano}`);
      const dados = (await res.json()) as PlanejadorResumo;
      if (tokenRef.current !== meuToken) return;
      setResumo(dados && Array.isArray(dados.operacoes) ? dados : RESUMO_VAZIO);
    } catch (erro) {
      console.error('Erro ao carregar planejador de diárias:', erro);
      if (tokenRef.current === meuToken) setResumo(RESUMO_VAZIO);
    } finally {
      if (tokenRef.current === meuToken) setCarregando(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const salvarCota = useCallback(async (valor: number): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cota_mensal_diarias: valor }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, mensagem: corpo.error || 'Falha ao salvar a cota.' };
      }
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao salvar a cota mensal:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { resumo, carregando, recarregar, salvarCota };
}
