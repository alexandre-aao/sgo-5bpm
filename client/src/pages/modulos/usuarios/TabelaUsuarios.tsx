import { Pencil, KeyRound, Trash2 } from 'lucide-react';
import type { UsuarioPublico } from './useUsuariosCrud';

interface TabelaUsuariosProps {
  usuarios: UsuarioPublico[];
  onEditar: (usuario: UsuarioPublico) => void;
  onResetarSenha: (usuario: UsuarioPublico) => void;
  onExcluir: (usuario: UsuarioPublico) => void;
}

export function TabelaUsuarios({ usuarios, onEditar, onResetarSenha, onExcluir }: TabelaUsuariosProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table">
        <thead>
          <tr>
            <th>Login</th>
            <th>Nome</th>
            <th>Perfil</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                Nenhum usuário cadastrado.
              </td>
            </tr>
          ) : (
            usuarios.map((u) => (
              <tr key={u.usuario}>
                <td><strong>{u.usuario}</strong></td>
                <td>{u.nome}</td>
                <td><span className={`badge perfil-${u.role.toLowerCase()}`}>{u.role}</span></td>
                <td className="text-right">
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(u)}>
                      <Pencil style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      type="button" className="btn-icon btn-sm" title="Resetar Senha" aria-label="Resetar Senha"
                      onClick={() => onResetarSenha(u)}
                    >
                      <KeyRound style={{ width: 14, height: 14 }} />
                    </button>
                    <button type="button" className="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onClick={() => onExcluir(u)}>
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
