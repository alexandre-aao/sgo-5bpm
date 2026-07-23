import { useState } from 'react';
import { Route, ClipboardX, Plus } from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import { calcularAlertasCartao } from '../../../lib/cartaoConflitos';
import { useCartaoPrograma } from './useCartaoPrograma';
import { useViaturasCartao } from './useViaturasCartao';
import { useItensRoteiro } from './useItensRoteiro';
import { NavegadorData } from './NavegadorData';
import { QuadroResumo } from './QuadroResumo';
import { CartoesRecentes } from './CartoesRecentes';
import { CartaoHeader } from './CartaoHeader';
import { ViaturasTabela } from './ViaturasTabela';
import { RoteiroGrid } from './RoteiroGrid';
import { FormAdicionarViatura } from './FormAdicionarViatura';
import { ModalEditarViatura } from './ModalEditarViatura';
import { ConflitoBanner } from './ConflitoBanner';
import { TrilhoCartao } from './TrilhoCartao';

export default function CartaoProgramaPage() {
  const { usuario } = useAuth();
  const { dados } = useAppData();
  const { toast } = useToast();
  const {
    dataSelecionada,
    setDataSelecionada,
    deslocarDia,
    cartao,
    temCartao,
    criarCartao,
    atualizarCabecalho,
    recarregar,
  } = useCartaoPrograma();
  const { adicionarViatura, editarViatura, removerViatura } = useViaturasCartao(cartao?.id, recarregar);
  const { adicionarItem, removerItem, atualizarAtividade } = useItensRoteiro(cartao?.id, recarregar);

  const [aba, setAba] = useState<'viaturas' | 'roteiro'>('viaturas');
  const [vtrEmEdicao, setVtrEmEdicao] = useState<CartaoViatura | null>(null);

  // Cartão Programa é a única tela que Adjunto/Oficial podem editar — só a
  // exclusão de cartão (fora do escopo deste lote) segue P3-only.
  const podeEditar = usuario?.role === 'P3' || usuario?.role === 'Adjunto';

  async function handleCriarCartao() {
    const resultado = await criarCartao();
    if (resultado.ok) {
      toast('Cartão Programa criado. Adicione as viaturas e roteiros.', 'success');
    } else {
      toast(resultado.mensagem, 'warning');
    }
  }

  async function handleExcluirViatura(vtr: CartaoViatura) {
    if (!window.confirm('Remover esta viatura e todo o seu roteiro do cartão?')) return;
    const resultado = await removerViatura(vtr.id);
    if (resultado.ok) {
      toast('Viatura removida do cartão.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <>
      <div className="panel cartao-toolbar-panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Route />
            <h2>Cartão Programa de Patrulhamento</h2>
          </div>
          <div className="report-filters cartao-toolbar">
            <NavegadorData
              dataSelecionada={dataSelecionada}
              onMudarData={setDataSelecionada}
              onDeslocarDia={deslocarDia}
              temCartao={temCartao}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCriarCartao}>
              <Plus /> Criar Cartão
            </button>
          </div>
        </div>
      </div>

      <CartoesRecentes dataSelecionada={dataSelecionada} onAbrir={setDataSelecionada} />

      {temCartao === false && (
        <div className="cartao-empty-state">
          <ClipboardX />
          <h3>Nenhum Cartão Programa para esta data</h3>
          <p>Crie um cartão em branco, copie a estrutura do dia anterior, ou importe um cartão padrão pronto.</p>
        </div>
      )}

      {cartao && (
        <>
          <ConflitoBanner alertas={calcularAlertasCartao(cartao, dados.pessoal)} />
          <div className="dash-layout">
          <div className="dash-main">
            <CartaoHeader cartao={cartao} pessoal={dados.pessoal} onAtualizar={atualizarCabecalho} />
            <QuadroResumo viaturas={cartao.viaturas} />

            <div className="panel cartao-abas-panel">
              <div className="sub-abas" role="tablist" aria-label="Conteúdo do cartão">
                <button
                  type="button"
                  className={`sub-aba${aba === 'viaturas' ? ' ativo' : ''}`}
                  role="tab"
                  aria-selected={aba === 'viaturas'}
                  onClick={() => setAba('viaturas')}
                >
                  Viaturas
                </button>
                <button
                  type="button"
                  className={`sub-aba${aba === 'roteiro' ? ' ativo' : ''}`}
                  role="tab"
                  aria-selected={aba === 'roteiro'}
                  onClick={() => setAba('roteiro')}
                >
                  Roteiro
                </button>
              </div>

              {aba === 'viaturas' ? (
                <ViaturasTabela
                  viaturas={cartao.viaturas}
                  podeEditar={podeEditar}
                  onEditar={setVtrEmEdicao}
                  onExcluir={handleExcluirViatura}
                />
              ) : (
                <RoteiroGrid
                  viaturas={cartao.viaturas}
                  dataCartao={cartao.data || dataSelecionada}
                  eventos={dados.eventos}
                  podeEditar={podeEditar}
                  onAdicionarItem={adicionarItem}
                  onExcluirItem={removerItem}
                  onSalvarAtividade={atualizarAtividade}
                  onEditarViatura={setVtrEmEdicao}
                  onExcluirViatura={handleExcluirViatura}
                />
              )}
            </div>

            {podeEditar && (
              <FormAdicionarViatura viaturasCadastradas={dados.viaturas} onAdicionar={adicionarViatura} />
            )}
          </div>

          <TrilhoCartao viaturas={cartao.viaturas} alertas={calcularAlertasCartao(cartao, dados.pessoal)} />
          </div>
        </>
      )}

      {vtrEmEdicao && (
        <ModalEditarViatura
          viatura={vtrEmEdicao}
          onFechar={() => setVtrEmEdicao(null)}
          onSalvar={editarViatura}
        />
      )}
    </>
  );
}
