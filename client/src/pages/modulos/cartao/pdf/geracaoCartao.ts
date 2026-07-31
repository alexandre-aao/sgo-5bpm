import type { CartaoViatura } from '../../../../lib/cartaoConflitos';
import type { LayoutCartaoPdf } from './CartaoPdf';

export type ConteudoCartao = 'ordinario' | 'reforco' | 'completo';
export type RecorteCartao = 'viatura' | 'companhia' | 'geral';

export interface PresetGeracao {
  conteudo: ConteudoCartao;
  recorte: RecorteCartao;
  comAvisos: boolean;
  layout: LayoutCartaoPdf;
}

/** Padrões do documento: por viatura, com avisos, no formato de celular — que é
 *  como o cartão é efetivamente usado (mandado ao comandante pelo WhatsApp). */
export const PRESET_PADRAO: PresetGeracao = {
  conteudo: 'ordinario',
  recorte: 'viatura',
  comAvisos: true,
  layout: 'celular',
};

const CHAVE_PRESET = 'sgo_cartao_preset_geracao';

export function carregarPreset(): PresetGeracao {
  try {
    const bruto = localStorage.getItem(CHAVE_PRESET);
    if (!bruto) return PRESET_PADRAO;
    const salvo = JSON.parse(bruto) as Partial<PresetGeracao>;
    // Mescla com o padrão: preset salvo por uma versão antiga pode não ter
    // todos os eixos, e faltar um deixaria o select sem valor.
    return { ...PRESET_PADRAO, ...salvo };
  } catch {
    return PRESET_PADRAO;
  }
}

export function salvarPreset(preset: PresetGeracao): void {
  try {
    localStorage.setItem(CHAVE_PRESET, JSON.stringify(preset));
  } catch {
    // localStorage indisponível (modo privado): o preset só não persiste.
  }
}

// Conteúdo filtra por CATEGORIA da viatura (decisão do usuário): o serviço
// ordinário é a escala normal; Força Tática e Suplementar são o reforço.
const CATEGORIAS_POR_CONTEUDO: Record<ConteudoCartao, string[] | null> = {
  ordinario: ['Ordinária'],
  reforco: ['Força Tática', 'Suplementar'],
  completo: null, // null = sem filtro
};

export const ROTULO_CONTEUDO: Record<ConteudoCartao, string> = {
  ordinario: 'Ordinário',
  reforco: 'Reforço',
  completo: 'Completo',
};

export const ROTULO_RECORTE: Record<RecorteCartao, string> = {
  viatura: 'Viatura',
  companhia: 'Companhia',
  geral: 'Geral',
};

/** Sufixo do nome do arquivo — é o que o comandante vê no WhatsApp. */
export const CODIGO_CONTEUDO: Record<ConteudoCartao, string> = {
  ordinario: 'ORD',
  reforco: 'REF',
  completo: 'COMP',
};

export function filtrarPorConteudo(viaturas: CartaoViatura[], conteudo: ConteudoCartao): CartaoViatura[] {
  const permitidas = CATEGORIAS_POR_CONTEUDO[conteudo];
  if (!permitidas) return viaturas;
  return viaturas.filter((v) => permitidas.includes(v.categoria || 'Ordinária'));
}

export interface GrupoGeracao {
  /** Identifica o grupo na lista e serve de chave de render. */
  id: string;
  titulo: string;
  subtitulo: string;
  viaturas: CartaoViatura[];
}

/**
 * Divide as viaturas nos documentos que serão gerados, conforme o recorte.
 * Nunca gera ZIP: cada grupo é um documento aberto e mandado individualmente.
 */
export function agruparPorRecorte(viaturas: CartaoViatura[], recorte: RecorteCartao): GrupoGeracao[] {
  if (recorte === 'viatura') {
    return viaturas.map((v) => ({
      id: v.id,
      titulo: `VTR ${v.prefixo}`,
      subtitulo: [v.comandante || 'Sem comandante', v.setor || 'Sem setor'].join(' · '),
      viaturas: [v],
    }));
  }

  if (recorte === 'companhia') {
    const porCia = new Map<string, CartaoViatura[]>();
    viaturas.forEach((v) => {
      const chave = v.companhia || 'Sem Companhia';
      if (!porCia.has(chave)) porCia.set(chave, []);
      porCia.get(chave)!.push(v);
    });
    return [...porCia.entries()].map(([companhia, lista]) => ({
      id: companhia,
      titulo: companhia,
      subtitulo: `${lista.length} viatura(s): ${lista.map((v) => v.prefixo).join(', ')}`,
      viaturas: lista,
    }));
  }

  return [{
    id: 'geral',
    titulo: 'Cartão Geral',
    subtitulo: `${viaturas.length} viatura(s) do dia`,
    viaturas,
  }];
}
