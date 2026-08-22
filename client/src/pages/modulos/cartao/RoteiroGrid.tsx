import { useState } from 'react';
import { Layers3 } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import type { ItemPayload } from './useItensRoteiro';
import type { ResultadoAcao } from './useCartaoPrograma';
import { ATIVIDADES_CARTAO } from './constantes';
import { useToast } from '../../../context/useToast';
import { ViaturaRoteiroCard } from './ViaturaRoteiroCard';

interface RoteiroGridProps {
  viaturas: CartaoViatura[];
  dataCartao: string;
  eventos: Tables<'eventos'>[];
  podeEditar: boolean;
  onAdicionarItem: (vtrId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onExcluirItem: (vtrId: string, itemId: string) => Promise<ResultadoAcao>;
  onAtualizarItem: (vtrId: string, itemId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onDuplicarItem: (vtrId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onCopiarRoteiro: (vtrAlvoId: string, origemViaturaId: string, substituir: boolean) => Promise<ResultadoAcao>;
  onAplicarAtividade: (viaturasIds: string[], atividade: string) => Promise<ResultadoAcao>;
  onEditarViatura: (vtr: CartaoViatura) => void;
  onExcluirViatura: (vtr: CartaoViatura) => void;
  onDuplicarViatura?: (vtr: CartaoViatura) => void;
  onMoverViatura?: (vtr: CartaoViatura, direcao: -1 | 1) => void;
  onAtualizarPadrao?: (vtr: CartaoViatura) => void;
  onEmitirViatura?: (vtr: CartaoViatura) => void;
}

export function RoteiroGrid({
  viaturas, dataCartao, eventos, podeEditar, onAdicionarItem, onExcluirItem, onAtualizarItem,
  onDuplicarItem, onCopiarRoteiro, onAplicarAtividade, onEditarViatura, onExcluirViatura,
  onDuplicarViatura, onMoverViatura, onAtualizarPadrao, onEmitirViatura,
}: RoteiroGridProps) {
  const { toast } = useToast();
  const [atividadeLote, setAtividadeLote] = useState(ATIVIDADES_CARTAO[0]);
  const [viaturasLote, setViaturasLote] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);

  async function aplicarEmLote() {
    if (!viaturasLote.size) {
      toast('Selecione ao menos uma viatura para aplicar a atividade.', 'warning');
      return;
    }
    setAplicando(true);
    const resultado = await onAplicarAtividade([...viaturasLote], atividadeLote);
    setAplicando(false);
    toast(resultado.ok ? 'Atividade aplicada aos roteiros selecionados.' : resultado.mensagem, resultado.ok ? 'success' : 'danger');
    if (resultado.ok) setViaturasLote(new Set());
  }

  if (viaturas.length === 0) {
    return <p className="cartao-vazio-inline">Nenhuma viatura adicionada. Use o formulário abaixo para montar o roteiro.</p>;
  }

  return (
    <div className="cartao-vtr-grid">
      {podeEditar && (
        <div className="roteiro-acoes-lote">
          <div className="roteiro-lote-identidade"><Layers3 /><span><strong>Aplicar atividade a várias viaturas</strong><small>Selecione uma atividade e as viaturas desejadas.</small></span></div>
          <div className="roteiro-lote-controles">
            <label><span>Atividade</span><select value={atividadeLote} onChange={(e) => setAtividadeLote(e.target.value)}>
              {ATIVIDADES_CARTAO.map((atividade) => <option key={atividade}>{atividade}</option>)}
            </select></label>
            <label><span>Viaturas</span><select multiple size={Math.min(4, Math.max(2, viaturas.length))} value={[...viaturasLote]} aria-label="Viaturas para aplicar atividade" onChange={(e) => setViaturasLote(new Set([...e.target.selectedOptions].map((option) => option.value)))}>
              {viaturas.map((viatura) => <option key={viatura.id} value={viatura.id}>{viatura.prefixo || 'Sem prefixo'} — {viatura.setor || 'Setor não informado'}</option>)}
            </select></label>
            <button type="button" className={`btn btn-primary btn-sm${aplicando ? ' btn-carregando' : ''}`} disabled={aplicando} onClick={() => void aplicarEmLote()}>Aplicar</button>
          </div>
        </div>
      )}
      {viaturas.map((vtr) => (
        <ViaturaRoteiroCard
          key={vtr.id} vtr={vtr} todasViaturas={viaturas} dataCartao={dataCartao} eventos={eventos}
          podeEditar={podeEditar} onExcluirItem={onExcluirItem} onAdicionarItem={onAdicionarItem}
          onAtualizarItem={onAtualizarItem} onDuplicarItem={onDuplicarItem} onCopiarRoteiro={onCopiarRoteiro}
          onEditarViatura={onEditarViatura} onExcluirViatura={onExcluirViatura}
          indice={viaturas.indexOf(vtr)} totalViaturas={viaturas.length}
          onDuplicarViatura={onDuplicarViatura} onMoverViatura={onMoverViatura}
          onAtualizarPadrao={onAtualizarPadrao} onEmitirViatura={onEmitirViatura}
        />
      ))}
    </div>
  );
}
