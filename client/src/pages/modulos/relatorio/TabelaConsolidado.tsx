import type { RelatorioDiariaItem } from './useRelatorioDiarias';

interface TabelaConsolidadoProps {
  lista: RelatorioDiariaItem[];
}

export function TabelaConsolidado({ lista }: TabelaConsolidadoProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table table-cards-mobile" id="table-relatorio">
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Nome do Militar</th>
            <th className="text-center">Quantidade de Escalas</th>
            <th className="text-center">Total de Aparições</th>
            <th className="text-right">Total de Diárias (Un.)</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                Nenhum militar localizado para o período/filtro selecionado.
              </td>
            </tr>
          ) : (
            lista.map((item) => (
              <tr key={item.militar_id}>
                <td data-label="Matrícula"><strong>{item.militar_id}</strong></td>
                <td className="card-title-cell">{item.militar_nome}</td>
                <td className="text-center" data-label="Qtd. Escalas">{item.escalas_count}</td>
                <td className="text-center" data-label="Total Aparições">{item.qtd_aparicoes}</td>
                <td className="text-right" data-label="Total Diárias" style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                  {item.total_diarias}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
