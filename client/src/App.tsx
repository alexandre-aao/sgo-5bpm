import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { AppDataProvider } from './context/AppDataContext';
import { Login } from './pages/Login';
import { AppLayout } from './layout/AppLayout';

function Shell() {
  const { usuario } = useAuth();
  if (!usuario) return <Login />;

  return (
    <AppDataProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </AppDataProvider>
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
