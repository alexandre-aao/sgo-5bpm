import { useCallback } from 'react';
import { apiFetch } from '../../../lib/api';
import type { ResultadoAcao } from './useCartaoPrograma';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { cabecalhosVersaoCartao, extrairErroCartao } from '../../../lib/concorrenciaCartao';
import { useConflitoCartao } from '../../../context/useConflitoCartao';

export interface ItemPayload {
  inicio: string;
  fim: string;
  local: string;
  atividade: string;
}

/** CRUD de itens de roteiro por viatura — espelha handleAddCartaoItem(),
 * handleDeleteCartaoItem() e salvarAtividadeItem() em public/app.js. */
export function useItensRoteiro(cartao: CartaoDetalhado | null, recarregar: () => Promise<void>) {
  const { avisarConflito } = useConflitoCartao();
  const cartaoId = cartao?.id;
  const tratarErro = useCallback(
    (res: Response, padrao: string) => extrairErroCartao(res, padrao, (erro) => avisarConflito(recarregar, erro)),
    [avisarConflito, recarregar],
  );
  const adicionarItem = useCallback(
    async (vtrId: string, payload: ItemPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao incluir o item de roteiro.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao incluir item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartao, cartaoId, recarregar, tratarErro],
  );

  const removerItem = useCallback(
    async (vtrId: string, itemId: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens/${itemId}`, {
          method: 'DELETE', headers: cabecalhosVersaoCartao(cartao),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao remover o item de roteiro.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao remover item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartao, cartaoId, recarregar, tratarErro],
  );

  const atualizarAtividade = useCallback(
    async (vtrId: string, itemId: string, atividade: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
          body: JSON.stringify({ atividade }),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao atualizar a atividade.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar atividade do item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartao, cartaoId, recarregar, tratarErro],
  );

  const atualizarItem = useCallback(
    async (vtrId: string, itemId: string, payload: ItemPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/itens/${itemId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) }, body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao atualizar o item de roteiro.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar item de roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    }, [cartao, cartaoId, recarregar, tratarErro],
  );

  const duplicarItem = useCallback(
    async (vtrId: string, payload: ItemPayload): Promise<ResultadoAcao> => adicionarItem(vtrId, payload),
    [adicionarItem],
  );

  const copiarRoteiro = useCallback(
    async (vtrAlvoId: string, origemViaturaId: string, substituir: boolean): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrAlvoId}/copiar-roteiro`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
          body: JSON.stringify({ origem_viatura_id: origemViaturaId, substituir }),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao copiar o roteiro.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao copiar roteiro:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    }, [cartao, cartaoId, recarregar, tratarErro],
  );

  const aplicarAtividade = useCallback(
    async (viaturasIds: string[], atividade: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/roteiro/atividade`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
          body: JSON.stringify({ viaturas_ids: viaturasIds, atividade }),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao aplicar a atividade.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao aplicar atividade em lote:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    }, [cartao, cartaoId, recarregar, tratarErro],
  );

  return { adicionarItem, removerItem, atualizarAtividade, atualizarItem, duplicarItem, copiarRoteiro, aplicarAtividade };
}
