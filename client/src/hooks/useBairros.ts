import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Tables } from '../types/supabase';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface BairroPayload {
  nome_bairro: string;
  latitude: string;
  longitude: string;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Cadastro de bairros (coordenadas) — alimenta o select de Bairro em Novo/Editar
 * Evento, os marcadores do Mapa e o painel Gerenciar Bairros (P3). Espelha
 * popularSelectBairros()/renderGerenciarBairrosTab()/handleSalvarBairro()/
 * handleExcluirBairro() em public/app.js. */
export function useBairros() {
  const [bairros, setBairros] = useState<Tables<'bairros_coordenadas'>[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiFetch('/api/bairros-coordenadas');
      const lista = (await res.json()) as Tables<'bairros_coordenadas'>[];
      if (Array.isArray(lista)) {
        setBairros([...lista].sort((a, b) => a.nome_bairro.localeCompare(b.nome_bairro)));
      }
    } catch (erro) {
      console.error('Erro ao carregar cadastro de bairros:', erro);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const criarBairro = useCallback(async (payload: BairroPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/bairros-coordenadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao cadastrar o bairro.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao cadastrar bairro:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const atualizarBairro = useCallback(async (id: string, payload: BairroPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/bairros-coordenadas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o bairro.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao salvar bairro:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluirBairro = useCallback(async (id: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/bairros-coordenadas/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir o bairro.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir bairro:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { bairros, carregando, recarregar, criarBairro, atualizarBairro, excluirBairro };
}
