import { useState } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { normalizarTexto } from '../lib/cartaoConflitos';
import { useModalA11y } from '../hooks/useModalA11y';

interface ModalConfirmarExclusaoForteProps {
  titulo: string;
  aviso: string;
  label: string;
  valorEsperado: string;
  onFechar: () => void;
  onConfirmar: () => void;
}

// Confirmação reforçada de exclusão (digitar um valor pra habilitar o botão).
// Reaproveitado pelo Cartão Programa (excluir cartão/template) e pela gaveta de
// Operação (excluir operação).
export function ModalConfirmarExclusaoForte({
  titulo,
  aviso,
  label,
  valorEsperado,
  onFechar,
  onConfirmar,
}: ModalConfirmarExclusaoForteProps) {
  const [valor, setValor] = useState('');
  const habilitado = normalizarTexto(valor) === normalizarTexto(valorEsperado) && !!valorEsperado;

  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const idAviso = `${idTitulo}-aviso`;
  const idCampo = `${idTitulo}-campo`;

  return (
    <div className="modal-overlay" {...propsOverlay} aria-describedby={idAviso}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><AlertTriangle /> {titulo}</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>

        {/* O aviso diz o que se perde na exclusão — vai destacado, não como texto apagado. */}
        <p className="aviso-destrutivo" id={idAviso}>
          <AlertTriangle aria-hidden="true" />
          <span>{aviso}</span>
        </p>

        <div className="form-group">
          <label htmlFor={idCampo}>{label}</label>
          <input
            type="text" id={idCampo} autoComplete="off" autoFocus
            placeholder={valorEsperado} value={valor} onChange={(e) => setValor(e.target.value)}
          />
        </div>

        <div className="form-actions form-actions-modal">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-danger" disabled={!habilitado} onClick={onConfirmar}>
            <Trash2 /> Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
