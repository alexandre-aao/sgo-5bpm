import type { Tables } from '../../../types/supabase';

interface SeletorBairrosViaturaProps {
  bairros: Tables<'bairros_coordenadas'>[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}

export function SeletorBairrosViatura({ bairros, selecionados, onChange }: SeletorBairrosViaturaProps) {
  function alternar(id: string) {
    if (!selecionados.includes(id) && selecionados.length >= 3) return;
    onChange(selecionados.includes(id) ? selecionados.filter((item) => item !== id) : [...selecionados, id]);
  }
  return (
    <fieldset className="bairros-multiselect">
      <legend>Bairros atendidos ({selecionados.length}/3)</legend>
      <div>
        {bairros.map((bairro) => (
          <label className="checkbox-inline" key={bairro.id}>
            <input type="checkbox" checked={selecionados.includes(bairro.id)} disabled={!selecionados.includes(bairro.id) && selecionados.length >= 3} onChange={() => alternar(bairro.id)} />
            <span>{bairro.nome_bairro}</span>
          </label>
        ))}
      </div>
      {selecionados.length === 0 && <small>Nenhum bairro vinculado; o setor operacional continua independente.</small>}
      {selecionados.length > 0 && <small>Selecione até 3 bairros. Os demais ficam disponíveis ao desmarcar um.</small>}
    </fieldset>
  );
}
