import { useEffect, useRef, useState } from 'react';
import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';

interface AutocompleteMilitarProps {
  pessoal: Tables<'pessoal'>[];
  valor: string;
  onChange: (valor: string) => void;
  onSelecionar: (nome: string, matricula: string) => void;
}

// Autocomplete customizado de militar (nome/nome de guerra/matrícula) — substitui
// o <datalist> nativo, espelha renderAutocompleteEscala()/selecionarMilitarEscala()
// em public/app.js (form "Escalar Militar" da gaveta de Operação).
export function AutocompleteMilitar({ pessoal, valor, onChange, onSelecionar }: AutocompleteMilitarProps) {
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const termo = normalizarTexto(valor);
  const resultados = termo
    ? pessoal.filter((p) =>
        normalizarTexto(p.nome).includes(termo) ||
        normalizarTexto(p.nome_guerra).includes(termo) ||
        normalizarTexto(p.matricula).includes(termo),
      ).slice(0, 8)
    : [];

  useEffect(() => {
    if (!aberto) return;
    function handleClickFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  function selecionar(p: Tables<'pessoal'>) {
    onSelecionar(p.nome, p.matricula || '');
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || resultados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (indiceAtivo >= 0 && resultados[indiceAtivo]) {
        e.preventDefault();
        selecionar(resultados[indiceAtivo]);
      }
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div className="form-group col-md-5 autocomplete-wrap" ref={wrapRef}>
      <label htmlFor="esc_militar_nome">Nome Completo *</label>
      <input
        type="text" id="esc_militar_nome" placeholder="Buscar por nome, nome de guerra ou matrícula"
        autoComplete="off" role="combobox" aria-expanded={aberto && resultados.length > 0} aria-autocomplete="list" required
        value={valor}
        onChange={(e) => { onChange(e.target.value); setAberto(true); setIndiceAtivo(-1); }}
        onFocus={() => setAberto(true)}
        onKeyDown={handleKeyDown}
      />
      {aberto && resultados.length > 0 && (
        <div className="autocomplete-results" role="listbox">
          {resultados.map((p, i) => (
            <div
              key={p.id} className={`autocomplete-item${i === indiceAtivo ? ' active' : ''}`} role="option"
              onMouseDown={(e) => { e.preventDefault(); selecionar(p); }}
            >
              <span className="ac-nome">{p.nome}</span>
              <span className="ac-sub">{[p.nome_guerra, p.matricula].filter(Boolean).join(' — ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
