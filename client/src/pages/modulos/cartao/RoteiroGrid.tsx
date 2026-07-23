import { useState } from 'react';
import type { Tables } from '../../../types/supabase';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import type { ItemPayload } from './useItensRoteiro';
import type { ResultadoAcao } from './useCartaoPrograma';
import { ViaturaRoteiroCard } from './ViaturaRoteiroCard';

interface RoteiroGridProps {
  viaturas: CartaoViatura[];
  dataCartao: string;
  eventos: Tables<'eventos'>[];
  podeEditar: boolean;
  onAdicionarItem: (vtrId: string, payload: ItemPayload) => Promise<ResultadoAcao>;
  onExcluirItem: (vtrId: string, itemId: string) => Promise<ResultadoAcao>;
  onSalvarAtividade: (vtrId: string, itemId: string, atividade: string) => Promise<ResultadoAcao>;
  onEditarViatura: (vtr: CartaoViatura) => void;
  onExcluirViatura: (vtr: CartaoViatura) => void;
}

// Grid de cards por viatura (sub-aba "Roteiro") — espelha renderCartaoVtrGrid().
// Só um item por vez fica em edição de atividade (editandoAtividade global, como
// editandoAtividadeItem no app antigo).
export function RoteiroGrid({
  viaturas,
  dataCartao,
  eventos,
  podeEditar,
  onAdicionarItem,
  onExcluirItem,
  onSalvarAtividade,
  onEditarViatura,
  onExcluirViatura,
}: RoteiroGridProps) {
  const [editandoAtividade, setEditandoAtividade] = useState<{ vtrId: string; itemId: string } | null>(null);

  async function handleSalvarAtividade(vtrId: string, itemId: string, atividade: string) {
    const resultado = await onSalvarAtividade(vtrId, itemId, atividade);
    if (resultado.ok) setEditandoAtividade(null);
    return resultado;
  }

  if (viaturas.length === 0) {
    return (
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
        Nenhuma viatura adicionada. Use o formulário abaixo para montar o roteiro.
      </p>
    );
  }

  return (
    <div className="cartao-vtr-grid">
      {viaturas.map((vtr) => (
        <ViaturaRoteiroCard
          key={vtr.id}
          vtr={vtr}
          dataCartao={dataCartao}
          eventos={eventos}
          podeEditar={podeEditar}
          editandoAtividade={editandoAtividade}
          onIniciarEdicaoAtividade={(vtrId, itemId) => setEditandoAtividade({ vtrId, itemId })}
          onCancelarEdicaoAtividade={() => setEditandoAtividade(null)}
          onSalvarAtividade={handleSalvarAtividade}
          onExcluirItem={onExcluirItem}
          onAdicionarItem={onAdicionarItem}
          onEditarViatura={onEditarViatura}
          onExcluirViatura={onExcluirViatura}
        />
      ))}
    </div>
  );
}
