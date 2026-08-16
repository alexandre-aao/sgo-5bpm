import { useState } from 'react';
import { Calendar, Car, Users, AlertTriangle, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../../context/useAppData';
import { useCartaoPorData } from '../../../hooks/useCartaoPorData';
import { AtividadesDoDia, type AtividadeDoTurno } from './EventosDoDia';
import { ViaturasDoTurno } from './ViaturasDoTurno';
import { EquipeDeServico } from './EquipeDeServico';
import { AvisosDoTurno } from './AvisosDoTurno';
import { calcularAvisosDoTurno } from './avisos';
import { DrawerEvento } from '../eventos/DrawerEvento';
import { DrawerOperacaoTurno } from './DrawerOperacaoTurno';
import { ocorreNaData } from '../../../lib/periodo';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function getLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rotuloDiaBotao(prefixo: string, date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${prefixo} · ${dd}/${mm}`;
}

// Meu Turno — visão do dia (Hoje/Amanhã) para Adjunto/Oficial, landing page
// desses perfis. Espelha renderTurnoTab() em public/app.js.
// Fase 3.4 Lote 3 (final): + gaveta de detalhes do Evento (Detalhes +
// Modalidades Alocadas), abrindo ao clicar numa linha de Eventos do Dia.
export default function TurnoPage() {
  const { dados, recarregar: recarregarAppData } = useAppData();
  const [diaSelecionado, setDiaSelecionado] = useState<'hoje' | 'amanha'>('hoje');
  const [eventoAbertoId, setEventoAbertoId] = useState<string | null>(null);
  const [operacaoAbertaId, setOperacaoAbertaId] = useState<string | null>(null);

  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const alvo = diaSelecionado === 'amanha' ? amanha : hoje;
  const dataStr = getLocalDateStr(alvo);
  const dataBr = dataStr.split('-').reverse().join('/');

  const { cartao, carregando: carregandoCartao } = useCartaoPorData(dataStr);

  const operacoesDoDia = dados.operacoes.filter((op) => ocorreNaData(op.data_inicio, op.data_termino, dataStr));
  const idsOperacoes = new Set(dados.operacoes.map((op) => op.id));
  const idsEventosConvertidos = new Set(dados.operacoes.map((op) => op.evento_origem_id).filter(Boolean));
  const eventosDoDia = dados.eventos.filter((evento) =>
    ocorreNaData(evento.data_inicio, evento.data_termino, dataStr) &&
    !(evento.operacao_gerada_id && idsOperacoes.has(evento.operacao_gerada_id)) &&
    !idsEventosConvertidos.has(evento.id),
  );
  const atividadesDoDia: AtividadeDoTurno[] = [
    ...eventosDoDia.map((item) => ({ origem: 'evento' as const, item })),
    ...operacoesDoDia.map((item) => ({ origem: 'operacao' as const, item })),
  ].sort((a, b) => (a.item.horario_inicio || '').localeCompare(b.item.horario_inicio || ''));

  const totalEfetivo = atividadesDoDia.reduce(
    (soma, atividade) => soma + dados.alocacoes
      .filter((alocacao) => atividade.origem === 'evento'
        ? alocacao.evento_id === atividade.item.id
        : alocacao.operacao_id === atividade.item.id)
      .reduce((subtotal, alocacao) => subtotal + (alocacao.qtd_policiais || 0), 0),
    0,
  );

  const viaturas = cartao?.viaturas || [];
  const avisos = calcularAvisosDoTurno(cartao, atividadesDoDia.map((atividade) => ({
    nome: atividade.origem === 'evento' ? atividade.item.nome_evento : atividade.item.nome_operacao,
    num_os_manual: atividade.item.num_os_manual,
    num_sei: atividade.item.num_sei,
  })), dados.pessoal);
  const operacaoAberta = operacaoAbertaId
    ? dados.operacoes.find((operacao) => operacao.id === operacaoAbertaId) || null
    : null;

  const textoStatusCartao = carregandoCartao ? 'Verificando cartão...' : cartao ? 'Cartão Programa lançado' : 'Cartão Programa não lançado';
  const classePill = carregandoCartao ? '' : cartao ? ' status-pill-ok' : ' status-pill-pendente';

  return (
    <>
      <div className="turno-toolbar">
        <div className="dia-switch" role="radiogroup" aria-label="Dia do turno">
          <button
            type="button" className={`dia-opcao${diaSelecionado === 'hoje' ? ' ativo' : ''}`}
            role="radio" aria-checked={diaSelecionado === 'hoje'} onClick={() => setDiaSelecionado('hoje')}
          >
            {rotuloDiaBotao('Hoje', hoje)}
          </button>
          <button
            type="button" className={`dia-opcao${diaSelecionado === 'amanha' ? ' ativo' : ''}`}
            role="radio" aria-checked={diaSelecionado === 'amanha'} onClick={() => setDiaSelecionado('amanha')}
          >
            {rotuloDiaBotao('Amanhã', amanha)}
          </button>
        </div>
        <div className="turno-toolbar-acoes">
          <span className={`status-pill${classePill}`}>
            <span className="status-dot" /><span>{textoStatusCartao}</span>
          </span>
          <Link to="/cartao" className="btn btn-secondary btn-sm">
            <Route /> Abrir Cartão Programa
          </Link>
        </div>
      </div>

      <div className="kpi-row turno-kpis">
        <div className="kpi-card kpi-card-horizontal">
          <span className="kpi-icone fundo-primary tom-primary"><Calendar /></span>
          <div>
            <div className="kpi-valor">{atividadesDoDia.length}</div>
            <div className="kpi-label-sob">Atividades do dia</div>
          </div>
        </div>
        <div className="kpi-card kpi-card-horizontal">
          <span className="kpi-icone fundo-info tom-info"><Car /></span>
          <div>
            <div className="kpi-valor">{viaturas.length}</div>
            <div className="kpi-label-sob">Viaturas no turno</div>
          </div>
        </div>
        <div className="kpi-card kpi-card-horizontal">
          <span className="kpi-icone fundo-roxo tom-roxo"><Users /></span>
          <div>
            <div className="kpi-valor">{totalEfetivo}</div>
            <div className="kpi-label-sob">Efetivo empregado</div>
          </div>
        </div>
        <div className="kpi-card kpi-card-horizontal">
          <span className={`kpi-icone ${avisos.length ? 'fundo-warning tom-warning' : 'fundo-success tom-success'}`}>
            <AlertTriangle />
          </span>
          <div>
            <div className="kpi-valor">{avisos.length}</div>
            <div className="kpi-label-sob">Pendências do turno</div>
          </div>
        </div>
      </div>

      <div className="dash-layout">
        <div className="dash-main">
          <AtividadesDoDia
            atividades={atividadesDoDia} alocacoes={dados.alocacoes} dataBr={dataBr} diaLabel={DIAS[alvo.getDay()]}
            onAbrirEvento={setEventoAbertoId} onAbrirOperacao={setOperacaoAbertaId}
          />
          <ViaturasDoTurno viaturas={viaturas} />
        </div>
        <aside className="dash-rail">
          <EquipeDeServico cartao={cartao} />
          <AvisosDoTurno avisos={avisos} />
        </aside>
      </div>

      {eventoAbertoId && (
        <DrawerEvento
          eventoId={eventoAbertoId}
          onFechar={() => setEventoAbertoId(null)}
          onAlterado={() => void recarregarAppData()}
        />
      )}
      {operacaoAberta && (
        <DrawerOperacaoTurno operacao={operacaoAberta} onFechar={() => setOperacaoAbertaId(null)} />
      )}
    </>
  );
}
