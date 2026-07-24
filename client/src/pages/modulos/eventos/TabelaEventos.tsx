import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { slugBadge } from '../../../lib/slug';

const ITENS_POR_PAGINA = 20;

interface TabelaEventosProps {
  eventos: Tables<'eventos'>[];
  totalGeral: number;
  pagina: number;
  onMudarPagina: (pagina: number) => void;
  onAbrir: (id: string) => void;
}

// Tabela "Listar Eventos" com paginação client-side — a API nunca paginou
// (readTabela devolve tudo), decisão registrada em MIGRACAO.md de implementar
// a paginação de verdade só aqui, na tela React. Espelha as colunas de
// renderEventosTab() em public/app.js (mesma ordenação: mais recente primeiro).
export function TabelaEventos({ eventos, totalGeral, pagina, onMudarPagina, onAbrir }: TabelaEventosProps) {
  const ordenados = [...eventos].sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const pagina_eventos = ordenados.slice(inicio, inicio + ITENS_POR_PAGINA);

  const rodape = ordenados.length === totalGeral
    ? `${totalGeral} evento(s) cadastrado(s).`
    : `Mostrando ${ordenados.length} de ${totalGeral} evento(s).`;

  return (
    <>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th>Data</th>
              <th>Nome do Evento</th>
              <th>Tipo</th>
              <th>Demandante</th>
              <th>Bairro / Local</th>
              <th>Nº OS</th>
              <th>Nº SEI</th>
            </tr>
          </thead>
          <tbody>
            {pagina_eventos.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  Nenhum evento localizado com os filtros aplicados.
                </td>
              </tr>
            ) : (
              pagina_eventos.map((evt) => (
                <tr key={evt.id} style={{ cursor: 'pointer' }} onClick={() => onAbrir(evt.id)}>
                  <td data-label="Data"><strong>{evt.data_inicio.split('-').reverse().join('/')}</strong></td>
                  <td className="card-title-cell">{evt.nome_evento}</td>
                  <td data-label="Tipo"><span className={`badge ${slugBadge(evt.tipo_evento)}`}>{evt.tipo_evento}</span></td>
                  <td data-label="Demandante">{evt.demandante || '-'}</td>
                  <td data-label="Bairro / Local">{evt.bairro || 'Centro'}</td>
                  <td data-label="Nº OS"><code style={{ color: 'var(--primary)' }}>{evt.num_os_manual || '-'}</code></td>
                  <td data-label="Nº SEI"><code style={{ color: 'var(--primary)' }}>{evt.num_sei || '-'}</code></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination-bar">
        <span className="pagination-info">{rodape}</span>
        {totalPaginas > 1 && (
          <div className="pagination-controls">
            <button
              type="button" className="btn-icon" aria-label="Página anterior" disabled={paginaAtual <= 1}
              onClick={() => onMudarPagina(paginaAtual - 1)}
            >
              <ChevronLeft />
            </button>
            <span className="pagination-pagina">Página {paginaAtual} de {totalPaginas}</span>
            <button
              type="button" className="btn-icon" aria-label="Próxima página" disabled={paginaAtual >= totalPaginas}
              onClick={() => onMudarPagina(paginaAtual + 1)}
            >
              <ChevronRight />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
