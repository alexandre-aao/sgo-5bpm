import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import type { ResultadoAcao } from './useCartaoPrograma';
import { cabecalhosVersaoCartao, extrairErroCartao } from '../../../lib/concorrenciaCartao';
import { useConflitoCartao } from '../../../context/useConflitoCartao';

export interface TemplateResumo {
  id: string;
  nome_template: string;
  tipo_periodo: string;
  qtd_viaturas_base: number;
  qtd_viaturas: number;
  padrao_ativo: boolean;
  estado_template: 'rascunho' | 'publicado';
  versao_publicada: number | null;
  atualizado_em: string | null;
}

export interface VersaoTemplate {
  id: string;
  versao: number;
  criado_em: string;
  criado_por: string;
  snapshot: CartaoDetalhado;
}

export interface NovoTemplatePayload {
  nome_template: string;
  tipo_periodo: string;
  qtd_viaturas_base: number;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Gestão de Cartões Padrão (templates) — espelha renderTemplatesTab(),
 * handleCriarTemplate() e handleExcluirTemplate() em public/app.js. */
export function useTemplatesCartao() {
  const { avisarConflito } = useConflitoCartao();
  const [templates, setTemplates] = useState<TemplateResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiFetch('/api/cartoes/templates');
      const dados = (await res.json()) as TemplateResumo[];
      setTemplates(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error('Erro ao carregar cartões padrão:', erro);
      setTemplates([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const criarTemplate = useCallback(async (payload: NovoTemplatePayload): Promise<ResultadoAcao & { template?: CartaoDetalhado }> => {
    try {
      const res = await apiFetch('/api/cartoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_template: true, ...payload }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao criar o cartão padrão.') };
      const criado = (await res.json()) as CartaoDetalhado;
      await recarregar();
      return { ok: true, template: criado };
    } catch (erro) {
      console.error('Erro ao criar cartão padrão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluirTemplate = useCallback(async (template: TemplateResumo): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/cartoes/${template.id}`, {
        method: 'DELETE', headers: cabecalhosVersaoCartao(template),
      });
      if (!res.ok) {
        const mensagem = await extrairErroCartao(
          res,
          'Falha ao excluir o cartão padrão.',
          (erro) => avisarConflito(recarregar, erro),
        );
        return { ok: false, mensagem };
      }
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir cartão padrão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [avisarConflito, recarregar]);

  /** Clona o padrão inteiro (viaturas + roteiro) como um NOVO padrão inativo.
   *  O padrão em vigor não é tocado. */
  const duplicarTemplate = useCallback(async (id: string, nome?: string): Promise<ResultadoAcao & { template?: CartaoDetalhado }> => {
    try {
      const res = await apiFetch(`/api/cartoes/templates/${id}/duplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nome ? { nome_template: nome } : {}),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao duplicar o cartão padrão.') };
      const criado = (await res.json()) as CartaoDetalhado;
      await recarregar();
      return { ok: true, template: criado };
    } catch (erro) {
      console.error('Erro ao duplicar cartão padrão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  /** Transforma o cartão de um DIA em novo padrão (inverso de POST /api/cartoes). */
  const salvarComoPadrao = useCallback(async (
    cartaoId: string,
    nome: string,
    tipoPeriodo?: string,
  ): Promise<ResultadoAcao & { template?: CartaoDetalhado }> => {
    try {
      const res = await apiFetch(`/api/cartoes/${cartaoId}/salvar-como-padrao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_template: nome, ...(tipoPeriodo ? { tipo_periodo: tipoPeriodo } : {}) }),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao salvar como cartão padrão.') };
      const criado = (await res.json()) as CartaoDetalhado;
      await recarregar();
      return { ok: true, template: criado };
    } catch (erro) {
      console.error('Erro ao salvar cartão como padrão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  // Único padrão ativo no sistema: a troca é atômica no servidor (ativar_cartao_padrao).
  const definirPadraoAtivo = useCallback(async (id: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/cartoes/${id}/padrao-ativo`, { method: 'PUT' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao definir o cartão padrão.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao definir cartão padrão ativo:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const publicarTemplate = useCallback(async (template: TemplateResumo): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/cartoes/${template.id}/publicar`, {
        method: 'POST', headers: cabecalhosVersaoCartao(template),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao publicar o cartão padrão.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao publicar cartão padrão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const listarVersoes = useCallback(async (id: string): Promise<{ ok: boolean; versoes: VersaoTemplate[]; mensagem?: string }> => {
    try {
      const res = await apiFetch(`/api/cartoes/${id}/versoes`);
      if (!res.ok) return { ok: false, versoes: [], mensagem: await extrairErro(res, 'Falha ao carregar o histórico de versões.') };
      return { ok: true, versoes: (await res.json()) as VersaoTemplate[] };
    } catch {
      return { ok: false, versoes: [], mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, []);

  const restaurarVersao = useCallback(async (template: TemplateResumo, versao: number): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/cartoes/${template.id}/versoes/${versao}/restaurar`, {
        method: 'POST', headers: cabecalhosVersaoCartao(template),
      });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao restaurar a versão.') };
      await recarregar();
      return { ok: true };
    } catch {
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return {
    templates, carregando, recarregar, criarTemplate, excluirTemplate,
    definirPadraoAtivo, publicarTemplate, listarVersoes, restaurarVersao, duplicarTemplate, salvarComoPadrao,
  };
}
