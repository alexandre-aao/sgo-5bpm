import { useState } from 'react';
import { useAppData } from '../../../context/useAppData';
import { useCartaoDeHoje } from '../../../hooks/useCartaoDeHoje';
import { calcularAlertasCartao } from '../../../lib/cartaoConflitos';
import { periodoInicial } from '../../../lib/periodo';
import { FiltroMesAno } from '../../../components/FiltroMesAno';
import { useDashboardStats } from './useDashboardStats';
import { useDashboardResumo } from './useDashboardResumo';
import { KpiRow } from './KpiRow';
import { AlertasEPatrulhamento } from './AlertasEPatrulhamento';
import { ModulosGrid } from './ModulosGrid';
import { DonutDiarias, DonutTipo } from './Donuts';
import { OperacoesRecentes } from './OperacoesRecentes';
import { TopMilitares } from './TopMilitares';
import { DashRail } from './DashRail';

export default function DashboardPage() {
  const { dados } = useAppData();
  const { cartaoHoje, carregando: carregandoCartao } = useCartaoDeHoje();
  const stats = useDashboardStats(dados);
  const [{ mes, ano }, setPeriodo] = useState(periodoInicial);
  const { resumo } = useDashboardResumo(mes, ano);

  const conflitosHoje = cartaoHoje ? calcularAlertasCartao(cartaoHoje, dados.pessoal).length : 0;
  const cartaoHojeResumo = carregandoCartao
    ? 'Verificando...'
    : cartaoHoje
      ? `Cartão de hoje: ${cartaoHoje.viaturas.length} viatura(s)`
      : 'Cartão de hoje não lançado';

  return (
    <>
      <div className="report-filters dashboard-periodo-filtro">
        <FiltroMesAno
          idPrefix="dashboard-filtro"
          mes={mes}
          ano={ano}
          onMesChange={(novoMes) => setPeriodo({ mes: novoMes, ano })}
          onAnoChange={(novoAno) => setPeriodo({ mes, ano: novoAno })}
        />
      </div>

      <div className="dash-layout">
        <div className="dash-main">
          <KpiRow stats={stats} conflitosHoje={conflitosHoje} cartaoHojeResumo={cartaoHojeResumo} />
          <AlertasEPatrulhamento
            cartaoHoje={cartaoHoje}
            carregandoCartao={carregandoCartao}
            eventos={dados.eventos}
            pessoal={dados.pessoal}
          />
          <ModulosGrid resumo={resumo} cartaoHoje={cartaoHoje} />
          <DonutDiarias
            periodo={`${mes}/${ano}`}
            consumido={resumo?.diarias.total_pago_periodo ?? 0}
            planejado={resumo?.diarias.planejado_periodo ?? 0}
            cota={resumo?.diarias.cota_mensal ?? 0}
          />
          <DonutTipo distribuicaoTipo={resumo?.distribuicao_tipo ?? []} />
          <OperacoesRecentes operacoes={dados.operacoes} escalas={dados.escalas} />
          <TopMilitares topMilitares={resumo?.top_militares ?? []} />
        </div>

        <DashRail eventos={dados.eventos} />
      </div>
    </>
  );
}
