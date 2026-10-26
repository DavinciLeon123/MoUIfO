import { useMemo } from 'preact/hooks';
import { useApp, useUi } from '../context.ts';
import type { VocabularyMember } from '../engine-host.ts';
import { fill, type Lang, modelText, type Rendered } from '../i18n/text.ts';
import type { Ui } from '../i18n/ui.en.ts';
import { type GraphEdge, graphEdges, layout } from '../model/graph.ts';
import { routeHref } from '../router.ts';
import { useSchemeName } from './ambiguity.tsx';
import { CertaintyBadge, MarkedText, SourceTitle } from './conclusion.tsx';

const NODE_HEIGHT = 28;
const CHAR_WIDTH = 8.5;

/**
 * The label of an edge: the relation kind from the model's vocabulary (Dutch where the model has it,
 * D-10), "rule <id>" or "component <prefix>". Rule ids and prefixes are data, not translated.
 */
function edgeLabel(
  edge: GraphEdge,
  vocabulary: readonly VocabularyMember[],
  lang: Lang,
  ui: Ui,
): Rendered {
  if (edge.type === 'rule') {
    return { text: fill(ui.edgeRule, { id: edge.ref }), lang, marker: null };
  }
  if (edge.type === 'component') {
    return { text: fill(ui.edgeComponent, { prefix: edge.ref }), lang, marker: null };
  }
  const label = vocabulary.find((entry) => entry.id === edge.ref)?.label;
  return label === undefined ? { text: edge.ref, lang, marker: null } : modelText(label, lang);
}

/**
 * D-15, WEB-02: the direct relations of a scheme as a hand-written SVG (the scheme in the middle,
 * its neighbours on a circle, each edge labelled and an inverse edge dashed and marked) followed by
 * the same edges as a visible list, which is the text alternative. Every edge comes from engine
 * describe data through graphEdges; the diagram adds no fact.
 */
export function RelationGraph({ id }: { id: string }) {
  const { host, lang } = useApp();
  const ui = useUi();
  const name = useSchemeName();
  const edges = useMemo(() => graphEdges(host, id), [host, id]);
  const placed = useMemo(() => layout(edges), [edges]);
  if (edges.length === 0) return <p class="relations-none">{ui.relationsNone}</p>;

  const vocabulary = host.model.vocab['relation-kind']?.values ?? [];
  const labels = edges.map((edge) => edgeLabel(edge, vocabulary, lang, ui));
  const boxWidth = (scheme: string) => Math.round(scheme.length * CHAR_WIDTH + 20);
  const centreWidth = boxWidth(id);
  return (
    <>
      <p class="note">{ui.relationsLegend}</p>
      {/* biome-ignore lint/a11y/useSemanticElements: an svg cannot be a fieldset; role group with a title names the diagram */}
      <svg
        class="graph"
        viewBox={`0 0 ${placed.width} ${placed.height}`}
        width="100%"
        role="group"
        aria-labelledby="relation-graph-title"
      >
        <title id="relation-graph-title">
          {fill(ui.relationsGraphTitle, { scheme: name(id) })}
        </title>
        <defs>
          <marker
            id="relation-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            orient="auto"
          >
            <path class="arrow-head" d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {edges.map((edge, index) => {
          const line = placed.lines[index];
          return line === undefined ? null : (
            <path
              key={`${edge.other}/${edge.type}/${edge.ref}/${edge.direction}`}
              class={edge.inverse ? 'edge edge-inverse' : 'edge'}
              data-edge={`${edge.type}/${edge.ref}/${edge.direction}`}
              d={`M ${line.x1} ${line.y1} L ${line.ax} ${line.ay} L ${line.x2} ${line.y2}`}
              fill="none"
              stroke-dasharray={edge.inverse ? '6 4' : undefined}
              marker-mid="url(#relation-arrow)"
            />
          );
        })}
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: the g holds only text labels, nothing focusable; the list below says the same */}
        <g aria-hidden="true">
          {edges.map((edge, index) => {
            const line = placed.lines[index];
            const label = labels[index];
            if (line === undefined || label === undefined) return null;
            return (
              <text
                key={`label/${edge.other}/${edge.type}/${edge.ref}/${edge.direction}`}
                class="edge-label"
                x={line.lx}
                y={line.ly}
                text-anchor="middle"
                lang={label.lang === lang ? undefined : label.lang}
              >
                {edge.inverse ? `${label.text} (${ui.edgeInverse})` : label.text}
              </text>
            );
          })}
        </g>
        <g class="node node-centre" data-node={id}>
          <rect
            x={placed.centre.x - centreWidth / 2}
            y={placed.centre.y - NODE_HEIGHT / 2}
            width={centreWidth}
            height={NODE_HEIGHT}
            rx="4"
          />
          <text
            x={placed.centre.x}
            y={placed.centre.y}
            text-anchor="middle"
            dominant-baseline="central"
          >
            {id}
          </text>
        </g>
        {placed.nodes.map((node) => (
          <a
            key={node.id}
            class="node node-link"
            data-node={node.id}
            href={routeHref({ view: 'scheme', id: node.id })}
          >
            <rect
              x={node.x - boxWidth(node.id) / 2}
              y={node.y - NODE_HEIGHT / 2}
              width={boxWidth(node.id)}
              height={NODE_HEIGHT}
              rx="4"
            />
            <text x={node.x} y={node.y} text-anchor="middle" dominant-baseline="central">
              {node.id}
            </text>
          </a>
        ))}
      </svg>
      <ul class="relation-list" aria-label={ui.relationsListLabel}>
        {edges.map((edge, index) => {
          const label = labels[index];
          const part = (scheme: string) =>
            scheme === id ? (
              name(scheme)
            ) : (
              <a href={routeHref({ view: 'scheme', id: scheme })}>{name(scheme)}</a>
            );
          return (
            <li
              key={`${edge.other}/${edge.type}/${edge.ref}/${edge.direction}`}
              data-edge={`${edge.type}/${edge.ref}/${edge.direction}`}
              data-other={edge.other}
              data-inverse={edge.inverse ? 'true' : 'false'}
            >
              {part(edge.from)} {'— '}
              {label === undefined ? null : <MarkedText rendered={label} />}
              {' — '}
              {part(edge.to)}
              {edge.inverse ? ` (${ui.edgeInverse})` : ''}{' '}
              <CertaintyBadge certainty={edge.certainty} />{' '}
              <span class="first-source">
                <SourceTitle title={edge.source.title} />
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
