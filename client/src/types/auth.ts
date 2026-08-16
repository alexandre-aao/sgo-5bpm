// Espelha a resposta de POST /api/login (server.js) e o formato salvo em
// localStorage['user'] pelo app antigo (public/app.js, checkAuth/handleLogin).
export type Role = 'P3' | 'Adjunto' | 'Oficial' | 'Sargenteante';

export interface Usuario {
  usuario: string;
  role: Role;
  nome: string;
  unidade?: '1ª Companhia' | '2ª Companhia' | '3ª Companhia' | 'PCS' | null;
  ativo?: boolean;
  exigir_troca_senha?: boolean;
  /** OPCIONAL desde a Fase 4: a sessão nova vive num cookie HttpOnly e o token
   *  não é mais exposto ao JavaScript. Só sessões antigas, criadas antes da
   *  migração e ainda salvas em localStorage, têm este campo. */
  token?: string;
  /** epoch ms — sessão dura 12h (SESSAO_DURACAO_MS no server.js) */
  expira: number;
}
