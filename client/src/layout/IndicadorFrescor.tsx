import { RefreshCw } from 'lucide-react';
import { useAppData } from '../context/useAppData';

function horaCurta(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(data);
}

/**
 * "Atualizado às HH:MM" + refresh manual. O polling de 60s do useAutoRefresh é
 * invisível: sem isto não há como saber se o número na tela é de agora ou de
 * meia hora atrás — e, quando a rede falha, o app mantém os dados anteriores de
 * propósito, o que torna o horário a única pista de que estão velhos.
 */
export function IndicadorFrescor() {
  const { atualizadoEm, atualizando, recarregar } = useAppData();

  return (
    <button
      type="button"
      className="indicador-frescor"
      onClick={() => void recarregar()}
      disabled={atualizando}
      title="Atualizar os dados agora"
      // O horário muda sozinho a cada polling; sem isto o leitor de tela
      // anunciaria a mudança do nada, no meio de outra tarefa.
      aria-live="off"
    >
      <RefreshCw className={atualizando ? 'girando' : undefined} aria-hidden="true" />
      <span>
        {atualizando
          ? 'Atualizando…'
          : atualizadoEm
            ? `Atualizado às ${horaCurta(atualizadoEm)}`
            : 'Carregando…'}
      </span>
    </button>
  );
}
