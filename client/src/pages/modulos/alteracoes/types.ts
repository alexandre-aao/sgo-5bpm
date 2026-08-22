export type PerfilAlteracoes = 'P3' | 'Sargenteante' | 'Adjunto' | 'Oficial' | string;

export type TipoAlteracao =
  | 'PERMUTA'
  | 'ATESTADO'
  | 'DISPENSA/FOLGA'
  | 'FÉRIAS'
  | 'CURSO'
  | 'LICENÇA'
  | 'AFASTAMENTO'
  | 'FALTA PREVISTA'
  | 'OUTRO'
  | string;

export type SituacaoAlteracao = 'INFORMADA' | 'CONFIRMADA' | 'CANCELADA' | string;
export type JornadaServico = '24H' | '12H';
export type TurnoServico = '24H' | 'DIURNO' | 'NOTURNO' | string;

export interface PessoaServico {
  id?: string;
  nome: string;
  matricula?: string | null;
  posto_graduacao?: string | null;
  subunidade?: string | null;
}

export interface ImpactoAlteracao {
  dias_corridos?: number | null;
  servicos_atingidos?: number | null;
  datas_servicos?: string[];
  proximo_servico?: string | null;
  impacto_liquido?: number | null;
  jornada?: JornadaServico | string | null;
  turno?: string | null;
  horarioInicio?: string | null;
  horarioFim?: string | null;
}

export interface DivergenciaServico {
  id?: string;
  texto?: string;
  motivo?: string;
  observacao?: string;
  descricao?: string;
  autor?: string;
  usuario?: string;
  criado_por?: string;
  criado_por_nome?: string;
  criado_em?: string | number | null;
}

export interface CienciaServico {
  usuario?: string;
  usuario_nome?: string;
  nome?: string;
  criado_em?: string | number | null;
  data_hora?: string | number | null;
}

export interface AlteracaoServico {
  id: string;
  unidade: string;
  data?: string | null;
  data_inicio: string;
  data_fim?: string | null;
  data_referencia_servico?: string | null;
  jornada?: JornadaServico | string | null;
  turno: TurnoServico;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  policial_id?: string | null;
  policial_nome: string;
  policial_matricula?: string | null;
  policial?: PessoaServico | null;
  tipo: TipoAlteracao;
  substituto_id?: string | null;
  substituto_nome?: string | null;
  substituto_matricula?: string | null;
  substituto?: PessoaServico | null;
  motivo?: string | null;
  observacao?: string | null;
  documento?: string | null;
  numero_sei?: string | null;
  situacao: SituacaoAlteracao;
  criado_por?: string | null;
  criado_em?: string | number | null;
  atualizado_por?: string | null;
  atualizado_em?: string | number | null;
  impacto?: ImpactoAlteracao | null;
  ciencias?: CienciaServico[];
  ciencia?: CienciaServico | null;
  ciente_por?: string | null;
  ciente_em?: string | number | null;
  divergencias?: DivergenciaServico[];
  [key: string]: unknown;
}

export interface ComposicaoServico {
  id?: string;
  unidade: string;
  data: string;
  turno: string;
  jornada?: JornadaServico | string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  viaturas_previstas: number;
  policiais_por_viatura: number;
  extras: number;
  total_previsto: number;
  qtd_viaturas_completas?: number | null;
  qtd_policiais_disponiveis?: number | null;
  observacao?: string | null;
  criado_por?: string | null;
  atualizado_em?: string | number | null;
  [key: string]: unknown;
}

export interface ResumoOperacional {
  policiais_previstos: number;
  alteracoes: number;
  permutas: number;
  ausencias_sem_reposicao: number;
  policiais_disponiveis: number;
  viaturas_completas: number;
  policiais_remanescentes: number;
  policiais_disponiveis_total?: number;
  capacidade_manual?: boolean;
  composicao?: ComposicaoServico | null;
  [key: string]: unknown;
}

export interface ResumoUnidade {
  unidade: string;
  composicao?: ComposicaoServico | null;
  alteracoes: AlteracaoServico[];
  resumo: ResumoOperacional;
  turno?: string;
  jornada?: string;
}

export interface ResumoResposta {
  data: string;
  turno: string;
  unidades: ResumoUnidade[];
  consolidado?: {
    totalAlteracoes: number;
    companhiasImpactadas: number;
    viaturasCompletas: number;
    policiaisDisponiveis: number;
    policiaisDisponiveisTotal?: number;
  };
}

export interface AlteracaoPayload {
  unidade: string;
  data_inicio: string;
  data_fim?: string | null;
  data_referencia_servico?: string | null;
  jornada?: JornadaServico | string | null;
  turno: TurnoServico;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  policial_id?: string | null;
  policial_nome: string;
  policial_matricula?: string | null;
  tipo: TipoAlteracao;
  substituto_id?: string | null;
  substituto_nome?: string | null;
  substituto_matricula?: string | null;
  motivo?: string | null;
  observacao?: string | null;
  numero_sei?: string | null;
  documento?: string | null;
  /** Nomes canônicos usados pela API do módulo. Os aliases acima preservam
   * a ergonomia dos componentes e permitem ler registros legados. */
  policial_pessoal_id?: string | null;
  substituto_pessoal_id?: string | null;
  numero_documento?: string | null;
  situacao?: SituacaoAlteracao;
}

export interface ComposicaoPayload {
  unidade: string;
  data: string;
  turno: string;
  jornada?: JornadaServico | string;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  viaturas_previstas: number;
  policiais_por_viatura: number;
  extras: number;
  observacao?: string;
  qtd_viaturas_previstas?: number;
  qtd_extras?: number;
  qtd_viaturas_completas?: number;
  qtd_policiais_disponiveis?: number;
}

export const UNIDADES_SERVICO = ['1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS'] as const;
export const TURNOS_SERVICO = ['24H', 'DIURNO', 'NOTURNO'] as const;
export const JORNADAS_SERVICO = ['24H', '12H'] as const;
export const TIPOS_ALTERACAO: TipoAlteracao[] = [
  'PERMUTA', 'ATESTADO', 'DISPENSA/FOLGA', 'FÉRIAS', 'CURSO', 'LICENÇA', 'AFASTAMENTO', 'FALTA PREVISTA', 'OUTRO',
];
export const SITUACOES_ALTERACAO: SituacaoAlteracao[] = ['INFORMADA', 'CONFIRMADA', 'CANCELADA'];
