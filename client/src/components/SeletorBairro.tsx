import { useState } from 'react';
import { useBairros } from '../hooks/useBairros';

interface SeletorBairroProps {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// Select de Bairro + campo livre "Outro" — reaproveitado por Novo Evento e
// Editar Evento. Espelha popularSelectBairros() + o toggle bairro/bairro_outro
// em public/app.js: se o valor atual não estiver no cadastro, cai automaticamente
// no modo "Outro" com o texto preenchido (mesma resolução do abrirModalEditarEvento()).
export function SeletorBairro({ idPrefix, value, onChange, className }: SeletorBairroProps) {
  const { bairros } = useBairros();
  const [modoOutroForcado, setModoOutroForcado] = useState(false);

  const nomesConhecidos = new Set(bairros.map((b) => b.nome_bairro));
  const modoOutro = modoOutroForcado || (!!value && !nomesConhecidos.has(value));

  function handleSelectChange(v: string) {
    if (v === '__outro__') {
      setModoOutroForcado(true);
      onChange('');
    } else {
      setModoOutroForcado(false);
      onChange(v);
    }
  }

  return (
    <div className={className || 'form-group col-md-4'}>
      <label htmlFor={idPrefix}>Bairro</label>
      <select id={idPrefix} value={modoOutro ? '__outro__' : value} onChange={(e) => handleSelectChange(e.target.value)}>
        <option value="">Selecione...</option>
        {bairros.map((b) => <option key={b.id} value={b.nome_bairro}>{b.nome_bairro}</option>)}
        <option value="__outro__">Outro (não cadastrado)</option>
      </select>
      {modoOutro && (
        <input
          type="text" id={`${idPrefix}_outro`} placeholder="Digite o nome do bairro" style={{ marginTop: 8 }}
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
