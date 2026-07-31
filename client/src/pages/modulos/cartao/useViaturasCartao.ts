import { useCallback } from 'react';
import { apiFetch } from '../../../lib/api';
import type { ResultadoAcao } from './useCartaoPrograma';

export interface ViaturaPayload {
  prefixo: string;
  setor: string;
  companhia: string;
  categoria: string;
  comandante: string;
  observacao: string;
  /** Liga a viatura ao cadastro de bairros — é o que traz os Avisos Operacionais
   *  do bairro para o cartão. `setor` continua sendo o texto livre usado pelo
   *  Mapa e pelo Quadro Resumo (nem todo setor é um bairro cadastrado). */
  bairro_id: string;
  comandante_pessoal_id: string;
  /** Ids dos avisos que entram no cartão desta viatura (teto de 4, aplicado
   *  também no servidor). Nunca o texto — ele vive só na tabela `avisos`. */
  avisos_ids: string[];
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** CRUD de viaturas do Cartão Programa — espelha handleAddCartaoVtr(),
 * handleSalvarEdicaoVtr() e handleDeleteCartaoVtr() em public/app.js. */
export function useViaturasCartao(cartaoId: string | undefined, recarregar: () => Promise<void>) {
  const adicionarViatura = useCallback(
    async (payload: ViaturaPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Crie o Cartão Programa desta data antes de adicionar viaturas.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao adicionar a viatura.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao adicionar viatura ao Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  const editarViatura = useCallback(
    async (vtrId: string, payload: ViaturaPayload): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao atualizar a viatura.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar viatura do Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  const removerViatura = useCallback(
    async (vtrId: string): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}`, { method: 'DELETE' });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao remover a viatura.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao remover viatura do Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  /** Marca o cartão da viatura como gerado ou enviado. O servidor tira o retrato
   *  do conteúdo nesse momento — daí em diante, qualquer mudança no que sai no
   *  documento devolve a viatura para "alterado" com a versão seguinte. */
  const marcarStatusEnvio = useCallback(
    async (vtrId: string, status: 'gerado' | 'enviado'): Promise<ResultadoAcao> => {
      if (!cartaoId) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartaoId}/viaturas/${vtrId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status_envio: status }),
        });
        if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao registrar o status do cartão.') };
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao registrar status do cartão da viatura:', erro);
        return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
      }
    },
    [cartaoId, recarregar],
  );

  return { adicionarViatura, editarViatura, removerViatura, marcarStatusEnvio };
}
