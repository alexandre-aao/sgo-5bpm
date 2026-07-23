import { AlertTriangle, AlertCircle, Route, ClipboardX, Plus, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tables } from '../../../types/supabase';
import { calcularAlertasCartao, type CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { calcularAlertasEventosUrgentes } from './alertasEventos';

interface AlertaExibicao {
  mensagem: string;
  deCartao: boolean;
}

interface AlertasEPatrulhamentoProps {
  cartaoHoje: CartaoDetalhado | null;
  carregandoCartao: boolean;
  eventos: Tables<'eventos'>[];
  pessoal: Tables<'pessoal'>[];
}

export function AlertasEPatrulhamento({ cartaoHoje, carregandoCartao, eventos, pessoal }: AlertasEPatrulhamentoProps) {
  const alertasCartao: AlertaExibicao[] = cartaoHoje
    ? calcularAlertasCartao(cartaoHoje, pessoal).map((a) => ({ mensagem: a.mensagem, deCartao: true }))
    : [];
  const alertasEventos: AlertaExibicao[] = calcularAlertasEventosUrgentes(eventos).map((mensagem) => ({
    mensagem,
    deCartao: false,
  }));
  const todosAlertas = [...alertasCartao, ...alertasEventos];

  // Enquanto o cartão de hoje ainda está carregando, não afirma "nenhum cartão
  // lançado" — fica em branco (mesmo comportamento do app antigo: a tabela some
  // vazia até o primeiro fetch responder, sem mostrar o estado vazio cedo demais).
  const semViaturas = !carregandoCartao && (!cartaoHoje || cartaoHoje.viaturas.length === 0);

  return (
    <div className="dash-duo">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <AlertTriangle />
            <h2>Alertas Operacionais</h2>
          </div>
        </div>
        <div className="dash-alertas-lista">
          {todosAlertas.length === 0 ? (
            <div className="dash-alertas-vazio">
              <CheckCircle />
              <span>Nenhum alerta operacional no momento.</span>
            </div>
          ) : (
            todosAlertas.map((a, i) => {
              const cor = a.deCartao ? 'var(--warning-fg)' : 'var(--danger-fg)';
              const bg = a.deCartao ? 'var(--warning-bg)' : 'var(--danger-bg)';
              const Icone = a.deCartao ? AlertTriangle : AlertCircle;
              const titulo = a.deCartao ? 'Conflito no Cartão Programa de hoje' : 'Evento próximo com pendência';
              return (
                <div className="dash-alerta-item" key={i}>
                  <span className="dash-alerta-icone" style={{ background: bg, color: cor }}>
                    <Icone />
                  </span>
                  <div className="dash-alerta-texto">
                    <div className="dash-alerta-titulo">{titulo}</div>
                    <div className="dash-alerta-sub">{a.mensagem}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Route />
            <h2>Patrulhamento de Hoje</h2>
          </div>
        </div>

        {semViaturas && (
          <div className="cartao-empty-state" style={{ padding: '28px 24px' }}>
            <ClipboardX />
            <h3>Nenhum Cartão Programa lançado para hoje</h3>
            <p>Lance o cartão de patrulhamento para orientar as viaturas do dia.</p>
            <Link to="/cartao" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
              <Plus /> Lançar Cartão de Hoje
            </Link>
          </div>
        )}

        <div className="table-responsive">
          <table className="styled-table table-cards-mobile">
            <thead>
              <tr>
                <th>Viatura</th>
                <th>Setor</th>
                <th>Companhia</th>
                <th>Comandante</th>
              </tr>
            </thead>
            <tbody>
              {cartaoHoje?.viaturas.map((v) => (
                <tr key={v.id}>
                  <td className="card-title-cell" data-label="Viatura"><strong>{v.prefixo}</strong></td>
                  <td data-label="Setor">{v.setor}</td>
                  <td data-label="Companhia">{v.companhia || '-'}</td>
                  <td data-label="Comandante">{v.comandante || 'Não informado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-rodape-link">
          <Link to="/cartao" className="link-btn">Ver cartão completo</Link>
        </div>
      </div>
    </div>
  );
}
