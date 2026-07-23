import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setAuthToken, setOnUnauthorized } from '../lib/api';
import type { Usuario } from '../types/auth';
import { AuthContext } from './auth-context';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const STORAGE_KEY = 'user';

function lerSessaoSalva(): Usuario | null {
  const bruto = localStorage.getItem(STORAGE_KEY);
  if (!bruto) return null;

  try {
    const dados = JSON.parse(bruto) as Partial<Usuario>;
    // Sessão sem token (formato antigo) ou já expirada: exige novo login — mesma
    // checagem de checkAuth() em public/app.js.
    if (!dados.token || !dados.expira || dados.expira <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return dados as Usuario;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

// Lida fora do componente, uma única vez por carregamento de página: a checagem de
// sessão é síncrona (localStorage), então não precisa de estado de "carregando" nem
// de useEffect — só inicializa o token do apiFetch antes de qualquer render.
const sessaoInicial = lerSessaoSalva();
if (sessaoInicial) setAuthToken(sessaoInicial.token);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(sessaoInicial);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch {
      // Encerra a sessão local mesmo se a chamada falhar (ex: já sem rede) —
      // mesmo comportamento de encerrarSessaoLocal() no app antigo.
    }
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setUsuario(null);
  }, []);

  // Registra o callback de 401 do apiFetch (que precisa poder deslogar sem
  // depender de import circular com este módulo).
  useEffect(() => {
    setOnUnauthorized(() => {
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken(null);
      setUsuario(null);
    });
  }, []);

  // Checagem proativa de expiração (12h) a cada 60s + ao voltar o foco da aba —
  // mesma cadência do fetchData() periódico do app antigo, aplicada aqui à sessão
  // em si (o app antigo só verificava a expiração no boot; toda outra sessão
  // vencida ali era pega de rebote pelo primeiro 401 de alguma chamada de API).
  useAutoRefresh(
    useCallback(() => {
      if (usuario && usuario.expira <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthToken(null);
        setUsuario(null);
      }
    }, [usuario]),
    !!usuario,
  );

  const login = useCallback(async (usuarioLogin: string, senha: string) => {
    const res = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuarioLogin, senha }),
    });

    if (!res.ok) {
      // Mesma mensagem genérica e estática do app antigo (#login-error), independente
      // do texto real devolvido pelo servidor (ex: bloqueio progressivo por tentativas).
      throw new Error('Usuário ou senha inválidos.');
    }

    const dados = (await res.json()) as Usuario;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    setAuthToken(dados.token);
    setUsuario(dados);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
