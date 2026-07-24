import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { Tables } from '../../../types/supabase';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface EscalaPayload {
  militar_nome: string;
  militar_id: string;
  qtd_aparicoes: number;
}

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

  const adicionarEscala = useCallback(async (payload: EscalaPayload): Promise<ResultadoAcao> => {
    if (!operacaoId) return { ok: false, mensagem: 'Nenhuma operação selecionada.' };
    try {
      const res = await apiFetch('/api/escalas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacao_id: operacaoId, ...payload }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao escalar o militar.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao escalar militar:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [operacaoId, recarregar]);

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

  return { operacao, escalas, carregando, recarregar, atualizarOperacao, marcarExecutada, excluirOperacao, adicionarEscala, removerEscala };
}
