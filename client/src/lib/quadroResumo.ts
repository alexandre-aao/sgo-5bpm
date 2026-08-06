import { formatHoraCartao } from './cartaoConflitos';
import { COMPANHIAS_VIATURA } from './categoriasViatura';

/** Atividade que alimenta a coluna "Madrugada Segura" do Quadro Resumo. Mora
 *  aqui, e não em pages/.../constantes.ts, para a lib não importar de pages —
 *  a lista ATIVIDADES_CARTAO é quem importa daqui. */
export const ATIVIDADE_MADRUGADA_SEGURA = 'Madrugada Segura';

/** Só o que o Quadro Resumo precisa ler. Estrutural de propósito: a tela usa
 *  `CartaoViatura.itens` e o documento de impressão usa `DocumentoViatura.roteiro`,
 *  que são tipos diferentes com o mesmo formato de item. */
interface ItemComHorario {
  inicio: string;
  fim?: string | null;
  atividade: string;
}

interface ViaturaOrdenavel {
  companhia: string;
  prefixo: string;
}

/** Ordem de exibição do Quadro Resumo, derivada de COMPANHIAS_VIATURA — incluir
 *  uma companhia nova naquela lista já a posiciona aqui, sem tocar neste arquivo.
 *  Viatura sem companhia (ou com valor fora da lista) vai para o fim. */
const ORDEM_COMPANHIA: Record<string, number> = Object.fromEntries(
  COMPANHIAS_VIATURA.map((companhia, indice) => [companhia, indice + 1]),
);

/** Ordena por Companhia e, dentro dela, por prefixo. Compartilhado entre o
 *  Quadro Resumo da tela do Cartão e a saída de impressão homônima, que
 *  precisam listar as viaturas na mesma ordem. */
export function ordenarViaturasQuadroResumo<T extends ViaturaOrdenavel>(viaturas: T[]): T[] {
  return [...viaturas].sort((a, b) => {
    const oa = ORDEM_COMPANHIA[a.companhia] || 99;
    const ob = ORDEM_COMPANHIA[b.companhia] || 99;
    if (oa !== ob) return oa - ob;
    return (a.prefixo || '').localeCompare(b.prefixo || '');
  });
}

/** "07h00 às 08h00", ou só o início quando não há fim. Vazio se não houver item. */
export function horarioDaAtividade(itens: ItemComHorario[], atividade: string): string {
  const item = (itens || []).find((i) => i.atividade === atividade);
  if (!item) return '';
  return `${formatHoraCartao(item.inicio)}${item.fim ? ' às ' + formatHoraCartao(item.fim) : ''}`;
}

/** Coluna "Madrugada Segura" do Quadro Resumo: o horário do item de roteiro é a
 *  fonte preferida; sem ele, cai na `observacao`, que é como o emprego era
 *  registrado antes de a atividade existir. Cartões antigos continuam legíveis
 *  sem migração de dado — mesma razão do regex em documentoCartao.ts. */
export function madrugadaSeguraTexto(itens: ItemComHorario[], observacao: string): string {
  return horarioDaAtividade(itens, ATIVIDADE_MADRUGADA_SEGURA) || observacao || '';
}
