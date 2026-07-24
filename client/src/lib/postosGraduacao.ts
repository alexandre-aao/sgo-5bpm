export interface PostoGraduacao {
  posto: string;
  tipo: 'Praça' | 'Oficial';
}

// Hierarquia da PMRN: cada posto/graduação já vem classificado como Praça ou
// Oficial — usado pra decidir automaticamente quando o Oficial de Sobreaviso é
// necessário no Cartão Programa. Espelha POSTOS_GRADUACAO em server.js.
export const POSTOS_GRADUACAO: PostoGraduacao[] = [
  { posto: 'Soldado PM', tipo: 'Praça' },
  { posto: 'Cabo PM', tipo: 'Praça' },
  { posto: '3º Sargento PM', tipo: 'Praça' },
  { posto: '2º Sargento PM', tipo: 'Praça' },
  { posto: '1º Sargento PM', tipo: 'Praça' },
  { posto: 'Subtenente PM', tipo: 'Praça' },
  { posto: 'Aspirante a Oficial PM', tipo: 'Oficial' },
  { posto: '2º Tenente PM', tipo: 'Oficial' },
  { posto: '1º Tenente PM', tipo: 'Oficial' },
  { posto: 'Capitão PM', tipo: 'Oficial' },
  { posto: 'Major PM', tipo: 'Oficial' },
  { posto: 'Tenente-Coronel PM', tipo: 'Oficial' },
  { posto: 'Coronel PM', tipo: 'Oficial' },
];

/** As 5 categorias operacionais do Cadastro de Pessoal — uma pessoa pode ter
 * mais de uma, ou nenhuma (efetivo geral sem papel operacional ainda). */
export const CATEGORIAS_PESSOAL = ['Adjunto', 'Fiscal de Operações', 'Oficial de Operações', 'Oficial de Sobreaviso', 'Executor'];

export const SUBUNIDADES_PESSOAL = ['PCS', '1ª Companhia', '2ª Companhia', '3ª Companhia'];
