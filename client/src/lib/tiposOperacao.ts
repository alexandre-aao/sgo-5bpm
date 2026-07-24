/** Tipos de operação policial — espelha TIPOS_OPERACAO em server.js (usado também
 * em public/index.html no <select> de Nova/Editar Operação). */
export const TIPOS_OPERACAO = [
  'Ostensiva',
  'Saturação',
  'Cerco',
  'Blitz',
  'Cumprimento de Mandado',
  'Reforço',
  'Outras',
];

/** Recorrência da operação — espelha o <select> #op-tipo_recorrencia. */
export const ROTULOS_RECORRENCIA: Record<string, string> = {
  diaria: 'Diária',
  fim_de_semana: 'Fim de Semana',
  dia_unico: 'Dia Único',
};
