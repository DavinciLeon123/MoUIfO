import type { Certainty, Host, SourceRef } from '../engine-host.ts';

export type EdgeType = 'relation' | 'rule' | 'component';

/**
 * One edge of the relation graph of a scheme, in the model's stored direction (`from` to `to`).
 * `ref` is the relation kind id, the rule id or the component prefix. An edge the model states from
 * the other scheme to this one has `direction: 'in'` and is the inverse of this scheme's reading.
 */
export type GraphEdge = {
  other: string;
  direction: 'out' | 'in';
  inverse: boolean;
  type: EdgeType;
  ref: string;
  from: string;
  to: string;
  certainty: Certainty;
  source: SourceRef;
};

const TYPE_ORDER: Readonly<Record<EdgeType, number>> = { relation: 0, rule: 1, component: 2 };

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * D-15, WEB-02: the direct connections of a scheme, read only from `describe` (never written in
 * code): its relations, components and rules_out (outgoing), its rules_in (incoming), and the
 * relations and components of every other scheme that point at it (incoming, so inverse). An end
 * that is the scheme itself or not a scheme of the model is left out, as the engine's own relate
 * does. Ordered by neighbour id, then type, reference and direction, so the result is stable.
 */
export function graphEdges(host: Host, id: string): GraphEdge[] {
  const own = host.engine.describe(id).data;
  if (own === null) return [];
  const edges: GraphEdge[] = [];
  const usable = (other: string): boolean =>
    other !== id && Object.hasOwn(host.model.schemes, other);
  const add = (
    other: string,
    direction: 'out' | 'in',
    type: EdgeType,
    ref: string,
    claim: { certainty: Certainty; source: SourceRef },
  ): void => {
    if (!usable(other)) return;
    edges.push({
      other,
      direction,
      inverse: direction === 'in',
      type,
      ref,
      from: direction === 'out' ? id : other,
      to: direction === 'out' ? other : id,
      certainty: claim.certainty,
      source: claim.source,
    });
  };

  for (const claim of own.relations)
    add(claim.value.target, 'out', 'relation', claim.value.kind, claim);
  for (const claim of own.components)
    add(claim.value.scheme, 'out', 'component', claim.value.prefix, claim);
  for (const claim of own.rules_out) add(claim.value.output, 'out', 'rule', claim.value.id, claim);
  for (const claim of own.rules_in) add(claim.value.input, 'in', 'rule', claim.value.id, claim);
  for (const other of Object.keys(host.model.schemes)) {
    if (other === id) continue;
    const description = host.engine.describe(other).data;
    if (description === null) continue;
    for (const claim of description.relations) {
      if (claim.value.target === id) add(other, 'in', 'relation', claim.value.kind, claim);
    }
    for (const claim of description.components) {
      if (claim.value.scheme === id) add(other, 'in', 'component', claim.value.prefix, claim);
    }
  }

  return edges.sort(
    (a, b) =>
      byCodeUnit(a.other, b.other) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      byCodeUnit(a.ref, b.ref) ||
      byCodeUnit(a.direction, b.direction) * -1,
  );
}

export type Point = { x: number; y: number };

/** A neighbour node: its scheme id and the position of its centre. */
export type PlacedNode = { id: string; x: number; y: number };

/**
 * A drawn edge, from its `from` end to its `to` end (so an arrow head at the end points the way the
 * model states it), and the point where its label goes.
 */
export type PlacedLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The label position on the line. */
  lx: number;
  ly: number;
  /** A point on the line near the scheme in the middle, where the arrow head is drawn. */
  ax: number;
  ay: number;
};

export type Layout = {
  width: number;
  height: number;
  /** The radius of the circle the neighbours sit on. */
  radius: number;
  centre: Point;
  nodes: PlacedNode[];
  lines: PlacedLine[];
};

/** The fixed viewBox of the graph and the circle of the neighbours. */
export const VIEW_WIDTH = 720;
export const VIEW_HEIGHT = 500;
const RADIUS = 190;
/** The distance between two parallel edges of one pair of schemes. */
const PARALLEL_GAP = 24;
/** How far along the centre-to-neighbour line the arrow head sits: near the centre, away from labels. */
const ARROW_AT = 0.35;
/** Where the label of a lone edge sits on that line, and the step between parallel edges' labels. */
const LABEL_AT = 0.62;
const LABEL_STEP = 0.14;

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * D-15: a deterministic layout without a graph library. The scheme is at the middle of the viewBox;
 * each distinct neighbour, in the order it first appears in `edges`, sits on a circle around it, the
 * first at the top and the rest evenly spaced clockwise. Parallel edges to one neighbour are drawn
 * side by side.
 */
export function layout(edges: readonly GraphEdge[]): Layout {
  const centre: Point = { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
  const others = [...new Set(edges.map((edge) => edge.other))];
  const nodes: PlacedNode[] = others.map((id, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / others.length;
    return {
      id,
      x: round(centre.x + RADIUS * Math.cos(angle)),
      y: round(centre.y + RADIUS * Math.sin(angle)),
    };
  });
  const perNeighbour = new Map<string, number>();
  for (const edge of edges) perNeighbour.set(edge.other, (perNeighbour.get(edge.other) ?? 0) + 1);
  const seen = new Map<string, number>();
  const lines: PlacedLine[] = edges.map((edge) => {
    const node = nodes.find((each) => each.id === edge.other) ?? centre;
    const count = perNeighbour.get(edge.other) ?? 1;
    const index = seen.get(edge.other) ?? 0;
    seen.set(edge.other, index + 1);
    // The unit vector perpendicular to the centre-to-node line, and this edge's share of the gap.
    const dx = node.x - centre.x;
    const dy = node.y - centre.y;
    const length = Math.hypot(dx, dy) || 1;
    const offset = (index - (count - 1) / 2) * PARALLEL_GAP;
    const ox = (-dy / length) * offset;
    const oy = (dx / length) * offset;
    const a = { x: centre.x + ox, y: centre.y + oy };
    const b = { x: node.x + ox, y: node.y + oy };
    const [start, end] = edge.direction === 'out' ? [a, b] : [b, a];
    // Parallel edges get their labels at different distances from the middle so that they do not
    // print over each other.
    const at = LABEL_AT + (index - (count - 1) / 2) * LABEL_STEP;
    return {
      x1: round(start.x),
      y1: round(start.y),
      x2: round(end.x),
      y2: round(end.y),
      lx: round(a.x + (b.x - a.x) * at),
      ly: round(a.y + (b.y - a.y) * at),
      ax: round(a.x + (b.x - a.x) * ARROW_AT),
      ay: round(a.y + (b.y - a.y) * ARROW_AT),
    };
  });
  return { width: VIEW_WIDTH, height: VIEW_HEIGHT, radius: RADIUS, centre, nodes, lines };
}
