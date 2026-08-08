import type { MapaPrefs } from './useMapaPrefs';

/**
 * Legenda das cores do mapa. As cores de categoria de viatura e de prioridade de
 * alerta já existiam no mapa sem nenhuma explicação na tela — quem não conhecia
 * a convenção via pontos coloridos sem significado.
 *
 * Os literais repetem os de `viaturasNoMapa.ts` e `avisosNoMapa.ts` de propósito:
 * o Leaflet pinta fora da cascata do componente e não resolve `var(--…)`, então
 * a fonte da verdade é o valor literal, e a legenda precisa bater com ele.
 */
const CATEGORIAS = [
  { rotulo: 'Força Tática', classe: 'mapa-cor-forca-tatica' },
  { rotulo: 'Suplementar', classe: 'mapa-cor-suplementar' },
  { rotulo: 'Ordinária', classe: 'mapa-cor-ordinaria' },
];

const PRIORIDADES = [
  { rotulo: 'Crítica', classe: 'mapa-prioridade-critica' },
  { rotulo: 'Alta', classe: 'mapa-prioridade-alta' },
  { rotulo: 'Atenção', classe: 'mapa-prioridade-atencao' },
  { rotulo: 'Informativa', classe: 'mapa-prioridade-informativa' },
];

export function LegendaMapa({ prefs }: { prefs: MapaPrefs }) {
  // Só entra na legenda o que está de fato desenhado: legenda de camada
  // desligada explica algo que o usuário não está vendo.
  if (!prefs.mostrarViaturas && !prefs.mostrarAvisos) return null;

  return (
    <div className="mapa-legenda">
      {prefs.mostrarViaturas && (
        <div className="mapa-legenda-grupo">
          <span className="mapa-legenda-titulo">Viaturas</span>
          {CATEGORIAS.map((c) => (
            <span className="mapa-legenda-item" key={c.rotulo}>
              <span className={`mapa-legenda-quadrado ${c.classe}`} aria-hidden="true" />
              {c.rotulo}
            </span>
          ))}
        </div>
      )}

      {prefs.mostrarAvisos && (
        <div className="mapa-legenda-grupo">
          <span className="mapa-legenda-titulo">Alertas</span>
          {PRIORIDADES.map((p) => (
            <span className="mapa-legenda-item" key={p.rotulo}>
              <span className={`mapa-legenda-circulo ${p.classe}`} aria-hidden="true" />
              {p.rotulo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
