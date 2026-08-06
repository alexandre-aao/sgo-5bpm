import { Pencil, Trash2, SearchX, CarFront } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { SemDados } from '../../../components/estado/SemDados';
import { MenuOpcoes } from '../../../components/MenuOpcoes';
import { statusViaturaBadgeClass } from '../../../lib/categoriasViatura';
import { ThOrdenavel } from '../../../components/tabela/ThOrdenavel';
import { useOrdenacao, ordenarLista, type Acessores } from '../../../components/tabela/ordenacao';
import { BarraPaginacao } from '../../../components/tabela/BarraPaginacao';
import { paginar, usePaginaLista } from '../../../components/tabela/paginacao';

type ColunaViatura = 'prefixo' | 'companhia' | 'categoria' | 'status';

const ACESSORES: Acessores<Tables<'viaturas'>, ColunaViatura> = {
  prefixo: (v) => v.prefixo || '',
  companhia: (v) => v.companhia || '',
  categoria: (v) => v.categoria || '',
  status: (v) => v.status || '',
};

interface TabelaViaturasProps {
  viaturas: Tables<'viaturas'>[];
  filtroAtivo: boolean;
  podeExcluir: boolean;
  onEditar: (viatura: Tables<'viaturas'>) => void;
  onExcluir: (viatura: Tables<'viaturas'>) => void;
  onLimparFiltros: () => void;
}

// Tabela do Cadastro de Viaturas — com ordenação, cabeçalho fixo e paginação
// (Etapa 1, item 6).
export function TabelaViaturas({
  viaturas, filtroAtivo, podeExcluir, onEditar, onExcluir, onLimparFiltros,
}: TabelaViaturasProps) {
  const { ordenacao, alternar } = useOrdenacao<ColunaViatura>({ coluna: 'prefixo', direcao: 'asc' });
  const { pagina, setPagina } = usePaginaLista(viaturas.length);

  const ordenadas = ordenarLista(viaturas, ordenacao, ACESSORES);
  const { itens, paginaAtual, totalPaginas } = paginar(ordenadas, pagina);

  return (
    <>
      <div className="table-responsive tabela-scroll">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <ThOrdenavel coluna="prefixo" ordenacao={ordenacao} onAlternar={alternar}>Prefixo</ThOrdenavel>
              <ThOrdenavel coluna="companhia" ordenacao={ordenacao} onAlternar={alternar}>Companhia</ThOrdenavel>
              <ThOrdenavel coluna="categoria" ordenacao={ordenacao} onAlternar={alternar}>Categoria</ThOrdenavel>
              <ThOrdenavel coluna="status" ordenacao={ordenacao} onAlternar={alternar}>Status</ThOrdenavel>
              <th>Observação</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {filtroAtivo ? (
                    <SemDados
                      icone={SearchX}
                      titulo="Nenhuma viatura para estes filtros"
                      orientacao="Revise o status selecionado ou o texto da pesquisa."
                      acao={{ rotulo: 'Limpar filtros', onClick: onLimparFiltros }}
                    />
                  ) : (
                    <SemDados
                      icone={CarFront}
                      titulo="Nenhuma viatura cadastrada"
                      orientacao="A frota cadastrada aqui sugere o prefixo na hora de montar o Cartão Programa."
                    />
                  )}
                </td>
              </tr>
            ) : (
              itens.map((v) => (
                <tr key={v.id}>
                  {/* O prefixo identifica a viatura — titula o card no celular. */}
                  <td className="card-title-cell">{v.prefixo}</td>
                  <td data-label="Companhia">{v.companhia || <span className="celula-vazia">—</span>}</td>
                  <td data-label="Categoria">{v.categoria}</td>
                  <td data-label="Status"><span className={`badge ${statusViaturaBadgeClass(v.status)}`}>{v.status}</span></td>
                  <td data-label="Observação">{v.observacao || <span className="celula-vazia">—</span>}</td>
                  <td className="text-right">
                    <div className="acoes-linha">
                      <button type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(v)}>
                        <Pencil />
                      </button>
                      {/* Excluir viatura é P3-only (regra inalterada) — o menu só
                          aparece pra quem tem a permissão. */}
                      {podeExcluir && (
                        <MenuOpcoes
                          rotulo={`Mais opções da viatura ${v.prefixo}`}
                          itens={[{ rotulo: 'Excluir viatura', icone: Trash2, onClick: () => onExcluir(v), perigo: true }]}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <BarraPaginacao
        info={`${viaturas.length} viatura(s) na lista.`}
        pagina={paginaAtual} totalPaginas={totalPaginas} onMudarPagina={setPagina}
      />
    </>
  );
}
