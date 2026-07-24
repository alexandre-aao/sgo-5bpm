import { ShieldCheck, UserCheck, PhoneCall } from 'lucide-react';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';

interface EquipeDeServicoProps {
  cartao: CartaoDetalhado | null;
}

// Trilho "Equipe de Serviço" do Meu Turno — os três papéis do cabeçalho do
// cartão do dia. Espelha o trecho de renderTurnoTab() que monta #turno-equipe.
export function EquipeDeServico({ cartao }: EquipeDeServicoProps) {
  const equipe = [
    { papel: 'Fiscal de Operações', nome: cartao?.fiscal, Icone: ShieldCheck, cor: 'var(--primary)', bg: 'var(--primary-soft)' },
    { papel: 'Adjunto', nome: cartao?.adjunto, Icone: UserCheck, cor: 'var(--success-fg)', bg: 'var(--success-bg)' },
    { papel: 'Oficial de Sobreaviso', nome: cartao?.oficial_sobreaviso, Icone: PhoneCall, cor: 'var(--roxo)', bg: 'var(--roxo-bg)' },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <UserCheck />
          <h2>Equipe de Serviço</h2>
        </div>
      </div>
      <div className="turno-equipe">
        {equipe.map((p) => (
          <div className="turno-equipe-item" key={p.papel}>
            <span className="turno-equipe-icone" style={{ background: p.bg, color: p.cor }}><p.Icone /></span>
            <div>
              <div className="turno-equipe-papel">{p.papel}</div>
              <div className={`turno-equipe-nome${p.nome ? '' : ' turno-equipe-vazio'}`}>{p.nome || 'Não designado'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
