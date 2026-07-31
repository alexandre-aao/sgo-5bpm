import type { Tables } from '../../../../types/supabase';
import type { CartaoDetalhado, CartaoViatura } from '../../../../lib/cartaoConflitos';
import { CartaoPdf, type LayoutCartaoPdf, type AvisoDoCartao } from './CartaoPdf';
import { montarDadosCartaoPdf } from './cartaoPdfDados';
import { avisosSelecionadosParaPdf } from './avisosDoCartao';

interface DocumentoCartoesProps {
  cartao: CartaoDetalhado;
  viaturas: CartaoViatura[];
  pessoal: Tables<'pessoal'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  avisos: Tables<'avisos'>[];
  layout: LayoutCartaoPdf;
  comAvisos: boolean;
  /** Fixa o "gerado em" de todas as páginas no mesmo instante. */
  agora?: Date;
}

/**
 * Um documento com N viaturas — uma por página. Recorte "Viatura" passa uma só;
 * "Companhia" e "Geral" passam várias. Nunca vira ZIP: é um documento contínuo
 * que o operador salva e manda inteiro.
 */
export function DocumentoCartoes({
  cartao, viaturas, pessoal, bairros, avisos, layout, comAvisos, agora,
}: DocumentoCartoesProps) {
  const instante = agora ?? new Date();

  return (
    <>
      {viaturas.map((viatura, indice) => {
        const dados = montarDadosCartaoPdf(cartao, viatura, pessoal, bairros, instante);
        // "Sem avisos" é a versão de arquivo/processo: a orientação da P3 costuma
        // ser informação sensível e não deve ir para o SEI.
        const avisosDaPagina: AvisoDoCartao[] = comAvisos
          ? avisosSelecionadosParaPdf(viatura, avisos, bairros)
          : [];

        return (
          <div key={viatura.id} className={indice < viaturas.length - 1 ? 'cp-pagina-quebra' : undefined}>
            <CartaoPdf dados={dados} layout={layout} avisos={avisosDaPagina} />
          </div>
        );
      })}
    </>
  );
}
