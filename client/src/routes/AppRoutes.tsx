import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from './RequireRole';
import { useAuth } from '../context/useAuth';
import { ALL_NAV_ITEMS, secaoInicialDoPerfil } from '../layout/navConfig';

// Um import() por módulo — cada aba vira um chunk próprio, baixado só quando
// visitada (regra 1.1 do MIGRACAO.md, "lazy loading por módulo").
const paginas = {
  dashboard: lazy(() => import('../pages/modulos/dashboard')),
  cadastro: lazy(() => import('../pages/modulos/cadastro')),
  eventos: lazy(() => import('../pages/modulos/eventos')),
  mapa: lazy(() => import('../pages/modulos/mapa')),
  turno: lazy(() => import('../pages/modulos/turno')),
  cartao: lazy(() => import('../pages/modulos/cartao')),
  operacoes: lazy(() => import('../pages/modulos/operacoes')),
  planejador: lazy(() => import('../pages/modulos/planejador')),
  relatorio: lazy(() => import('../pages/modulos/relatorio')),
  usuarios: lazy(() => import('../pages/modulos/usuarios')),
  pessoal: lazy(() => import('../pages/modulos/pessoal')),
  viaturas: lazy(() => import('../pages/modulos/viaturas')),
} as const;

export function AppRoutes() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route index element={<Navigate to={`/${secaoInicialDoPerfil(usuario!.role)}`} replace />} />
      {ALL_NAV_ITEMS.map((item) => {
        const Pagina = paginas[item.id];
        return (
          <Route
            key={item.id}
            path={item.id}
            element={
              <RequireRole roles={item.roles}>
                <Suspense fallback={null}>
                  <Pagina />
                </Suspense>
              </RequireRole>
            }
          />
        );
      })}
      {/* URL desconhecida: volta pra tela inicial do perfil, não deixa em branco */}
      <Route path="*" element={<Navigate to={`/${secaoInicialDoPerfil(usuario!.role)}`} replace />} />
    </Routes>
  );
}
