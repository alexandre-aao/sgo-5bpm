import { useContext } from 'react';
import { AppDataContext } from './app-data-context';

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData precisa estar dentro de <AppDataProvider>.');
  return ctx;
}
