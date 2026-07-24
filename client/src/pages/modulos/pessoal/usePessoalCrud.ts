import { useCallback } from 'react';
import { apiFetch } from '../../../lib/api';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface PessoaPayload {
  nome: string;
  matricula: string;
  subunidade: string;
  posto_graduacao: string;
  categorias: string[];
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Criar/editar/excluir Cadastro de Pessoal — a leitura vem de `dados.pessoal`
 * (useAppData, já carregado globalmente), então aqui só ficam as mutações, que
 * chamam `recarregar()` do pai pra atualizar o cache global depois. Espelha
 * handleSalvarPessoa()/handleExcluirPessoa() em public/app.js. */
export function usePessoalCrud(recarregar: () => Promise<void>) {
  const criarPessoa = useCallback(async (payload: PessoaPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/pessoal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o cadastro.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao cadastrar pessoa:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const atualizarPessoa = useCallback(async (id: string, payload: PessoaPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/pessoal/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o cadastro.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao atualizar pessoa:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluirPessoa = useCallback(async (id: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/pessoal/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir o cadastro.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir pessoa:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { criarPessoa, atualizarPessoa, excluirPessoa };
}
