import { useState, type FormEvent } from 'react';
import { Pencil, UserPlus, X, Check } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { CATEGORIAS_PESSOAL, POSTOS_GRADUACAO, SUBUNIDADES_PESSOAL } from '../../../lib/postosGraduacao';
import { useToast } from '../../../context/useToast';
import type { PessoaPayload, ResultadoAcao } from './usePessoalCrud';

interface ModalPessoaProps {
  /** undefined/null = modo criação; presente = modo edição, pré-preenchido. */
  pessoa?: Tables<'pessoal'> | null;
  onFechar: () => void;
  onSalvar: (payload: PessoaPayload) => Promise<ResultadoAcao>;
}

function formularioVazio(): PessoaPayload {
  // posto_graduacao começa na 1ª opção (Soldado PM) — o <select> antigo não
  // tinha opção em branco, então o navegador já selecionava a 1ª por padrão.
  return { nome: '', matricula: '', subunidade: '', posto_graduacao: POSTOS_GRADUACAO[0].posto, categorias: [] };
}

function formularioDaPessoa(pessoa: Tables<'pessoal'>): PessoaPayload {
  return {
    nome: pessoa.nome,
    matricula: pessoa.matricula || '',
    subunidade: pessoa.subunidade || '',
    posto_graduacao: pessoa.posto_graduacao,
    categorias: [...pessoa.categorias],
  };
}

const PRACAS = POSTOS_GRADUACAO.filter((p) => p.tipo === 'Praça');
const OFICIAIS = POSTOS_GRADUACAO.filter((p) => p.tipo === 'Oficial');

// Modal "Nova/Editar Pessoa" — espelha #modal-pessoa + abrirModalPessoa()/
// handleSalvarPessoa() em public/app.js. Sem campo de nome de guerra de
// propósito: não existe no form antigo (só populado pela importação em massa
// do SGEPM) — editar aqui nunca deve tocar em pessoa.nome_guerra.
export function ModalPessoa({ pessoa, onFechar, onSalvar }: ModalPessoaProps) {
  const { toast } = useToast();
  const modoEdicao = !!pessoa;
  const [form, setForm] = useState<PessoaPayload>(() => (pessoa ? formularioDaPessoa(pessoa) : formularioVazio()));
  const [enviando, setEnviando] = useState(false);

  function atualizar<K extends keyof PessoaPayload>(campo: K, valor: PessoaPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarCategoria(categoria: string) {
    setForm((atual) => ({
      ...atual,
      categorias: atual.categorias.includes(categoria)
        ? atual.categorias.filter((c) => c !== categoria)
        : [...atual.categorias, categoria],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: PessoaPayload = {
      nome: form.nome.trim(),
      matricula: form.matricula.trim(),
      subunidade: form.subunidade,
      posto_graduacao: form.posto_graduacao,
      categorias: form.categorias,
    };

    setEnviando(true);
    const resultado = await onSalvar(payload);
    setEnviando(false);
    if (resultado.ok) {
      toast(modoEdicao ? 'Cadastro atualizado com sucesso.' : 'Pessoa cadastrada com sucesso.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{modoEdicao ? <Pencil /> : <UserPlus />} {modoEdicao ? 'Editar Pessoa' : 'Nova Pessoa'}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pes-nome">Nome (como deve aparecer no Cartão Programa)</label>
            <input
              type="text" id="pes-nome" required placeholder="Ex: 3º SGT PM HERAYSON"
              value={form.nome} onChange={(e) => atualizar('nome', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="pes-matricula">Matrícula (RE)</label>
            <input
              type="text" id="pes-matricula" maxLength={30} placeholder="Opcional"
              value={form.matricula} onChange={(e) => atualizar('matricula', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="pes-subunidade">Subunidade</label>
            <select id="pes-subunidade" value={form.subunidade} onChange={(e) => atualizar('subunidade', e.target.value)}>
              <option value="">Não informada</option>
              {SUBUNIDADES_PESSOAL.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pes-posto">Posto/Graduação</label>
            <select id="pes-posto" required value={form.posto_graduacao} onChange={(e) => atualizar('posto_graduacao', e.target.value)}>
              <optgroup label="Praças">
                {PRACAS.map((p) => <option key={p.posto} value={p.posto}>{p.posto}</option>)}
              </optgroup>
              <optgroup label="Oficiais">
                {OFICIAIS.map((p) => <option key={p.posto} value={p.posto}>{p.posto}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="form-group">
            <label>Categorias (pode marcar mais de uma)</label>
            <div className="pessoal-categorias-checkboxes">
              {CATEGORIAS_PESSOAL.map((c) => (
                <label key={c}>
                  <input type="checkbox" value={c} checked={form.categorias.includes(c)} onChange={() => alternarCategoria(c)} /> {c}
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
