import type { Biome, BoardEdge, BoardState, BoardTile, BoardVertex, EdgeId, TileId, VertexId } from "./types";

type Axial = { q: number; r: number };

const SQRT3 = Math.sqrt(3);

const BIOMES: Exclude<Biome, "singularity">[] = ["nebula", "asteroid", "frozen", "farm", "ruins"];

const DICE_SUMS: number[] = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function tileId(q: number, r: number): TileId {
  return `t:${q},${r}`;
}

function vertexIdFromPoint(x: number, y: number): VertexId {
  const sx = Math.round(x * 1_000_000);
  const sy = Math.round(y * 1_000_000);
  return `v:${sx},${sy}`;
}

function edgeId(a: VertexId, b: VertexId): EdgeId {
  return a < b ? `e:${a}|${b}` : `e:${b}|${a}`;
}

function axialDistance(a: Axial): number {
  const x = a.q;
  const z = a.r;
  const y = -x - z;
  return (Math.abs(x) + Math.abs(y) + Math.abs(z)) / 2;
}

function axialToPixel(a: Axial, size: number): { x: number; y: number } {
  const x = size * (SQRT3 * a.q + (SQRT3 / 2) * a.r);
  const y = size * ((3 / 2) * a.r);
  return { x, y };
}

function hexCorner(center: { x: number; y: number }, size: number, i: number) {
  const angleDeg = 60 * i - 30;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: center.x + size * Math.cos(angleRad),
    y: center.y + size * Math.sin(angleRad),
  };
}

function balancedDiceNumbersPool(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(count / DICE_SUMS.length);
  const rem = count % DICE_SUMS.length;
  const pool: number[] = [];

  for (const sum of DICE_SUMS) {
    for (let i = 0; i < base; i++) pool.push(sum);
  }

  const extraOrder = shuffle(DICE_SUMS);
  for (let i = 0; i < rem; i++) pool.push(extraOrder[i]!);

  return shuffle(pool);
}

export function createBoard(params: { radius: number; size: number }): BoardState {
  const { radius, size } = params;

  const axialTiles: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (axialDistance({ q, r }) <= radius) axialTiles.push({ q, r });
    }
  }

  const centerId = tileId(0, 0);
  const nonCenter = axialTiles.filter((t) => !(t.q === 0 && t.r === 0));

  const biomePool = shuffle(
    Array.from({ length: nonCenter.length }, (_, i) => BIOMES[i % BIOMES.length]!),
  );
  const numbersPool = balancedDiceNumbersPool(nonCenter.length);

  const verticesById = new Map<VertexId, BoardVertex>();
  const edgesById = new Map<EdgeId, BoardEdge>();

  const tiles: BoardTile[] = [];
  let numIdx = 0;
  let biomeIdx = 0;

  for (const a of axialTiles) {
    const id = tileId(a.q, a.r);
    const center = axialToPixel(a, size);

    let biome: Biome;
    let numberToken: number | null;
    if (id === centerId) {
      biome = "singularity";
      numberToken = null;
    } else {
      biome = biomePool[biomeIdx++]!;
      numberToken = numbersPool[numIdx++]!;
    }

    const cornerVertexIds: VertexId[] = [];
    for (let i = 0; i < 6; i++) {
      const p = hexCorner(center, size, i);
      const vid = vertexIdFromPoint(p.x, p.y);
      cornerVertexIds.push(vid);
      if (!verticesById.has(vid)) verticesById.set(vid, { id: vid, x: p.x, y: p.y });
    }

    for (let i = 0; i < 6; i++) {
      const aV = cornerVertexIds[i]!;
      const bV = cornerVertexIds[(i + 1) % 6]!;
      const eid = edgeId(aV, bV);
      if (!edgesById.has(eid)) edgesById.set(eid, { id: eid, a: aV < bV ? aV : bV, b: aV < bV ? bV : aV });
    }

    tiles.push({
      id,
      q: a.q,
      r: a.r,
      biome,
      numberToken,
      center,
      cornerVertexIds,
    });
  }

  return {
    radius,
    tiles,
    vertices: Array.from(verticesById.values()),
    edges: Array.from(edgesById.values()),
  };
}

export function rotateOuterRing(board: BoardState, params: { steps: number }): { board: BoardState; tileIdMap: Map<TileId, TileId> } {
  const dirs: Axial[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];

  const ringCoords: Axial[] = [];
  if (board.radius > 0) {
    let q = dirs[4]!.q * board.radius;
    let r = dirs[4]!.r * board.radius;
    for (let side = 0; side < 6; side++) {
      const d = dirs[side]!;
      for (let step = 0; step < board.radius; step++) {
        ringCoords.push({ q, r });
        q += d.q;
        r += d.r;
      }
    }
  }

  const byId = new Map(board.tiles.map((t) => [t.id, t] as const));
  const ring = ringCoords
    .map((c) => byId.get(tileId(c.q, c.r)))
    .filter(Boolean) as BoardTile[];

  const steps = ((params.steps % ring.length) + ring.length) % ring.length;
  if (ring.length === 0 || steps === 0) {
    return { board, tileIdMap: new Map() };
  }

  const rotated = ring.map((_, i) => ring[(i - steps + ring.length) % ring.length]!);
  const tileIdMap = new Map<TileId, TileId>();

  for (let i = 0; i < ring.length; i++) {
    const target = ring[i]!;
    const source = rotated[i]!;
    const targetTile = byId.get(target.id)!;
    tileIdMap.set(source.id, target.id);
    byId.set(target.id, {
      ...targetTile,
      biome: source.biome,
      numberToken: source.numberToken,
    });
  }

  return {
    board: { ...board, tiles: Array.from(byId.values()) },
    tileIdMap,
  };
}
