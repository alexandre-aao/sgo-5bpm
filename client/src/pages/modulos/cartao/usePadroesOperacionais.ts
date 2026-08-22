import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { contarPbsComponentes } from '../../../lib/padroesOperacionais';

export type CategoriaPadrao = 'bairro' | 'especializado' | 'reforco' | 'missao' | string;

export interface ItemRoteiroPadrao {
  id: string;
  inicio: string;
  fim: string;
  local: string;
  atividade: string;
  observacao?: string;
}

export interface ComponentePadrao {
  id: string;
  prefixo: string;
  setor: string;
  companhia: string;
  categoria: string;
  observacao: string;
  bairro_id?: string;
  bairros_ids?: string[];
  itens: ItemRoteiroPadrao[];
}

export interface PadraoOperacional {
  id: string;
  nome: string;
  categoria?: CategoriaPadrao | null;
  descricao?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  quantidade_pbs?: number | null;
  bairros?: string[] | null;
  roteiro?: string | null;
  ativo: boolean;
  publicado?: boolean;
  versao?: number | null;
  versao_publicada?: number | null;
  atualizado_em?: string | null;
  criado_em?: string | null;
  tipo_periodo?: string | null;
  componentes?: ComponentePadrao[];
  [key: string]: unknown;
}

export interface PadraoOperacionalDetalhe extends PadraoOperacional {
  componentes?: ComponentePadrao[];
}

export interface VersaoPadrao {
  id?: string;
  versao: number;
  criado_em?: string | null;
  criado_por?: string | null;
  snapshot?: unknown;
  [key: string]: unknown;
}

export interface PadraoPayload {
  nome: string;
  categoria: string;
  descricao: string;
  horario_inicio: string;
  horario_fim: string;
  bairros: string[];
  componentes?: ComponentePadrao[];
  ativo?: boolean;
}

export type ResultadoPadrao = { ok: true; padrao?: PadraoOperacional } | { ok: false; mensagem: string };

async function erroDaResposta(res: Response, fallback: string) {
  const corpo = (await res.json().catch(() => ({}))) as { error?: string; mensagem?: string };
  return corpo.error || corpo.mensagem || fallback;
}

function normalizarPadrao(item: Record<string, unknown>): PadraoOperacional {
  const configuracao = item.configuracao && typeof item.configuracao === 'object' && !Array.isArray(item.configuracao)
    ? item.configuracao as Record<string, unknown> : {};
  const nome = String(item.nome ?? item.nome_padrao ?? item.nome_template ?? item.titulo ?? 'Padrão sem nome');
  const categoria = item.categoria ?? item.tipo ?? item.tipo_padrao ?? 'bairro';
  const bairros = Array.isArray(item.bairros)
    ? item.bairros.map(String)
    : Array.isArray(item.bairros_atendidos) ? item.bairros_atendidos.map(String)
      : Array.isArray(configuracao.bairros) ? configuracao.bairros.map(String)
        : (item.bairro ? String(item.bairro).split('+').map((bairro) => bairro.trim()).filter(Boolean) : null);
  const componentes = Array.isArray(item.componentes)
    ? item.componentes.map((componente, indice) => {
      const valor = componente && typeof componente === 'object' ? componente as Record<string, unknown> : {};
      const itens = Array.isArray(valor.itens) ? valor.itens.map((itemRoteiro, indiceItem) => {
        const item = itemRoteiro && typeof itemRoteiro === 'object' ? itemRoteiro as Record<string, unknown> : {};
        return {
          id: String(item.id ?? `item-${indice}-${indiceItem}`),
          inicio: String(item.inicio ?? item.horario_inicio ?? ''),
          fim: String(item.fim ?? item.horario_fim ?? ''),
          local: String(item.local ?? item.area ?? ''),
          atividade: String(item.atividade ?? item.missao ?? 'CPB'),
          observacao: String(item.observacao ?? item.observacoes ?? ''),
        };
      }) : [];
      return {
        id: String(valor.id ?? `componente-${indice}`),
        prefixo: String(valor.prefixo ?? valor.indicativo ?? ''),
        setor: String(valor.setor ?? valor.area ?? ''),
        companhia: String(valor.companhia ?? ''),
        categoria: String(valor.categoria ?? 'Ordinária'),
        observacao: String(valor.observacao ?? ''),
        bairro_id: valor.bairro_id ? String(valor.bairro_id) : '',
        bairros_ids: Array.isArray(valor.bairros_ids) ? valor.bairros_ids.map(String) : [],
        itens,
      };
    }) : [];
  return {
    ...item,
    id: String(item.id),
    nome,
    categoria: String(categoria),
    descricao: item.descricao == null ? (item.missao == null ? null : String(item.missao)) : String(item.descricao),
    horario_inicio: item.horario_inicio == null ? null : String(item.horario_inicio),
    horario_fim: item.horario_fim == null ? null : String(item.horario_fim),
    // O campo legado pode continuar vindo da API, mas a tela sempre usa o
    // roteiro como fonte de verdade.
    quantidade_pbs: contarPbsComponentes(componentes),
    bairros,
    ativo: item.ativo !== false,
    publicado: Boolean(item.publicado ?? item.estado === 'publicado'),
    versao: item.versao == null ? null : Number(item.versao),
    versao_publicada: item.versao_publicada == null ? null : Number(item.versao_publicada),
    componentes,
  };
}

function listaNormalizada(payload: unknown): PadraoOperacional[] {
  const lista = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as { padroes?: unknown }).padroes)
      ? (payload as { padroes: unknown[] }).padroes
      : []);
  return lista.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object').map(normalizarPadrao);
}

export function usePadroesOperacionais() {
  const [padroes, setPadroes] = useState<PadraoOperacional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await apiFetch('/api/padroes-operacionais');
      if (!res.ok) throw new Error(await erroDaResposta(res, 'Falha ao carregar padrões operacionais.'));
      setPadroes(listaNormalizada(await res.json()));
    } catch (error) {
      setPadroes([]);
      setErro(error instanceof Error ? error.message : 'Falha ao carregar padrões operacionais.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // A busca inicial sincroniza este hook com a API externa; o setState ocorre
    // no callback assíncrono e não durante a renderização do componente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const criar = useCallback(async (payload: PadraoPayload): Promise<ResultadoPadrao> => {
    try {
      const res = await apiFetch('/api/padroes-operacionais', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await erroDaResposta(res, 'Falha ao criar padrão operacional.') };
      const dado = await res.json().catch(() => null);
      await recarregar();
      return { ok: true, padrao: dado && typeof dado === 'object' ? normalizarPadrao(dado as Record<string, unknown>) : undefined };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }, [recarregar]);

  const atualizar = useCallback(async (id: string, payload: Partial<PadraoPayload>): Promise<ResultadoPadrao> => {
    try {
      const res = await apiFetch(`/api/padroes-operacionais/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, mensagem: await erroDaResposta(res, 'Falha ao atualizar padrão operacional.') };
      const dado = await res.json().catch(() => null);
      await recarregar();
      return { ok: true, padrao: dado && typeof dado === 'object' ? normalizarPadrao(dado as Record<string, unknown>) : undefined };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }, [recarregar]);

  const executar = useCallback(async (path: string, init?: RequestInit, fallback = 'Falha ao atualizar padrão operacional.'): Promise<ResultadoPadrao> => {
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) return { ok: false, mensagem: await erroDaResposta(res, fallback) };
      await recarregar();
      return { ok: true };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }, [recarregar]);

  const publicar = useCallback((id: string) => executar(`/api/padroes-operacionais/${id}/publicar`, { method: 'POST' }, 'Falha ao publicar padrão operacional.'), [executar]);
  const duplicar = useCallback((id: string) => executar(`/api/padroes-operacionais/${id}/duplicar`, { method: 'POST' }, 'Falha ao duplicar padrão operacional.'), [executar]);
  const alterarAtivo = useCallback((id: string, ativo: boolean) => executar(`/api/padroes-operacionais/${id}/ativo`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo }) }, 'Falha ao alterar situação do padrão.'), [executar]);

  const excluir = useCallback(async (id: string): Promise<ResultadoPadrao> => {
    try {
      const res = await apiFetch(`/api/padroes-operacionais/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, mensagem: await erroDaResposta(res, 'Falha ao excluir padrão operacional.') };
      await recarregar();
      return { ok: true };
    } catch {
      return { ok: false, mensagem: 'Falha na comunicação com o servidor.' };
    }
  }, [recarregar]);

  const detalhe = useCallback(async (id: string): Promise<PadraoOperacionalDetalhe | null> => {
    try {
      const res = await apiFetch(`/api/padroes-operacionais/${id}`);
      if (!res.ok) return null;
      const dado = await res.json();
      return dado && typeof dado === 'object' ? normalizarPadrao(dado as Record<string, unknown>) as PadraoOperacionalDetalhe : null;
    } catch { return null; }
  }, []);

  const versoes = useCallback(async (id: string): Promise<VersaoPadrao[]> => {
    try {
      const res = await apiFetch(`/api/padroes-operacionais/${id}/versoes`);
      if (!res.ok) return [];
      const dado = await res.json();
      const lista = Array.isArray(dado) ? dado : (dado && typeof dado === 'object' && Array.isArray((dado as { versoes?: unknown }).versoes) ? (dado as { versoes: unknown[] }).versoes : []);
      return lista.filter((item): item is VersaoPadrao => !!item && typeof item === 'object' && typeof (item as { versao?: unknown }).versao === 'number');
    } catch { return []; }
  }, []);

  return { padroes, carregando, erro, recarregar, criar, atualizar, publicar, duplicar, alterarAtivo, excluir, detalhe, versoes };
}
