import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Tables } from '../types/supabase';
import type { TipoCartao } from '../lib/cartaoConflitos';

export type OrientacaoCartao = Tables<'orientacoes_cartao'>;

export interface NovaOrientacao {
  texto: string;
  tipo_cartao: TipoCartao | null;
  ativo: boolean;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

type Resultado = { ok: true } | { ok: false; mensagem: string };

/** Orientações permanentes da P3 — aparecem no bloco de observações da VIATURA (no
 * cartão e no PDF), nunca na linha do roteiro. Só ativo/inativo, sem vigência por data.
 *
 * `apenasAtivas` distingue os dois usos: a exibição no cartão/PDF pede só as vigentes;
 * o painel de gestão da P3 carrega todas, pra poder reativar as inativas. */
export function useOrientacoesCartao(apenasAtivas = false) {
  const [orientacoes, setOrientacoes] = useState<OrientacaoCartao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiFetch(`/api/orientacoes-cartao${apenasAtivas ? '?ativo=true' : ''}`);
      const dados = (await res.json()) as OrientacaoCartao[];
      setOrientacoes(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error('Erro ao carregar orientações da P3:', erro);
      setOrientacoes([]);
    } finally {
      setCarregando(false);
    }
  }, [apenasAtivas]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const criar = useCallback(async (payload: NovaOrientacao): Promise<Resultado> => {
    try {
      const res = await apiFetch('/api/orientacoes-cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao criar a orientação.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao criar orientação:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const atualizar = useCallback(async (id: string, patch: Partial<NovaOrientacao>): Promise<Resultado> => {
    try {
      const res = await apiFetch(`/api/orientacoes-cartao/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao atualizar a orientação.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao atualizar orientação:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluir = useCallback(async (id: string): Promise<Resultado> => {
    try {
      const res = await apiFetch(`/api/orientacoes-cartao/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir a orientação.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir orientação:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { orientacoes, carregando, recarregar, criar, atualizar, excluir };
}

/** Orientações que se aplicam a um tipo de cartão (tipo_cartao null = vale pros dois). */
export function orientacoesDoTipo(orientacoes: OrientacaoCartao[], tipo: TipoCartao): OrientacaoCartao[] {
  return orientacoes.filter((o) => o.ativo && (!o.tipo_cartao || o.tipo_cartao === tipo));
}
