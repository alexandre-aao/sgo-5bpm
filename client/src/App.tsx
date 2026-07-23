import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { Login } from './pages/Login';
import { AppLayout } from './layout/AppLayout';

function Shell() {
  const { usuario } = useAuth();
  return usuario ? <AppLayout /> : <Login />;
}

function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

export default App;
