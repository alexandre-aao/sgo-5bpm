/** Cadastro administrável pela P3. O cliente não mantém uma lista fixa: os
 * registros vêm de GET /api/tipos-evento e eventos antigos continuam podendo
 * exibir seu texto mesmo quando o tipo foi desativado. */
export interface TipoEvento {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  criado_por?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
}
