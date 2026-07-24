import { useState } from 'react';
import { Info, X, Plus, Trash2 } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../context/useToast';
import { slugBadge } from '../../../lib/slug';
import { ModalConfirmarExclusaoForte } from '../../../components/ModalConfirmarExclusaoForte';
import { useEventoDrawer, type ResultadoAcao } from './useEventoDrawer';
import { AlocacoesList } from './AlocacoesList';
import { FormAlocarModalidade } from './FormAlocarModalidade';

interface DrawerEventoProps {
  eventoId: string;
  onFechar: () => void;
  /** Chamado após qualquer alteração (alocar/remover/excluir) — o pai
   * recarrega o cache global (eventos/alocações). */
  onAlterado: () => void;
}

// Gaveta de detalhes do Evento (Detalhes + Modalidades Alocadas) — espelha
// #drawer + fetchEventDetails()/handleCreateAlocacao()/handleDeleteEvento() em
// public/app.js. "Editar Evento" (modal com todos os campos) fica pra Fase
// 4.1, junto com a tela cheia de Eventos — mesma decisão da gaveta de Operação.
export function DrawerEvento({ eventoId, onFechar, onAlterado }: DrawerEventoProps) {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const { evento, alocacoes, excluirEvento, adicionarAlocacao, removerAlocacao } = useEventoDrawer(eventoId);
  const podeEditar = usuario?.role === 'P3';

  const [formAlocacaoAberto, setFormAlocacaoAberto] = useState(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false);
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

  async function handleRemoverAlocacao(alocacao: Tables<'alocacoes'>) {
    if (!window.confirm('Deseja remover essa alocação de policiamento?')) return;
    await acaoComAlerta(() => removerAlocacao(alocacao.id), 'Alocação removida.');
  }

  async function handleConfirmarExclusao() {
    setExcluindo(true);
    const resultado = await excluirEvento();
    setExcluindo(false);
    if (resultado.ok) {
      toast('Evento excluído com sucesso.', 'success');
      onAlterado();
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  if (!evento) return null;

  const nomeEvento = evento.nome_evento;

  return (
    <>
      <div className="drawer open">
        <div className="drawer-overlay" onClick={onFechar} />
        <div className="drawer-content">
          <div className="drawer-header">
            <div className="drawer-title-area">
              <span className={`badge ${slugBadge(evento.tipo_evento)}`}>{evento.tipo_evento}</span>
              <h2>{nomeEvento}</h2>
            </div>
            <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
          </div>

          <div className="drawer-body">
            <div className="drawer-section">
              <h3><Info /> Detalhes do Ofício</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Ofício:</strong> <span>{evento.num_oficio || 'Sem ofício informado'}</span></div>
                <div className="detail-item"><strong>Número da OS:</strong> <span>{evento.num_os_manual || 'Não informado'}</span></div>
                <div className="detail-item"><strong>Número SEI:</strong> <span>{evento.num_sei || 'Não informado'}</span></div>
                <div className="detail-item"><strong>Demandante:</strong> <span>{evento.demandante || 'Não Informado'}</span></div>
                <div className="detail-item"><strong>Início:</strong> <span>{evento.data_inicio.split('-').reverse().join('/')}</span></div>
                <div className="detail-item"><strong>Término:</strong> <span>{evento.data_termino ? evento.data_termino.split('-').reverse().join('/') : '-'}</span></div>
                <div className="detail-item"><strong>Hora:</strong> <span>{evento.horario_inicio || 'Não informada'}</span></div>
                <div className="detail-item"><strong>Bairro:</strong> <span>{evento.bairro || '-'}</span></div>
                <div className="detail-item" style={{ gridColumn: 'span 2' }}><strong>Local/Itinerário:</strong> <span>{evento.local_itinerario}</span></div>
              </div>
            </div>

            <hr className="drawer-divider" />

            <div className="drawer-tab-content active">
              <div className="section-actions">
                <h4>Modalidades Alocadas</h4>
                {podeEditar && !formAlocacaoAberto && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFormAlocacaoAberto(true)}>
                    <Plus /> Alocar Modalidade
                  </button>
                )}
              </div>

              {formAlocacaoAberto && (
                <FormAlocarModalidade
                  onAdicionar={async (payload) => {
                    const resultado = await adicionarAlocacao(payload);
                    if (resultado.ok) onAlterado();
                    return resultado;
                  }}
                  onFechar={() => setFormAlocacaoAberto(false)}
                />
              )}

              <AlocacoesList alocacoes={alocacoes} podeEditar={podeEditar} onRemover={handleRemoverAlocacao} />
            </div>
          </div>

          <div className="drawer-footer">
            {podeEditar && (
              <button className="btn btn-danger" onClick={() => setModalExcluirAberto(true)}>
                <Trash2 /> Excluir Evento
              </button>
            )}
            <button className="btn btn-primary" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>

      {modalExcluirAberto && (
        <ModalConfirmarExclusaoForte
          titulo="Excluir Evento"
          aviso="Isso excluirá permanentemente o evento e todas as suas alocações de policiamento associadas."
          label={`Digite "${nomeEvento}" para confirmar`}
          valorEsperado={nomeEvento}
          onFechar={() => setModalExcluirAberto(false)}
          onConfirmar={() => { if (!excluindo) void handleConfirmarExclusao(); }}
        />
      )}
    </>
  );
}
