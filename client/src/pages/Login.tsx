import { useState, type FormEvent } from 'react';
import { ShieldCheck, AlertTriangle, LogIn } from 'lucide-react';
import { useAuth } from '../context/useAuth';

// Espelha #login-container/.login-box/.form-group/.login-error-message de
// public/index.html — mesmas classes de style.css, mesmos textos e placeholders.
export function Login() {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(usuario, senha);
    } catch {
      setErro('Usuário ou senha inválidos.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="login-logo-container">
            <ShieldCheck />
          </div>
          <h2>SGO - 5º BPM</h2>
          <h3>Sistema de Gestão Operacional</h3>
          <p>Insira suas credenciais de serviço para acessar o sistema.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-usuario">Usuário</label>
            <input
              type="text"
              id="login-usuario"
              required
              placeholder="Ex: p3, adjunto ou oficial"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-senha">Senha</label>
            <input
              type="password"
              id="login-senha"
              required
              placeholder="••••••••"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          {erro && (
            <div className="login-error-message">
              <AlertTriangle />
              <span>{erro}</span>
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
            <LogIn /> {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
