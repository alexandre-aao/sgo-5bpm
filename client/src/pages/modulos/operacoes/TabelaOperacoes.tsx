import { SearchX, ShieldPlus } from 'lucide-react';
import { BadgeSituacao } from './BadgeSituacao';
import type { OperacaoComResumo } from './filtros';
import { SemDados } from '../../../components/estado/SemDados';
import { ThOrdenavel } from '../../../components/tabela/ThOrdenavel';
import { useOrdenacao, ordenarLista, type Acessores } from '../../../components/tabela/ordenacao';
import { BarraPaginacao } from '../../../components/tabela/BarraPaginacao';
import { paginar, usePaginaLista } from '../../../components/tabela/paginacao';

type ColunaOperacao = 'data' | 'nome' | 'tipo' | 'situacao' | 'demandante' | 'militares' | 'diaria';

const ACESSORES: Acessores<OperacaoComResumo, ColunaOperacao> = {
  data: (op) => op.data_inicio,
  nome: (op) => op.nome_operacao || '',
  tipo: (op) => op.tipo_operacao || '',
  situacao: (op) => op.situacao || '',
  demandante: (op) => op.demandante || '',
  militares: (op) => op.militares_escalados,
  diaria: (op) => op.total_diarias,
};

interface TabelaOperacoesProps {
  operacoes: OperacaoComResumo[];
  temFiltro: boolean;
  onAbrir: (id: string) => void;
  onLimparFiltros: () => void;
}

// Tabela de Operações: ordenação por coluna, cabeçalho fixo e paginação
// (Etapa 1, item 6). Ordem padrão inalterada — data, mais recente primeiro.
export function TabelaOperacoes({ operacoes, temFiltro, onAbrir, onLimparFiltros }: TabelaOperacoesProps) {
  const { ordenacao, alternar } = useOrdenacao<ColunaOperacao>({ coluna: 'data', direcao: 'desc' });
  const { pagina, setPagina } = usePaginaLista(operacoes.length);

  const ordenadas = ordenarLista(operacoes, ordenacao, ACESSORES);
  const { itens, paginaAtual, totalPaginas } = paginar(ordenadas, pagina);

  return (
    <>
      <div className="table-responsive tabela-scroll">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <ThOrdenavel coluna="data" ordenacao={ordenacao} onAlternar={alternar}>Data</ThOrdenavel>
              <ThOrdenavel coluna="nome" ordenacao={ordenacao} onAlternar={alternar}>Operação</ThOrdenavel>
              <ThOrdenavel coluna="tipo" ordenacao={ordenacao} onAlternar={alternar}>Tipo</ThOrdenavel>
              <ThOrdenavel coluna="situacao" ordenacao={ordenacao} onAlternar={alternar}>Situação</ThOrdenavel>
              <ThOrdenavel coluna="demandante" ordenacao={ordenacao} onAlternar={alternar}>Demandante</ThOrdenavel>
              <ThOrdenavel coluna="militares" ordenacao={ordenacao} onAlternar={alternar} className="text-center">
                Militares
              </ThOrdenavel>
              <ThOrdenavel coluna="diaria" ordenacao={ordenacao} onAlternar={alternar} className="text-right">
                Diária
              </ThOrdenavel>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {temFiltro ? (
                    <SemDados
                      icone={SearchX}
                      titulo="Nenhuma operação para estes filtros"
                      orientacao="Revise a situação, o período ou o texto da busca."
                      acao={{ rotulo: 'Limpar filtros', onClick: onLimparFiltros }}
                    />
                  ) : (
                    <SemDados
                      icone={ShieldPlus}
                      titulo="Nenhuma operação cadastrada"
                      orientacao="As operações com diária ficam aqui. Use “Nova Operação” para lançar a primeira."
                    />
                  )}
                </td>
              </tr>
            ) : (
              itens.map((op) => (
                <tr key={op.id} className="linha-clicavel" onClick={() => onAbrir(op.id)}>
                  <td data-label="Data"><strong>{op.data_inicio.split('-').reverse().join('/')}</strong></td>
                  <td className="card-title-cell">{op.nome_operacao}</td>
                  <td data-label="Tipo">{op.tipo_operacao}</td>
                  <td data-label="Situação"><BadgeSituacao situacao={op.situacao} /></td>
                  <td data-label="Demandante">{op.demandante || '-'}</td>
                  <td className="text-center" data-label="Militares">{op.militares_escalados}</td>
                  {/* Quantidade de diárias é dado, não prioridade: destaque por peso, não por cor. */}
                  <td className="text-right celula-numero" data-label="Diária">
                    {op.total_diarias}
                    {!op.tem_escala && <span className="celula-nota"> (est.)</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <BarraPaginacao
        info={`${operacoes.length} operação(ões) na lista.`}
        pagina={paginaAtual} totalPaginas={totalPaginas} onMudarPagina={setPagina}
      />
    </>
  );
}
