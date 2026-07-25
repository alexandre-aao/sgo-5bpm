import { useState } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { formatarPrazoCartao } from '../../../lib/prazoCartao';

interface ModalExcluirCartaoProps {
  titulo: string;
  aviso: string;
  /** Valor que o operador precisa digitar (data do cartão, nome do modelo…). */
  valorEsperado: string;
  /** true quando o prazo de 08h do dia seguinte já passou — aí a justificativa é
   * obrigatória (e só a P3 chega até aqui). */
  foraDoPrazo: boolean;
  dataCartao: string | null;
  onFechar: () => void;
  onConfirmar: (justificativa: string) => void;
}

/** Exclusão do Cartão Programa. É sempre exclusão LÓGICA no servidor — o registro
 * continua no banco com quem excluiu, quando e por quê. Variante do
 * ModalConfirmarExclusaoForte com o campo de justificativa exigido fora do prazo;
 * não dá pra usar o componente compartilhado direto porque ele não tem esse campo. */
export function ModalExcluirCartao({
  titulo,
  aviso,
  valorEsperado,
  foraDoPrazo,
  dataCartao,
  onFechar,
  onConfirmar,
}: ModalExcluirCartaoProps) {
  const [valor, setValor] = useState('');
  const [justificativa, setJustificativa] = useState('');

  const confirmacaoOk = normalizarTexto(valor) === normalizarTexto(valorEsperado) && !!valorEsperado;
  // Mesmo mínimo do servidor (10 caracteres) — evita mandar request que voltaria 400.
  const justificativaOk = !foraDoPrazo || justificativa.trim().length >= 10;

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><AlertTriangle /> {titulo}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{aviso}</p>

        {foraDoPrazo && (
          <div className="cartao-prazo-aviso" role="alert">
            <AlertTriangle />
            <span>
              O prazo de edição encerrou em <strong>{formatarPrazoCartao(dataCartao)}</strong>. A exclusão fora do
              prazo é privativa da P3 e exige justificativa registrada.
            </span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="confirmar-exclusao-input">Digite &quot;{valorEsperado}&quot; para confirmar</label>
          <input
            type="text" id="confirmar-exclusao-input" autoComplete="off" autoFocus
            placeholder={valorEsperado} value={valor} onChange={(e) => setValor(e.target.value)}
          />
        </div>

        {foraDoPrazo && (
          <div className="form-group">
            <label htmlFor="exclusao-justificativa">Justificativa * (mínimo 10 caracteres)</label>
            <textarea
              id="exclusao-justificativa" rows={3}
              placeholder="Ex: Cartão lançado em duplicidade; roteiro correto está no cartão de 26/07."
              value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
            />
          </div>
        )}

        <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button
            type="button" className="btn btn-danger"
            disabled={!confirmacaoOk || !justificativaOk}
            onClick={() => onConfirmar(justificativa.trim())}
          >
            <Trash2 /> Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
