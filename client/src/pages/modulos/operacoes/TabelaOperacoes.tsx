import { BadgeSituacao } from './BadgeSituacao';
import type { OperacaoComResumo } from './filtros';

interface TabelaOperacoesProps {
  operacoes: OperacaoComResumo[];
  onAbrir: (id: string) => void;
}

// Tabela de Operações — espelha as colunas/ordenação de renderOperacoesTab()
// em public/app.js. Sem paginação: a tabela de operações é pequena (registro
// único planejamento→execução, ao contrário de Eventos).
export function TabelaOperacoes({ operacoes, onAbrir }: TabelaOperacoesProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table table-cards-mobile">
        <thead>
          <tr>
            <th>Data</th>
            <th>Operação</th>
            <th>Tipo</th>
            <th>Situação</th>
            <th>Demandante</th>
            <th className="text-center">Militares</th>
            <th className="text-right">Diária</th>
          </tr>
        </thead>
        <tbody>
          {operacoes.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                Nenhuma operação localizada.
              </td>
            </tr>
          ) : (
            operacoes.map((op) => (
              <tr key={op.id} style={{ cursor: 'pointer' }} onClick={() => onAbrir(op.id)}>
                <td data-label="Data"><strong>{op.data_inicio.split('-').reverse().join('/')}</strong></td>
                <td className="card-title-cell">{op.nome_operacao}</td>
                <td data-label="Tipo">{op.tipo_operacao}</td>
                <td data-label="Situação"><BadgeSituacao situacao={op.situacao} /></td>
                <td data-label="Demandante">{op.demandante || '-'}</td>
                <td className="text-center" data-label="Militares">{op.militares_escalados}</td>
                <td className="text-right" data-label="Diária" style={{ color: 'var(--warning-fg)', fontWeight: 700 }}>
                  {op.total_diarias}
                  {!op.tem_escala && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.72rem' }}> (est.)</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
