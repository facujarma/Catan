import { RESOURCES, type Board, type Edge, type Hex, type Port, type Resource, type Terrain, type Vertex } from "./types";
import { SeededRandom, type RandomSource } from "./random";

const AXIAL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const STANDARD_TERRAINS: Terrain[] = [
  "wood",
  "wood",
  "wood",
  "wood",
  "brick",
  "brick",
  "brick",
  "sheep",
  "sheep",
  "sheep",
  "sheep",
  "wheat",
  "wheat",
  "wheat",
  "wheat",
  "ore",
  "ore",
  "ore",
  "desert",
];

const STANDARD_NUMBER_TOKENS = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

interface AxialCoordinate {
  q: number;
  r: number;
}

interface VertexDraft {
  x: number;
  y: number;
  hexIds: Set<string>;
  edgeIds: Set<string>;
}

interface EdgeDraft {
  vertexKeys: [string, string];
  hexIds: Set<string>;
}

function getHexCoordinates(): AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      if (Math.abs(q + r) <= 2) coordinates.push({ q, r });
    }
  }
  return coordinates;
}

function positionKey(x: number, y: number): string {
  return `${Math.round(x * 10_000)},${Math.round(y * 10_000)}`;
}

function isValidNumberPlacement(
  coordinates: readonly AxialCoordinate[],
  numberByHex: ReadonlyMap<string, number>,
): boolean {
  for (const coordinate of coordinates) {
    const id = `h-${coordinate.q}-${coordinate.r}`;
    const number = numberByHex.get(id);
    if (number !== 6 && number !== 8) continue;

    for (const [dq, dr] of AXIAL_DIRECTIONS) {
      const neighborNumber = numberByHex.get(
        `h-${coordinate.q + dq}-${coordinate.r + dr}`,
      );
      if (neighborNumber === 6 || neighborNumber === 8) return false;
    }
  }
  return true;
}

function placeNumberTokens(
  coordinates: readonly AxialCoordinate[],
  nonDesertHexIds: readonly string[],
  random: RandomSource,
): Map<string, number> {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const tokens = random.shuffle(STANDARD_NUMBER_TOKENS);
    const numberByHex = new Map<string, number>();
    for (let index = 0; index < nonDesertHexIds.length; index += 1) {
      numberByHex.set(nonDesertHexIds[index]!, tokens[index]!);
    }
    if (isValidNumberPlacement(coordinates, numberByHex)) return numberByHex;
  }

  throw new Error("No se pudo generar una distribución válida de números.");
}

function buildGeometry(hexes: Hex[]): { vertices: Vertex[]; edges: Edge[] } {
  const vertexDrafts = new Map<string, VertexDraft>();
  const edgeDrafts = new Map<string, EdgeDraft>();

  for (const hex of hexes) {
    const centerX = Math.sqrt(3) * (hex.q + hex.r / 2);
    const centerY = 1.5 * hex.r;
    const cornerKeys: string[] = [];

    for (let corner = 0; corner < 6; corner += 1) {
      const angle = ((30 + corner * 60) * Math.PI) / 180;
      const x = centerX + Math.cos(angle);
      const y = centerY + Math.sin(angle);
      const key = positionKey(x, y);
      cornerKeys.push(key);

      const vertex = vertexDrafts.get(key) ?? {
        x,
        y,
        hexIds: new Set<string>(),
        edgeIds: new Set<string>(),
      };
      vertex.hexIds.add(hex.id);
      vertexDrafts.set(key, vertex);
    }

    for (let corner = 0; corner < 6; corner += 1) {
      const firstKey = cornerKeys[corner]!;
      const secondKey = cornerKeys[(corner + 1) % 6]!;
      const vertexKeys = [firstKey, secondKey].sort() as [string, string];
      const edgeKey = `${vertexKeys[0]}|${vertexKeys[1]}`;
      const edge = edgeDrafts.get(edgeKey) ?? {
        vertexKeys,
        hexIds: new Set<string>(),
      };
      edge.hexIds.add(hex.id);
      edgeDrafts.set(edgeKey, edge);
    }
  }

  const sortedVertexKeys = [...vertexDrafts.keys()].sort();
  const vertexIdByKey = new Map(
    sortedVertexKeys.map((key, index) => [key, `v${index}`] as const),
  );
  const sortedEdgeDrafts = [...edgeDrafts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const edges: Edge[] = sortedEdgeDrafts.map(([key, draft], index) => {
    const id = `e${index}`;
    const vertexIds = draft.vertexKeys
      .map((vertexKey) => vertexIdByKey.get(vertexKey)!)
      .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1))) as [
      string,
      string,
    ];
    for (const vertexKey of draft.vertexKeys) {
      vertexDrafts.get(vertexKey)!.edgeIds.add(id);
    }
    return {
      id,
      vertexIds,
      hexIds: [...draft.hexIds].sort(),
    };
  });

  const vertices: Vertex[] = sortedVertexKeys.map((key, index) => {
    const draft = vertexDrafts.get(key)!;
    const edgeIds = [...draft.edgeIds].sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
    );
    const adjacentVertexIds = new Set<string>();
    for (const edgeId of edgeIds) {
      const edge = edges[Number(edgeId.slice(1))]!;
      for (const vertexId of edge.vertexIds) {
        if (vertexId !== `v${index}`) adjacentVertexIds.add(vertexId);
      }
    }
    return {
      id: `v${index}`,
      x: draft.x,
      y: draft.y,
      hexIds: [...draft.hexIds].sort(),
      edgeIds,
      adjacentVertexIds: [...adjacentVertexIds].sort(
        (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
      ),
    };
  });

  if (edgeDrafts.size !== edges.length || vertexIdByKey.size !== vertices.length) {
    throw new Error("La geometría del tablero contiene ids duplicados.");
  }

  return { vertices, edges };
}

function orderCoastEdges(edges: readonly Edge[]): Edge[] {
  const coastEdges = edges.filter((edge) => edge.hexIds.length === 1);
  const edgeById = new Map(coastEdges.map((edge) => [edge.id, edge]));
  const coastEdgeIdsByVertex = new Map<string, string[]>();

  for (const edge of coastEdges) {
    for (const vertexId of edge.vertexIds) {
      const adjacent = coastEdgeIdsByVertex.get(vertexId) ?? [];
      adjacent.push(edge.id);
      coastEdgeIdsByVertex.set(vertexId, adjacent);
    }
  }

  const startVertexId = [...coastEdgeIdsByVertex.keys()].sort(
    (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
  )[0];
  if (!startVertexId) throw new Error("El tablero no tiene costa.");

  const ordered: Edge[] = [];
  const visited = new Set<string>();
  let currentVertexId = startVertexId;
  let previousEdgeId: string | null = null;

  while (ordered.length < coastEdges.length) {
    const candidates = (coastEdgeIdsByVertex.get(currentVertexId) ?? [])
      .filter((edgeId) => edgeId !== previousEdgeId && !visited.has(edgeId))
      .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
    const nextEdgeId = candidates[0];
    if (!nextEdgeId) break;

    const nextEdge = edgeById.get(nextEdgeId)!;
    ordered.push(nextEdge);
    visited.add(nextEdgeId);
    const nextVertexId = nextEdge.vertexIds.find(
      (vertexId) => vertexId !== currentVertexId,
    );
    if (!nextVertexId) break;

    previousEdgeId = nextEdgeId;
    currentVertexId = nextVertexId;
  }

  if (ordered.length !== coastEdges.length) {
    throw new Error("No se pudo recorrer todo el perímetro del tablero.");
  }
  return ordered;
}

function createPorts(edges: readonly Edge[], random: RandomSource): Port[] {
  const coastline = orderCoastEdges(edges);
  const portGaps = Array.from({ length: 9 }, () => 3);
  for (let extra = 0; extra < 3; extra += 1) {
    portGaps[random.nextInt(portGaps.length)]! += 1;
  }

  const start = random.nextInt(coastline.length);
  const selectedEdges: Edge[] = [];
  let position = start;
  for (const gap of portGaps) {
    selectedEdges.push(coastline[position]!);
    position = (position + gap) % coastline.length;
  }

  const portTypes: Array<{ type: "generic"; ratio: 3 } | { type: Resource; ratio: 2 }> = [
    { type: "generic", ratio: 3 },
    { type: "generic", ratio: 3 },
    { type: "generic", ratio: 3 },
    { type: "generic", ratio: 3 },
    ...RESOURCES.map((type) => ({ type, ratio: 2 as const })),
  ];

  return random.shuffle(portTypes).map((port, index) => ({
    id: `p${index}`,
    type: port.type,
    ratio: port.ratio,
    edgeId: selectedEdges[index]!.id,
    vertexIds: [...selectedEdges[index]!.vertexIds] as [string, string],
  }));
}

export function generateBoard(seed: number | string): Board {
  return generateBoardWithRandom(new SeededRandom(seed));
}

export function generateBoardWithRandom(random: RandomSource): Board {
  const coordinates = getHexCoordinates();
  const terrains = random.shuffle(STANDARD_TERRAINS);
  const hexDrafts = coordinates.map((coordinate, index) => ({
    id: `h-${coordinate.q}-${coordinate.r}`,
    q: coordinate.q,
    r: coordinate.r,
    terrain: terrains[index]!,
  }));
  const nonDesertHexIds = hexDrafts
    .filter((hex) => hex.terrain !== "desert")
    .map((hex) => hex.id);
  const numberByHex = placeNumberTokens(coordinates, nonDesertHexIds, random);

  const hexes: Hex[] = hexDrafts.map((hex) => ({
    ...hex,
    number: numberByHex.get(hex.id) ?? null,
    neighborHexIds: AXIAL_DIRECTIONS
      .map(([dq, dr]) => `h-${hex.q + dq}-${hex.r + dr}`)
      .filter((neighborId) => hexDrafts.some((candidate) => candidate.id === neighborId))
      .sort(),
  }));

  const { vertices, edges } = buildGeometry(hexes);
  const ports = createPorts(edges, random);
  return { hexes, vertices, edges, ports };
}
