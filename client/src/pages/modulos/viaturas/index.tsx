import { useState } from 'react';
import { Car, Plus } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../context/useToast';
import type { Tables } from '../../../types/supabase';
import { FiltroStatusViaturas } from './FiltroStatusViaturas';
import { TabelaViaturas } from './TabelaViaturas';
import { ModalViatura } from './ModalViatura';
import { useViaturasCrud } from './useViaturasCrud';
import { FiltrosAtivos, type FiltroAtivo } from '../../../components/tabela/FiltrosAtivos';
import { normalizarTexto } from '../../../lib/cartaoConflitos';

// Cadastro de Viaturas — registro central que alimenta a sugestão de prefixo
// no Cartão Programa. Aberto a P3/Adjunto/Oficial pra criar/editar; só a
// exclusão é P3-only (exceção deliberada, ver CLAUDE.md). Espelha
// #tab-viaturas + renderViaturasTab() em public/app.js.
export default function ViaturasPage() {
  const { usuario } = useAuth();
  const { dados, recarregar } = useAppData();
  const { toast } = useToast();
  const { criarViatura, atualizarViatura, excluirViatura } = useViaturasCrud(recarregar);
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [viaturaEditando, setViaturaEditando] = useState<Tables<'viaturas'> | null>(null);
  const podeExcluir = usuario?.role === 'P3';

  const porStatus = status ? dados.viaturas.filter((v) => v.status === status) : dados.viaturas;

  // Pesquisa (Etapa 1, item 6) — prefixo, companhia e observação
  const termo = normalizarTexto(busca.trim());
  const viaturasFiltradas = termo
    ? porStatus.filter((v) =>
        normalizarTexto(v.prefixo || '').includes(termo) ||
        normalizarTexto(v.companhia || '').includes(termo) ||
        normalizarTexto(v.observacao || '').includes(termo),
      )
    : porStatus;

  const filtrosAtivos: FiltroAtivo[] = [
    status && { rotulo: `Status: ${status}`, onRemover: () => setStatus('') },
    busca.trim() && { rotulo: `Texto: "${busca.trim()}"`, onRemover: () => setBusca('') },
  ].filter(Boolean) as FiltroAtivo[];

  function handleLimparFiltros() {
    setStatus('');
    setBusca('');
  }

  function handleNovaViatura() {
    setViaturaEditando(null);
    setModalAberto(true);
  }

  function handleEditar(viatura: Tables<'viaturas'>) {
    setViaturaEditando(viatura);
    setModalAberto(true);
  }

  async function handleExcluir(viatura: Tables<'viaturas'>) {
    if (!window.confirm('Excluir permanentemente esta viatura do cadastro?')) return;
    const resultado = await excluirViatura(viatura.id);
    if (resultado.ok) {
      toast('Viatura excluída.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Car />
            <h2>Cadastro de Viaturas</h2>
          </div>
          <div className="events-filters-bar">
            <div className="filter-search">
              <label htmlFor="filter-viaturas-busca">Pesquisar</label>
              <input
                type="text" id="filter-viaturas-busca" placeholder="Prefixo, companhia ou observação..."
                value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleNovaViatura}>
              <Plus /> Nova Viatura
            </button>
          </div>
        </div>

        <FiltroStatusViaturas status={status} onMudar={setStatus} />

        <FiltrosAtivos filtros={filtrosAtivos} onLimparTudo={handleLimparFiltros} />

        <TabelaViaturas
          viaturas={viaturasFiltradas} filtroAtivo={!!status || !!termo} podeExcluir={podeExcluir}
          onEditar={handleEditar} onExcluir={handleExcluir}
          onLimparFiltros={handleLimparFiltros}
        />
      </div>

      {modalAberto && (
        <ModalViatura
          viatura={viaturaEditando}
          onFechar={() => setModalAberto(false)}
          onSalvar={(payload) => (viaturaEditando ? atualizarViatura(viaturaEditando.id, payload) : criarViatura(payload))}
        />
      )}
    </>
  );
}
