import { COMPANHIAS_VIATURA, rotuloCurtoCompanhia } from '../../../lib/categoriasViatura';

interface SeletorCompanhiaProps {
  valor: string;
  onChange: (valor: string) => void;
  id?: string;
}

/** Companhia da viatura em botões lado a lado — escolha manual do Adjunto, nunca
 *  derivada do bairro. Clicar na opção já marcada desmarca (volta a "não
 *  informada"), que é o estado que o formulário sempre aceitou. */
export function SeletorCompanhia({ valor, onChange, id }: SeletorCompanhiaProps) {
  return (
    <div className="form-group">
      <span className="form-label-estatico" id={id ? `${id}-label` : undefined}>Companhia</span>
      <div className="companhia-switch" role="group" aria-labelledby={id ? `${id}-label` : undefined}>
        {COMPANHIAS_VIATURA.map((companhia) => {
          const ativo = valor === companhia;
          return (
            <button
              key={companhia}
              type="button"
              className={`companhia-opcao${ativo ? ' ativo' : ''}`}
              aria-pressed={ativo}
              onClick={() => onChange(ativo ? '' : companhia)}
            >
              {rotuloCurtoCompanhia(companhia)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
