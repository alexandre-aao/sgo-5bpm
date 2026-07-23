import { Link } from 'react-router-dom';
import { CalendarRange, Car, ClipboardList, FileText, Users, User } from 'lucide-react';
import type { DashboardResumo } from './useDashboardResumo';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';

interface ModulosGridProps {
  resumo: DashboardResumo | null;
  cartaoHoje: CartaoDetalhado | null;
}

// Espelha o .mod-grid de public/index.html — mesma ordem, mesmas cores de ícone.
// "Estatísticas" do protótipo não existe como aba própria (painel entra em
// Relatório de Diárias); no lugar fica Cadastro de Viaturas.
export function ModulosGrid({ resumo, cartaoHoje }: ModulosGridProps) {
  const descEventos = resumo ? `${resumo.eventos.total_periodo} no período · ${resumo.eventos.proximos_7_dias} em 7 dias` : '—';
  const descCartao = cartaoHoje ? `${cartaoHoje.viaturas.length} viatura(s) hoje` : 'Pendente — nada lançado hoje';
  const descPlanejador = resumo ? `${resumo.diarias.total_pago_periodo} de ${resumo.diarias.cota_mensal} diárias` : '—';
  const descViaturas = resumo ? `${resumo.efetivo_total_periodo} militares empregados` : '—';
  const descPessoal = resumo ? `${resumo.pessoal.total} cadastrados · ${resumo.pessoal.pracas} praças / ${resumo.pessoal.oficiais} oficiais` : '—';
  const descUsuarios = resumo ? `${resumo.usuarios.total} contas do sistema` : '—';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <ClipboardList />
          <h2>Módulos</h2>
        </div>
      </div>
      <div className="mod-grid">
        <Link to="/eventos" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><CalendarRange /></span>
          <span className="mod-nome">Eventos</span>
          <span className="mod-desc">{descEventos}</span>
        </Link>
        <Link to="/cartao" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Car /></span>
          <span className="mod-nome">Cartão Programa</span>
          <span className="mod-desc">{descCartao}</span>
        </Link>
        <Link to="/planejador" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}><ClipboardList /></span>
          <span className="mod-nome">Planejador de Diárias</span>
          <span className="mod-desc">{descPlanejador}</span>
        </Link>
        <Link to="/relatorio" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--success-bg)', color: 'var(--success-fg)' }}><FileText /></span>
          <span className="mod-nome">Relatório de Diárias</span>
          <span className="mod-desc">Consolidado por militar</span>
        </Link>
        <Link to="/viaturas" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)' }}><Car /></span>
          <span className="mod-nome">Cadastro de Viaturas</span>
          <span className="mod-desc">{descViaturas}</span>
        </Link>
        <Link to="/pessoal" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--roxo-bg)', color: 'var(--roxo)' }}><Users /></span>
          <span className="mod-nome">Pessoal</span>
          <span className="mod-desc">{descPessoal}</span>
        </Link>
        <Link to="/usuarios" className="mod-card">
          <span className="mod-icone" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><User /></span>
          <span className="mod-nome">Usuários</span>
          <span className="mod-desc">{descUsuarios}</span>
        </Link>
      </div>
    </div>
  );
}
