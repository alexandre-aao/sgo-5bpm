import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { ToastContext, type TipoToast } from './toast-context';

interface ToastItem {
  id: number;
  mensagem: string;
  tipo: TipoToast;
  saindo: boolean;
}

const ICONE: Record<TipoToast, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertOctagon,
};

// Espelha showToast()/#toast-container de public/app.js: 4s visível, 200ms de
// fade antes de remover.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([]);
  const proximoId = useRef(0);

  const toast = useCallback((mensagem: string, tipo: TipoToast = 'info') => {
    const id = proximoId.current++;
    setItens((atual) => [...atual, { id, mensagem, tipo, saindo: false }]);

    setTimeout(() => {
      setItens((atual) => atual.map((t) => (t.id === id ? { ...t, saindo: true } : t)));
      setTimeout(() => {
        setItens((atual) => atual.filter((t) => t.id !== id));
      }, 200);
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {itens.map((t) => {
          const Icone = ICONE[t.tipo];
          return (
            <div key={t.id} className={`toast ${t.tipo}`} style={{ opacity: t.saindo ? 0 : undefined }}>
              <Icone className="toast-icon" />
              <div className="toast-content">{t.mensagem}</div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
