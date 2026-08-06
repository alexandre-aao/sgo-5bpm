import { Table2 } from 'lucide-react';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import {
  horarioDaAtividade, madrugadaSeguraTexto, ordenarViaturasQuadroResumo,
} from '../../../lib/quadroResumo';
import { LinhaTabelaVazia } from '../../../components/tabela/LinhaTabelaVazia';

interface QuadroResumoProps {
  viaturas: CartaoViatura[];
}

// Tabela oficial de impressão: Companhia x Viatura x Setor x QTL Almoço x QTL
// Jantar x Madrugada Segura. A ordenação e a leitura das colunas de horário
// ficam em lib/quadroResumo.ts, compartilhadas com a saída de impressão.
export function QuadroResumo({ viaturas }: QuadroResumoProps) {
  const ordenadas = ordenarViaturasQuadroResumo(viaturas);

  return (
    <div className="panel cartao-resumo-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Table2 />
          <h2>Quadro Resumo</h2>
        </div>
      </div>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th>Companhia</th>
              <th>Viatura</th>
              <th>Setor</th>
              <th>QTL Almoço</th>
              <th>QTL Jantar</th>
              <th>Madrugada Segura / Observação</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <LinhaTabelaVazia colunas={6}>
                Nenhuma viatura no cartão.
              </LinhaTabelaVazia>
            ) : (
              ordenadas.map((vtr) => (
                <tr key={vtr.id}>
                  <td data-label="Companhia">{vtr.companhia || '-'}</td>
                  <td className="card-title-cell">{vtr.prefixo}</td>
                  <td data-label="Setor">{vtr.setor}</td>
                  <td data-label="QTL Almoço">{horarioDaAtividade(vtr.itens, 'QTL Almoço') || '-'}</td>
                  <td data-label="QTL Jantar">{horarioDaAtividade(vtr.itens, 'QTL Jantar') || '-'}</td>
                  <td data-label="Madrugada Segura">{madrugadaSeguraTexto(vtr.itens, vtr.observacao) || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
