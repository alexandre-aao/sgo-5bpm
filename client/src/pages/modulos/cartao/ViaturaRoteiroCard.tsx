import { useState } from 'react';
import { Pencil, Trash2, Check, X, Plus, CalendarCheck } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import { formatHoraCartao, itensSobrepostos } from '../../../lib/cartaoConflitos';
import { useToast } from '../../../context/useToast';
import { ATIVIDADES_CARTAO, atividadeBadgeClass, categoriaBadgeClass } from './constantes';
import { eventosNoSetorDaVtr } from './eventosNoSetor';
import type { ItemPayload } from './useItensRoteiro';
import type { ResultadoAcao } from './useCartaoPrograma';

interface EdicaoAtividade {
  vtrId: string;
  itemId: string;
}

interface ViaturaRoteiroCardProps {
  vtr: CartaoViatura;
  dataCartao: string;
  eventos: Tables<'eventos'>[];
  podeEditar: boolean;
  editandoAtividade: EdicaoAtividade | null;
  onIniciarEdicaoAtividade: (vtrId: string, itemId: string) => void;
  onCancelarEdicaoAtividade: () => void;
  onSalvarAtividade: (vtrId: string, itemId: string, atividade: string) => Promise<ResultadoAcao>;
  onExcluirItem: (vtrId: string, itemId: string) => Promise<ResultadoAcao>;
  onAdicionarItem: (vtrId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onEditarViatura: (vtr: CartaoViatura) => void;
  onExcluirViatura: (vtr: CartaoViatura) => void;
}

const ITEM_VAZIO: ItemPayload = { inicio: '', fim: '', local: '', atividade: ATIVIDADES_CARTAO[0] };

// Um card por viatura, com a tabela de itens de roteiro + form de inclusão —
// espelha o trecho de renderCartaoVtrGrid() em public/app.js.
export function ViaturaRoteiroCard({
  vtr,
  dataCartao,
  eventos,
  podeEditar,
  editandoAtividade,
  onIniciarEdicaoAtividade,
  onCancelarEdicaoAtividade,
  onSalvarAtividade,
  onExcluirItem,
  onAdicionarItem,
  onEditarViatura,
  onExcluirViatura,
}: ViaturaRoteiroCardProps) {
  const { toast } = useToast();
  const [novoItem, setNovoItem] = useState<ItemPayload>(ITEM_VAZIO);
  const [atividadeEmEdicao, setAtividadeEmEdicao] = useState('');
  const [enviando, setEnviando] = useState(false);

  const eventosSetor = eventosNoSetorDaVtr(vtr.setor, dataCartao, eventos);
  const categoria = vtr.categoria || 'Ordinária';

  async function handleIncluirItem() {
    const inicio = novoItem.inicio;
    const fim = novoItem.fim;
    const local = novoItem.local.trim();
    const atividade = novoItem.atividade;

    if (!inicio || !local) {
      toast('Informe pelo menos o horário de início e o local.', 'warning');
      return;
    }

    // Sobreposição de horário com itens já lançados nesta mesma viatura — mesmo
    // aviso não-bloqueante de handleAddCartaoItem() (confirm nativo).
    if (fim) {
      const conflito = vtr.itens.find((item) => itensSobrepostos(item, { inicio, fim }));
      if (conflito) {
        const confirmar = window.confirm(
          `Atenção: este horário (${formatHoraCartao(inicio)} às ${formatHoraCartao(fim)}) sobrepõe o item já lançado ` +
            `"${formatHoraCartao(conflito.inicio)} às ${formatHoraCartao(conflito.fim)}" (${conflito.atividade}) nesta viatura.\n\n` +
            `Deseja incluir mesmo assim?`,
        );
        if (!confirmar) return;
      }
    }

    setEnviando(true);
    const resultado = await onAdicionarItem(vtr.id, { inicio, fim, local, atividade });
    setEnviando(false);
    if (resultado.ok) {
      toast('Item incluído no roteiro.', 'success');
      setNovoItem(ITEM_VAZIO);
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleExcluirItem(itemId: string) {
    const resultado = await onExcluirItem(vtr.id, itemId);
    if (resultado.ok) {
      toast('Item removido do roteiro.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleSalvarAtividade(itemId: string) {
    const resultado = await onSalvarAtividade(vtr.id, itemId, atividadeEmEdicao);
    if (resultado.ok) {
      toast('Atividade atualizada.', 'success');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="cartao-vtr-card">
      <div className="cartao-vtr-header">
        <div>
          <h3>
            VTR {vtr.prefixo} — {vtr.setor}{' '}
            {categoria !== 'Ordinária' && (
              <span className={`badge cartao-badge-categoria ${categoriaBadgeClass(categoria)}`}>{categoria}</span>
            )}
          </h3>
          <div className="vtr-meta">
            <span><strong>Companhia:</strong> {vtr.companhia || 'Não informada'}</span>
            <span><strong>Comandante:</strong> {vtr.comandante || 'Não informado'}</span>
            {vtr.observacao && <span><strong>Obs:</strong> {vtr.observacao}</span>}
          </div>
        </div>
        {podeEditar && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-icon btn-sm" title="Editar viatura" aria-label="Editar viatura" onClick={() => onEditarViatura(vtr)}>
              <Pencil style={{ width: 14, height: 14 }} />
            </button>
            <button className="btn-icon btn-sm" title="Remover viatura" aria-label="Remover viatura" onClick={() => onExcluirViatura(vtr)}>
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
      </div>

      <div className="cartao-vtr-body">
        {eventosSetor.length > 0 && (
          <div className="cartao-evento-alerta">
            <CalendarCheck />
            <div>
              <strong>OBSERVAÇÃO — EVENTO NO SETOR NESTA DATA:</strong>
              {eventosSetor.map((evt) => (
                <div className="cartao-evento-linha" key={evt.id}>
                  • <strong>{evt.nome_evento}</strong> ({evt.tipo_evento})
                  {' — '}{evt.horario_inicio ? `às ${formatHoraCartao(evt.horario_inicio)}` : 'horário não informado'}
                  {' — '}{evt.local_itinerario}
                  {evt.num_os_manual && <><br />&nbsp;&nbsp;{evt.num_os_manual}</>}
                </div>
              ))}
            </div>
          </div>
        )}

        <table className="cartao-itens-table">
          <thead>
            <tr><th>Horário</th><th>Local / Itinerário</th><th>Atividade</th><th></th></tr>
          </thead>
          <tbody>
            {vtr.itens.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>Sem itens de roteiro.</td></tr>
            ) : (
              vtr.itens.map((item) => {
                const emEdicao = editandoAtividade?.vtrId === vtr.id && editandoAtividade?.itemId === item.id;
                return (
                  <tr key={item.id}>
                    <td className="cartao-item-hora">{formatHoraCartao(item.inicio)}{item.fim ? ` às ${formatHoraCartao(item.fim)}` : ''}</td>
                    <td>{item.local}</td>
                    <td>
                      {emEdicao ? (
                        <select
                          className="cartao-edit-atividade-select"
                          defaultValue={item.atividade}
                          onChange={(e) => setAtividadeEmEdicao(e.target.value)}
                        >
                          {ATIVIDADES_CARTAO.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      ) : (
                        <span className={`badge ${atividadeBadgeClass(item.atividade)}`}>{item.atividade}</span>
                      )}
                    </td>
                    <td style={{ width: 64, whiteSpace: 'nowrap' }}>
                      {!podeEditar ? null : emEdicao ? (
                        <>
                          <button className="btn-icon btn-sm" title="Salvar atividade" aria-label="Salvar atividade" onClick={() => handleSalvarAtividade(item.id)}>
                            <Check style={{ width: 12, height: 12 }} />
                          </button>
                          <button className="btn-icon btn-sm" title="Cancelar" aria-label="Cancelar" onClick={onCancelarEdicaoAtividade}>
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn-icon btn-sm" title="Mudar atividade" aria-label="Mudar atividade"
                            onClick={() => { setAtividadeEmEdicao(item.atividade); onIniciarEdicaoAtividade(vtr.id, item.id); }}
                          >
                            <Pencil style={{ width: 12, height: 12 }} />
                          </button>
                          <button className="btn-icon btn-sm" title="Remover item" aria-label="Remover item" onClick={() => handleExcluirItem(item.id)}>
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {podeEditar && (
          <div className="cartao-item-form">
            <div className="form-group">
              <label>Início *</label>
              <input type="time" value={novoItem.inicio} onChange={(e) => setNovoItem({ ...novoItem, inicio: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Fim</label>
              <input type="time" value={novoItem.fim} onChange={(e) => setNovoItem({ ...novoItem, fim: e.target.value })} />
            </div>
            <div className="form-group" style={{ flexGrow: 1 }}>
              <label>Local / Itinerário *</label>
              <input
                type="text" placeholder="Ex: Rot. Eng. Roberto Freire c/ Via Costeira"
                value={novoItem.local} onChange={(e) => setNovoItem({ ...novoItem, local: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Atividade</label>
              <select value={novoItem.atividade} onChange={(e) => setNovoItem({ ...novoItem, atividade: e.target.value })}>
                {ATIVIDADES_CARTAO.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <button className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`} disabled={enviando} onClick={handleIncluirItem}>
              <Plus style={{ width: 12, height: 12 }} /> Incluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
