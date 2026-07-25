import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado, TipoCartao } from '../../../lib/cartaoConflitos';
import type { ResultadoAcao } from './useCartaoPrograma';

export interface TemplateResumo {
  id: string;
  nome_template: string;
  tipo: TipoCartao;
  /** null nos modelos de REFORÇO: período e frota-base são conceitos do ordinário. */
  tipo_periodo: string | null;
  qtd_viaturas_base: number | null;
  observacoes: string;
  qtd_viaturas: number;
}

export interface NovoTemplatePayload {
  nome_template: string;
  tipo: TipoCartao;
  /** Só no modelo de ordinário. */
  tipo_periodo?: string;
  qtd_viaturas_base?: number;
  /** Observações padrão — herdadas pelo cartão gerado a partir do modelo. */
  observacoes?: string;
}

async function extrairErro(res: Response, padrao: string): Promise<string> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string };
  return corpo.error || padrao;
}

/** Gestão dos MODELOS de cartão (is_template) — os do ordinário e os padrões de
 * reforço, separados por `tipo`. Espelha renderTemplatesTab(), handleCriarTemplate() e
 * handleExcluirTemplate() em public/app.js. */
export function useTemplatesCartao(tipo: TipoCartao = 'padrao') {
  const [templates, setTemplates] = useState<TemplateResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiFetch(`/api/cartoes/templates?tipo=${tipo}`);
      const dados = (await res.json()) as TemplateResumo[];
      setTemplates(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error('Erro ao carregar modelos de cartão:', erro);
      setTemplates([]);
    } finally {
      setCarregando(false);
    }
  }, [tipo]);

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
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao criar o modelo de cartão.') };
      const criado = (await res.json()) as CartaoDetalhado;
      await recarregar();
      return { ok: true, template: criado };
    } catch (erro) {
      console.error('Erro ao criar modelo de cartão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const excluirTemplate = useCallback(async (id: string): Promise<ResultadoAcao> => {
    try {
      const res = await apiFetch(`/api/cartoes/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await extrairErro(res, 'Falha ao excluir o modelo de cartão.') };
      await recarregar();
      return { ok: true };
    } catch (erro) {
      console.error('Erro ao excluir modelo de cartão:', erro);
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  return { templates, carregando, recarregar, criarTemplate, excluirTemplate };
}
