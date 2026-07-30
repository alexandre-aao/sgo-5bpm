import { Plus, FileDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FiltrosEventos } from './filtros';
import { MenuOpcoes } from '../../../components/MenuOpcoes';

interface FiltrosEventosBarProps {
  filtros: FiltrosEventos;
  onMudar: (filtros: FiltrosEventos) => void;
  onRelatorio: () => void;
  podeCriar: boolean;
}

// Barra de filtros de Listar Eventos — espelha a events-filters-bar de
// public/index.html (data inicial/final + busca de texto + Limpar Filtros +
// Relatório (PDF)).
export function FiltrosEventosBar({ filtros, onMudar, onRelatorio, podeCriar }: FiltrosEventosBarProps) {
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
      {/* Sobrou só a ação principal na barra: "Limpar Filtros" foi pro indicador
          de filtros ativos e o relatório, pro menu de opções (Etapa 1, item 2). */}
      {podeCriar && (
        <Link to="/cadastro" className="btn btn-primary btn-sm">
          <Plus /> Novo Evento
        </Link>
      )}
      <MenuOpcoes itens={[{ rotulo: 'Relatório de Eventos (PDF)', icone: FileDown, onClick: onRelatorio }]} />
    </div>
  );
}
