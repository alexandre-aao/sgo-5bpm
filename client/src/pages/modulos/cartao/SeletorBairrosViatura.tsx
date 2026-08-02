import type { Tables } from '../../../types/supabase';

interface SeletorBairrosViaturaProps {
  bairros: Tables<'bairros_coordenadas'>[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}

export function SeletorBairrosViatura({ bairros, selecionados, onChange }: SeletorBairrosViaturaProps) {
  function alternar(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter((item) => item !== id) : [...selecionados, id]);
  }
  return (
    <fieldset className="bairros-multiselect">
      <legend>Bairros atendidos</legend>
      <div>
        {bairros.map((bairro) => (
          <label className="checkbox-inline" key={bairro.id}>
            <input type="checkbox" checked={selecionados.includes(bairro.id)} onChange={() => alternar(bairro.id)} />
            <span>{bairro.nome_bairro}</span>
          </label>
        ))}
      </div>
      {selecionados.length === 0 && <small>Nenhum bairro vinculado; o setor operacional continua independente.</small>}
    </fieldset>
  );
}
