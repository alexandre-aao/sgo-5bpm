import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SemDadosProps {
  titulo: string;
  /** O que fazer em seguida — a orientação é o ponto do estado vazio (Etapa 1, item 7). */
  orientacao: string;
  icone?: LucideIcon;
  acao?: { rotulo: string; onClick: () => void };
}

export function SemDados({ titulo, orientacao, icone, acao }: SemDadosProps) {
  const Icone = icone ?? Inbox;

  return (
    <div className="estado-vazio">
      <span className="estado-vazio-icone"><Icone /></span>
      <h3>{titulo}</h3>
      <p>{orientacao}</p>
      {acao && (
        <button type="button" className="btn btn-primary btn-sm" onClick={acao.onClick}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}
