import type { PlayerGameView, Resource } from "@catan/engine";
import type { LegalPlacements } from "../model";

export type BoardMode = "road" | "free-road" | "settlement" | "city" | "robber" | null;

interface BoardSvgProps {
  game: PlayerGameView;
  legal: LegalPlacements;
  selfPlayerId: string;
  mode: BoardMode;
  selectedRoadIds: string[];
  onVertexClick: (vertexId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onHexClick: (hexId: string) => void;
}

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 720;
const ORIGIN_X = VIEW_WIDTH / 2;
const ORIGIN_Y = VIEW_HEIGHT / 2;
const SCALE = 68;

const TERRAIN_FILL: Record<string, string> = {
  wood: "url(#terrain-wood)",
  brick: "url(#terrain-brick)",
  sheep: "url(#terrain-sheep)",
  wheat: "url(#terrain-wheat)",
  ore: "url(#terrain-ore)",
  desert: "url(#terrain-desert)",
};

const TERRAIN_BORDER: Record<string, string> = {
  wood: "#2f6a2b",
  brick: "#94451f",
  sheep: "#6f9636",
  wheat: "#b3942a",
  ore: "#6c7885",
  desert: "#bda868",
};

const RESOURCE_LABEL: Record<Resource, string> = {
  wood: "M",
  brick: "L",
  sheep: "O",
  wheat: "T",
  ore: "P",
};

function project(x: number, y: number): [number, number] {
  return [ORIGIN_X + x * SCALE, ORIGIN_Y + y * SCALE];
}

function hexCenter(q: number, r: number): [number, number] {
  return [Math.sqrt(3) * (q + r / 2), 1.5 * r];
}

function pointsForHex(q: number, r: number, radius = 1): string {
  const [centerX, centerY] = hexCenter(q, r);
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = ((30 + corner * 60) * Math.PI) / 180;
    const [x, y] = project(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    return `${x},${y}`;
  }).join(" ");
}

function coastlinePath(game: PlayerGameView): string {
  const coastalVertexIds = new Set(
    game.board.edges
      .filter((edge) => edge.hexIds.length === 1)
      .flatMap((edge) => edge.vertexIds),
  );
  const boundary = game.board.vertices
    .filter((vertex) => coastalVertexIds.has(vertex.id))
    .sort((left, right) => Math.atan2(left.y, left.x) - Math.atan2(right.y, right.x))
    .map((vertex, index) => {
      const distance = Math.hypot(vertex.x, vertex.y) || 1;
      const ripple = 0.2 + 0.055 * Math.sin(index * 2.4);
      const x = vertex.x + (vertex.x / distance) * ripple;
      const y = vertex.y + (vertex.y / distance) * ripple;
      return project(x, y);
    });

  if (boundary.length < 3) return "";
  const midpoints = boundary.map((point, index) => {
    const next = boundary[(index + 1) % boundary.length]!;
    return [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as [number, number];
  });
  let path = `M ${midpoints[midpoints.length - 1]![0]} ${midpoints[midpoints.length - 1]![1]}`;
  for (let index = 0; index < boundary.length; index += 1) {
    const point = boundary[index]!;
    const nextMidpoint = midpoints[index]!;
    path += ` Q ${point[0]} ${point[1]} ${nextMidpoint[0]} ${nextMidpoint[1]}`;
  }
  return `${path} Z`;
}

function probabilityPips(number: number): number {
  if (number === 2 || number === 12) return 1;
  if (number === 3 || number === 11) return 2;
  if (number === 4 || number === 10) return 3;
  if (number === 5 || number === 9) return 4;
  return 5;
}

function TerrainIcon({ terrain, cx, cy }: { terrain: string; cx: number; cy: number }) {
  const transform = `translate(${cx} ${cy - 30})`;
  switch (terrain) {
    case "wood":
      return (
        <g transform={transform} stroke="#075f2d" strokeWidth="1.7" strokeLinejoin="round" pointerEvents="none">
          <path d="M-14 14 -6 -1 2 14 H-3 V23 H-10 V14 Z" fill="#11823a" />
          <path d="M9 10 16 -4 23 10 H19 V18 H13 V10 Z" fill="#087a34" />
          <path d="M-25 17 Q-21 12 -17 17 M24 18 Q28 13 32 18" fill="none" stroke="#55a83b" />
        </g>
      );
    case "sheep":
      return (
        <g transform={transform} stroke="#777a67" strokeWidth="1.5" strokeLinejoin="round" pointerEvents="none">
          <ellipse cx="-2" cy="10" rx="18" ry="11" fill="#fffdf2" />
          <circle cx="-14" cy="4" r="7" fill="#fffdf2" />
          <circle cx="-5" cy="1" r="8" fill="#fffdf2" />
          <circle cx="5" cy="2" r="8" fill="#fffdf2" />
          <ellipse cx="14" cy="7" rx="7" ry="6" fill="#fffdf2" />
          <path d="M17 3 22 0 21 7 M-10 19 V27 M1 20 V27 M11 18 V26" fill="none" stroke="#fffdf2" strokeWidth="2.5" />
          <circle cx="17" cy="6" r="1" fill="#334638" stroke="none" />
        </g>
      );
    case "wheat":
      return (
        <g transform={transform} fill="none" stroke="#9c7415" strokeWidth="1.8" strokeLinecap="round" pointerEvents="none">
          <path d="M-12 25 Q-8 12 -10 -6 M0 25 Q3 10 2 -11 M12 25 Q16 13 15 -4" />
          <path d="M-10 2 Q-19 0 -18 -7 Q-10 -7 -10 2 M-9 9 Q-18 8 -18 2 Q-11 1 -9 9 M2 0 Q-7 -2 -7 -9 Q1 -8 2 0 M2 8 Q10 5 10 -2 Q3 0 2 8 M15 4 Q8 1 9 -6 Q16 -5 15 4 M14 12 Q22 9 22 3 Q15 4 14 12" />
          <path d="M-25 19 Q-20 14 -16 19 M22 19 Q26 14 30 18" stroke="#b9a143" />
        </g>
      );
    case "brick":
      return (
        <g transform={transform} stroke="#9d3828" strokeWidth="1.3" pointerEvents="none">
          <g fill="#f4c6a1">
            <rect x="-17" y="-2" width="15" height="8" rx="1" />
            <rect x="2" y="-2" width="15" height="8" rx="1" />
            <rect x="-25" y="9" width="15" height="8" rx="1" />
            <rect x="-6" y="9" width="15" height="8" rx="1" />
            <rect x="13" y="9" width="15" height="8" rx="1" />
          </g>
          <path d="M-28 20 Q-23 16 -19 21 M24 21 Q29 17 33 22" fill="none" stroke="#d78056" />
        </g>
      );
    case "ore":
      return (
        <g transform={transform} stroke="#68737a" strokeWidth="1.5" strokeLinejoin="round" pointerEvents="none">
          <path d="M-24 16 -19 6 -10 3 -4 9 -6 18 -17 21 Z" fill="#d6d9d7" />
          <path d="M-10 13 -4 1 7 -2 16 5 14 17 4 22 -5 19 Z" fill="#f0eee5" />
          <path d="M8 17 13 7 22 5 29 12 25 21 15 23 Z" fill="#c9d0d1" />
          <path d="M-17 9 -10 13 M1 2 5 10 14 5 M16 11 22 14" fill="none" stroke="#fffdf2" />
        </g>
      );
    case "desert":
      return (
        <g transform={transform} fill="none" stroke="#54743b" strokeWidth="3.4" strokeLinecap="round" pointerEvents="none">
          <path d="M0 25 V-15 Q0 -21 5 -21 Q10 -21 10 -15 V-7 M0 1 H-8 Q-12 1 -12 -4 V-9 M10 4 H17 Q21 4 21 -1 V-6" />
          <path d="M-28 18 Q-23 14 -19 18 M23 19 Q28 14 32 19" stroke="#b19865" strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

function ownerAtVertex(game: PlayerGameView, vertexId: string): string | null {
  return (
    game.players.find(
      (player) =>
        player.settlementVertexIds.includes(vertexId) ||
        player.cityVertexIds.includes(vertexId),
    )?.id ?? null
  );
}

export default function BoardSvg({
  game,
  legal,
  selfPlayerId,
  mode,
  selectedRoadIds,
  onVertexClick,
  onEdgeClick,
  onHexClick,
}: BoardSvgProps) {
  const isMyTurn = game.currentPlayerId === selfPlayerId;
  const activeMode =
    game.phase === "setup-settlement" || game.phase === "setup-road" || game.phase === "robber"
      ? game.phase === "setup-settlement"
        ? "settlement"
        : game.phase === "setup-road"
          ? "road"
          : "robber"
      : game.phase === "main" && isMyTurn
        ? mode
        : null;
  const playerById = new Map(game.players.map((player) => [player.id, player]));
  const edgeById = new Map(game.board.edges.map((edge) => [edge.id, edge]));
  const vertexById = new Map(game.board.vertices.map((vertex) => [vertex.id, vertex]));
  const self = playerById.get(selfPlayerId);

  const canPlaceFreeRoad = (edgeId: string): boolean => {
    if (!self || selectedRoadIds.includes(edgeId) || self.roadIds.length + selectedRoadIds.length >= 15) {
      return false;
    }
    if (legal.freeRoadIds.includes(edgeId)) return true;
    const edge = edgeById.get(edgeId);
    if (!edge) return false;
    const ownAndSelectedRoads = new Set([...self.roadIds, ...selectedRoadIds]);

    return edge.vertexIds.some((vertexId) => {
      const buildingOwner = ownerAtVertex(game, vertexId);
      if (buildingOwner === selfPlayerId) return true;
      if (buildingOwner !== null) return false;
      const vertex = vertexById.get(vertexId);
      return vertex?.edgeIds.some(
        (connectedEdgeId) =>
          connectedEdgeId !== edgeId && ownAndSelectedRoads.has(connectedEdgeId),
      );
    });
  };

  const legalVertexIds = new Set(
    activeMode === "settlement"
      ? legal.settlementVertexIds
      : activeMode === "city"
        ? legal.cityVertexIds
        : [],
  );
  const legalEdgeIds = new Set(
    activeMode === "road" ? legal.roadIds : activeMode === "free-road" ? legal.freeRoadIds : [],
  );
  const robberTargets = new Set(legal.robberHexIds);
  const coastPath = coastlinePath(game);

  return (
    <div className="board-frame">
      <svg
        className="board-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Tablero de Catan"
      >
        <defs>
          <linearGradient id="sea-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3f9ecb" />
            <stop offset="0.55" stopColor="#328dc0" />
            <stop offset="1" stopColor="#2879a8" />
          </linearGradient>
          <linearGradient id="terrain-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4f9a43" />
            <stop offset="1" stopColor="#3b7d33" />
          </linearGradient>
          <linearGradient id="terrain-brick" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d1743f" />
            <stop offset="1" stopColor="#b85a2c" />
          </linearGradient>
          <linearGradient id="terrain-sheep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b6d96c" />
            <stop offset="1" stopColor="#93c04a" />
          </linearGradient>
          <linearGradient id="terrain-wheat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4d766" />
            <stop offset="1" stopColor="#e0bd3f" />
          </linearGradient>
          <linearGradient id="terrain-ore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#aab4bd" />
            <stop offset="1" stopColor="#8b97a3" />
          </linearGradient>
          <linearGradient id="terrain-desert" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ecd9a4" />
            <stop offset="1" stopColor="#dcc584" />
          </linearGradient>
          <filter id="tile-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodColor="#533f22" floodOpacity="0.24" />
          </filter>
          <filter id="coast-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#sea-gradient)" />
        {coastPath && (
          <>
            <path d={coastPath} fill="none" stroke="#bfe4f2" strokeWidth="34" opacity="0.35" filter="url(#coast-glow)" />
            <path d={coastPath} fill="#ecd9a4" stroke="#dcc584" strokeWidth="22" strokeLinejoin="round" />
            <path d={coastPath} fill="none" stroke="#f7efd6" strokeWidth="10" strokeLinejoin="round" opacity="0.85" />
            <path d={coastPath} fill="none" stroke="#bfe4f2" strokeWidth="3" strokeDasharray="3 14" strokeLinecap="round" opacity="0.8" />
          </>
        )}

        {game.board.hexes.map((hex) => {
          const [centerX, centerY] = hexCenter(hex.q, hex.r);
          const [cx, cy] = project(centerX, centerY);
          const isRobberTarget = activeMode === "robber" && isMyTurn && robberTargets.has(hex.id);
          const pips = hex.number === null ? 0 : probabilityPips(hex.number);
          const pipColor = hex.number === 6 || hex.number === 8 ? "#d51f20" : "#174b27";
          return (
            <g key={hex.id}>
              <polygon
                points={pointsForHex(hex.q, hex.r)}
                fill={TERRAIN_FILL[hex.terrain]}
                stroke={TERRAIN_BORDER[hex.terrain]}
                strokeWidth="6"
                strokeLinejoin="round"
                filter="url(#tile-shadow)"
                className={isRobberTarget ? "cursor-pointer transition hover:brightness-110" : ""}
                onClick={isRobberTarget ? () => onHexClick(hex.id) : undefined}
              />
              <polygon
                points={pointsForHex(hex.q, hex.r, 0.89)}
                fill="none"
                stroke="#fff6d8"
                strokeOpacity="0.55"
                strokeWidth="1.2"
                pointerEvents="none"
              />
              {hex.terrain !== "desert" && <TerrainIcon terrain={hex.terrain} cx={cx} cy={cy} />}
              {hex.terrain === "desert" && <TerrainIcon terrain="desert" cx={cx} cy={cy} />}
              {hex.number !== null && (
                <g pointerEvents="none">
                  <circle cx={cx} cy={cy + 10} r="26" fill="#f8f1dd" stroke="#cbbd9a" strokeWidth="2" />
                  <text
                    x={cx}
                    y={cy + 20}
                    textAnchor="middle"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    fontSize="26"
                    fontWeight="900"
                    fill={pipColor}
                  >
                    {hex.number}
                  </text>
                  {Array.from({ length: pips }, (_, index) => {
                    const spacing = 6;
                    const x = cx - ((pips - 1) * spacing) / 2 + index * spacing;
                    return <circle key={index} cx={x} cy={cy + 29} r="1.7" fill={pipColor} />;
                  })}
                </g>
              )}
              {hex.id === game.robberHexId && (
                <g transform={`translate(${cx + 23} ${cy - 25})`} pointerEvents="none">
                  <circle r="9" fill="#233128" stroke="#f4ebd7" strokeWidth="1.5" />
                  <circle cy="-2" r="2.5" fill="#f4ebd7" />
                  <path d="M-4 5 Q0 1 4 5" fill="none" stroke="#f4ebd7" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              )}
            </g>
          );
        })}

        {game.board.ports.map((port) => {
          const first = vertexById.get(port.vertexIds[0]);
          const second = vertexById.get(port.vertexIds[1]);
          if (!first || !second) return null;
          const midpointX = (first.x + second.x) / 2;
          const midpointY = (first.y + second.y) / 2;
          const distance = Math.hypot(midpointX, midpointY) || 1;
          const [x, y] = project(
            midpointX + (midpointX / distance) * 0.28,
            midpointY + (midpointY / distance) * 0.28,
          );
          const label =
            port.type === "generic"
              ? "3:1"
              : `2:1 ${RESOURCE_LABEL[port.type]}`;
          return (
            <g key={port.id} pointerEvents="none">
              <rect x={x - 23} y={y - 10} width="46" height="20" rx="8" fill="#f2e8d0" stroke="#9f865c" />
              <text x={x} y={y + 4} textAnchor="middle" className="fill-[#493b29] text-[10px] font-bold">
                {label}
              </text>
            </g>
          );
        })}

        {game.board.edges.map((edge) => {
          const first = vertexById.get(edge.vertexIds[0]);
          const second = vertexById.get(edge.vertexIds[1]);
          if (!first || !second) return null;
          const [x1, y1] = project(first.x, first.y);
          const [x2, y2] = project(second.x, second.y);
          const ownerId = game.players.find((player) => player.roadIds.includes(edge.id))?.id;
          const owner = ownerId ? playerById.get(ownerId) : undefined;
          const isSelected = selectedRoadIds.includes(edge.id);
          const isBuildable =
            activeMode !== null &&
            (isSelected ||
              (activeMode === "road"
                ? legalEdgeIds.has(edge.id)
                : activeMode === "free-road"
                  ? canPlaceFreeRoad(edge.id)
                  : false));
          return (
            <g key={edge.id}>
              {owner && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#f3e6bf"
                  strokeWidth="10"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              {owner && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={owner.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              {isBuildable && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isSelected ? "#f5d35f" : "#d8eb9b"}
                  strokeWidth={isSelected ? 8 : 5}
                  strokeDasharray={isSelected ? undefined : "5 6"}
                  strokeLinecap="round"
                  className="cursor-pointer"
                  onClick={() => onEdgeClick(edge.id)}
                />
              )}
              {isBuildable && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth="20"
                  className="cursor-pointer"
                  onClick={() => onEdgeClick(edge.id)}
                />
              )}
            </g>
          );
        })}

        {game.board.vertices.map((vertex) => {
          const [cx, cy] = project(vertex.x, vertex.y);
          const ownerId = ownerAtVertex(game, vertex.id);
          const owner = ownerId ? playerById.get(ownerId) : undefined;
          const isCity = owner?.cityVertexIds.includes(vertex.id) ?? false;
          const isBuildable = legalVertexIds.has(vertex.id);
          return (
            <g key={vertex.id}>
              {owner && (
                <g pointerEvents="none">
                  {isCity ? (
                    <>
                      <path d={`M${cx - 13} ${cy - 1}  ${cx - 4} ${cy - 9} ${cx + 4} ${cy - 1} V${cy + 8} H${cx - 13} Z`} fill={owner.color} stroke="#fff8e7" strokeWidth="1.7" strokeLinejoin="round" />
                      <path d={`M${cx + 1} ${cy - 2} ${cx + 9} ${cy - 10} ${cx + 16} ${cy - 2} V${cy + 8} H${cx + 1} Z`} fill={owner.color} stroke="#fff8e7" strokeWidth="1.7" strokeLinejoin="round" />
                      <path d={`M${cx + 6} ${cy - 10} V${cy - 15} H${cx + 11} V${cy - 8}`} fill={owner.color} stroke="#fff8e7" strokeWidth="1.5" strokeLinejoin="round" />
                    </>
                  ) : (
                    <path d={`M${cx - 10} ${cy - 1} ${cx} ${cy - 10} ${cx + 10} ${cy - 1} V${cy + 8} H${cx - 10} Z`} fill={owner.color} stroke="#fff8e7" strokeWidth="1.8" strokeLinejoin="round" />
                  )}
                </g>
              )}
              {isBuildable && isMyTurn && (
                <g
                  className="cursor-pointer"
                  onClick={() => onVertexClick(vertex.id)}
                  aria-label={activeMode === "city" ? "Mejorar a ciudad" : "Construir poblado"}
                >
                  <circle cx={cx} cy={cy} r="13" fill="#d9eea7" fillOpacity="0.55" stroke="#fff8e5" strokeWidth="2" />
                  <circle cx={cx} cy={cy} r="20" fill="transparent" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="board-legend" aria-hidden="true">
        <span><i className="terrain-dot bg-[#5c974d]" />Bosque</span>
        <span><i className="terrain-dot bg-[#bd694f]" />Ladrillo</span>
        <span><i className="terrain-dot bg-[#9aba70]" />Oveja</span>
        <span><i className="terrain-dot bg-[#d7b84d]" />Trigo</span>
        <span><i className="terrain-dot bg-[#8b9294]" />Mineral</span>
      </div>
    </div>
  );
}
