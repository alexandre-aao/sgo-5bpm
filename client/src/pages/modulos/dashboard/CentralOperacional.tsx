import { CalendarCheck2, Layers3, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardResumo } from './useDashboardResumo';

export function CentralOperacional({ resumo }: { resumo: DashboardResumo }) {
  const { operacional, diarias } = resumo;
  return (
    <div className="dash-central-grid">
      <section className="panel">
        <div className="panel-title"><CalendarCheck2 /><h2>Preparação do Serviço</h2></div>
        <div className="dash-status-lista">
          <Link to={`/cartao?data=${operacional.hoje}`} className="dash-status-item"><span>Cartão Ordinário de hoje</span><strong className={operacional.cartao_hoje_pronto ? 'tom-success' : 'tom-danger'}>{operacional.cartao_hoje_pronto ? 'Pronto' : 'Pendente'}</strong></Link>
          <Link to={`/cartao?data=${operacional.amanha}`} className="dash-status-item"><span>Cartão de amanhã</span><strong className={operacional.cartao_amanha_preparado ? 'tom-success' : 'tom-warning'}>{operacional.cartao_amanha_preparado ? 'Preparado' : 'Não preparado'}</strong></Link>
          <Link to="/cartao?modelos=1" className="dash-status-item"><span>Modelo Ordinário ativo</span><strong>{operacional.modelo_ordinario_ativo?.nome || 'Não definido'}</strong></Link>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><Layers3 /><h2>Operações</h2></div>
        <div className="dash-status-lista">
          {operacional.operacoes_hoje.length === 0 ? <span className="texto-auxiliar">Nenhuma operação hoje.</span> : operacional.operacoes_hoje.map((op) => <Link key={op.id} to={`/operacoes?operacao=${op.id}`} className="dash-status-item"><span>{op.nome_operacao}</span><strong>Hoje</strong></Link>)}
          {operacional.operacoes_proximas.slice(0, 4).map((op) => <Link key={op.id} to={`/operacoes?operacao=${op.id}`} className="dash-status-item"><span>{op.nome_operacao}</span><strong>{op.data_inicio.split('-').reverse().join('/')}</strong></Link>)}
        </div>
      </section>
      <section className="panel dash-cota-panel">
        <div className="panel-title"><WalletCards /><h2>Cota de Diárias</h2></div>
        <div className="dash-cota-valores">
          <span><small>Cota</small><strong>{diarias.cota_mensal}</strong></span>
          <span><small>Consumidas</small><strong>{diarias.total_pago_periodo}</strong></span>
          <span><small>Planejadas</small><strong>{diarias.planejado_periodo}</strong></span>
          <span><small>Comprometidas</small><strong>{diarias.comprometido_periodo}</strong></span>
          <span><small>Saldo</small><strong className={diarias.saldo_cota_periodo < 0 ? 'tom-danger' : 'tom-success'}>{diarias.saldo_cota_periodo}</strong></span>
        </div>
        <Link to="/planejador" className="link-btn">Abrir Planejador de Diárias</Link>
      </section>
    </div>
  );
}
