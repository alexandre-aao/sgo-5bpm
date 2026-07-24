import { Pencil, Trash2 } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { categoriaPessoalBadgeClass } from '../../../lib/categoriaPessoalBadge';

interface TabelaPessoalProps {
  pessoal: Tables<'pessoal'>[];
  filtroAtivo: boolean;
  onEditar: (pessoa: Tables<'pessoal'>) => void;
  onExcluir: (pessoa: Tables<'pessoal'>) => void;
}

// Tabela do Cadastro de Pessoal — espelha renderPessoalTab() em public/app.js.
export function TabelaPessoal({ pessoal, filtroAtivo, onEditar, onExcluir }: TabelaPessoalProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table">
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Nome</th>
            <th>Subunidade</th>
            <th>Posto/Graduação</th>
            <th>Tipo</th>
            <th>Categorias</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {pessoal.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                Nenhuma pessoa cadastrada{filtroAtivo ? ' nesta categoria' : ''}.
              </td>
            </tr>
          ) : (
            pessoal.map((p) => (
              <tr key={p.id}>
                <td>{p.matricula || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td><strong>{p.nome}</strong></td>
                <td>{p.subunidade || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td>{p.posto_graduacao}</td>
                <td><span className={`badge tipo-${p.tipo === 'Praça' ? 'praca' : 'oficial'}`}>{p.tipo}</span></td>
                <td>
                  {p.categorias.length > 0 ? (
                    p.categorias.map((c) => (
                      <span key={c} className={`badge ${categoriaPessoalBadgeClass(c)}`} style={{ margin: 2 }}>{c}</span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Sem categoria</span>
                  )}
                </td>
                <td className="text-right">
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(p)}>
                      <Pencil style={{ width: 14, height: 14 }} />
                    </button>
                    <button type="button" className="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onClick={() => onExcluir(p)}>
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
