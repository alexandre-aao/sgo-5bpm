import { Route, ClipboardX } from 'lucide-react';
import { useCartaoPrograma } from './useCartaoPrograma';
import { NavegadorData } from './NavegadorData';
import { QuadroResumo } from './QuadroResumo';
import { CartoesRecentes } from './CartoesRecentes';

export default function CartaoProgramaPage() {
  const { dataSelecionada, setDataSelecionada, deslocarDia, cartao, temCartao } = useCartaoPrograma();

  return (
    <>
      <div className="panel cartao-toolbar-panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <Route />
            <h2>Cartão Programa de Patrulhamento</h2>
          </div>
          <NavegadorData
            dataSelecionada={dataSelecionada}
            onMudarData={setDataSelecionada}
            onDeslocarDia={deslocarDia}
            temCartao={temCartao}
          />
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
            <QuadroResumo viaturas={cartao.viaturas} />
            <p style={{ padding: 24, color: 'var(--text-muted)' }}>
              Cabeçalho, Viaturas, Roteiro e trilho de conflitos chegam nos próximos lotes da migração.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
