import { useState, type FormEvent } from 'react';
import { Car, Plus } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { CATEGORIAS_VIATURA } from '../../../lib/categoriasViatura';
import { useToast } from '../../../context/useToast';
import { SeletorCompanhia } from './SeletorCompanhia';
import { PainelAvisosViatura } from './PainelAvisosViatura';
import { AutocompleteComandante } from './AutocompleteComandante';
import { SeletorBairrosViatura } from './SeletorBairrosViatura';
import type { ViaturaPayload } from './useViaturasCartao';
import type { ResultadoAcao } from './useCartaoPrograma';

const VAZIO: ViaturaPayload = {
  prefixo: '', setor: '', companhia: '', categoria: 'Ordinária', comandante: '', composicao: '',
  observacao: '', bairro_id: '', bairros_ids: [], comandante_pessoal_id: '', avisos_ids: [],
};

interface FormAdicionarViaturaProps {
  viaturasCadastradas: Tables<'viaturas'>[];
  pessoal: Tables<'pessoal'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  avisos: Tables<'avisos'>[];
  onAdicionar: (payload: ViaturaPayload) => Promise<ResultadoAcao>;
}

// Espelha o form #form-cartao-vtr de public/index.html + handleAddCartaoVtr().
export function FormAdicionarViatura({ viaturasCadastradas, pessoal, bairros, avisos, onAdicionar }: FormAdicionarViaturaProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ViaturaPayload>(VAZIO);
  const [enviando, setEnviando] = useState(false);

  function atualizarPrefixo(prefixo: string) {
    const prefixoNormalizado = prefixo.trim().toLocaleUpperCase('pt-BR');
    const cadastro = viaturasCadastradas.find((viatura) => viatura.prefixo.trim().toLocaleUpperCase('pt-BR') === prefixoNormalizado);
    setForm((atual) => {
      if (cadastro) {
        return {
          ...atual,
          prefixo,
          setor: cadastro.setor || atual.setor,
          companhia: cadastro.companhia || atual.companhia,
          categoria: cadastro.categoria || atual.categoria,
          // A observação cadastrada passa a ser o valor inicial do cartão; o
          // operador ainda pode ajustar o texto no cartão do dia sem alterar o
          // cadastro central.
          observacao: cadastro.observacao || atual.observacao,
        };
      }

      // Ao sair de um prefixo cadastrado, remova somente os valores que ainda
      // são exatamente os defaults daquele cadastro. Sem isso, uma VTR digitada
      // livremente herdava Companhia/setor/observação do prefixo anterior.
      const anterior = viaturasCadastradas.find((viatura) =>
        viatura.prefixo.trim().toLocaleUpperCase('pt-BR') === atual.prefixo.trim().toLocaleUpperCase('pt-BR'));
      if (!anterior) return { ...atual, prefixo };
      return {
        ...atual,
        prefixo,
        setor: atual.setor === (anterior.setor || '') ? '' : atual.setor,
        companhia: atual.companhia === (anterior.companhia || '') ? '' : atual.companhia,
        categoria: atual.categoria === (anterior.categoria || 'Ordinária') ? 'Ordinária' : atual.categoria,
        observacao: atual.observacao === (anterior.observacao || '') ? '' : atual.observacao,
      };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: ViaturaPayload = {
      ...form,
      prefixo: form.prefixo.trim(),
      setor: form.setor.trim().toUpperCase(),
      comandante: form.comandante.trim(),
      observacao: form.observacao.trim(),
    };
    setEnviando(true);
    const resultado = await onAdicionar(payload);
    setEnviando(false);
    if (resultado.ok) {
      toast(`VTR ${payload.prefixo} adicionada ao cartão.`, 'success');
      setForm(VAZIO);
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="panel cartao-add-vtr-panel">
      <div className="section-actions cartao-add-vtr-cabecalho">
        <h4><Car className="icone-inline-md icone-alinhado" /> Adicionar Viatura ao Cartão</h4>
      </div>
      <form className="styled-form cartao-add-vtr-form" onSubmit={handleSubmit}>
        <datalist id="lista-prefixos-viaturas">
          {viaturasCadastradas.map((v) => <option key={v.id} value={v.prefixo} />)}
        </datalist>
        <div className="form-row">
          <div className="form-group col-md-3">
            <label htmlFor="vtr_prefixo">Prefixo VTR *</label>
            <input
              type="text" id="vtr_prefixo" placeholder="Ex: B05-05" list="lista-prefixos-viaturas" required
              value={form.prefixo} onChange={(e) => atualizarPrefixo(e.target.value)}
            />
          </div>
          <div className="form-group col-md-4">
            <label htmlFor="vtr_setor">Setor / Bairro *</label>
            <input
              type="text" id="vtr_setor" placeholder="Ex: PONTA NEGRA" required
              value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}
            />
          </div>
          <div className="form-group col-md-5">
            <label htmlFor="vtr_comandante">Comandante da Guarnição</label>
            <AutocompleteComandante id="vtr_comandante" pessoal={pessoal} valor={form.comandante}
              onChange={(comandante, comandante_pessoal_id) => setForm({ ...form, comandante, comandante_pessoal_id })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group col-md-4">
            <label htmlFor="vtr_categoria">Categoria da Viatura</label>
            <select id="vtr_categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_VIATURA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group col-md-4">
            <label htmlFor="vtr_observacao">Obs. / Turno da Madrugada</label>
            <input
              type="text" id="vtr_observacao" placeholder="Ex: 1º TURNO - HEMISFÉRIO SUL"
              value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group col-md-6">
            <label htmlFor="vtr_composicao">Composição da guarnição</label>
            <input id="vtr_composicao" type="text" placeholder="Ex: 3º SGT SILVA · CB SOUZA · SD LIMA"
              value={form.composicao} onChange={(e) => setForm({ ...form, composicao: e.target.value })} />
          </div>
        </div>
        <SeletorBairrosViatura bairros={bairros} selecionados={form.bairros_ids}
          onChange={(bairros_ids) => setForm({ ...form, bairros_ids, bairro_id: bairros_ids[0] || '' })} />
        <div className="form-row">
          <SeletorCompanhia
            id="vtr_companhia"
            valor={form.companhia}
            onChange={(companhia) => setForm({ ...form, companhia })}
          />
        </div>

        <PainelAvisosViatura
          avisos={avisos}
          bairros={bairros}
          viatura={form}
          selecionados={form.avisos_ids}
          onChange={(avisos_ids) => setForm((atual) => ({ ...atual, avisos_ids }))}
        />
        <div className="form-row flex-fim">
          <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
            <Plus /> Adicionar Viatura
          </button>
        </div>
      </form>
    </div>
  );
}
