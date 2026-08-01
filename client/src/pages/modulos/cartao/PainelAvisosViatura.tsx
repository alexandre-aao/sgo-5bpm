import { useEffect, useMemo, useRef } from 'react';
import { Megaphone } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import {
  avisosDaViatura,
  bairrosDaViatura,
  prioridadeBadgeClass,
  ROTULO_PRIORIDADE,
  PRIORIDADES_PRE_MARCADAS,
  MAX_AVISOS_POR_CARTAO,
  type PrioridadeAviso,
} from '../../../lib/avisos';

interface PainelAvisosViaturaProps {
  avisos: Tables<'avisos'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  viatura: { bairro_id?: string; setor?: string; companhia?: string; itens?: { local: string }[] };
  selecionados: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Avisos que se aplicam à viatura, para o Adjunto marcar o que entra no cartão.
 * Alta e crítica já vêm marcadas; informativa e atenção ficam visíveis e
 * desmarcadas. Teto de 4 (protege a página única) — atingido o teto, o que está
 * desmarcado fica desabilitado em vez de sumir, para o operador ver o que ficou
 * de fora.
 */
export function PainelAvisosViatura({ avisos, bairros, viatura, selecionados, onChange }: PainelAvisosViaturaProps) {
  const cobertura = useMemo(() => bairrosDaViatura(viatura, bairros), [viatura, bairros]);
  const bairrosIds = useMemo(() => cobertura.map((c) => c.bairro.id), [cobertura]);

  const aplicaveis = useMemo(
    () => avisosDaViatura(avisos, bairrosIds, viatura.companhia),
    [avisos, bairrosIds, viatura.companhia],
  );

  // Pré-marcação roda quando muda o conjunto de avisos aplicáveis (ou seja,
  // quando o Adjunto troca o bairro) — nunca por cima de uma escolha manual já
  // feita para o mesmo conjunto.
  const assinaturaRef = useRef<string | null>(null);
  const assinatura = aplicaveis.map((a) => a.id).join(',');

  useEffect(() => {
    if (assinaturaRef.current === assinatura) return;
    const primeiraVez = assinaturaRef.current === null;
    assinaturaRef.current = assinatura;
    // Na montagem com seleção já gravada, respeita o que está salvo.
    if (primeiraVez && selecionados.length > 0) return;

    const preMarcados = aplicaveis
      .filter((a) => PRIORIDADES_PRE_MARCADAS.includes(a.prioridade as PrioridadeAviso))
      .slice(0, MAX_AVISOS_POR_CARTAO)
      .map((a) => a.id);

    const mesmos =
      preMarcados.length === selecionados.length && preMarcados.every((id) => selecionados.includes(id));
    if (!mesmos) onChange(preMarcados);
  }, [assinatura, aplicaveis, selecionados, onChange]);

  if (aplicaveis.length === 0) {
    return (
      <div className="form-group">
        <span className="form-label-estatico">Alertas</span>
        <span className="aviso-contador">
          {bairrosIds.length === 0
            ? 'Vincule um bairro à viatura para trazer os alertas da P3.'
            : 'Nenhum alerta vigente para esta área.'}
        </span>
      </div>
    );
  }

  const noTeto = selecionados.length >= MAX_AVISOS_POR_CARTAO;
  const nomesCobertura = cobertura.map((c) => c.bairro.nome_bairro).join(', ');
  const soPorNome = cobertura.length > 0 && cobertura.every((c) => !c.explicito);

  function alternar(id: string) {
    if (selecionados.includes(id)) {
      onChange(selecionados.filter((x) => x !== id));
    } else if (!noTeto) {
      onChange([...selecionados, id]);
    }
  }

  return (
    <div className="form-group">
      <span className="form-label-estatico">
        <Megaphone style={{ width: 13, height: 13, verticalAlign: '-2px' }} />{' '}
        {aplicaveis.length} alerta(s) para {nomesCobertura.toUpperCase()}
      </span>
      {soPorNome && (
        <span className="aviso-contador">
          Área identificada pelo texto do setor/roteiro. Vincule o bairro no campo acima para fixar.
        </span>
      )}
      <div className="avisos-cartao-lista">
        {aplicaveis.map((aviso) => {
          const marcado = selecionados.includes(aviso.id);
          return (
            <label key={aviso.id} className={`aviso-selecionavel${marcado ? ' marcado' : ''}`}>
              <input
                type="checkbox"
                checked={marcado}
                disabled={!marcado && noTeto}
                onChange={() => alternar(aviso.id)}
              />
              <span className="aviso-selecionavel-corpo">
                <span className="aviso-selecionavel-cabecalho">
                  <span className={`badge ${prioridadeBadgeClass(aviso.prioridade)}`}>
                    {ROTULO_PRIORIDADE[aviso.prioridade as PrioridadeAviso]}
                  </span>
                  {aviso.categoria && <strong>{aviso.categoria}</strong>}
                </span>
                <span className="aviso-selecionavel-texto">{aviso.texto}</span>
              </span>
            </label>
          );
        })}
      </div>
      {noTeto && (
        <span className="aviso-teto-atingido">
          Limite de {MAX_AVISOS_POR_CARTAO} alertas por cartão atingido — desmarque um para trocar.
        </span>
      )}
    </div>
  );
}
