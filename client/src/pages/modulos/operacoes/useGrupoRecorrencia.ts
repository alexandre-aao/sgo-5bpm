import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { OperacaoDoGrupo } from '../../../lib/escalaLote';

interface RespostaGrupo {
  grupo_recorrencia_id: string;
  total: number;
  total_executadas: number;
  total_diarias: number;
  operacoes: OperacaoDoGrupo[];
}

/** Ocorrências do grupo de recorrência COM o efetivo de cada uma
 *  (GET /api/operacoes/grupo/:grupoId). `null` enquanto não há grupo — operação
 *  avulsa não faz a chamada e a UI de replicação nem aparece. */
export function useGrupoRecorrencia(grupoId: string | null) {
  const [grupo, setGrupo] = useState<OperacaoDoGrupo[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!grupoId) {
      setGrupo(null);
      return;
    }
    setCarregando(true);
    try {
      const res = await apiFetch(`/api/operacoes/grupo/${grupoId}`);
      if (!res.ok) {
        setGrupo(null);
        return;
      }
      const corpo = (await res.json()) as RespostaGrupo;
      setGrupo(corpo.operacoes || []);
    } catch (erro) {
      console.error('Erro ao carregar o grupo de recorrência:', erro);
      setGrupo(null);
    } finally {
      setCarregando(false);
    }
  }, [grupoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  return { grupo, carregando, recarregar };
}
