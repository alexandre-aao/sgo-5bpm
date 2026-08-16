import { Info, X } from 'lucide-react';
import type { Tables } from '../../../types/supabase';

interface DrawerOperacaoTurnoProps {
  operacao: Tables<'operacoes'>;
  onFechar: () => void;
}

function dataBr(data?: string | null): string {
  return data ? data.split('-').reverse().join('/') : '—';
}

/** Detalhes estritamente operacionais para o Meu Turno. Não consulta escalas e
 * não renderiza estimativas, totais ou controles administrativos de diárias. */
export function DrawerOperacaoTurno({ operacao, onFechar }: DrawerOperacaoTurnoProps) {
  return (
    <div className="drawer open">
      <div className="drawer-overlay" onClick={onFechar} />
      <div className="drawer-content">
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="badge turno-badge-origem turno-badge-operacao">Operação</span>
            <h2>{operacao.nome_operacao}</h2>
          </div>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-section">
            <h3><Info /> Informações Operacionais</h3>
            <div className="details-grid">
              <div className="detail-item"><strong>Tipo:</strong> <span>{operacao.tipo_operacao || '—'}</span></div>
              <div className="detail-item"><strong>Situação:</strong> <span>{operacao.situacao || '—'}</span></div>
              <div className="detail-item"><strong>Início:</strong> <span>{dataBr(operacao.data_inicio)}</span></div>
              <div className="detail-item"><strong>Término:</strong> <span>{dataBr(operacao.data_termino || operacao.data_inicio)}</span></div>
              <div className="detail-item"><strong>Horário:</strong> <span>{operacao.horario_inicio || 'Não informado'}</span></div>
              <div className="detail-item"><strong>Bairro:</strong> <span>{operacao.bairro || '—'}</span></div>
              <div className="detail-item"><strong>Número da OS:</strong> <span>{operacao.num_os_manual || 'Não informado'}</span></div>
              <div className="detail-item"><strong>Número SEI:</strong> <span>{operacao.num_sei || 'Não informado'}</span></div>
              <div className="detail-item"><strong>Ofício:</strong> <span>{operacao.num_oficio || 'Não informado'}</span></div>
              <div className="detail-item"><strong>Demandante:</strong> <span>{operacao.demandante || 'Não informado'}</span></div>
              <div className="detail-item detalhe-duplo"><strong>Endereço:</strong> <span>{operacao.endereco || '—'}</span></div>
              <div className="detail-item detalhe-duplo"><strong>Local/Itinerário:</strong> <span>{operacao.local_itinerario || '—'}</span></div>
            </div>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
