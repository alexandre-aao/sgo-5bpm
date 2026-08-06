import { useEffect, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { chaveMilitar } from '../../../lib/escalaLote';

interface SeletorMilitaresProps {
  pessoal: Tables<'pessoal'>[];
  /** Chaves já escolhidas — somem do dropdown para não serem adicionadas duas vezes. */
  chavesSelecionadas: string[];
  onSelecionar: (pessoa: Tables<'pessoal'>) => void;
  /** Escalar quem não está no cadastro continua permitido (o backend aceita escala
   *  sem matrícula), então o termo digitado pode ser adicionado como nome livre. */
  onAdicionarLivre: (nome: string) => void;
}

// Busca com MULTI-seleção de militares (nome / nome de guerra / matrícula).
// Substituiu o autocomplete de um militar por vez: escalar 8 pessoas exigia abrir e
// confirmar o formulário 8 vezes. Selecionar não fecha nem limpa o campo — a lista de
// chips fica logo abaixo e o campo segue pronto para o próximo nome.
export function SeletorMilitares({ pessoal, chavesSelecionadas, onSelecionar, onAdicionarLivre }: SeletorMilitaresProps) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const busca = normalizarTexto(termo);
  const jaSelecionadas = new Set(chavesSelecionadas);
  const resultados = busca
    ? pessoal
        .filter((p) =>
          normalizarTexto(p.nome).includes(busca) ||
          normalizarTexto(p.nome_guerra).includes(busca) ||
          normalizarTexto(p.matricula).includes(busca))
        .filter((p) => !jaSelecionadas.has(chaveMilitar(p.matricula, p.nome)))
        .slice(0, 8)
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
    onSelecionar(p);
    setTermo('');
    setIndiceAtivo(-1);
  }

  function adicionarLivre() {
    const nome = termo.trim();
    if (!nome) return;
    onAdicionarLivre(nome);
    setTermo('');
    setIndiceAtivo(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (indiceAtivo >= 0 && resultados[indiceAtivo]) selecionar(resultados[indiceAtivo]);
      else if (resultados.length === 0 && termo.trim()) adicionarLivre();
    }
  }

  const semResultado = busca.length > 0 && resultados.length === 0;

  return (
    <div className="form-group col-md-12 autocomplete-wrap" ref={wrapRef}>
      <label htmlFor="esc_busca_militar">Adicionar Militares</label>
      <input
        type="text" id="esc_busca_militar" autoComplete="off" role="combobox" aria-autocomplete="list"
        aria-expanded={aberto && resultados.length > 0}
        placeholder="Buscar por nome, nome de guerra ou matrícula"
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); setIndiceAtivo(-1); }}
        onFocus={() => setAberto(true)}
        onKeyDown={handleKeyDown}
      />
      {aberto && resultados.length > 0 && (
        <div className="autocomplete-results" role="listbox">
          {resultados.map((p, i) => (
            <div
              key={p.id} className={`autocomplete-item${i === indiceAtivo ? ' active' : ''}`} role="option"
              aria-selected={i === indiceAtivo}
              onMouseDown={(e) => { e.preventDefault(); selecionar(p); }}
            >
              <span className="ac-nome">{p.nome}</span>
              <span className="ac-sub">{[p.nome_guerra, p.matricula].filter(Boolean).join(' — ')}</span>
            </div>
          ))}
        </div>
      )}
      {aberto && semResultado && (
        <div className="autocomplete-results">
          <button type="button" className="autocomplete-item autocomplete-item-acao" onMouseDown={(e) => { e.preventDefault(); adicionarLivre(); }}>
            <UserPlus /> Escalar <strong>{termo.trim()}</strong> sem cadastro
          </button>
        </div>
      )}
    </div>
  );
}
