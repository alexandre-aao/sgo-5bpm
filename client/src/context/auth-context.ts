import { createContext } from 'react';
import type { Usuario } from '../types/auth';

export interface AuthContextValue {
  usuario: Usuario | null;
  login: (usuario: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Fica num arquivo próprio (sem exportar componente) porque o
// eslint-plugin-react-refresh exige isso para o Fast Refresh funcionar
// direito — ver AuthContext.tsx (Provider) e useAuth.ts (hook).
export const AuthContext = createContext<AuthContextValue | null>(null);
