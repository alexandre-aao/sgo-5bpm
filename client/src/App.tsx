import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { Login } from './pages/Login';

function Shell() {
  const { usuario, logout } = useAuth();

  if (!usuario) return <Login />;

  // Placeholder até o Lote 3 (AppLayout: Sidebar/Topbar/Navegação mobile).
  return (
    <div style={{ padding: 24 }}>
      <p>
        Logado como <strong>{usuario.nome}</strong> ({usuario.role})
      </p>
      <button className="btn" onClick={() => logout()}>
        Sair
      </button>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

export default App;
