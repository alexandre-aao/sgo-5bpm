import type { RelatorioDiariaItem } from './useRelatorioDiarias';
import { LinhaTabelaVazia } from '../../../components/tabela/LinhaTabelaVazia';

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
            <LinhaTabelaVazia colunas={5}>
              Nenhum militar localizado para o período/filtro selecionado.
            </LinhaTabelaVazia>
          ) : (
            lista.map((item) => (
              <tr key={item.militar_id}>
                <td data-label="Matrícula"><strong>{item.militar_id}</strong></td>
                <td className="card-title-cell">{item.militar_nome}</td>
                <td className="text-center" data-label="Qtd. Escalas">{item.escalas_count}</td>
                <td className="text-center" data-label="Total Aparições">{item.qtd_aparicoes}</td>
                <td className="text-right texto-principal peso-700" data-label="Total Diárias">
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
