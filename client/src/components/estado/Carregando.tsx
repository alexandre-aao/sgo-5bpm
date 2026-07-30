interface CarregandoProps {
  /** Texto abaixo do indicador, ex.: "Carregando eventos..." */
  mensagem?: string;
}

// Estado de carregamento explícito (Etapa 1, item 7). Antes, enquanto os dados
// não chegavam, as telas mostravam zeros e listas vazias, indistinguíveis de
// "não há nada cadastrado".
export function Carregando({ mensagem = 'Carregando...' }: CarregandoProps) {
  return (
    <div className="estado-carregando" role="status" aria-live="polite">
      <span className="estado-spinner" />
      <span>{mensagem}</span>
    </div>
  );
}
