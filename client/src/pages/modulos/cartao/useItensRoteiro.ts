import { useCallback } from 'react';
import { apiFetch } from '../../../lib/api';
import type { ResultadoAcao } from './useCartaoPrograma';

export interface ItemPayload {
  inicio: string;
  fim: string;
  local: string;
  atividade: string;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** CRUD de itens de roteiro por viatura — espelha handleAddCartaoItem(),
 * handleDeleteCartaoItem() e salvarAtividadeItem() em public/app.js. */
export function useItensRoteiro(cartaoId: string | undefined, recarregar: () => Promise<void>) {
  const adicionarItem = useCallback(
    async (vtrId: string, payload: ItemPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao incluir o item de roteiro.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao incluir item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  const removerItem = useCallback(
    async (vtrId: string, itemId: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens/${itemId}`, { method: 'DELETE' });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao remover o item de roteiro.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao remover item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  const atualizarAtividade = useCallback(
    async (vtrId: string, itemId: string, atividade: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ atividade }),
        });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao atualizar a atividade.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar atividade do item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  return { adicionarItem, removerItem, atualizarAtividade };
}
