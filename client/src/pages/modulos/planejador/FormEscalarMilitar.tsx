import { useState, type FormEvent } from 'react';
import { Calculator, Wallet } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { useToast } from '../../../context/useToast';
import { AutocompleteMilitar } from './AutocompleteMilitar';
import type { EscalaPayload, ResultadoAcao } from './useOperacaoDrawer';

interface FormEscalarMilitarProps {
  operacao: Tables<'operacoes'>;
  pessoal: Tables<'pessoal'>[];
  operacoesTodas: Tables<'operacoes'>[];
  escalasTodas: Tables<'escalas'>[];
  cotaMensal: number;
  onAdicionar: (payload: EscalaPayload) => Promise<ResultadoAcao>;
  onFechar: () => void;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Sub-formulário "Escalar Militar" da gaveta de Operação — nome via autocomplete,
// matrícula trava se o militar tiver cadastro, preview de diárias e de saldo da
// cota. Espelha o bloco #form-escala-container + handleCreateEscala() +
// updateEscalaBudgetPreview() em public/app.js.
export function FormEscalarMilitar({
  operacao,
  pessoal,
  operacoesTodas,
  escalasTodas,
  cotaMensal,
  onAdicionar,
  onFechar,
}: FormEscalarMilitarProps) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [matriculaTravada, setMatriculaTravada] = useState(false);
  const [qtdAparicoes, setQtdAparicoes] = useState('1');
  const [enviando, setEnviando] = useState(false);

  const qtd = parseInt(qtdAparicoes, 10) || 1;
  const novasDiarias = qtd * 2;

  const prefixoMes = operacao.data_inicio.slice(0, 7);
  const idsOperacoesMes = new Set(
    operacoesTodas.filter((o) => o.data_inicio.startsWith(prefixoMes)).map((o) => o.id),
  );
  const consumidoMes = escalasTodas
    .filter((s) => idsOperacoesMes.has(s.operacao_id))
    .reduce((soma, s) => soma + (s.total_diarias || 0), 0);
  const saldoApos = cotaMensal - consumidoMes - novasDiarias;
  const [anoEvt, mesEvt] = operacao.data_inicio.split('-');
  const nomeMesEvt = MESES[parseInt(mesEvt, 10) - 1] || mesEvt;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await onAdicionar({ militar_nome: nome.trim(), militar_id: matricula.trim(), qtd_aparicoes: qtd });
    setEnviando(false);
    if (resultado.ok) {
      toast('Policial militar escalado com sucesso!', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="sub-form-panel">
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <AutocompleteMilitar
            pessoal={pessoal}
            valor={nome}
            onChange={(v) => { setNome(v); if (!v.trim()) setMatriculaTravada(false); }}
            onSelecionar={(nomeSel, matriculaSel) => {
              setNome(nomeSel);
              setMatricula(matriculaSel);
              setMatriculaTravada(!!matriculaSel);
            }}
          />
          <div className="form-group col-md-4">
            <label htmlFor="esc_militar_id">Matrícula / ID *</label>
            <input
              type="text" id="esc_militar_id" placeholder="Ex: 123.456-7" autoComplete="off" required
              value={matricula} readOnly={matriculaTravada}
              onChange={(e) => setMatricula(e.target.value)}
            />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="esc_qtd_aparicoes">Nº Aparições *</label>
            <input
              type="number" id="esc_qtd_aparicoes" min={1} required
              value={qtdAparicoes} onChange={(e) => setQtdAparicoes(e.target.value)}
            />
          </div>
        </div>
        <div className="calculation-preview">
          <Calculator />
          <span>Cálculo automático de diárias: <strong>{novasDiarias}</strong> diárias operacionais.</span>
        </div>
        <div className={`calculation-preview budget${saldoApos < 0 ? ' exceeded' : ''}`}>
          <Wallet />
          <span>
            {cotaMensal <= 0 ? (
              <>Nenhuma cota mensal definida. Configure no <strong>Planejador de Diárias</strong>.</>
            ) : saldoApos < 0 ? (
              <>Atenção: esta escala <strong>excede a cota de {nomeMesEvt}/{anoEvt} em {Math.abs(saldoApos)} diária(s)</strong>.</>
            ) : (
              <>Saldo da cota de {nomeMesEvt}/{anoEvt} após esta escala: <strong>{saldoApos}</strong> diária(s) disponível(is).</>
            )}
          </span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}>Cancelar</button>
          <button type="submit" className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
            Confirmar Escala
          </button>
        </div>
      </form>
    </div>
  );
}
