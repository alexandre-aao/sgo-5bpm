import { useState } from 'react';
import { Info, X, UserPlus, Trash2, CheckCircle } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { useToast } from '../../../context/useToast';
import { ModalConfirmarExclusaoForte } from '../../../components/ModalConfirmarExclusaoForte';
import { useOperacaoDrawer, type ResultadoAcao } from './useOperacaoDrawer';
import { BadgeSituacao } from './OperacoesDoMes';
import { FormEscalarMilitar } from './FormEscalarMilitar';
import { EscalasList } from './EscalasList';

const ROTULOS_RECORRENCIA: Record<string, string> = {
  diaria: 'Diária',
  fim_de_semana: 'Fim de Semana',
  dia_unico: 'Dia Único',
};

interface DrawerOperacaoProps {
  operacaoId: string;
  pessoal: Tables<'pessoal'>[];
  operacoesTodas: Tables<'operacoes'>[];
  escalasTodas: Tables<'escalas'>[];
  cotaMensal: number;
  onFechar: () => void;
  /** Chamado após qualquer alteração (marcar executada, escalar, remover
   * escala) — o pai recarrega o Planejador (KPIs/tabela/calendário). */
  onAlterado: () => void;
}

// Gaveta de detalhes da Operação (Detalhes + Efetivo Escalado) — espelha
// #drawer-op + fetchOperacaoDetails()/handleMarcarOperacaoExecutada()/
// handleDeleteOperacao() em public/app.js.
export function DrawerOperacao({
  operacaoId,
  pessoal,
  operacoesTodas,
  escalasTodas,
  cotaMensal,
  onFechar,
  onAlterado,
}: DrawerOperacaoProps) {
  const { toast } = useToast();
  const { operacao, escalas, marcarExecutada, excluirOperacao, adicionarEscala, removerEscala } = useOperacaoDrawer(operacaoId);

  const [formEscalaAberto, setFormEscalaAberto] = useState(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false);
  const [marcandoExecutada, setMarcandoExecutada] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function acaoComAlerta(acao: () => Promise<ResultadoAcao>, mensagemSucesso: string) {
    const resultado = await acao();
    if (resultado.ok) {
      toast(mensagemSucesso, 'success');
      onAlterado();
    } else {
      toast(resultado.mensagem, 'danger');
    }
    return resultado;
  }

  async function handleMarcarExecutada() {
    setMarcandoExecutada(true);
    await acaoComAlerta(marcarExecutada, 'Operação marcada como Executada.');
    setMarcandoExecutada(false);
  }

  async function handleRemoverEscala(escala: Tables<'escalas'>) {
    if (!window.confirm(`Remover ${escala.militar_nome} da escala desta operação?`)) return;
    await acaoComAlerta(() => removerEscala(escala.id), 'Militar removido da escala.');
  }

  async function handleConfirmarExclusao() {
    setExcluindo(true);
    const resultado = await excluirOperacao();
    setExcluindo(false);
    if (resultado.ok) {
      toast('Operação excluída com sucesso.', 'success');
      onAlterado();
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  if (!operacao) return null;

  const escalasOp = escalas.filter((s) => s.operacao_id === operacaoId);
  const totalDiariasOp = escalasOp.reduce((soma, s) => soma + (s.total_diarias || 0), 0);
  const nomeOp = operacao.nome_operacao;
  const dataBr = operacao.data_inicio.split('-').reverse().join('/');

  return (
    <>
      <div className="drawer open">
        <div className="drawer-overlay" onClick={onFechar} />
        <div className="drawer-content">
          <div className="drawer-header">
            <div className="drawer-title-area">
              <BadgeSituacao situacao={operacao.situacao} />
              <h2>{nomeOp}</h2>
            </div>
            <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
          </div>

          <div className="drawer-body">
            <div className="drawer-section">
              <h3><Info /> Detalhes da Operação</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Tipo:</strong> <span>{operacao.tipo_operacao || '-'}</span></div>
                <div className="detail-item"><strong>Recorrência:</strong> <span>{operacao.tipo_recorrencia ? ROTULOS_RECORRENCIA[operacao.tipo_recorrencia] : '—'}</span></div>
                <div className="detail-item"><strong>Ofício:</strong> <span>{operacao.num_oficio || 'Sem ofício informado'}</span></div>
                <div className="detail-item"><strong>Número da OS:</strong> <span>{operacao.num_os_manual || 'Não informado'}</span></div>
                <div className="detail-item"><strong>Número SEI:</strong> <span>{operacao.num_sei || 'Não informado'}</span></div>
                <div className="detail-item"><strong>Demandante:</strong> <span>{operacao.demandante || 'Não Informado'}</span></div>
                <div className="detail-item"><strong>Início:</strong> <span>{dataBr}</span></div>
                <div className="detail-item"><strong>Término:</strong> <span>{operacao.data_termino ? operacao.data_termino.split('-').reverse().join('/') : '-'}</span></div>
                <div className="detail-item"><strong>Hora:</strong> <span>{operacao.horario_inicio || 'Não informada'}</span></div>
                <div className="detail-item"><strong>Bairro:</strong> <span>{operacao.bairro || '-'}</span></div>
                <div className="detail-item"><strong>Diárias Estimadas:</strong> <span>{operacao.qtd_diarias_estimada || 0} diária(s)</span></div>
                <div className="detail-item" style={{ gridColumn: 'span 2' }}><strong>Local/Itinerário:</strong> <span>{operacao.local_itinerario || '-'}</span></div>
              </div>
            </div>

            <hr className="drawer-divider" />

            <div className="drawer-tab-content active">
              <div className="section-actions">
                <h4>Efetivo Escalado (Diárias)</h4>
                {!formEscalaAberto && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFormEscalaAberto(true)}>
                    <UserPlus /> Escalar Militar
                  </button>
                )}
              </div>

              {formEscalaAberto && (
                <FormEscalarMilitar
                  operacao={operacao}
                  pessoal={pessoal}
                  operacoesTodas={operacoesTodas}
                  escalasTodas={escalasTodas}
                  cotaMensal={cotaMensal}
                  onAdicionar={async (payload) => {
                    const resultado = await adicionarEscala(payload);
                    if (resultado.ok) onAlterado();
                    return resultado;
                  }}
                  onFechar={() => setFormEscalaAberto(false)}
                />
              )}

              <EscalasList escalas={escalasOp} onRemover={handleRemoverEscala} />
            </div>
          </div>

          <div className="drawer-footer">
            <button className="btn btn-danger" onClick={() => setModalExcluirAberto(true)}>
              <Trash2 /> Excluir Operação
            </button>
            {operacao.situacao !== 'Executada' && (
              <button
                className={`btn btn-success${marcandoExecutada ? ' btn-carregando' : ''}`} disabled={marcandoExecutada}
                onClick={handleMarcarExecutada}
              >
                <CheckCircle /> Marcar como Executada
              </button>
            )}
            <button className="btn btn-primary" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>

      {modalExcluirAberto && (
        <ModalConfirmarExclusaoForte
          titulo="Excluir Operação"
          aviso={
            escalasOp.length > 0
              ? `Isso excluirá permanentemente a operação e todo o efetivo escalado nela. Há ${escalasOp.length} militar(es) escalado(s), somando ${totalDiariasOp} diária(s) — tudo isso será perdido.`
              : 'Isso excluirá permanentemente a operação e todo o efetivo escalado nela.'
          }
          label={`Digite "${nomeOp}" para confirmar`}
          valorEsperado={nomeOp}
          onFechar={() => setModalExcluirAberto(false)}
          onConfirmar={() => { if (!excluindo) void handleConfirmarExclusao(); }}
        />
      )}
    </>
  );
}
