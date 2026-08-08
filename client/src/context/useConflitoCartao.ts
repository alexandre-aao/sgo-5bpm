import { useContext } from 'react';
import { ConflitoCartaoContext } from './conflito-cartao-context';

export function useConflitoCartao() {
  const contexto = useContext(ConflitoCartaoContext);
  if (!contexto) throw new Error('useConflitoCartao precisa estar dentro de <ConflitoCartaoProvider>.');
  return contexto;
}

