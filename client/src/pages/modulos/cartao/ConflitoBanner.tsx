import { AlertTriangle } from 'lucide-react';
import type { AlertaConflito } from '../../../lib/cartaoConflitos';

const ROTULO_CONFLITO: Record<AlertaConflito['tipo'], string> = {
  sobreposicao: 'Sobreposição de horário',
  cobertura: 'Setor sem cobertura',
  'sobreaviso-pendente': 'Fiscal Praça sem Oficial de Sobreaviso',
};

interface ConflitoBannerProps {
  alertas: AlertaConflito[];
}

// Faixa âmbar no topo do cartão, resumo em uma linha — espelha o trecho do
// banner em renderAlertasCartao(). O detalhamento fica no trilho (AlertasConflito).
export function ConflitoBanner({ alertas }: ConflitoBannerProps) {
  if (alertas.length === 0) return null;

  const tipos = [...new Set(alertas.map((a) => ROTULO_CONFLITO[a.tipo] || 'Conflito'))];

  return (
    <div className="cartao-conflito-banner">
      <AlertTriangle />
      <div className="cartao-conflito-texto">
        <strong>{alertas.length} {alertas.length === 1 ? 'alerta de conflito' : 'alertas de conflito'} neste cartão.</strong>
        <span>{tipos.join(' · ')}</span>
      </div>
    </div>
  );
}
