import { createContext } from 'react';

export interface ConflitoCartaoContextValue {
  avisarConflito: (recarregar: () => Promise<void>, mensagem?: string) => void;
}

export const ConflitoCartaoContext = createContext<ConflitoCartaoContextValue | null>(null);

