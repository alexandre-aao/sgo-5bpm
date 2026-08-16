import { useState, type FormEvent } from 'react';
import { Pencil, UserPlus, X, Check } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import type { EditarUsuarioPayload, NovoUsuarioPayload, ResultadoAcao, UsuarioPublico } from './useUsuariosCrud';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface ModalUsuarioProps {
  usuario?: UsuarioPublico | null;
  onFechar: () => void;
  onSalvar: (payload: NovoUsuarioPayload | EditarUsuarioPayload) => Promise<ResultadoAcao>;
}

export function ModalUsuario({ usuario, onFechar, onSalvar }: ModalUsuarioProps) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const modoEdicao = !!usuario;
  const [login, setLogin] = useState(usuario?.usuario ?? '');
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [role, setRole] = useState(usuario?.role ?? 'P3');
  const [unidade, setUnidade] = useState(usuario?.unidade ?? '');
  const [ativo, setAtivo] = useState(usuario?.ativo !== false);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: NovoUsuarioPayload | EditarUsuarioPayload = modoEdicao
      ? { nome: nome.trim(), role, ativo, unidade: role === 'Sargenteante' ? unidade : null }
      : { usuario: login.trim(), nome: nome.trim(), role, senha, unidade: role === 'Sargenteante' ? unidade : null };

    setEnviando(true);
    const resultado = await onSalvar(payload);
    setEnviando(false);
    if (resultado.ok) {
      toast(modoEdicao ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}>{modoEdicao ? <Pencil /> : <UserPlus />} {modoEdicao ? 'Editar Usuário' : 'Novo Usuário'}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="usr-login">Login</label>
            <input
              type="text" id="usr-login" required placeholder="Ex: oficial2" autoComplete="off"
              value={login} disabled={modoEdicao} onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="usr-nome">Nome de Exibição</label>
            <input
              type="text" id="usr-nome" required placeholder="Ex: Oficial de Dia - Turma B"
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="usr-role">Perfil</label>
            <select id="usr-role" required value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="P3">P3 (Administrador)</option>
              <option value="Adjunto">Adjunto</option>
              <option value="Oficial">Oficial</option>
              <option value="Sargenteante">Sargenteante</option>
            </select>
          </div>
          {role === 'Sargenteante' && (
            <div className="form-group">
              <label htmlFor="usr-unidade">Unidade vinculada</label>
              <select id="usr-unidade" required value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                <option value="">Selecione</option>
                <option value="1ª Companhia">1ª CIA</option>
                <option value="2ª Companhia">2ª CIA</option>
                <option value="3ª Companhia">3ª CIA</option>
                <option value="PCS">PCS</option>
              </select>
            </div>
          )}
          {modoEdicao && (
            <label className="checkbox-inline">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              Usuário ativo
            </label>
          )}
          {!modoEdicao && (
            <div className="form-group">
              <label htmlFor="usr-senha">Senha Inicial</label>
              <input
                type="password" id="usr-senha" minLength={3} placeholder="Mínimo 3 caracteres" autoComplete="new-password"
                required value={senha} onChange={(e) => setSenha(e.target.value)}
              />
            </div>
          )}
          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
