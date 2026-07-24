import { Plus } from 'lucide-react';
import type { FiltrosOperacoes } from './filtros';

interface FiltrosOperacoesBarProps {
  filtros: FiltrosOperacoes;
  onMudar: (filtros: FiltrosOperacoes) => void;
  onNova: () => void;
}

// Barra de filtros de Operações — espelha o cabeçalho de #tab-operacoes em
// public/index.html (situação + busca de texto + Nova Operação).
export function FiltrosOperacoesBar({ filtros, onMudar, onNova }: FiltrosOperacoesBarProps) {
  return (
    <div className="events-filters-bar">
      <div className="filter-group">
        <label htmlFor="filter-operacoes-situacao">Situação</label>
        <select
          id="filter-operacoes-situacao"
          value={filtros.situacao} onChange={(e) => onMudar({ ...filtros, situacao: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="Planejada">Planejada</option>
          <option value="Executada">Executada</option>
        </select>
      </div>
      <div className="filter-search">
        <label htmlFor="filter-operacoes-search">Filtrar Texto</label>
        <input
          type="text" id="filter-operacoes-search" placeholder="Buscar por Operação ou Demandante..."
          value={filtros.busca} onChange={(e) => onMudar({ ...filtros, busca: e.target.value })}
        />
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onNova}>
        <Plus /> Nova Operação
      </button>
    </div>
  );
}
