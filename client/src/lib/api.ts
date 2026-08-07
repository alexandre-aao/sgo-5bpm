// Wrapper das chamadas à API: manda o cookie de sessão, injeta o Bearer enquanto
// ele existir e trata sessão expirada.
//
// AUTENTICAÇÃO EM TRANSIÇÃO (Fase 4 — S2): o token saiu do localStorage, onde
// qualquer XSS o leria, para um cookie HttpOnly que o JavaScript não enxerga.
// `credentials: 'include'` é o que faz esse cookie viajar — sem ele o fetch
// omite cookie em requisição cross-origin, que é o caso no desenvolvimento
// (5173 -> 3005). O Bearer continua sendo enviado quando há token em memória,
// para a sessão de quem já estava logado não cair no deploy; sai quando a
// transição terminar.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
/** Marca que existe sessão ativa mesmo sem token em memória — é o que permite
 *  detectar o 401 quando a autenticação vem só do cookie. */
let sessaoAtiva = false;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setSessaoAtiva(ativa: boolean) {
  sessaoAtiva = ativa;
}

export function setOnUnauthorized(callback: () => void) {
  onUnauthorized = callback;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Sem o `sessaoAtiva`, uma sessão vinda só do cookie nunca dispararia o
  // logout automático no 401 — o app ficaria preso numa tela vazia.
  if (res.status === 401 && (authToken || sessaoAtiva)) {
    onUnauthorized?.();
  }

  return res;
}
