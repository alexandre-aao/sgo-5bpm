import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FiltrosEventos } from './filtros';

interface FiltrosEventosBarProps {
  filtros: FiltrosEventos;
  onMudar: (filtros: FiltrosEventos) => void;
  onLimpar: () => void;
  podeCriar: boolean;
}

// Barra de filtros de Listar Eventos — espelha a events-filters-bar de
// public/index.html (data inicial/final + busca de texto + Limpar Filtros).
// O botão "Relatório (PDF)" chega no Lote 4.
export function FiltrosEventosBar({ filtros, onMudar, onLimpar, podeCriar }: FiltrosEventosBarProps) {
  return (
    <div className="events-filters-bar">
      <div className="filter-group">
        <label htmlFor="filter-eventos-inicio">Data Inicial</label>
        <input
          type="date" id="filter-eventos-inicio"
          value={filtros.dataInicio} onChange={(e) => onMudar({ ...filtros, dataInicio: e.target.value })}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="filter-eventos-fim">Data Final</label>
        <input
          type="date" id="filter-eventos-fim"
          value={filtros.dataFim} onChange={(e) => onMudar({ ...filtros, dataFim: e.target.value })}
        />
      </div>
      <div className="filter-search">
        <label htmlFor="filter-eventos-search">Filtrar Texto</label>
        <input
          type="text" id="filter-eventos-search" placeholder="Buscar por Evento, Local ou Demandante..."
          value={filtros.busca} onChange={(e) => onMudar({ ...filtros, busca: e.target.value })}
        />
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onLimpar}>Limpar Filtros</button>
      {podeCriar && (
        <Link to="/cadastro" className="btn btn-primary btn-sm">
          <Plus /> Novo Evento
        </Link>
      )}
    </div>
  );
}
