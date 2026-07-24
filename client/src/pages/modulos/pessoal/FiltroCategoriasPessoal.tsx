import { CATEGORIAS_PESSOAL } from '../../../lib/postosGraduacao';

interface FiltroCategoriasPessoalProps {
  categoria: string;
  onMudar: (categoria: string) => void;
}

const ROTULOS: Record<string, string> = {
  Adjunto: 'Adjuntos',
  'Fiscal de Operações': 'Fiscais de Operações',
  'Oficial de Operações': 'Oficiais de Operações',
  'Oficial de Sobreaviso': 'Oficiais de Sobreaviso',
  Executor: 'Executores',
};

// Filtro por categoria do Cadastro de Pessoal — espelha #pessoal-filtro-categorias
// em public/index.html. "Sem categoria" é filtro só client-side (pessoas com
// categorias=[]), a API não sabe filtrar por ausência de categoria.
export function FiltroCategoriasPessoal({ categoria, onMudar }: FiltroCategoriasPessoalProps) {
  return (
    <div className="pessoal-filtro-categorias">
      <button type="button" className={`btn btn-secondary btn-sm pessoal-filtro-btn${categoria === '' ? ' active' : ''}`} onClick={() => onMudar('')}>
        Todos
      </button>
      {CATEGORIAS_PESSOAL.map((c) => (
        <button
          key={c} type="button" className={`btn btn-secondary btn-sm pessoal-filtro-btn${categoria === c ? ' active' : ''}`}
          onClick={() => onMudar(c)}
        >
          {ROTULOS[c]}
        </button>
      ))}
      <button
        type="button" className={`btn btn-secondary btn-sm pessoal-filtro-btn${categoria === '__sem_categoria__' ? ' active' : ''}`}
        onClick={() => onMudar('__sem_categoria__')}
      >
        Sem categoria
      </button>
    </div>
  );
}
