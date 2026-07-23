import { useAppData } from '../../../context/useAppData';
import { useCartaoDeHoje } from '../../../hooks/useCartaoDeHoje';
import { calcularAlertasCartao } from '../../../lib/cartaoConflitos';
import { useDashboardStats } from './useDashboardStats';
import { KpiRow } from './KpiRow';
import { AlertasEPatrulhamento } from './AlertasEPatrulhamento';

export default function DashboardPage() {
  const { dados } = useAppData();
  const { cartaoHoje, carregando: carregandoCartao } = useCartaoDeHoje();
  const stats = useDashboardStats(dados);

  const conflitosHoje = cartaoHoje ? calcularAlertasCartao(cartaoHoje, dados.pessoal).length : 0;
  // "Verificando..." enquanto o fetch do cartão de hoje ainda está em voo — sem isso,
  // a UI pisca "não lançado" por um instante mesmo quando o cartão existe (mesmo texto
  // de carregamento do #stat-cartao-hoje no app antigo).
  const cartaoHojeResumo = carregandoCartao
    ? 'Verificando...'
    : cartaoHoje
      ? `Cartão de hoje: ${cartaoHoje.viaturas.length} viatura(s)`
      : 'Cartão de hoje não lançado';

  return (
    <div className="dash-layout">
      <div className="dash-main">
        <KpiRow stats={stats} conflitosHoje={conflitosHoje} cartaoHojeResumo={cartaoHojeResumo} />
        <AlertasEPatrulhamento
          cartaoHoje={cartaoHoje}
          carregandoCartao={carregandoCartao}
          eventos={dados.eventos}
          pessoal={dados.pessoal}
        />
      </div>
    </div>
  );
}
