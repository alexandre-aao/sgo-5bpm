import { useState } from 'react';
import { Contact, UserPlus } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import type { Tables } from '../../../types/supabase';
import { FiltroCategoriasPessoal } from './FiltroCategoriasPessoal';
import { TabelaPessoal } from './TabelaPessoal';
import { ModalPessoa } from './ModalPessoa';
import { usePessoalCrud } from './usePessoalCrud';

// Cadastro de Pessoal (P3) — Adjuntos, Fiscais/Oficiais de Operações, Oficiais
// de Sobreaviso e Executores, com filtro por categoria. Espelha #tab-pessoal +
// renderPessoalTab() em public/app.js. A leitura vem de dados.pessoal
// (useAppData, já carregado globalmente) — filtrada aqui, sem nova chamada.
export default function PessoalPage() {
  const { dados, recarregar } = useAppData();
  const { toast } = useToast();
  const { criarPessoa, atualizarPessoa, excluirPessoa } = usePessoalCrud(recarregar);
  const [categoria, setCategoria] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [pessoaEditando, setPessoaEditando] = useState<Tables<'pessoal'> | null>(null);

  const pessoalFiltrado =
    categoria === '__sem_categoria__'
      ? dados.pessoal.filter((p) => !p.categorias || p.categorias.length === 0)
      : categoria
        ? dados.pessoal.filter((p) => p.categorias.includes(categoria))
        : dados.pessoal;

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
          <button type="button" className="btn btn-primary btn-sm" onClick={handleNovaPessoa}>
            <UserPlus /> Nova Pessoa
          </button>
        </div>

        <FiltroCategoriasPessoal categoria={categoria} onMudar={setCategoria} />

        <TabelaPessoal pessoal={pessoalFiltrado} filtroAtivo={!!categoria} onEditar={handleEditar} onExcluir={handleExcluir} />
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
