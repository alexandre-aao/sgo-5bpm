import { Pencil, Trash2, SearchX, UserPlus } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { SemDados } from '../../../components/estado/SemDados';
import { EsqueletoLinhasTabela } from '../../../components/estado/Esqueleto';
import { MenuOpcoes } from '../../../components/MenuOpcoes';
import { categoriaPessoalBadgeClass } from '../../../lib/categoriaPessoalBadge';
import { ThOrdenavel } from '../../../components/tabela/ThOrdenavel';
import { useOrdenacao, ordenarLista, type Acessores } from '../../../components/tabela/ordenacao';
import { BarraPaginacao } from '../../../components/tabela/BarraPaginacao';
import { paginar, usePaginaLista } from '../../../components/tabela/paginacao';

type ColunaPessoal = 'matricula' | 'nome' | 'nome_guerra' | 'subunidade' | 'posto' | 'tipo';

const ACESSORES: Acessores<Tables<'pessoal'>, ColunaPessoal> = {
  matricula: (p) => p.matricula || '',
  nome: (p) => p.nome || '',
  nome_guerra: (p) => p.nome_guerra || '',
  subunidade: (p) => p.subunidade || '',
  posto: (p) => p.posto_graduacao || '',
  tipo: (p) => p.tipo || '',
};

interface TabelaPessoalProps {
  /** 2ª onda do AppData ainda em voo: mostra esqueleto em vez do estado vazio,
   *  que diria "nenhuma pessoa cadastrada" para 244 militares que ainda vêm. */
  carregando?: boolean;
  pessoal: Tables<'pessoal'>[];
  filtroAtivo: boolean;
  onEditar: (pessoa: Tables<'pessoal'>) => void;
  onExcluir: (pessoa: Tables<'pessoal'>) => void;
  onLimparFiltros: () => void;
}

// Tabela do Cadastro de Pessoal: ordenação por coluna, cabeçalho fixo e
// paginação (Etapa 1, item 6) — são 244 militares cadastrados, a lista inteira
// numa página só era a pior rolagem do sistema no celular.
export function TabelaPessoal({ carregando = false, pessoal, filtroAtivo, onEditar, onExcluir, onLimparFiltros }: TabelaPessoalProps) {
  const { ordenacao, alternar } = useOrdenacao<ColunaPessoal>({ coluna: 'nome', direcao: 'asc' });
  const { pagina, setPagina } = usePaginaLista(pessoal.length);

  const ordenados = ordenarLista(pessoal, ordenacao, ACESSORES);
  const { itens, paginaAtual, totalPaginas } = paginar(ordenados, pagina);

  return (
    <>
      <div className="table-responsive tabela-scroll">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <ThOrdenavel coluna="matricula" ordenacao={ordenacao} onAlternar={alternar}>Matrícula</ThOrdenavel>
              <ThOrdenavel coluna="nome" ordenacao={ordenacao} onAlternar={alternar}>Nome</ThOrdenavel>
              <ThOrdenavel coluna="nome_guerra" ordenacao={ordenacao} onAlternar={alternar}>Nome de Guerra</ThOrdenavel>
              <ThOrdenavel coluna="subunidade" ordenacao={ordenacao} onAlternar={alternar}>Subunidade</ThOrdenavel>
              <ThOrdenavel coluna="posto" ordenacao={ordenacao} onAlternar={alternar}>Posto/Graduação</ThOrdenavel>
              <ThOrdenavel coluna="tipo" ordenacao={ordenacao} onAlternar={alternar}>Tipo</ThOrdenavel>
              <th>Categorias</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <EsqueletoLinhasTabela linhas={6} colunas={8} />
            ) : itens.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  {filtroAtivo ? (
                    <SemDados
                      icone={SearchX}
                      titulo="Nenhum militar para estes filtros"
                      orientacao="Revise a categoria selecionada ou o texto da pesquisa."
                      acao={{ rotulo: 'Limpar filtros', onClick: onLimparFiltros }}
                    />
                  ) : (
                    <SemDados
                      icone={UserPlus}
                      titulo="Nenhuma pessoa cadastrada"
                      orientacao="O efetivo cadastrado aqui alimenta os seletores de Fiscal, Adjunto e Sobreaviso do Cartão Programa."
                    />
                  )}
                </td>
              </tr>
            ) : (
              itens.map((p) => (
                <tr key={p.id}>
                  <td data-label="Matrícula">{p.matricula || <span className="celula-vazia">—</span>}</td>
                  {/* O nome é o título do card no celular; os demais campos ganham rótulo. */}
                  <td className="card-title-cell">{p.nome}</td>
                  <td data-label="Nome de Guerra">{p.nome_guerra || <span className="celula-vazia">—</span>}</td>
                  <td data-label="Subunidade">{p.subunidade || <span className="celula-vazia">—</span>}</td>
                  <td data-label="Posto/Graduação">{p.posto_graduacao}</td>
                  <td data-label="Tipo"><span className={`badge tipo-${p.tipo === 'Praça' ? 'praca' : 'oficial'}`}>{p.tipo}</span></td>
                  <td data-label="Categorias">
                    {p.categorias.length > 0 ? (
                      p.categorias.map((c) => (
                        <span key={c} className={`badge badge-com-respiro ${categoriaPessoalBadgeClass(c)}`}>{c}</span>
                      ))
                    ) : (
                      <span className="celula-vazia">Sem categoria</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="acoes-linha">
                      <button type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(p)}>
                        <Pencil />
                      </button>
                      <MenuOpcoes
                        rotulo={`Mais opções de ${p.nome}`}
                        itens={[{ rotulo: 'Excluir cadastro', icone: Trash2, onClick: () => onExcluir(p), perigo: true }]}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <BarraPaginacao
        info={`${pessoal.length} militar(es) na lista.`}
        pagina={paginaAtual} totalPaginas={totalPaginas} onMudarPagina={setPagina}
      />
    </>
  );
}
