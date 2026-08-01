import { useState } from 'react';
import { FileText, X, Printer } from 'lucide-react';
import type { Tables } from '../../../../types/supabase';
import type { CartaoDetalhado, CartaoViatura } from '../../../../lib/cartaoConflitos';
import { CartaoPdf, type LayoutCartaoPdf, type AvisoDoCartao } from './CartaoPdf';
import { montarDadosCartaoPdf, nomeArquivoCartao } from './cartaoPdfDados';
import { PortalImpressao } from '../../../../components/PortalImpressao';

interface ModalCartaoPdfProps {
  cartao: CartaoDetalhado;
  viatura: CartaoViatura;
  pessoal: Tables<'pessoal'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  avisos?: AvisoDoCartao[];
  onFechar: () => void;
}

/** Prévia do Cartão Programa de uma viatura, com as duas variantes de página.
 *  O painel completo de opções (Conteúdo / Recorte / Avisos) e o compartilhamento
 *  entram na etapa de geração — aqui é o documento e a conferência em tela. */
export function ModalCartaoPdf({ cartao, viatura, pessoal, bairros, avisos = [], onFechar }: ModalCartaoPdfProps) {
  const [layout, setLayout] = useState<LayoutCartaoPdf>('celular');

  // Congelado no primeiro render: o "gerado em" não pode mudar enquanto o
  // operador olha a prévia (mesmo cuidado do CabecalhoRelatorioPdf).
  const [dados] = useState(() => montarDadosCartaoPdf(cartao, viatura, pessoal, bairros));

  function handleImprimir() {
    // O nome do arquivo sugerido no "Salvar como PDF" vem do document.title —
    // é o que o comandante vê no WhatsApp antes de abrir.
    const tituloOriginal = document.title;
    document.title = nomeArquivoCartao(dados, 'ORD');
    window.print();
    document.title = tituloOriginal;
  }

  return (
    <PortalImpressao>
      <div id="modal-cartao-pdf" className="modal-overlay">
        <div className="modal-box modal-box-lg">
          <div className="modal-header">
            <h3><FileText /> Cartão da VTR {viatura.prefixo}</h3>
            <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
          </div>

          <div className="cp-pdf-opcoes">
            <span className="form-label-estatico">Layout</span>
            <div className="companhia-switch" role="group" aria-label="Layout da página">
              <button
                type="button"
                className={`companhia-opcao${layout === 'celular' ? ' ativo' : ''}`}
                aria-pressed={layout === 'celular'}
                onClick={() => setLayout('celular')}
              >
                Celular
              </button>
              <button
                type="button"
                className={`companhia-opcao${layout === 'a4' ? ' ativo' : ''}`}
                aria-pressed={layout === 'a4'}
                onClick={() => setLayout('a4')}
              >
                A4
              </button>
            </div>
          </div>

          <p className="cp-pdf-dica">
            Clique em &quot;Imprimir / Salvar PDF&quot; e escolha &quot;Salvar como PDF&quot;. No celular, confira
            se o destino está em {layout === 'celular' ? '100 × 180 mm' : 'A4'}.
          </p>

          <div className="cp-pdf-palco">
            <CartaoPdf dados={dados} layout={layout} avisos={avisos} />
          </div>

          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button>
            <button type="button" className="btn btn-primary" onClick={handleImprimir}>
              <Printer /> Imprimir / Salvar PDF
            </button>
          </div>
        </div>
      </div>
    </PortalImpressao>
  );
}
