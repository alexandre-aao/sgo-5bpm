import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Tables } from '../types/supabase';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface AvisoPayload {
  texto: string;
  categoria: string;
  prioridade: string;
  bairro_id: string;
  companhia: string;
  data_inicio: string;
  data_fim: string;
  permanente: boolean;
  ativo?: boolean;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Avisos Operacionais: leitura para todos os perfis, escrita só P3 (o servidor
 *  aplica exigirP3 — aqui a UI apenas esconde o que o perfil não pode usar). */
export function useAvisos() {
  const [avisos, setAvisos] = useState<Tables<'avisos'>[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiFetch('/api/avisos');
      const lista = (await res.json()) as Tables<'avisos'>[];
      if (Array.isArray(lista)) {
        setAvisos(lista);
        setErro(false);
      }
    } catch (e) {
      console.error('Erro ao carregar avisos operacionais:', e);
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const criarAviso = useCallback(async (payload: AvisoPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao cadastrar o alerta.') };
      await recarregar();
      return { ok: true };
    } catch (e) {
      console.error('Erro ao cadastrar aviso:', e);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const atualizarAviso = useCallback(async (id: string, payload: Partial<AvisoPayload>): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/avisos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o alerta.') };
      await recarregar();
      return { ok: true };
    } catch (e) {
      console.error('Erro ao salvar aviso:', e);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const renovarAviso = useCallback(async (id: string, dias = 30): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/avisos/${id}/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao renovar o alerta.') };
      await recarregar();
      return { ok: true };
    } catch (e) {
      console.error('Erro ao renovar aviso:', e);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluirAviso = useCallback(async (id: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/avisos/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir o alerta.') };
      await recarregar();
      return { ok: true };
    } catch (e) {
      console.error('Erro ao excluir aviso:', e);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { avisos, carregando, erro, recarregar, criarAviso, atualizarAviso, renovarAviso, excluirAviso };
}
