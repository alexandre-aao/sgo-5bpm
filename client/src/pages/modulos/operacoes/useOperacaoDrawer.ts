import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { Tables } from '../../../types/supabase';
import type { RecorrenciaRegra } from '../../../lib/recorrencia';
import type { MilitarDoLote } from '../../../lib/escalaLote';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface OperacaoPayload {
  nome_operacao: string;
  tipo_operacao: string;
  data_inicio: string;
  data_termino: string;
  qtd_diarias_estimada: number | string;
  horario_inicio: string;
  tipo_recorrencia: string;
  bairro: string;
  local_itinerario: string;
  num_oficio: string;
  num_os_manual: string;
  num_sei: string;
  demandante: string;
  /** Presente só na CRIAÇÃO com recorrência — é o que faz o payload ir para
   *  POST /api/operacoes/lote em vez de POST /api/operacoes. O PUT ignora. */
  recorrencia_regra?: RecorrenciaRegra | null;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Detalhes de uma Operação + Efetivo Escalado — espelha fetchOperacaoDetails(),
 * handleMarcarOperacaoExecutada(), handleDeleteOperacao(), handleCreateEscala()
 * e window.handleDeleteAlocacao/Escala em public/app.js. */
export function useOperacaoDrawer(operacaoId: string | null) {
  const [operacao, setOperacao] = useState<Tables<'operacoes'> | null>(null);
  const [escalas, setEscalas] = useState<Tables<'escalas'>[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!operacaoId) return;
    setCarregando(true);
    try {
      const [resOp, resEscalas] = await Promise.all([
        apiFetch('/api/operacoes'),
        apiFetch(`/api/escalas?operacao_id=${operacaoId}`),
      ]);
      const operacoes = (await resOp.json()) as Tables<'operacoes'>[];
      const escalasResp = (await resEscalas.json()) as Tables<'escalas'>[];
      setOperacao(operacoes.find((o) => o.id === operacaoId) || null);
      setEscalas(Array.isArray(escalasResp) ? escalasResp : []);
    } catch (erro) {
      console.error('Erro ao carregar detalhes da operação:', erro);
    } finally {
      setCarregando(false);
    }
  }, [operacaoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const atualizarOperacao = useCallback(async (payload: OperacaoPayload): Promise<ResultadoAcao> => {
    if (!operacaoId) return { ok: false, mensagem: 'Nenhuma operação selecionada.' };
    try {
      const res = await apiFetch(`/api/operacoes/${operacaoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar a operação.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao salvar edição de operação:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [operacaoId, recarregar]);

  const marcarExecutada = useCallback(async (): Promise<ResultadoAcao> => {
    if (!operacaoId) return { ok: false, mensagem: 'Nenhuma operação selecionada.' };
    try {
      const res = await apiFetch(`/api/operacoes/${operacaoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situacao: 'Executada' }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao marcar como executada.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao marcar operação como executada:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [operacaoId, recarregar]);

  const excluirOperacao = useCallback(async (): Promise<ResultadoAcao> => {
    if (!operacaoId) return { ok: false, mensagem: 'Nenhuma operação selecionada.' };
    try {
      const res = await apiFetch(`/api/operacoes/${operacaoId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir a operação.') };
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir operação:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [operacaoId]);

  // Inclusão de UM militar por vez saiu daqui: toda inclusão passa por escalarEmLote,
  // que cobre o caso de uma operação só. O POST /api/escalas unitário continua no
  // servidor — é o único caminho que aceita escalar em operação já Executada.

  /** Escala N militares em N operações numa chamada (POST /api/escalas/lote).
   *  É o caminho único de inclusão, inclusive para uma operação só — o servidor
   *  atualiza quem já está escalado em vez de duplicar. */
  const escalarEmLote = useCallback(async (
    operacaoIds: string[],
    militares: MilitarDoLote[],
  ): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/escalas/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operacao_ids: operacaoIds,
          militares: militares.map((m) => ({
            militar_id: m.militar_id,
            militar_nome: m.militar_nome,
            qtd_aparicoes: m.qtd_aparicoes,
          })),
        }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao escalar o efetivo.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao escalar efetivo em lote:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  /** Remove um militar de um conjunto de operações (DELETE /api/escalas/lote) —
   *  usado pelo "Remover do grupo" da lista de efetivo. */
  const removerEmLote = useCallback(async (
    operacaoIds: string[],
    militar: { militar_id: string; militar_nome: string },
  ): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/escalas/lote', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacao_ids: operacaoIds, militares: [militar] }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao remover o militar do grupo.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao remover efetivo em lote:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const removerEscala = useCallback(async (escalaId: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/escalas/${escalaId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao remover o militar da escala.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao remover escala:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return {
    operacao, escalas, carregando, recarregar,
    atualizarOperacao, marcarExecutada, excluirOperacao,
    removerEscala, escalarEmLote, removerEmLote,
  };
}
