import { useState } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import { normalizarTexto } from '../lib/cartaoConflitos';

interface ModalConfirmarExclusaoForteProps {
  titulo: string;
  aviso: string;
  label: string;
  valorEsperado: string;
  onFechar: () => void;
  onConfirmar: () => void;
}

// Confirmação reforçada de exclusão (digitar um valor pra habilitar o botão) —
// espelha abrirConfirmacaoExclusaoForte() em public/app.js. Reaproveitado pelo
// Cartão Programa (excluir cartão/template) e pela gaveta de Operação (excluir
// operação).
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

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><AlertTriangle /> {titulo}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{aviso}</p>
        <div className="form-group">
          <label htmlFor="confirmar-exclusao-input">{label}</label>
          <input
            type="text" id="confirmar-exclusao-input" autoComplete="off" autoFocus
            placeholder={valorEsperado} value={valor} onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-danger" disabled={!habilitado} onClick={onConfirmar}>
            <Trash2 /> Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
