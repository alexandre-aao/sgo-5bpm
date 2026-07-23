const MESES = [
  ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
  ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
  ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
] as const;

interface PeriodoFiltroProps {
  mes: string;
  ano: string;
  onMesChange: (mes: string) => void;
  onAnoChange: (ano: string) => void;
}

// Espelha initPeriodFilters(): anos de anoAtual-1 até anoAtual+2.
export function PeriodoFiltro({ mes, ano, onMesChange, onAnoChange }: PeriodoFiltroProps) {
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2];

  return (
    <div className="report-filters dashboard-periodo-filtro">
      <div className="filter-group">
        <label htmlFor="dashboard-filtro-mes">Mês</label>
        <select id="dashboard-filtro-mes" value={mes} onChange={(e) => onMesChange(e.target.value)}>
          {MESES.map(([valor, nome]) => (
            <option key={valor} value={valor}>{nome}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label htmlFor="dashboard-filtro-ano">Ano</label>
        <select id="dashboard-filtro-ano" value={ano} onChange={(e) => onAnoChange(e.target.value)}>
          {anos.map((a) => (
            <option key={a} value={String(a)}>{a}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
