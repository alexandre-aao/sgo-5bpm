import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado, CartaoViatura } from '../../../lib/cartaoConflitos';
import { janela24h } from '../../../lib/janelaCartao';
import { DocumentoCartoes } from '../cartao/pdf/DocumentoCartoes';
import { CabecalhoImpressao } from './CabecalhoImpressao';

interface SaidaCartaoIndividualProps {
  cartao: CartaoDetalhado;
  viaturas: CartaoViatura[];
  pessoal: Tables<'pessoal'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  avisos: Tables<'avisos'>[];
  agora: Date;
}

/**
 * Saída 1 — Cartão Programa individual. Reaproveita DocumentoCartoes/CartaoPdf
 * já existentes (não modificados: design próprio do cartão, ver CLAUDE.md) para
 * o conteúdo por viatura, envolvendo com o cabeçalho institucional exigido pela
 * especificação. Uma viatura por página (DocumentoCartoes já cuida da quebra
 * entre elas via .cp-pagina-quebra).
 */
export function SaidaCartaoIndividual({ cartao, viaturas, pessoal, bairros, avisos, agora }: SaidaCartaoIndividualProps) {
  return (
    <div className="folha">
      <CabecalhoImpressao
        tipoDocumento="Cartão Programa de Patrulhamento"
        periodo={janela24h(cartao.data)}
        numeroDocumento={cartao.numero ? `${String(cartao.numero).padStart(6, '0')}/${cartao.ano}` : undefined}
        agora={agora}
      />
      <DocumentoCartoes
        cartao={cartao} viaturas={viaturas} pessoal={pessoal} bairros={bairros} avisos={avisos}
        layout="a4" comAvisos agora={agora}
      />
    </div>
  );
}
