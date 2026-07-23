import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { secaoInicialDoPerfil, type SectionId } from '../layout/navConfig';
import type { Role } from '../types/auth';

interface RequireRoleProps {
  roles: Role[];
  children: React.ReactNode;
}

// Guarda de rota por perfil: espelha o que hidden-role faz no menu do app antigo,
// mas do lado do servidor de rotas — quem digitar a URL de uma seção que não pode
// ver é redirecionado pra tela inicial do próprio perfil, não fica preso a uma
// página vazia. A restrição "de verdade" continua sendo o exigirP3 do server.js;
// isto aqui é só UX de navegação.
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { usuario } = useAuth();
  if (!usuario) return null; // AppLayout só monta autenticado; guarda defensiva

  if (!roles.includes(usuario.role)) {
    const destino: SectionId = secaoInicialDoPerfil(usuario.role);
    return <Navigate to={`/${destino}`} replace />;
  }

  return <>{children}</>;
}
