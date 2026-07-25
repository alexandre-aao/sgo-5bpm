import type { TipoCartao } from '../../../lib/cartaoConflitos';

interface TipoCartaoSwitchProps {
  tipoAtivo: TipoCartao;
  onTrocar: (tipo: TipoCartao) => void;
  /** Quantos reforços existem na data — aparece no rótulo pra dar noção sem trocar de aba. */
  qtdReforcos: number;
}

/** Segmentado Ordinário | Reforço. Reusa `.sub-abas` (mesmo componente visual das
 * sub-abas Viaturas/Roteiro) em vez de criar um controle novo — os dois tipos usam o
 * MESMO editor abaixo, isto só escolhe qual cartão entra nele. */
export function TipoCartaoSwitch({ tipoAtivo, onTrocar, qtdReforcos }: TipoCartaoSwitchProps) {
  return (
    <div className="sub-abas cartao-tipo-switch" role="tablist" aria-label="Tipo de cartão">
      <button
        type="button"
        className={`sub-aba${tipoAtivo === 'padrao' ? ' ativo' : ''}`}
        role="tab"
        aria-selected={tipoAtivo === 'padrao'}
        onClick={() => onTrocar('padrao')}
      >
        Ordinário
      </button>
      <button
        type="button"
        className={`sub-aba${tipoAtivo === 'reforco' ? ' ativo' : ''}`}
        role="tab"
        aria-selected={tipoAtivo === 'reforco'}
        onClick={() => onTrocar('reforco')}
      >
        Reforço{qtdReforcos > 0 ? ` (${qtdReforcos})` : ''}
      </button>
    </div>
  );
}
