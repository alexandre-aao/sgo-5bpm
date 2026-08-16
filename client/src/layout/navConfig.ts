import {
  LayoutDashboard,
  CalendarRange,
  Map,
  UserCheck,
  Route,
  ShieldAlert,
  Wallet,
  FileText,
  UsersRound,
  Contact,
  Car,
  Calendar,
  ClipboardList,
  Megaphone,
  Printer,
  Menu,
  History,
  RefreshCcw,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types/auth';

export type SectionId =
  | 'dashboard'
  | 'cadastro'
  | 'eventos'
  | 'mapa'
  | 'turno'
  | 'cartao'
  | 'operacoes'
  | 'planejador'
  | 'relatorio'
  | 'usuarios'
  | 'pessoal'
  | 'viaturas'
  | 'avisos'
  | 'impressao'
  | 'historico'
  | 'alteracoes';

export interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** Perfis que veem este item — espelha applyRolePermissions() em public/app.js */
  roles: Role[];
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

// Agrupamento em 5 blocos (Etapa 1, item 5). Só entram telas que existem: os
// destinos "Agenda", "Pendências", "Escalas", "Bairros", "Estatísticas",
// "Configurações" e "Modelos" pedidos no agrupamento não têm rota própria —
// Escalas vive na gaveta de Operações, Bairros num painel do Mapa, Modelos nos
// Templates do Cartão, e Estatísticas nunca foi portada do app vanilla.
// Os `roles` de cada item são os mesmos de antes — o reagrupamento não mexe em
// permissão. Cadastro de Viaturas segue aberto a Adjunto/Oficial de propósito
// (exceção documentada no CLAUDE.md e em applyRolePermissions).
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Visão geral',
    items: [
      { id: 'dashboard', label: 'Início', icon: LayoutDashboard, roles: ['P3'] },
      { id: 'turno', label: 'Meu Turno', icon: UserCheck, roles: ['P3', 'Adjunto', 'Oficial'] },
      { id: 'alteracoes', label: 'Alterações do Serviço', icon: RefreshCcw, roles: ['P3', 'Adjunto', 'Oficial', 'Sargenteante'] },
    ],
  },
  {
    label: 'Planejamento',
    items: [
      { id: 'eventos', label: 'Eventos', icon: CalendarRange, roles: ['P3', 'Adjunto', 'Oficial'] },
      { id: 'operacoes', label: 'Operações', icon: ShieldAlert, roles: ['P3'] },
      { id: 'cartao', label: 'Cartão Programa', icon: Route, roles: ['P3', 'Adjunto', 'Oficial'] },
      // Alertas (id/tabela seguem "avisos" — só o rótulo mudou): só a P3 cria e
      // edita, mas todos veem — o Adjunto precisa consultar para selecionar no
      // cartão, e o Oficial para saber o que foi orientado ao turno. Fica só no
      // menu (a barra inferior do celular já tem seus 4 destinos + Mais).
      { id: 'avisos', label: 'Alertas', icon: Megaphone, roles: ['P3', 'Adjunto', 'Oficial'] },
      // Fora das bottom-tabs de propósito (já tem 4 destinos + Mais) — fica só no
      // menu/drawer, mesma decisão tomada para Alertas.
      { id: 'impressao', label: 'Impressão', icon: Printer, roles: ['P3', 'Adjunto', 'Oficial'] },
    ],
  },
  {
    label: 'Recursos',
    items: [
      { id: 'pessoal', label: 'Pessoal', icon: Contact, roles: ['P3'] },
      { id: 'viaturas', label: 'Viaturas', icon: Car, roles: ['P3', 'Adjunto', 'Oficial'] },
    ],
  },
  {
    label: 'Análise',
    items: [
      { id: 'mapa', label: 'Mapa', icon: Map, roles: ['P3', 'Adjunto', 'Oficial'] },
      { id: 'planejador', label: 'Planejador de Diárias', icon: Wallet, roles: ['P3'] },
      { id: 'relatorio', label: 'Relatório de Diárias', icon: FileText, roles: ['P3'] },
    ],
  },
  {
    label: 'Administração',
    items: [
      { id: 'usuarios', label: 'Usuários', icon: UsersRound, roles: ['P3'] },
      { id: 'historico', label: 'Histórico de Atividades', icon: History, roles: ['P3'] },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

// Espelha o objeto `titles` de setupNavigation() em public/app.js.
export const SECTION_TITLES: Record<SectionId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard Operacional', subtitle: 'Visão geral do policiamento e pautas do batalhão.' },
  cadastro: { title: 'Novo Evento', subtitle: 'Cadastro de novos eventos e ordens de policiamento recebidas.' },
  relatorio: { title: 'Relatório Financeiro de Efetivo', subtitle: 'Consolidação de escalas e diárias acumuladas por militar.' },
  turno: { title: 'Escala de Turno (Serviço Diário)', subtitle: 'Pauta focada de policiamento para os Oficiais de Dia e Adjuntos.' },
  eventos: { title: 'Consulta Geral de Pautas', subtitle: 'Lista consolidada de eventos históricos e futuros com filtros de busca.' },
  mapa: { title: 'Mapa de Eventos da Semana', subtitle: 'Localização geográfica dos eventos da semana corrente por bairro.' },
  operacoes: { title: 'Operações (Diárias)', subtitle: 'Operações planejadas e executadas, com efetivo escalado e diárias.' },
  planejador: { title: 'Planejador Mensal de Diárias', subtitle: 'Controle da cota mensal e distribuição de diárias operacionais por operação.' },
  cartao: { title: 'Cartão Programa', subtitle: 'Roteiro diário de patrulhamento das viaturas: locais, horários e atividades.' },
  usuarios: { title: 'Usuários do Sistema', subtitle: 'Gestão de perfis de acesso e redefinição de senhas.' },
  pessoal: { title: 'Cadastro de Pessoal', subtitle: 'Adjuntos, Fiscais de Operações, Oficiais de Operações e Oficiais de Sobreaviso.' },
  viaturas: { title: 'Cadastro de Viaturas', subtitle: 'Registro central de viaturas, usado para sugerir o prefixo no Cartão Programa.' },
  avisos: { title: 'Alertas', subtitle: 'Orientações da P3 por bairro e Companhia, que entram no Cartão Programa das viaturas.' },
  impressao: { title: 'Central de Emissão', subtitle: 'Saídas oficiais do Cartão Programa, num lugar só.' },
  historico: { title: 'Histórico de Atividades', subtitle: 'Quem fez o quê no SGO nos últimos 30 dias.' },
  alteracoes: { title: 'Alterações do Serviço', subtitle: 'Composição informada pelas unidades e situação projetada do efetivo.' },
};

/** Tela inicial por perfil — regra 7 do MIGRACAO.md. */
export function secaoInicialDoPerfil(role: Role): SectionId {
  if (role === 'P3') return 'dashboard';
  if (role === 'Sargenteante') return 'alteracoes';
  return 'turno';
}

interface BottomTabItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

// Espelha BOTTOM_TABS_P3 / BOTTOM_TABS_OPERACIONAL em public/app.js.
export const BOTTOM_TABS_P3: BottomTabItem[] = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
  { id: 'eventos', label: 'Eventos', icon: Calendar },
  { id: 'operacoes', label: 'Operações', icon: ShieldAlert },
  { id: 'cartao', label: 'Cartão', icon: ClipboardList },
];

export const BOTTOM_TABS_OPERACIONAL: BottomTabItem[] = [
  { id: 'turno', label: 'Meu Turno', icon: UserCheck },
  { id: 'cartao', label: 'Cartão', icon: ClipboardList },
  { id: 'eventos', label: 'Eventos', icon: Calendar },
  { id: 'mapa', label: 'Mapa', icon: Map },
];

export const BOTTOM_TABS_SARGENTEANTE: BottomTabItem[] = [
  { id: 'alteracoes', label: 'Alterações', icon: RefreshCcw },
];

export const MAIS_ICON = Menu;
