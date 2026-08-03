import { Pencil, Trash2, FileText } from 'lucide-react';
import type { CartaoViatura, StatusEnvio } from '../../../lib/cartaoConflitos';
import { ROTULO_STATUS_ENVIO } from '../../../lib/cartaoConflitos';
import { categoriaBadgeClass } from './constantes';
import { LinhaTabelaVazia } from '../../../components/tabela/LinhaTabelaVazia';

function statusEnvioBadgeClass(status: StatusEnvio | undefined): string {
  return `envio-${status || 'pendente'}`;
}

interface ViaturasTabelaProps {
  viaturas: CartaoViatura[];
  podeEditar: boolean;
  onEditar: (vtr: CartaoViatura) => void;
  onExcluir: (vtr: CartaoViatura) => void;
  onVerCartao: (vtr: CartaoViatura) => void;
}

// Tabela enxuta da sub-aba "Viaturas" — espelha renderCartaoViaturasTabela().
export function ViaturasTabela({ viaturas, podeEditar, onEditar, onExcluir, onVerCartao }: ViaturasTabelaProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table table-cards-mobile">
        <thead>
          <tr>
            <th>Prefixo</th>
            <th>Setor</th>
            <th>Companhia</th>
            <th>Categoria</th>
            <th>Comandante</th>
            <th>Cartão</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {viaturas.length === 0 ? (
            <LinhaTabelaVazia colunas={7}>
              Nenhuma viatura adicionada. Use o formulário abaixo para montar o cartão.
            </LinhaTabelaVazia>
          ) : (
            viaturas.map((vtr) => (
              <tr key={vtr.id}>
                <td className="card-title-cell"><strong>{vtr.prefixo}</strong></td>
                <td data-label="Setor">{vtr.setor || '-'}</td>
                <td data-label="Companhia">{vtr.companhia || '-'}</td>
                <td data-label="Categoria">
                  {vtr.categoria ? <span className={`badge ${categoriaBadgeClass(vtr.categoria)}`}>{vtr.categoria}</span> : '-'}
                </td>
                <td data-label="Comandante">{vtr.comandante || 'Não informado'}</td>
                {/* Substituiu a coluna Observação: saber se o comandante já
                    recebeu o cartão do dia importa mais na hora do turno, e a
                    observação continua visível na edição e no Quadro Resumo. */}
                <td data-label="Cartão">
                  <span className={`badge ${statusEnvioBadgeClass(vtr.status_envio)}`}>
                    {ROTULO_STATUS_ENVIO[vtr.status_envio || 'pendente']}
                  </span>
                  {(vtr.versao || 1) > 1 && <span className="vtr-versao">v{vtr.versao}</span>}
                </td>
                <td className="text-right" data-label="Ações">
                  <div className="acoes-linha">
                    {/* Ver o cartão da viatura é leitura: Oficial também precisa,
                        mesmo sem poder editar o cartão. */}
                    <button
                      className="btn-icon" title={`Ver cartão da VTR ${vtr.prefixo}`}
                      aria-label={`Ver cartão da VTR ${vtr.prefixo}`} onClick={() => onVerCartao(vtr)}
                    >
                      <FileText />
                    </button>
                    {podeEditar && (
                      <>
                        <button className="btn-icon" title="Editar viatura" aria-label="Editar viatura" onClick={() => onEditar(vtr)}>
                          <Pencil />
                        </button>
                        <button className="btn-icon btn-icon-danger" title="Excluir viatura" aria-label="Excluir viatura" onClick={() => onExcluir(vtr)}>
                          <Trash2 />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
