import {
  LayoutDashboard,
  FilePlus2,
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
  Menu,
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
  | 'viaturas';

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

// Espelha o <nav class="nav-menu"> de public/index.html, na mesma ordem. Cadastro de
// Viaturas fica aberto a Adjunto/Oficial de propósito (exceção documentada no
// CLAUDE.md e em applyRolePermissions — não é erro de digitação).
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['P3'] }],
  },
  {
    label: 'Eventos',
    items: [
      { id: 'cadastro', label: 'Novo Evento', icon: FilePlus2, roles: ['P3'] },
      { id: 'eventos', label: 'Listar Eventos', icon: CalendarRange, roles: ['P3', 'Adjunto', 'Oficial'] },
      { id: 'mapa', label: 'Mapa', icon: Map, roles: ['P3', 'Adjunto', 'Oficial'] },
    ],
  },
  {
    label: 'Patrulhamento',
    items: [
      { id: 'turno', label: 'Meu Turno', icon: UserCheck, roles: ['P3', 'Adjunto', 'Oficial'] },
      { id: 'cartao', label: 'Cartão Programa', icon: Route, roles: ['P3', 'Adjunto', 'Oficial'] },
    ],
  },
  {
    label: 'Diárias',
    items: [
      { id: 'operacoes', label: 'Operações', icon: ShieldAlert, roles: ['P3'] },
      { id: 'planejador', label: 'Planejador Diárias', icon: Wallet, roles: ['P3'] },
      { id: 'relatorio', label: 'Relatório Diárias', icon: FileText, roles: ['P3'] },
    ],
  },
  {
    label: 'Administração',
    items: [
      { id: 'usuarios', label: 'Usuários', icon: UsersRound, roles: ['P3'] },
      { id: 'pessoal', label: 'Cadastro de Pessoal', icon: Contact, roles: ['P3'] },
      { id: 'viaturas', label: 'Cadastro de Viaturas', icon: Car, roles: ['P3', 'Adjunto', 'Oficial'] },
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
};

/** Tela inicial por perfil — regra 7 do MIGRACAO.md. */
export function secaoInicialDoPerfil(role: Role): SectionId {
  return role === 'P3' ? 'dashboard' : 'turno';
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

export const MAIS_ICON = Menu;
