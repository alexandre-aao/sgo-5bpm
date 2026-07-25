interface FiltroStatusViaturasProps {
  status: string;
  onMudar: (status: string) => void;
}

// Filtro por status do Cadastro de Viaturas — espelha #viaturas-filtro-status
// em public/index.html.
export function FiltroStatusViaturas({ status, onMudar }: FiltroStatusViaturasProps) {
  return (
    <div className="pessoal-filtro-categorias">
      <button type="button" className={`btn btn-secondary btn-sm viaturas-filtro-btn${status === '' ? ' active' : ''}`} onClick={() => onMudar('')}>
        Todas
      </button>
      <button type="button" className={`btn btn-secondary btn-sm viaturas-filtro-btn${status === 'Ativa' ? ' active' : ''}`} onClick={() => onMudar('Ativa')}>
        Ativas
      </button>
      <button
        type="button" className={`btn btn-secondary btn-sm viaturas-filtro-btn${status === 'Manutenção' ? ' active' : ''}`}
        onClick={() => onMudar('Manutenção')}
      >
        Manutenção
      </button>
    </div>
  );
}
