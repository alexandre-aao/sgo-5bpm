import { createContext } from 'react';
import type { Tables } from '../types/supabase';

export interface AppData {
  eventos: Tables<'eventos'>[];
  operacoes: Tables<'operacoes'>[];
  alocacoes: Tables<'alocacoes'>[];
  escalas: Tables<'escalas'>[];
  config: Tables<'config'>;
  pessoal: Tables<'pessoal'>[];
  viaturas: Tables<'viaturas'>[];
}

export interface AppDataContextValue {
  dados: AppData;
  /** true enquanto a 1ª onda (núcleo) ainda não terminou a primeira carga */
  carregandoNucleo: boolean;
  /** dispara as duas ondas de novo — mesmo papel do fetchData() do app antigo */
  recarregar: () => Promise<void>;
}

// Fica num arquivo próprio (sem exportar componente) pelo mesmo motivo de
// auth-context.ts: react-refresh/only-export-components.
export const AppDataContext = createContext<AppDataContextValue | null>(null);
