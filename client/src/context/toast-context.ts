import { createContext } from 'react';

export type TipoToast = 'success' | 'info' | 'warning' | 'danger';

export interface ToastContextValue {
  /** Espelha showToast(mensagem, tipo) de public/app.js. */
  toast: (mensagem: string, tipo?: TipoToast) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
