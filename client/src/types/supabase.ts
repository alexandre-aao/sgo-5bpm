// Gerado via Supabase MCP (generate_typescript_types), projeto qzwmnkqxoubqyapmpjnb.
// Não editar manualmente — regenerar após qualquer ALTER TABLE em supabase/schema.sql.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alocacoes: {
        Row: {
          comando_servico: string | null
          evento_id: string | null
          id: string
          modalidade: string | null
          operacao_id: string | null
          prefixos_vtr: string | null
          qtd_policiais: number | null
          qtd_viaturas: number | null
        }
        Insert: {
          comando_servico?: string | null
          evento_id?: string | null
          id: string
          modalidade?: string | null
          operacao_id?: string | null
          prefixos_vtr?: string | null
          qtd_policiais?: number | null
          qtd_viaturas?: number | null
        }
        Update: {
          comando_servico?: string | null
          evento_id?: string | null
          id?: string
          modalidade?: string | null
          operacao_id?: string | null
          prefixos_vtr?: string | null
          qtd_policiais?: number | null
          qtd_viaturas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alocacoes_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacoes_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          criado_em: number
          descricao_resumida: string | null
          entidade: string
          entidade_id: string | null
          id: string
          usuario: string
        }
        Insert: {
          acao: string
          criado_em: number
          descricao_resumida?: string | null
          entidade: string
          entidade_id?: string | null
          id: string
          usuario: string
        }
        Update: {
          acao?: string
          criado_em?: number
          descricao_resumida?: string | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          usuario?: string
        }
        Relationships: []
      }
      avisos: {
        Row: {
          ativo: boolean
          atualizado_em: string | null
          bairro_id: string | null
          categoria: string
          companhia: string | null
          criado_em: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          id: string
          permanente: boolean
          prioridade: string
          texto: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string | null
          bairro_id?: string | null
          categoria?: string
          companhia?: string | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          id: string
          permanente?: boolean
          prioridade?: string
          texto: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string | null
          bairro_id?: string | null
          categoria?: string
          companhia?: string | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          permanente?: boolean
          prioridade?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros_coordenadas"
            referencedColumns: ["id"]
          },
        ]
      }
      bairros_coordenadas: {
        Row: {
          ativo: boolean
          id: string
          latitude: number | null
          longitude: number | null
          nome_bairro: string
        }
        Insert: {
          ativo?: boolean
          id: string
          latitude?: number | null
          longitude?: number | null
          nome_bairro: string
        }
        Update: {
          ativo?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_bairro?: string
        }
        Relationships: []
      }
      cartoes: {
        Row: {
          adjunto: string | null
          adjunto_exibicao: string | null
          adjunto_pessoal_id: string | null
          ano: number | null
          atualizado_em: string | null
          data: string | null
          delta07_viatura: string | null
          fiscal: string | null
          fiscal_exibicao: string | null
          fiscal_pessoal_id: string | null
          id: string
          is_template: boolean
          nome_template: string | null
          numero: number | null
          oficial_sobreaviso: string | null
          origem_template_id: string | null
          padrao_ativo: boolean | null
          estado_template: string | null
          publicado_em: string | null
          publicado_por: string | null
          versao_publicada: number | null
          qtd_viaturas_base: number | null
          tipo_periodo: string | null
          viaturas: Json
        }
        Insert: {
          adjunto?: string | null
          adjunto_exibicao?: string | null
          adjunto_pessoal_id?: string | null
          ano?: number | null
          atualizado_em?: string | null
          data?: string | null
          delta07_viatura?: string | null
          fiscal?: string | null
          fiscal_exibicao?: string | null
          fiscal_pessoal_id?: string | null
          id: string
          is_template?: boolean
          nome_template?: string | null
          numero?: number | null
          oficial_sobreaviso?: string | null
          origem_template_id?: string | null
          padrao_ativo?: boolean | null
          estado_template?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          versao_publicada?: number | null
          qtd_viaturas_base?: number | null
          tipo_periodo?: string | null
          viaturas?: Json
        }
        Update: {
          adjunto?: string | null
          adjunto_exibicao?: string | null
          adjunto_pessoal_id?: string | null
          ano?: number | null
          atualizado_em?: string | null
          data?: string | null
          delta07_viatura?: string | null
          fiscal?: string | null
          fiscal_exibicao?: string | null
          fiscal_pessoal_id?: string | null
          id?: string
          is_template?: boolean
          nome_template?: string | null
          numero?: number | null
          oficial_sobreaviso?: string | null
          origem_template_id?: string | null
          padrao_ativo?: boolean | null
          estado_template?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          versao_publicada?: number | null
          qtd_viaturas_base?: number | null
          tipo_periodo?: string | null
          viaturas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_origem_template_id_fkey"
            columns: ["origem_template_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          cota_mensal_diarias: number
          id: number
        }
        Insert: {
          cota_mensal_diarias?: number
          id?: number
        }
        Update: {
          cota_mensal_diarias?: number
          id?: number
        }
        Relationships: []
      }
      contador_cartoes: {
        Row: {
          ano: number
          ultimo: number
        }
        Insert: {
          ano: number
          ultimo?: number
        }
        Update: {
          ano?: number
          ultimo?: number
        }
        Relationships: []
      }
      escalas: {
        Row: {
          data: string | null
          id: string
          militar_id: string | null
          militar_nome: string
          operacao_id: string
          qtd_aparicoes: number
          total_diarias: number
        }
        Insert: {
          data?: string | null
          id: string
          militar_id?: string | null
          militar_nome: string
          operacao_id: string
          qtd_aparicoes?: number
          total_diarias?: number
        }
        Update: {
          data?: string | null
          id?: string
          militar_id?: string | null
          militar_nome?: string
          operacao_id?: string
          qtd_aparicoes?: number
          total_diarias?: number
        }
        Relationships: [
          {
            foreignKeyName: "escalas_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          bairro: string | null
          created_at: string | null
          data_inicio: string
          data_termino: string | null
          demandante: string | null
          endereco: string | null
          horario_inicio: string | null
          id: string
          local_itinerario: string | null
          nome_evento: string
          num_oficio: string | null
          num_os_manual: string | null
          num_sei: string | null
          tipo_evento: string
        }
        Insert: {
          bairro?: string | null
          created_at?: string | null
          data_inicio: string
          data_termino?: string | null
          demandante?: string | null
          endereco?: string | null
          horario_inicio?: string | null
          id: string
          local_itinerario?: string | null
          nome_evento: string
          num_oficio?: string | null
          num_os_manual?: string | null
          num_sei?: string | null
          tipo_evento: string
        }
        Update: {
          bairro?: string | null
          created_at?: string | null
          data_inicio?: string
          data_termino?: string | null
          demandante?: string | null
          endereco?: string | null
          horario_inicio?: string | null
          id?: string
          local_itinerario?: string | null
          nome_evento?: string
          num_oficio?: string | null
          num_os_manual?: string | null
          num_sei?: string | null
          tipo_evento?: string
        }
        Relationships: []
      }
      missoes_planejadas: {
        Row: {
          ano: string
          convertida_em_evento_id: string | null
          data_fim: string
          data_inicio: string
          id: string
          mes: string
          nome: string
          qtd_diarias_por_ocorrencia: number
          tipo_recorrencia: string
        }
        Insert: {
          ano: string
          convertida_em_evento_id?: string | null
          data_fim: string
          data_inicio: string
          id: string
          mes: string
          nome: string
          qtd_diarias_por_ocorrencia: number
          tipo_recorrencia: string
        }
        Update: {
          ano?: string
          convertida_em_evento_id?: string | null
          data_fim?: string
          data_inicio?: string
          id?: string
          mes?: string
          nome?: string
          qtd_diarias_por_ocorrencia?: number
          tipo_recorrencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "missoes_planejadas_convertida_em_evento_id_fkey"
            columns: ["convertida_em_evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      operacoes: {
        Row: {
          bairro: string | null
          created_at: string | null
          data_inicio: string
          data_termino: string | null
          demandante: string | null
          grupo_recorrencia_id: string | null
          horario_inicio: string | null
          id: string
          local_itinerario: string | null
          nome_operacao: string
          num_oficio: string | null
          num_os_manual: string | null
          num_sei: string | null
          qtd_diarias_estimada: number
          recorrencia_regra: Json | null
          situacao: string
          tipo_operacao: string
          tipo_recorrencia: string | null
        }
        Insert: {
          bairro?: string | null
          created_at?: string | null
          data_inicio: string
          data_termino?: string | null
          demandante?: string | null
          grupo_recorrencia_id?: string | null
          horario_inicio?: string | null
          id: string
          local_itinerario?: string | null
          nome_operacao: string
          num_oficio?: string | null
          num_os_manual?: string | null
          num_sei?: string | null
          qtd_diarias_estimada?: number
          recorrencia_regra?: Json | null
          situacao?: string
          tipo_operacao?: string
          tipo_recorrencia?: string | null
        }
        Update: {
          bairro?: string | null
          created_at?: string | null
          data_inicio?: string
          data_termino?: string | null
          demandante?: string | null
          grupo_recorrencia_id?: string | null
          horario_inicio?: string | null
          id?: string
          local_itinerario?: string | null
          nome_operacao?: string
          num_oficio?: string | null
          num_os_manual?: string | null
          num_sei?: string | null
          qtd_diarias_estimada?: number
          recorrencia_regra?: Json | null
          situacao?: string
          tipo_operacao?: string
          tipo_recorrencia?: string | null
        }
        Relationships: []
      }
      pessoal: {
        Row: {
          ativo: boolean
          categorias: string[]
          id: string
          matricula: string | null
          nome: string
          nome_guerra: string | null
          posto_graduacao: string
          subunidade: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          categorias?: string[]
          id: string
          matricula?: string | null
          nome: string
          nome_guerra?: string | null
          posto_graduacao: string
          subunidade?: string | null
          tipo: string
        }
        Update: {
          ativo?: boolean
          categorias?: string[]
          id?: string
          matricula?: string | null
          nome?: string
          nome_guerra?: string | null
          posto_graduacao?: string
          subunidade?: string | null
          tipo?: string
        }
        Relationships: []
      }
      sessoes: {
        Row: {
          exigir_troca_senha: boolean
          expira: number
          nome: string
          role: string
          token: string
          usuario: string
        }
        Insert: {
          exigir_troca_senha?: boolean
          expira: number
          nome: string
          role: string
          token: string
          usuario: string
        }
        Update: {
          exigir_troca_senha?: boolean
          expira?: number
          nome?: string
          role?: string
          token?: string
          usuario?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean
          exigir_troca_senha: boolean
          nome: string
          role: string
          senha: string
          usuario: string
        }
        Insert: {
          ativo?: boolean
          exigir_troca_senha?: boolean
          nome: string
          role: string
          senha: string
          usuario: string
        }
        Update: {
          ativo?: boolean
          exigir_troca_senha?: boolean
          nome?: string
          role?: string
          senha?: string
          usuario?: string
        }
        Relationships: []
      }
      viaturas: {
        Row: {
          categoria: string
          companhia: string | null
          id: string
          observacao: string | null
          prefixo: string
          setor: string | null
          status: string
        }
        Insert: {
          categoria?: string
          companhia?: string | null
          id: string
          observacao?: string | null
          prefixo: string
          setor?: string | null
          status?: string
        }
        Update: {
          categoria?: string
          companhia?: string | null
          id?: string
          observacao?: string | null
          prefixo?: string
          setor?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      proximo_numero_cartao: { Args: { p_ano: number }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
