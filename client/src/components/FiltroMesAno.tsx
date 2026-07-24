const MESES = [
  ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
  ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
  ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
] as const;

interface FiltroMesAnoProps {
  idPrefix: string;
  mes: string;
  ano: string;
  onMesChange: (mes: string) => void;
  onAnoChange: (ano: string) => void;
}

// Seletor de Mês/Ano reaproveitado pelo Dashboard e pelo Planejador de Diárias —
// espelha initPeriodFilters() em public/app.js (anos de anoAtual-1 até anoAtual+2).
// Sem div própria (Fragment): quem chama decide o wrapper, já que cada tela
// organiza os dois `.filter-group` num flex diferente (só o par, ou par + cota).
export function FiltroMesAno({ idPrefix, mes, ano, onMesChange, onAnoChange }: FiltroMesAnoProps) {
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2];

  return (
    <>
      <div className="filter-group">
        <label htmlFor={`${idPrefix}-mes`}>Mês</label>
        <select id={`${idPrefix}-mes`} value={mes} onChange={(e) => onMesChange(e.target.value)}>
          {MESES.map(([valor, nome]) => (
            <option key={valor} value={valor}>{nome}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label htmlFor={`${idPrefix}-ano`}>Ano</label>
        <select id={`${idPrefix}-ano`} value={ano} onChange={(e) => onAnoChange(e.target.value)}>
          {anos.map((a) => (
            <option key={a} value={String(a)}>{a}</option>
          ))}
        </select>
      </div>
    </>
  );
}
