import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { AppDataProvider } from './context/AppDataContext';
import { ToastProvider } from './context/ToastContext';
import { Login } from './pages/Login';
import { AppLayout } from './layout/AppLayout';
import { RotaCartaoTelaCheia } from './routes/RotaCartaoTelaCheia';

function Shell() {
  const { usuario } = useAuth();
  if (!usuario) return <Login />;

  return (
    <AppDataProvider>
      <BrowserRouter>
        <Routes>
          {/* Tela cheia, sem sidebar/topbar/bottom-tabs — precisa vir antes do
              catch-all "/*" abaixo. AppRoutes (dentro de AppLayout) segue com
              seu próprio <Routes>, casando contra o restante da URL. */}
          <Route path="/cartao/:id" element={<RotaCartaoTelaCheia />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AppDataProvider>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
