import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

export interface UsuarioPublico {
  usuario: string;
  nome: string;
  role: string;
  ativo?: boolean;
  exigir_troca_senha?: boolean;
}

export interface NovoUsuarioPayload {
  usuario: string;
  nome: string;
  role: string;
  senha: string;
  exigir_troca_senha?: boolean;
}

export interface EditarUsuarioPayload {
  nome: string;
  role: string;
  ativo: boolean;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

export function useUsuariosCrud() {
  const [usuarios, setUsuarios] = useState<UsuarioPublico[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiFetch('/api/usuarios');
      const lista = (await res.json()) as UsuarioPublico[];
      if (Array.isArray(lista)) setUsuarios(lista);
    } catch (erro) {
      console.error('Erro ao carregar usuários:', erro);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const criarUsuario = useCallback(async (payload: NovoUsuarioPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o usuário.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao criar usuário:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const atualizarUsuario = useCallback(async (login: string, payload: EditarUsuarioPayload): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/usuarios/${encodeURIComponent(login)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar o usuário.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao atualizar usuário:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const resetarSenha = useCallback(async (login: string, senhaNova: string, exigirTrocaSenha = true): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/usuarios/${encodeURIComponent(login)}/resetar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_nova: senhaNova, exigir_troca_senha: exigirTrocaSenha }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao redefinir a senha.') };
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao redefinir senha:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, []);

  const excluirUsuario = useCallback(async (login: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/usuarios/${encodeURIComponent(login)}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir o usuário.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir usuário:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { usuarios, carregando, criarUsuario, atualizarUsuario, resetarSenha, excluirUsuario };
}
