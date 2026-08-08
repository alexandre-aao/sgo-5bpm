import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';
import { useToast } from './useToast';
import { ConflitoCartaoContext } from './conflito-cartao-context';

interface ConflitoPendente {
  mensagem: string;
  recarregar: () => Promise<void>;
}

function ModalConflitoCartao({ conflito, onFechar }: { conflito: ConflitoPendente; onFechar: () => void }) {
  const [recarregando, setRecarregando] = useState(false);
  const { toast } = useToast();
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);

  async function handleRecarregar() {
    setRecarregando(true);
    try {
      await conflito.recarregar();
      onFechar();
      toast('Cartão Programa recarregado com a versão mais recente.', 'info');
    } catch (erro) {
      console.error('Falha ao recarregar Cartão Programa após conflito:', erro);
      toast('Não foi possível recarregar o cartão. Tente novamente.', 'danger');
    } finally {
      setRecarregando(false);
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}><TriangleAlert /> Cartão alterado por outra pessoa</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <p>{conflito.mensagem}</p>
        <p className="texto-auxiliar">A ação que você acabou de tentar não foi salva. Recarregue para trabalhar sobre os dados mais recentes.</p>
        <div className="form-actions form-actions-modal">
          <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={recarregando}>Agora não</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleRecarregar()} disabled={recarregando}>
            <RefreshCw /> {recarregando ? 'Recarregando...' : 'Recarregar cartão'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConflitoCartaoProvider({ children }: { children: ReactNode }) {
  const [conflito, setConflito] = useState<ConflitoPendente | null>(null);
  const avisarConflito = useCallback((recarregar: () => Promise<void>, mensagem?: string) => {
    setConflito({
      recarregar,
      mensagem: mensagem || 'Este Cartão Programa foi alterado por outro usuário.',
    });
  }, []);
  const valor = useMemo(() => ({ avisarConflito }), [avisarConflito]);

  return (
    <ConflitoCartaoContext.Provider value={valor}>
      {children}
      {conflito && <ModalConflitoCartao conflito={conflito} onFechar={() => setConflito(null)} />}
    </ConflitoCartaoContext.Provider>
  );
}

