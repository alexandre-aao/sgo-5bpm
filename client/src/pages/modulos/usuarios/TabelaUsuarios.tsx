import { Pencil, KeyRound, Trash2, UserPlus } from 'lucide-react';
import type { UsuarioPublico } from './useUsuariosCrud';
import { SemDados } from '../../../components/estado/SemDados';
import { MenuOpcoes } from '../../../components/MenuOpcoes';
import { ThOrdenavel } from '../../../components/tabela/ThOrdenavel';
import { useOrdenacao, ordenarLista, type Acessores } from '../../../components/tabela/ordenacao';

type ColunaUsuario = 'login' | 'nome' | 'perfil';

const ACESSORES: Acessores<UsuarioPublico, ColunaUsuario> = {
  login: (u) => u.usuario || '',
  nome: (u) => u.nome || '',
  perfil: (u) => u.role || '',
};

interface TabelaUsuariosProps {
  usuarios: UsuarioPublico[];
  onEditar: (usuario: UsuarioPublico) => void;
  onResetarSenha: (usuario: UsuarioPublico) => void;
  onExcluir: (usuario: UsuarioPublico) => void;
}

// Tabela de Usuários — ordenação por coluna e cabeçalho fixo (Etapa 1, item 6).
// Sem paginação: são poucas contas de login, uma página sempre dá conta.
export function TabelaUsuarios({ usuarios, onEditar, onResetarSenha, onExcluir }: TabelaUsuariosProps) {
  const { ordenacao, alternar } = useOrdenacao<ColunaUsuario>({ coluna: 'login', direcao: 'asc' });
  const ordenados = ordenarLista(usuarios, ordenacao, ACESSORES);

  return (
    <div className="table-responsive tabela-scroll">
      <table className="styled-table table-cards-mobile">
        <thead>
          <tr>
            <ThOrdenavel coluna="login" ordenacao={ordenacao} onAlternar={alternar}>Login</ThOrdenavel>
            <ThOrdenavel coluna="nome" ordenacao={ordenacao} onAlternar={alternar}>Nome</ThOrdenavel>
            <ThOrdenavel coluna="perfil" ordenacao={ordenacao} onAlternar={alternar}>Perfil / status</ThOrdenavel>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <SemDados
                  icone={UserPlus}
                  titulo="Nenhum usuário cadastrado"
                  orientacao="Use “Novo Usuário” para criar as contas de acesso da P3, dos Adjuntos e dos Oficiais."
                />
              </td>
            </tr>
          ) : (
            ordenados.map((u) => (
              <tr key={u.usuario}>
                {/* O login é a identidade da conta — é ele que titula o card. */}
                <td className="card-title-cell">{u.usuario}</td>
                <td data-label="Nome">{u.nome}</td>
                <td data-label="Perfil"><span className={`badge perfil-${u.role.toLowerCase()}`}>{u.role}</span>{u.ativo === false && <span className="badge status-inativa">Inativo</span>}{u.exigir_troca_senha && <span className="badge status-pendente">Troca pendente</span>}</td>
                {/* Editar fica no botão direto; resetar senha e excluir são
                    pouco frequentes e vão pro menu (Etapa 1, item 2). */}
                <td className="text-right">
                  <div className="acoes-linha">
                    <button type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(u)}>
                      <Pencil />
                    </button>
                    <MenuOpcoes
                      rotulo={`Mais opções de ${u.usuario}`}
                      itens={[
                        { rotulo: 'Resetar senha', icone: KeyRound, onClick: () => onResetarSenha(u) },
                        { rotulo: 'Excluir usuário', icone: Trash2, onClick: () => onExcluir(u), perigo: true },
                      ]}
                    />
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
