import { ShieldAlert } from 'lucide-react';
import { BadgeSituacao } from '../operacoes/BadgeSituacao';
import type { OperacaoDoMes } from './usePlanejadorDiarias';

interface OperacoesDoMesProps {
  operacoes: OperacaoDoMes[];
  onAbrir: (id: string) => void;
}

// Tabela "Operações do Mês" do Planejador — espelha o trecho de renderPlanejadorTab()
// que monta table-planejador-body. Clicar na linha abre a gaveta de Operação.
export function OperacoesDoMes({ operacoes, onAbrir }: OperacoesDoMesProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <ShieldAlert />
          <h2>Operações do Mês</h2>
        </div>
        <span className="panel-header-sub">
          {operacoes.length} {operacoes.length === 1 ? 'operação' : 'operações'}
        </span>
      </div>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th>Data</th>
              <th>Operação</th>
              <th>Tipo</th>
              <th>Situação</th>
              <th className="text-center">Escala</th>
              <th className="text-right">Diárias</th>
            </tr>
          </thead>
          <tbody>
            {operacoes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  Nenhuma operação para este mês.
                </td>
              </tr>
            ) : (
              operacoes.map((op) => (
                <tr key={op.id} style={{ cursor: 'pointer' }} onClick={() => onAbrir(op.id)}>
                  <td data-label="Data"><strong>{op.data_inicio.split('-').reverse().join('/')}</strong></td>
                  <td className="card-title-cell">{op.nome_operacao}</td>
                  <td data-label="Tipo">{op.tipo_operacao}</td>
                  <td data-label="Situação"><BadgeSituacao situacao={op.situacao} /></td>
                  <td className="text-center" data-label="Escala">
                    {op.tem_escala ? (
                      <span className="badge-tint badge-tint-ok">Com escala</span>
                    ) : (
                      <span className="badge-tint badge-tint-alerta">Sem escala</span>
                    )}
                  </td>
                  <td className="text-right" data-label="Diárias" style={{ color: 'var(--warning-fg)', fontWeight: 700 }}>
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
      <p className="panel-nota">
        Diária = nº de aparições × 2. Consumido conta escalas reais; Planejado conta a estimativa das operações sem escala.
      </p>
    </div>
  );
}
