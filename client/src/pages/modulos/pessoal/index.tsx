import { useState } from 'react';
import { Contact, UserPlus } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import type { Tables } from '../../../types/supabase';
import { FiltroCategoriasPessoal } from './FiltroCategoriasPessoal';
import { TabelaPessoal } from './TabelaPessoal';
import { ModalPessoa } from './ModalPessoa';
import { usePessoalCrud } from './usePessoalCrud';
import { FiltrosAtivos, type FiltroAtivo } from '../../../components/tabela/FiltrosAtivos';
import { normalizarTexto } from '../../../lib/cartaoConflitos';

// Cadastro de Pessoal (P3) — Adjuntos, Fiscais/Oficiais de Operações, Oficiais
// de Sobreaviso e Executores, com filtro por categoria. Espelha #tab-pessoal +
// renderPessoalTab() em public/app.js. A leitura vem de dados.pessoal
// (useAppData, já carregado globalmente) — filtrada aqui, sem nova chamada.
export default function PessoalPage() {
  const { dados, recarregar } = useAppData();
  const { toast } = useToast();
  const { criarPessoa, atualizarPessoa, excluirPessoa } = usePessoalCrud(recarregar);
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [pessoaEditando, setPessoaEditando] = useState<Tables<'pessoal'> | null>(null);

  const porCategoria =
    categoria === '__sem_categoria__'
      ? dados.pessoal.filter((p) => !p.categorias || p.categorias.length === 0)
      : categoria
        ? dados.pessoal.filter((p) => p.categorias.includes(categoria))
        : dados.pessoal;

  // Pesquisa (Etapa 1, item 6): nome, nome de guerra e matrícula, acento- e
  // case-insensitive, no mesmo padrão do autocomplete de escala.
  const termo = normalizarTexto(busca.trim());
  const pessoalFiltrado = termo
    ? porCategoria.filter((p) =>
        normalizarTexto(p.nome || '').includes(termo) ||
        normalizarTexto(p.nome_guerra || '').includes(termo) ||
        (p.matricula || '').toLowerCase().includes(busca.trim().toLowerCase()),
      )
    : porCategoria;

  const filtrosAtivos: FiltroAtivo[] = [
    categoria && {
      rotulo: categoria === '__sem_categoria__' ? 'Sem categoria' : `Categoria: ${categoria}`,
      onRemover: () => setCategoria(''),
    },
    busca.trim() && { rotulo: `Texto: "${busca.trim()}"`, onRemover: () => setBusca('') },
  ].filter(Boolean) as FiltroAtivo[];

  function handleLimparFiltros() {
    setCategoria('');
    setBusca('');
  }

  function handleNovaPessoa() {
    setPessoaEditando(null);
    setModalAberto(true);
  }

  function handleEditar(pessoa: Tables<'pessoal'>) {
    setPessoaEditando(pessoa);
    setModalAberto(true);
  }

  async function handleExcluir(pessoa: Tables<'pessoal'>) {
    if (!window.confirm('Excluir permanentemente este cadastro?')) return;
    const resultado = await excluirPessoa(pessoa.id);
    if (resultado.ok) {
      toast('Cadastro excluído.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Contact />
            <h2>Cadastro de Pessoal</h2>
          </div>
          <div className="events-filters-bar">
            <div className="filter-search">
              <label htmlFor="filter-pessoal-busca">Pesquisar</label>
              <input
                type="text" id="filter-pessoal-busca" placeholder="Nome, nome de guerra ou matrícula..."
                value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleNovaPessoa}>
              <UserPlus /> Nova Pessoa
            </button>
          </div>
        </div>

        <FiltroCategoriasPessoal categoria={categoria} onMudar={setCategoria} />

        <FiltrosAtivos filtros={filtrosAtivos} onLimparTudo={handleLimparFiltros} />

        <TabelaPessoal
          pessoal={pessoalFiltrado} filtroAtivo={!!categoria || !!termo}
          onEditar={handleEditar} onExcluir={handleExcluir}
          onLimparFiltros={handleLimparFiltros}
        />
      </div>

      {modalAberto && (
        <ModalPessoa
          pessoa={pessoaEditando}
          onFechar={() => setModalAberto(false)}
          onSalvar={(payload) => (pessoaEditando ? atualizarPessoa(pessoaEditando.id, payload) : criarPessoa(payload))}
        />
      )}
    </>
  );
}
