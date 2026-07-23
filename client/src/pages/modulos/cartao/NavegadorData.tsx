import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

interface NavegadorDataProps {
  dataSelecionada: string;
  onMudarData: (data: string) => void;
  onDeslocarDia: (dias: number) => void;
  /** null = sem data; false = sem cartão; true = cartão lançado */
  temCartao: boolean | null;
}

// Espelha o navegador de data + status-pill de public/index.html/atualizarCabecalhoDataCartao().
export function NavegadorData({ dataSelecionada, onMudarData, onDeslocarDia, temCartao }: NavegadorDataProps) {
  const semana = dataSelecionada ? DIAS[new Date(dataSelecionada + 'T00:00:00').getDay()] : '';
  const textoStatus = temCartao === null ? 'Selecione uma data' : temCartao ? 'Cartão lançado' : 'Cartão não lançado';
  const classePill = temCartao === true ? ' status-pill-ok' : temCartao === false ? ' status-pill-pendente' : '';

  return (
    <>
      <div className="cartao-data-nav">
        <button type="button" className="btn-icon" aria-label="Dia anterior" title="Dia anterior" onClick={() => onDeslocarDia(-1)}>
          <ChevronLeft />
        </button>
        <Calendar className="cartao-data-nav-icone" />
        <input
          type="date"
          aria-label="Data do cartão"
          value={dataSelecionada}
          onChange={(e) => onMudarData(e.target.value)}
        />
        <span className="cartao-data-semana">{semana}</span>
        <button type="button" className="btn-icon" aria-label="Próximo dia" title="Próximo dia" onClick={() => onDeslocarDia(1)}>
          <ChevronRight />
        </button>
      </div>
      <span className={`status-pill${classePill}`}>
        <span className="status-dot" /><span>{textoStatus}</span>
      </span>
    </>
  );
}
