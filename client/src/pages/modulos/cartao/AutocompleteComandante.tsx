import { useEffect, useRef, useState } from 'react';
import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { abreviarPosto } from '../../../lib/abrevPosto';

interface AutocompleteComandanteProps {
  id: string;
  pessoal: Tables<'pessoal'>[];
  valor: string;
  onChange: (nome: string, pessoaId: string) => void;
}

export function AutocompleteComandante({ id, pessoal, valor, onChange }: AutocompleteComandanteProps) {
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const termo = normalizarTexto(valor);
  const resultados = termo ? pessoal.filter((pessoa) => [
    pessoa.nome, pessoa.nome_guerra, pessoa.posto_graduacao, pessoa.matricula,
  ].some((campo) => normalizarTexto(campo).includes(termo))).slice(0, 8) : [];

  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: MouseEvent) => {
      if (ref.current && !ref.current.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  function selecionar(pessoa: Tables<'pessoal'>) {
    onChange(pessoa.nome, pessoa.id);
    setAberto(false);
    setIndice(-1);
  }

  return (
    <div className="autocomplete-wrap" ref={ref}>
      <input
        id={id} type="text" autoComplete="off" role="combobox" aria-autocomplete="list"
        aria-expanded={aberto && resultados.length > 0}
        placeholder="Buscar por nome, nome de guerra, posto ou RE"
        value={valor}
        onFocus={() => setAberto(true)}
        onChange={(e) => { onChange(e.target.value, ''); setAberto(true); setIndice(-1); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, resultados.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && indice >= 0) { e.preventDefault(); selecionar(resultados[indice]); }
          if (e.key === 'Escape') setAberto(false);
        }}
      />
      {aberto && resultados.length > 0 && (
        <div className="autocomplete-results" role="listbox">
          {resultados.map((pessoa, i) => (
            <button
              type="button" key={pessoa.id} role="option" aria-selected={i === indice}
              className={`autocomplete-item${i === indice ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); selecionar(pessoa); }}
            >
              <span className="ac-nome">{abreviarPosto(pessoa.posto_graduacao)} · {pessoa.nome_guerra || pessoa.nome}</span>
              <span className="ac-sub">{[pessoa.nome, pessoa.matricula].filter(Boolean).join(' — ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
