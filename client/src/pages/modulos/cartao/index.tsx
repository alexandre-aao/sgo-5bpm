import { Route, ClipboardX, Plus } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { useCartaoPrograma } from './useCartaoPrograma';
import { NavegadorData } from './NavegadorData';
import { QuadroResumo } from './QuadroResumo';
import { CartoesRecentes } from './CartoesRecentes';
import { CartaoHeader } from './CartaoHeader';

export default function CartaoProgramaPage() {
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
  } = useCartaoPrograma();

  async function handleCriarCartao() {
    const resultado = await criarCartao();
    if (resultado.ok) {
      toast('Cartão Programa criado. Adicione as viaturas e roteiros.', 'success');
    } else {
      toast(resultado.mensagem, 'warning');
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
        <div className="dash-layout">
          <div className="dash-main">
            <CartaoHeader cartao={cartao} pessoal={dados.pessoal} onAtualizar={atualizarCabecalho} />
            <QuadroResumo viaturas={cartao.viaturas} />
            <p style={{ padding: 24, color: 'var(--text-muted)' }}>
              Viaturas, Roteiro e trilho de conflitos chegam nos próximos lotes da migração.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
