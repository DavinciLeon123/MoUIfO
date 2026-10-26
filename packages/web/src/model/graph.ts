import type { Certainty, Host, SourceRef } from '../engine-host.ts';

export type EdgeType = 'relation' | 'rule' | 'component';

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

export type Point = { x: number; y: number };
export type PlacedNode = { id: string; x: number; y: number };
export type PlacedLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lx: number;
  ly: number;
};
export type Layout = {
  width: number;
  height: number;
  radius: number;
  centre: Point;
  nodes: PlacedNode[];
  lines: PlacedLine[];
};

/** Stub of the RED commit: no edges and an empty layout until the tests drive the real ones. */
export function graphEdges(_host: Host, _id: string): GraphEdge[] {
  return [];
}

export function layout(_edges: readonly GraphEdge[]): Layout {
  return { width: 0, height: 0, radius: 0, centre: { x: 0, y: 0 }, nodes: [], lines: [] };
}
