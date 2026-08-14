import { ShieldAlert } from 'lucide-react';
import { BadgeSituacao } from '../operacoes/BadgeSituacao';
import type { OperacaoDoMes } from './usePlanejadorDiarias';
import { LinhaTabelaVazia } from '../../../components/tabela/LinhaTabelaVazia';

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
              <LinhaTabelaVazia colunas={6}>Nenhuma operação para este mês.</LinhaTabelaVazia>
            ) : (
              operacoes.map((op) => (
                <tr key={op.id} className="cursor-acao" onClick={() => onAbrir(op.id)}>
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
                  <td className="text-right texto-principal peso-700" data-label="Diárias">
                    {op.total_diarias}
                    {!op.tem_escala && (
                      <span className="texto-muted peso-400 texto-xs"> (est.)</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="panel-nota">
        Consumido usa a quantidade registrada nas escalas; Planejado usa a estimativa das operações ainda sem escala.
      </p>
    </div>
  );
}
