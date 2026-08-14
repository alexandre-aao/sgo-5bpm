import { useState, type FormEvent } from 'react';
import { KeyRound, X } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import type { ResultadoAcao, UsuarioPublico } from './useUsuariosCrud';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface ModalResetSenhaProps {
  usuario: UsuarioPublico;
  onFechar: () => void;
  onResetar: (login: string, senhaNova: string, exigirTrocaSenha?: boolean) => Promise<ResultadoAcao>;
}

export function ModalResetSenha({ usuario, onFechar, onResetar }: ModalResetSenhaProps) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exigirTroca, setExigirTroca] = useState(true);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await onResetar(usuario.usuario, senha, exigirTroca);
    setEnviando(false);
    if (resultado.ok) {
      toast(`Senha de ${usuario.usuario} redefinida com sucesso.`, 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><KeyRound /> Resetar Senha</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <p className="texto-auxiliar margem-inferior-1">
            Definindo nova senha para <strong>{usuario.nome}</strong>. O usuário precisará usar esta nova senha no próximo login.
          </p>
          <div className="form-group">
            <label htmlFor="reset-senha-nova">Nova Senha</label>
            <input
              type="password" id="reset-senha-nova" required minLength={3} placeholder="Mínimo 3 caracteres" autoComplete="new-password"
              value={senha} onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <label className="checkbox-inline"><input type="checkbox" checked={exigirTroca} onChange={(e) => setExigirTroca(e.target.checked)} /> Exigir troca no próximo acesso</label>
          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <KeyRound /> Redefinir Senha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
