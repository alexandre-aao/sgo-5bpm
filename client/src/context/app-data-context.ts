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
  /** true enquanto a 2ª onda (pessoal + viaturas) ainda não chegou na 1ª carga.
   *  As telas que dependem desses dois já estão pintadas nessa hora, então sem
   *  este sinal a tabela de Pessoal aparece VAZIA — indistinguível de "nada
   *  cadastrado" — até o payload mais pesado responder. */
  carregandoSecundario: boolean;
  /** Falha na última busca. O estado anterior é preservado (ver usarLista), então
   *  isto sinaliza "dados possivelmente desatualizados", não "sem dados". */
  erro: string | null;
  /** dispara as duas ondas de novo — mesmo papel do fetchData() do app antigo */
  recarregar: () => Promise<void>;
}

// Fica num arquivo próprio (sem exportar componente) pelo mesmo motivo de
// auth-context.ts: react-refresh/only-export-components.
export const AppDataContext = createContext<AppDataContextValue | null>(null);
