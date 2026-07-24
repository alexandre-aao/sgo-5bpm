import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { Tables } from '../../../types/supabase';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface AlocacaoPayload {
  modalidade: string;
  qtd_policiais: number;
  qtd_viaturas: number;
  prefixos_vtr: string;
  comando_servico: string;
}

export interface EventoPayload {
  num_oficio: string;
  num_os_manual: string;
  num_sei: string;
  tipo_evento: string;
  nome_evento: string;
  demandante: string;
  data_inicio: string;
  data_termino: string;
  horario_inicio: string;
  local_itinerario: string;
  bairro: string;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Detalhes de um Evento + Alocações de Policiamento — espelha
 * fetchEventDetails(), handleCreateAlocacao(), window.handleDeleteAlocacao e
 * handleDeleteEvento() em public/app.js. */
export function useEventoDrawer(eventoId: string | null) {
  const [evento, setEvento] = useState<Tables<'eventos'> | null>(null);
  const [alocacoes, setAlocacoes] = useState<Tables<'alocacoes'>[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!eventoId) return;
    setCarregando(true);
    try {
      const [resEvt, resAloc] = await Promise.all([
        apiFetch('/api/eventos'),
        apiFetch(`/api/alocacoes?evento_id=${eventoId}`),
      ]);
      const eventos = (await resEvt.json()) as Tables<'eventos'>[];
      const alocacoesResp = (await resAloc.json()) as Tables<'alocacoes'>[];
      setEvento(eventos.find((e) => e.id === eventoId) || null);
      setAlocacoes(Array.isArray(alocacoesResp) ? alocacoesResp : []);
    } catch (erro) {
      console.error('Erro ao carregar detalhes do evento:', erro);
    } finally {
      setCarregando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const atualizarEvento = useCallback(async (payload: EventoPayload): Promise<ResultadoAcao> => {
    if (!eventoId) return { ok: false, mensagem: 'Nenhum evento selecionado.' };
    try {
      const res = await apiFetch(`/api/eventos/${eventoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o evento.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao salvar edição de evento:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [eventoId, recarregar]);

  const excluirEvento = useCallback(async (): Promise<ResultadoAcao> => {
    if (!eventoId) return { ok: false, mensagem: 'Nenhum evento selecionado.' };
    try {
      const res = await apiFetch(`/api/eventos/${eventoId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir o evento.') };
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir evento:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [eventoId]);

  const adicionarAlocacao = useCallback(async (payload: AlocacaoPayload): Promise<ResultadoAcao> => {
    if (!eventoId) return { ok: false, mensagem: 'Nenhum evento selecionado.' };
    try {
      const res = await apiFetch('/api/alocacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento_id: eventoId, ...payload }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao alocar a modalidade.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao alocar modalidade:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [eventoId, recarregar]);

  const removerAlocacao = useCallback(async (alocacaoId: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/alocacoes/${alocacaoId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao remover a alocação.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao remover alocação:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { evento, alocacoes, carregando, recarregar, atualizarEvento, excluirEvento, adicionarAlocacao, removerAlocacao };
}
