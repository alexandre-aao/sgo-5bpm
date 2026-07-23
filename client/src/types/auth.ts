// Espelha a resposta de POST /api/login (server.js) e o formato salvo em
// localStorage['user'] pelo app antigo (public/app.js, checkAuth/handleLogin).
export type Role = 'P3' | 'Adjunto' | 'Oficial';

export interface Usuario {
  usuario: string;
  role: Role;
  nome: string;
  token: string;
  /** epoch ms — sessão dura 12h (SESSAO_DURACAO_MS no server.js) */
  expira: number;
}
