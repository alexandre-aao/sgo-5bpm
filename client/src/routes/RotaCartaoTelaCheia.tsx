import { lazy, Suspense } from 'react';
import { RequireRole } from './RequireRole';

const CartaoTelaCheiaPage = lazy(() => import('../pages/cartaoTelaCheia'));

// Cartão Programa em tela cheia (/cartao/:id) — fica FORA de NAV_SECTIONS de
// propósito: se entrasse lá, o loop de AppRoutes.tsx a recriaria dentro do
// AppLayout normal (com sidebar/topbar), anulando o objetivo da rota. Mesmos
// perfis que já acessam o Cartão Programa hoje.
export function RotaCartaoTelaCheia() {
  return (
    <RequireRole roles={['P3', 'Adjunto', 'Oficial']}>
      <Suspense fallback={null}>
        <CartaoTelaCheiaPage />
      </Suspense>
    </RequireRole>
  );
}
