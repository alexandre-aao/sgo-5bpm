import { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarCheck, Check, Copy, CopyPlus, FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import type { CartaoItem, CartaoViatura } from '../../../lib/cartaoConflitos';
import { formatHoraCartao, itensSobrepostos } from '../../../lib/cartaoConflitos';
import { marcarViradaDeDia } from '../../../lib/janelaCartao';
import { useToast } from '../../../context/useToast';
import { ATIVIDADES_CARTAO, atividadeBadgeClass, categoriaBadgeClass } from './constantes';
import { eventosNoSetorDaVtr } from './eventosNoSetor';
import type { ItemPayload } from './useItensRoteiro';
import type { ResultadoAcao } from './useCartaoPrograma';
import { enderecoEvento } from '../../../lib/enderecoEvento';

interface ViaturaRoteiroCardProps {
  vtr: CartaoViatura;
  todasViaturas: CartaoViatura[];
  dataCartao: string;
  eventos: Tables<'eventos'>[];
  podeEditar: boolean;
  onExcluirItem: (vtrId: string, itemId: string) => Promise<ResultadoAcao>;
  onAdicionarItem: (vtrId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onAtualizarItem: (vtrId: string, itemId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onDuplicarItem: (vtrId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onCopiarRoteiro: (vtrAlvoId: string, origemViaturaId: string, substituir: boolean) => Promise<ResultadoAcao>;
  onEditarViatura: (vtr: CartaoViatura) => void;
  onExcluirViatura: (vtr: CartaoViatura) => void;
  indice: number;
  totalViaturas: number;
  onDuplicarViatura?: (vtr: CartaoViatura) => void;
  onMoverViatura?: (vtr: CartaoViatura, direcao: -1 | 1) => void;
  onAtualizarPadrao?: (vtr: CartaoViatura) => void;
  onEmitirViatura?: (vtr: CartaoViatura) => void;
}

const ITEM_VAZIO: ItemPayload = { inicio: '', fim: '', local: '', atividade: ATIVIDADES_CARTAO[0] };

function payloadDoItem(item: CartaoItem): ItemPayload {
  return { inicio: item.inicio, fim: item.fim || '', local: item.local, atividade: item.atividade };
}

export function ViaturaRoteiroCard({
  vtr, todasViaturas, dataCartao, eventos, podeEditar, onExcluirItem, onAdicionarItem,
  onAtualizarItem, onDuplicarItem, onCopiarRoteiro, onEditarViatura, onExcluirViatura,
  indice, totalViaturas, onDuplicarViatura, onMoverViatura, onAtualizarPadrao, onEmitirViatura,
}: ViaturaRoteiroCardProps) {
  const { toast } = useToast();
  const [novoItem, setNovoItem] = useState<ItemPayload>(ITEM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [itemEmEdicao, setItemEmEdicao] = useState<ItemPayload>(ITEM_VAZIO);
  const [origemRoteiro, setOrigemRoteiro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const eventosSetor = eventosNoSetorDaVtr(vtr.setor, dataCartao, eventos);
  const categoria = vtr.categoria || 'Ordinária';

  function validarItem(payload: ItemPayload, ignorarId?: string): boolean {
    if (!payload.inicio || !payload.local.trim()) {
      toast('Informe pelo menos o horário de início e o local.', 'warning');
      return false;
    }
    if (payload.fim) {
      const conflito = vtr.itens.find((item) => item.id !== ignorarId && itensSobrepostos(item, payload));
      if (conflito && !window.confirm(
        `O horário sobrepõe ${formatHoraCartao(conflito.inicio)} às ${formatHoraCartao(conflito.fim)} (${conflito.atividade}). Deseja salvar mesmo assim?`,
      )) return false;
    }
    return true;
  }

  async function incluirItem() {
    const payload = { ...novoItem, local: novoItem.local.trim() };
    if (!validarItem(payload)) return;
    setEnviando(true);
    const resultado = await onAdicionarItem(vtr.id, payload);
    setEnviando(false);
    toast(resultado.ok ? 'Item incluído; roteiro reordenado pela janela 07h–07h.' : resultado.mensagem, resultado.ok ? 'success' : 'danger');
    if (resultado.ok) setNovoItem(ITEM_VAZIO);
  }

  async function salvarItem(itemId: string) {
    const payload = { ...itemEmEdicao, local: itemEmEdicao.local.trim() };
    if (!validarItem(payload, itemId)) return;
    const resultado = await onAtualizarItem(vtr.id, itemId, payload);
    toast(resultado.ok ? 'Horário, local e atividade atualizados.' : resultado.mensagem, resultado.ok ? 'success' : 'danger');
    if (resultado.ok) setEditandoId(null);
  }

  async function duplicarItem(item: CartaoItem) {
    const resultado = await onDuplicarItem(vtr.id, payloadDoItem(item));
    toast(resultado.ok ? 'Item duplicado no roteiro.' : resultado.mensagem, resultado.ok ? 'success' : 'danger');
  }

  async function excluirItem(itemId: string) {
    if (!window.confirm('Excluir este item do roteiro?')) return;
    const resultado = await onExcluirItem(vtr.id, itemId);
    toast(resultado.ok ? 'Item removido do roteiro.' : resultado.mensagem, resultado.ok ? 'info' : 'danger');
  }

  async function copiarRoteiro(substituir: boolean) {
    if (!origemRoteiro) {
      toast('Selecione a viatura de origem.', 'warning');
      return;
    }
    if (substituir && vtr.itens.length && !window.confirm('Substituir todo o roteiro atual pelo roteiro da viatura escolhida?')) return;
    const resultado = await onCopiarRoteiro(vtr.id, origemRoteiro, substituir);
    toast(resultado.ok ? `Roteiro ${substituir ? 'substituído' : 'adicionado'} com sucesso.` : resultado.mensagem, resultado.ok ? 'success' : 'danger');
    if (resultado.ok) setOrigemRoteiro('');
  }

  return (
    <div className="cartao-vtr-card">
      <div className="cartao-vtr-header">
        <div>
          <h3>VTR {vtr.prefixo} — {vtr.setor}{' '}{categoria !== 'Ordinária' && <span className={`badge cartao-badge-categoria ${categoriaBadgeClass(categoria)}`}>{categoria}</span>}</h3>
          <div className="vtr-meta">
            <span><strong>Companhia:</strong> {vtr.companhia || 'Não informada'}</span>
            <span><strong>Comandante:</strong> {vtr.comandante || 'Não informado'}</span>
            {vtr.composicao && <span><strong>Composição:</strong> {vtr.composicao}</span>}
            {vtr.observacao && <span><strong>Obs:</strong> {vtr.observacao}</span>}
          </div>
        </div>
        <div className="acoes-linha cartao-vtr-header-acoes">
          {onEmitirViatura && <button className="btn-icon btn-sm" title="Emitir cartão desta viatura" aria-label="Emitir cartão desta viatura" onClick={() => onEmitirViatura(vtr)}><FileText /></button>}
          {podeEditar && onMoverViatura && <><button className="btn-icon btn-sm" title="Mover viatura para cima" aria-label="Mover viatura para cima" disabled={indice === 0} onClick={() => onMoverViatura(vtr, -1)}><ArrowUp /></button><button className="btn-icon btn-sm" title="Mover viatura para baixo" aria-label="Mover viatura para baixo" disabled={indice === totalViaturas - 1} onClick={() => onMoverViatura(vtr, 1)}><ArrowDown /></button></>}
          {podeEditar && onDuplicarViatura && <button className="btn-icon btn-sm" title="Duplicar viatura" aria-label="Duplicar viatura" onClick={() => onDuplicarViatura(vtr)}><Copy /></button>}
          {podeEditar && vtr.padrao_desatualizado && onAtualizarPadrao && <button className="btn-icon btn-sm" title="Atualizar para a versão atual do padrão" aria-label="Atualizar para a versão atual do padrão" onClick={() => onAtualizarPadrao(vtr)}><Check /></button>}
          {podeEditar && <><button className="btn-icon btn-sm" title="Editar viatura" aria-label="Editar viatura" onClick={() => onEditarViatura(vtr)}><Pencil /></button><button className="btn-icon btn-sm btn-icon-danger" title="Remover viatura" aria-label="Remover viatura" onClick={() => onExcluirViatura(vtr)}><Trash2 /></button></>}
        </div>
      </div>

      <div className="cartao-vtr-body">
        {eventosSetor.length > 0 && <div className="cartao-evento-alerta"><CalendarCheck /><div><strong>EVENTOS NO SETOR NESTA DATA</strong>{eventosSetor.map((evento) => <div className="cartao-evento-linha" key={evento.id}>• <strong>{evento.nome_evento}</strong> ({evento.tipo_evento}) — {evento.horario_inicio ? `às ${formatHoraCartao(evento.horario_inicio)}` : 'horário não informado'} — {enderecoEvento(evento)}</div>)}</div></div>}

        {podeEditar && todasViaturas.length > 1 && <div className="roteiro-copiar"><Copy /><span>Copiar roteiro de</span><select value={origemRoteiro} onChange={(e) => setOrigemRoteiro(e.target.value)}><option value="">Selecione...</option>{todasViaturas.filter((item) => item.id !== vtr.id).map((item) => <option key={item.id} value={item.id}>{item.prefixo}</option>)}</select><button type="button" className="btn btn-secondary btn-sm" onClick={() => void copiarRoteiro(false)}>Adicionar</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => void copiarRoteiro(true)}>Substituir</button></div>}

        <div className="roteiro-ordem-nota">A ordem é recalculada automaticamente pelo horário do turno: 07h00 até 06h59 do dia seguinte.</div>
        <table className="cartao-itens-table">
          <thead><tr><th>Horário</th><th>Local / Itinerário</th><th>Atividade</th><th></th></tr></thead>
          <tbody>
            {vtr.itens.length === 0 ? <tr className="cartao-item-vazio"><td colSpan={4} className="cartao-vazio-linha">Sem itens de roteiro.</td></tr> : marcarViradaDeDia(vtr.itens, dataCartao).map((entrada) => {
              if (entrada.tipo === 'virada') return <tr className="cartao-item-virada" key={`virada-${vtr.id}`}><td colSpan={4}>{entrada.rotulo}</td></tr>;
              const item = entrada.item;
              const editando = editandoId === item.id;
              return <tr className="cartao-item-linha" key={item.id}>
                <td className="cartao-item-hora">{editando ? <div className="roteiro-edicao-horas"><input type="time" value={itemEmEdicao.inicio} onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, inicio: e.target.value })} /><input type="time" value={itemEmEdicao.fim} onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, fim: e.target.value })} /></div> : <>{formatHoraCartao(item.inicio)}{item.fim ? ` às ${formatHoraCartao(item.fim)}` : ''}</>}</td>
                <td>{editando ? <input className="roteiro-edicao-local" value={itemEmEdicao.local} onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, local: e.target.value })} /> : item.local}</td>
                <td>{editando ? <select value={itemEmEdicao.atividade} onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, atividade: e.target.value })}>{ATIVIDADES_CARTAO.map((atividade) => <option key={atividade}>{atividade}</option>)}</select> : <span className={`badge ${atividadeBadgeClass(item.atividade)}`}>{item.atividade}</span>}</td>
                <td className="roteiro-item-acoes">{podeEditar && (editando ? <><button className="btn-icon btn-sm" title="Salvar item" aria-label="Salvar item" onClick={() => void salvarItem(item.id)}><Check /></button><button className="btn-icon btn-sm" title="Cancelar" aria-label="Cancelar" onClick={() => setEditandoId(null)}><X /></button></> : <><button className="btn-icon btn-sm" title="Editar horário, local e atividade" aria-label="Editar item" onClick={() => { setItemEmEdicao(payloadDoItem(item)); setEditandoId(item.id); }}><Pencil /></button><button className="btn-icon btn-sm" title="Duplicar item" aria-label="Duplicar item" onClick={() => void duplicarItem(item)}><CopyPlus /></button><button className="btn-icon btn-sm" title="Excluir item" aria-label="Excluir item" onClick={() => void excluirItem(item.id)}><X /></button></>)}</td>
              </tr>;
            })}
          </tbody>
        </table>

        {podeEditar && <div className="cartao-item-form">
          <div className="form-group"><label>Início *</label><input type="time" value={novoItem.inicio} onChange={(e) => setNovoItem({ ...novoItem, inicio: e.target.value })} /></div>
          <div className="form-group"><label>Fim</label><input type="time" value={novoItem.fim} onChange={(e) => setNovoItem({ ...novoItem, fim: e.target.value })} /></div>
          <div className="form-group crescer"><label>Local / Itinerário *</label><input type="text" value={novoItem.local} onChange={(e) => setNovoItem({ ...novoItem, local: e.target.value })} /></div>
          <div className="form-group"><label>Atividade</label><select value={novoItem.atividade} onChange={(e) => setNovoItem({ ...novoItem, atividade: e.target.value })}>{ATIVIDADES_CARTAO.map((atividade) => <option key={atividade}>{atividade}</option>)}</select></div>
          <button className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`} disabled={enviando} onClick={() => void incluirItem()}><Plus /> Incluir</button>
        </div>}
      </div>
    </div>
  );
}
