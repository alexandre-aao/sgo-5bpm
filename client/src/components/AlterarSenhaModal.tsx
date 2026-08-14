import { useState, type FormEvent } from 'react';
import { KeyRound, X, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useModalA11y } from '../hooks/useModalA11y';

interface AlterarSenhaModalProps {
  obrigatoria: boolean;
  onFechar: () => void;
}

export function AlterarSenhaModal({ obrigatoria, onFechar }: AlterarSenhaModalProps) {
  const { atualizarUsuario } = useAuth();
  const { toast } = useToast();
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(obrigatoria ? () => undefined : onFechar);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senhaNova.length < 3) { toast('A nova senha deve ter pelo menos 3 caracteres.', 'warning'); return; }
    if (senhaNova !== confirmacao) { toast('A confirmação da nova senha não confere.', 'warning'); return; }
    setEnviando(true);
    try {
      const res = await apiFetch('/api/alterar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }) });
      const corpo = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast(corpo.error || 'Não foi possível alterar a senha.', 'danger'); return; }
      atualizarUsuario({ exigir_troca_senha: false });
      toast('Senha alterada com sucesso.', 'success');
      onFechar();
    } catch (erro) {
      console.error('Erro ao alterar senha:', erro);
      toast('Falha na comunicação com o servidor.', 'danger');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header"><h3 id={idTitulo}><KeyRound /> {obrigatoria ? 'Cadastre uma nova senha' : 'Minha Conta — Alterar senha'}</h3>{!obrigatoria && <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>}</div>
        {obrigatoria && <p className="texto-auxiliar margem-inferior-1">A senha foi redefinida pelo P3. Cadastre uma nova senha para continuar usando o sistema.</p>}
        <form onSubmit={enviar}>
          <div className="form-group"><label htmlFor="minha-conta-senha-atual">Senha atual</label><input id="minha-conta-senha-atual" type="password" required minLength={3} autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="minha-conta-senha-nova">Nova senha</label><input id="minha-conta-senha-nova" type="password" required minLength={3} autoComplete="new-password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="minha-conta-senha-confirmacao">Confirmar nova senha</label><input id="minha-conta-senha-confirmacao" type="password" required minLength={3} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} /></div>
          <div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar} disabled={obrigatoria}>Cancelar</button><button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}><Check /> Salvar nova senha</button></div>
        </form>
      </div>
    </div>
  );
}
