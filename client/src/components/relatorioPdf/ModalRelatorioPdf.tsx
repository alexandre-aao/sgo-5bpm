import type { ReactNode } from 'react';
import { FileDown, X, Printer } from 'lucide-react';
import { PortalImpressao } from '../PortalImpressao';
import { useModalA11y } from '../../hooks/useModalA11y';

interface ModalRelatorioPdfProps {
  onFechar: () => void;
  children: ReactNode;
}

// Modal de pré-visualização de Relatório PDF (estilo SGEPM) — compartilhado
// por TODOS os relatórios do projeto (mudança de design aqui vale pra todos,
// requisito do usuário). Espelha #modal-relatorio-pdf +
// abrirRelatorioPdf()/gerarRelatorioPdf*() em public/app.js. Mantém o mesmo
// id/classes do app antigo (#modal-relatorio-pdf, .modal-box, .modal-header,
// .form-actions, .relatorio-pdf-area) pra reaproveitar o bloco @media print
// já portado em client/src/print.css sem precisar mexer em CSS. O PortalImpressao
// é o que mantém esse bloco válido: o gate esconde .app-container, então o modal
// precisa ficar FORA dele (ver PortalImpressao.tsx).
export function ModalRelatorioPdf({ onFechar, children }: ModalRelatorioPdfProps) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  return (
    <PortalImpressao>
      <div id="modal-relatorio-pdf" className="modal-overlay" {...propsOverlay}>
        <div className="modal-box modal-box-lg" ref={refCaixa}>
          <div className="modal-header">
            <h3 id={idTitulo}><FileDown /> Relatório (PDF)</h3>
            <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Pré-visualização do relatório. Clique em &quot;Imprimir / Salvar PDF&quot; e escolha &quot;Salvar como PDF&quot;.
          </p>
          <div id="relatorio-pdf-area" className="relatorio-pdf-area">{children}</div>
          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Printer /> Imprimir / Salvar PDF
            </button>
          </div>
        </div>
      </div>
    </PortalImpressao>
  );
}
