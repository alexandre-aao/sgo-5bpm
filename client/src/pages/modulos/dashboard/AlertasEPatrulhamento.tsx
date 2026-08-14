import { AlertTriangle, AlertCircle, Route, ClipboardX, Plus, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tables } from '../../../types/supabase';
import { calcularAlertasCartao, type CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { calcularAlertasEventosUrgentes } from '../../../lib/alertasEventos';
import type { DashboardResumo } from './useDashboardResumo';

interface AlertaExibicao {
  titulo: string;
  mensagem: string;
  deCartao: boolean;
  /** Para onde a pendência leva. Conflito vai ao Cartão de hoje; evento sem OS/SEI
   *  abre a gaveta daquele evento em Listar Eventos. */
  destino: string;
}

interface AlertasEPatrulhamentoProps {
  cartaoHoje: CartaoDetalhado | null;
  carregandoCartao: boolean;
  eventos: Tables<'eventos'>[];
  pessoal: Tables<'pessoal'>[];
  operacional: DashboardResumo['operacional'] | null;
}

export function AlertasEPatrulhamento({ cartaoHoje, carregandoCartao, eventos, pessoal, operacional }: AlertasEPatrulhamentoProps) {
  const alertasCartao: AlertaExibicao[] = cartaoHoje
    ? calcularAlertasCartao(cartaoHoje, pessoal).map((a) => ({ titulo: 'Conflito no Cartão Programa de hoje', mensagem: a.mensagem, deCartao: true, destino: '/cartao' }))
    : [];
  const alertasEventos: AlertaExibicao[] = calcularAlertasEventosUrgentes(eventos).map((a) => ({
    titulo: 'Evento próximo com pendência',
    mensagem: a.mensagem,
    deCartao: false,
    destino: `/eventos?evento=${encodeURIComponent(a.eventoId)}`,
  }));
  const alertasOperacionais: AlertaExibicao[] = operacional ? [
    ...(!operacional.cartao_hoje_pronto ? [{ titulo: 'Preparação do serviço', mensagem: 'O Cartão Ordinário de hoje ainda não está pronto.', deCartao: true, destino: `/cartao?data=${operacional.hoje}` }] : []),
    ...(!operacional.cartao_amanha_preparado ? [{ titulo: 'Preparação do serviço', mensagem: 'O cartão de amanhã ainda não foi preparado.', deCartao: true, destino: `/cartao?data=${operacional.amanha}` }] : []),
    ...(!operacional.modelo_ordinario_ativo ? [{ titulo: 'Modelo Ordinário', mensagem: 'Nenhum Modelo Ordinário está definido como padrão ativo.', deCartao: true, destino: '/cartao?modelos=1' }] : []),
    ...(operacional.modelo_ordinario_com_rascunho ? [{ titulo: 'Publicação pendente', mensagem: 'O Modelo Ordinário ativo possui alterações ainda não publicadas.', deCartao: true, destino: '/cartao?modelos=1' }] : []),
    ...operacional.operacoes_diaria_pendente.map((op) => ({ titulo: 'Operação com diária pendente', mensagem: `${op.nome_operacao}: diária ainda não definida.`, deCartao: false, destino: `/operacoes?operacao=${op.id}` })),
  ] : [];
  const todosAlertas = [...alertasOperacionais, ...alertasCartao, ...alertasEventos];

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
            <h2>Pendências</h2>
          </div>
        </div>
        <div className="dash-alertas-lista">
          {todosAlertas.length === 0 ? (
            <div className="dash-alertas-vazio">
              <CheckCircle />
              <span>Nenhuma pendência no momento.</span>
            </div>
          ) : (
            todosAlertas.map((a, i) => {
              const classesIcone = a.deCartao ? 'fundo-warning tom-warning' : 'fundo-danger tom-danger';
              const Icone = a.deCartao ? AlertTriangle : AlertCircle;
              return (
                // A pendência leva ao lugar de resolvê-la: antes era leitura pura
                // e obrigava o usuário a navegar até o dado por conta própria.
                <Link className="dash-alerta-item dash-alerta-clicavel" to={a.destino} key={i}>
                  <span className={`dash-alerta-icone ${classesIcone}`}>
                    <Icone />
                  </span>
                  <div className="dash-alerta-texto">
                    <div className="dash-alerta-titulo">{a.titulo}</div>
                    <div className="dash-alerta-sub">{a.mensagem}</div>
                  </div>
                </Link>
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
          <div className="cartao-empty-state cartao-empty-state-compacto">
            <ClipboardX />
            <h3>Nenhum Cartão Programa lançado para hoje</h3>
            <p>Lance o cartão de patrulhamento para orientar as viaturas do dia.</p>
            <Link to="/cartao" className="btn btn-primary btn-sm margem-topo-3">
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
