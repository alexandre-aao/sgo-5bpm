import { useCallback } from 'react';
import { apiFetch } from '../../../lib/api';
import type { ResultadoAcao } from './useCartaoPrograma';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { cabecalhosVersaoCartao, extrairErroCartao } from '../../../lib/concorrenciaCartao';
import { useConflitoCartao } from '../../../context/useConflitoCartao';

export interface ViaturaPayload {
  prefixo: string;
  setor: string;
  companhia: string;
  categoria: string;
  comandante: string;
  composicao: string;
  observacao: string;
  /** Liga a viatura ao cadastro de bairros — é o que traz os Avisos Operacionais
   *  do bairro para o cartão. `setor` continua sendo o texto livre usado pelo
   *  Mapa e pelo Quadro Resumo (nem todo setor é um bairro cadastrado). */
  bairro_id: string;
  bairros_ids: string[];
  comandante_pessoal_id: string;
  /** Ids dos avisos que entram no cartão desta viatura (teto de 4, aplicado
   *  também no servidor). Nunca o texto — ele vive só na tabela `avisos`. */
  avisos_ids: string[];
}

/** CRUD de viaturas do Cartão Programa — espelha handleAddCartaoVtr(),
 * handleSalvarEdicaoVtr() e handleDeleteCartaoVtr() em public/app.js. */
export function useViaturasCartao(cartao: CartaoDetalhado | null, recarregar: () => Promise<void>) {
  const { avisarConflito } = useConflitoCartao();
  const cartaoId = cartao?.id;
  const tratarErro = useCallback(
    (res: Response, padrao: string) => extrairErroCartao(res, padrao, (erro) => avisarConflito(recarregar, erro)),
    [avisarConflito, recarregar],
  );
  const adicionarViatura = useCallback(
    async (payload: ViaturaPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Crie o Cartão Programa desta data antes de adicionar viaturas.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao adicionar a viatura.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao adicionar viatura ao Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartao, cartaoId, recarregar, tratarErro],
  );

  const editarViatura = useCallback(
    async (vtrId: string, payload: ViaturaPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao atualizar a viatura.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar viatura do Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartao, cartaoId, recarregar, tratarErro],
  );

  const removerViatura = useCallback(
    async (vtrId: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}`, {
          method: 'DELETE', headers: cabecalhosVersaoCartao(cartao),
        });
        if (!res.ok) return { ok: false, mensagem: await tratarErro(res, 'Falha ao remover a viatura.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao remover viatura do Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartao, cartaoId, recarregar, tratarErro],
  );

  return { adicionarViatura, editarViatura, removerViatura };
}
