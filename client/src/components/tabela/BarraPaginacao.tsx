import { ChevronLeft, ChevronRight } from 'lucide-react';

interface BarraPaginacaoProps {
  /** Texto livre à esquerda, ex.: "Mostrando 20 de 464 evento(s)." */
  info: string;
  pagina: number;
  totalPaginas: number;
  onMudarPagina: (pagina: number) => void;
}

// Rodapé de paginação compartilhado (Etapa 1, item 6) — saiu de TabelaEventos,
// que era a única tela com paginação, para servir também às outras listas.
export function BarraPaginacao({ info, pagina, totalPaginas, onMudarPagina }: BarraPaginacaoProps) {
  return (
    <div className="pagination-bar">
      <span className="pagination-info">{info}</span>
      {totalPaginas > 1 && (
        <div className="pagination-controls">
          <button
            type="button" className="btn-icon" aria-label="Página anterior" disabled={pagina <= 1}
            onClick={() => onMudarPagina(pagina - 1)}
          >
            <ChevronLeft />
          </button>
          <span className="pagination-pagina">Página {pagina} de {totalPaginas}</span>
          <button
            type="button" className="btn-icon" aria-label="Próxima página" disabled={pagina >= totalPaginas}
            onClick={() => onMudarPagina(pagina + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}
