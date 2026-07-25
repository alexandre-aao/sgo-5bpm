import { useCallback } from 'react';
import { apiFetch } from '../../../lib/api';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface ViaturaCadastroPayload {
  prefixo: string;
  companhia: string;
  categoria: string;
  status: string;
  setor: string;
  observacao: string;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Criar/editar/excluir Cadastro de Viaturas — a leitura vem de
 * `dados.viaturas` (useAppData, já carregado globalmente), então aqui só
 * ficam as mutações, que chamam `recarregar()` do pai depois. Espelha
 * handleSalvarViatura()/handleExcluirViatura() em public/app.js. */
export function useViaturasCrud(recarregar: () => Promise<void>) {
  const criarViatura = useCallback(async (payload: ViaturaCadastroPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/viaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar a viatura.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao cadastrar viatura:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const atualizarViatura = useCallback(async (id: string, payload: ViaturaCadastroPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/viaturas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar a viatura.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao atualizar viatura:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluirViatura = useCallback(async (id: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/viaturas/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir a viatura.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir viatura:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { criarViatura, atualizarViatura, excluirViatura };
}
