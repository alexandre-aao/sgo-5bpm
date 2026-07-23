// Equivalente ao apiFetch() de public/app.js: injeta o Bearer token e trata sessão
// expirada. Mantém um token em memória (setAuthToken) em vez de ler direto do
// AuthContext para não criar dependência circular entre este módulo e o contexto —
// quem seta o token/callback é o AuthProvider, no login/logout/boot.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnUnauthorized(callback: () => void) {
  onUnauthorized = callback;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && authToken) {
    onUnauthorized?.();
  }

  return res;
}
