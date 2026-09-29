import type { PlayerGameView } from "@catan/engine";
import {
  GENERIC_PORT_FILE,
  pieceFile,
  RESOURCE_PORT_FILES,
  ROBBER_ICON_FILE,
  TILE_FILES,
  TILE_FRAME_FILE,
} from "../assets";
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
const SCALE = 72;

const TERRAIN_FILL: Record<string, string> = {
  wood: "url(#terrain-wood)",
  brick: "url(#terrain-brick)",
  sheep: "url(#terrain-sheep)",
  wheat: "url(#terrain-wheat)",
  ore: "url(#terrain-ore)",
  desert: "url(#terrain-desert)",
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
      const ripple = 0.19 + 0.05 * Math.sin(index * 2.3) + 0.028 * Math.sin(index * 5.1);
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

function Pine({ x, y, s, alt = false }: { x: number; y: number; s: number; alt?: boolean }) {
  const mid = alt ? "#3a8438" : "#3f8f3d";
  const light = alt ? "#4e9c46" : "#57a94e";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeLinejoin="round">
      <rect x="-2.6" y="-10" width="5.2" height="11" rx="1.2" fill="#6b4423" stroke="#4c2f16" strokeWidth="0.9" />
      <path d="M0 -48 L12 -29 H-12 Z" fill={mid} stroke="#1f5a2a" strokeWidth="1.3" />
      <path d="M0 -35 L17 -9 H-17 Z" fill={mid} stroke="#1f5a2a" strokeWidth="1.3" />
      <path d="M0 -48 L6.5 -38 H-6.5 Z" fill={light} />
      <path d="M0 -34 L9 -20 H-9 Z" fill={light} opacity="0.82" />
    </g>
  );
}

function Sheep({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cy="14" rx="20" ry="4.5" fill="#000000" opacity="0.12" />
      <path
        d="M-13 12 V3 M-4 12 V3 M5 12 V3 M12 11 V4"
        stroke="#4a4f52"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="-2" cy="0" rx="17" ry="10.5" fill="#fdfbf1" stroke="#d4cdb6" strokeWidth="1.2" />
      <circle cx="-13" cy="-5" r="6" fill="#fdfbf1" stroke="#d4cdb6" strokeWidth="1.1" />
      <circle cx="-5" cy="-8" r="7" fill="#fdfbf1" stroke="#d4cdb6" strokeWidth="1.1" />
      <circle cx="4" cy="-7.5" r="6.5" fill="#fdfbf1" stroke="#d4cdb6" strokeWidth="1.1" />
      <circle cx="11" cy="-4" r="5.5" fill="#fdfbf1" stroke="#d4cdb6" strokeWidth="1.1" />
      <path d="M16 -7 Q23 -10 26 -5.5 Q23 -1 17 -3.5 Z" fill="#3c4a50" />
      <circle cx="23" cy="-6" r="0.9" fill="#fff" />
      <path d="M14 -9 Q11 -13 15 -13" stroke="#3c4a50" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

function WheatStalk({ x, s }: { x: number; s: number }) {
  return (
    <g transform={`translate(${x} 14) scale(${s})`}>
      <path
        d="M-1 -4 Q-10 -7 -11 -15 M1 -9 Q10 -12 11 -20"
        stroke="#a8842a"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M0 0 Q-2 -14 0 -28" stroke="#96700f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="0" cy="-27" rx="4.4" ry="9.5" fill="#e3b93a" stroke="#8f6b12" strokeWidth="1.3" />
      <path
        d="M0 -36 V-46 M-2.6 -33 Q-8 -30 -8 -24 M2.6 -33 Q8 -30 8 -24 M-2.2 -40 Q-7 -37 -7 -31 M2.2 -40 Q7 -37 7 -31"
        stroke="#b28c2e"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function TerrainIcon({ terrain, cx, cy }: { terrain: string; cx: number; cy: number }) {
  const transform = (scale: number, offsetY = -30) =>
    `translate(${cx} ${cy + offsetY}) scale(${scale})`;
  switch (terrain) {
    case "wood":
      return (
        <g transform={transform(1.16)} pointerEvents="none">
          <ellipse cy="10" rx="40" ry="7" fill="#000000" opacity="0.12" />
          <Pine x={-20} y={6} s={0.68} alt />
          <Pine x={20} y={8} s={0.6} />
          <Pine x={0} y={3} s={0.98} />
        </g>
      );
    case "brick":
      return (
        <g transform={transform(1.14)} pointerEvents="none">
          <ellipse cy="12" rx="40" ry="6" fill="#000000" opacity="0.12" />
          <path
            d="M-40 13 C-34 -14 -12 -27 0 -9 C7 -1 2 13 -6 13 Z"
            fill="#d1743f"
            stroke="#a04a22"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M-36 9 C-30 -8 -16 -17 -5 -7" stroke="#eb9a64" strokeWidth="2.6" fill="none" opacity="0.85" strokeLinecap="round" />
          <path
            d="M-6 13 C2 -19 25 -25 37 -5 C43 5 40 13 33 13 Z"
            fill="#c25c2c"
            stroke="#94451f"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M-1 9 C6 -9 20 -15 29 -3" stroke="#dd8a55" strokeWidth="2.4" fill="none" opacity="0.8" strokeLinecap="round" />
          <g stroke="#8f3d1c" strokeWidth="1">
            <rect x="-27" y="4" width="14" height="7" rx="1.5" fill="#e8b183" />
            <rect x="-11" y="6" width="14" height="7" rx="1.5" fill="#f0bd94" />
            <rect x="6" y="5" width="14" height="7" rx="1.5" fill="#e8b183" />
          </g>
        </g>
      );
    case "sheep":
      return (
        <g transform={transform(1.2)} pointerEvents="none">
          <ellipse cy="13" rx="40" ry="6.5" fill="#000000" opacity="0.1" />
          <g stroke="#4f8d3c" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9">
            <path d="M-34 11 q2 -6 0 -10 M-29 12 q1 -5 3 -7" />
            <path d="M30 8 q2 -6 0 -10 M35 9 q1 -5 3 -7" />
            <path d="M-24 14 q2 -5 0 -8" />
          </g>
          <Sheep x={18} y={6} s={0.6} />
          <Sheep x={-6} y={1} s={1} />
        </g>
      );
    case "wheat":
      return (
        <g transform={transform(1.12, -24)} pointerEvents="none">
          <path
            d="M-42 12 Q-20 5 0 12 T42 12 M-40 17 Q-18 10 2 17 T42 17"
            stroke="#b8932e"
            strokeWidth="2"
            fill="none"
            opacity="0.5"
          />
          <WheatStalk x={-19} s={1} />
          <WheatStalk x={0} s={1.16} />
          <WheatStalk x={19} s={0.98} />
          <WheatStalk x={-33} s={0.78} />
          <WheatStalk x={33} s={0.76} />
        </g>
      );
    case "ore":
      return (
        <g transform={transform(1.12)} pointerEvents="none">
          <ellipse cy="13" rx="40" ry="6" fill="#000000" opacity="0.14" />
          <path d="M-38 13 L-17 -25 L-2 5 L3 13 Z" fill="#93a0ab" stroke="#5f6b76" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M-17 -25 L-10 -12 L-14 -11 L-17 -16 L-21 -11 L-24 -12 Z" fill="#fbfdff" opacity="0.92" />
          <path d="M-6 13 L11 -35 L30 13 Z" fill="#b6c0c8" stroke="#62707c" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M11 -35 L18 -21 L14 -19 L11 -25 L7 -19 L4 -21 Z" fill="#fbfdff" opacity="0.95" />
          <path d="M11 -35 L11 13 L-6 13 Z" fill="#7c8894" opacity="0.32" />
          <path d="M29 13 L36 -2 L40 8 V13 Z" fill="#a5b0b9" stroke="#5f6b76" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M-38 13 L-32 4 L-28 13 Z" fill="#a5b0b9" stroke="#5f6b76" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      );
    case "desert":
      return (
        <g transform={transform(1.14, -26)} pointerEvents="none">
          <path d="M-42 14 C-32 -3 -14 -6 -2 8 C6 14 2 14 -6 14 Z" fill="#e7d29b" />
          <path d="M-4 14 C9 -4 29 -7 42 5 V14 Z" fill="#dcc584" />
          <path d="M-36 9 C-27 0 -17 0 -10 7" stroke="#f0dfae" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.9" />
          <path d="M8 5 C17 -1 28 -1 35 5" stroke="#ecd7a2" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8" />
          <ellipse cx="28" cy="11" rx="8" ry="3.8" fill="#cdb47c" />
          <ellipse cx="18" cy="13" rx="5" ry="2.6" fill="#d8c28c" />
          <ellipse cx="-30" cy="12" rx="5.5" ry="2.8" fill="#cdb47c" />
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
    const edge = edgeById.get(edgeId);
    if (!edge) return false;
    const occupied = game.players.some((player) => player.roadIds.includes(edgeId));
    if (occupied) return false;
    if (legal.freeRoadIds.includes(edgeId)) return true;
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
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <svg
        className="block h-full w-full"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="Tablero de Catan"
      >
        <defs>
          <linearGradient id="sea-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#46a4d1" />
            <stop offset="0.5" stopColor="#328dc0" />
            <stop offset="1" stopColor="#266f9d" />
          </linearGradient>
          <radialGradient id="sea-vignette" cx="0.5" cy="0.5" r="0.72">
            <stop offset="0.55" stopColor="#062c47" stopOpacity="0" />
            <stop offset="1" stopColor="#062c47" stopOpacity="0.34" />
          </radialGradient>
          <pattern id="sea-waves" width="130" height="64" patternUnits="userSpaceOnUse">
            <path
              d="M0 26 Q16 17 32 26 T64 26 T96 26 T128 26"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.09"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M-16 56 Q0 47 16 56 T48 56 T80 56 T112 56"
              fill="none"
              stroke="#0b3a5c"
              strokeOpacity="0.09"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </pattern>
          <linearGradient id="terrain-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5aa74c" />
            <stop offset="1" stopColor="#3f7f36" />
          </linearGradient>
          <linearGradient id="terrain-brick" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#db8250" />
            <stop offset="1" stopColor="#bc5f2d" />
          </linearGradient>
          <linearGradient id="terrain-sheep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c3e07a" />
            <stop offset="1" stopColor="#9ac74f" />
          </linearGradient>
          <linearGradient id="terrain-wheat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7dc72" />
            <stop offset="1" stopColor="#e2c043" />
          </linearGradient>
          <linearGradient id="terrain-ore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b4bec6" />
            <stop offset="1" stopColor="#94a0ab" />
          </linearGradient>
          <linearGradient id="terrain-desert" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0deac" />
            <stop offset="1" stopColor="#dfc98c" />
          </linearGradient>
          <filter id="tile-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#533f22" floodOpacity="0.28" />
          </filter>
          <filter id="island-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#062c47" floodOpacity="0.42" />
          </filter>
          <filter id="token-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="1.8" floodColor="#3a2c14" floodOpacity="0.35" />
          </filter>
          <filter id="pawn-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#04182a" floodOpacity="0.45" />
          </filter>
          <filter id="robber-tone" x="-20%" y="-20%" width="140%" height="140%">
            <feColorMatrix
              type="matrix"
              values="0.34 0 0 0 0  0 0.34 0 0 0  0 0 0.36 0 0  0 0 0 1 0"
            />
          </filter>
        </defs>

        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#sea-gradient)" />
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#sea-waves)" />
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#sea-vignette)" />

        {coastPath && (
          <>
            <path d={coastPath} fill="#d9c08c" filter="url(#island-shadow)" />
            <path d={coastPath} fill="#e6d19b" stroke="#c9ad78" strokeWidth="1.5" strokeLinejoin="round" />
            <path
              d={coastPath}
              fill="none"
              stroke="#f4e6c2"
              strokeWidth="14"
              strokeLinejoin="round"
              opacity="0.75"
            />
            <path
              d={coastPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              strokeDasharray="2 12"
              strokeLinecap="round"
              opacity="0.75"
            />
          </>
        )}

        {game.board.hexes.map((hex) => {
          const [centerX, centerY] = hexCenter(hex.q, hex.r);
          const [cx, cy] = project(centerX, centerY);
          const isRobberTarget = activeMode === "robber" && isMyTurn && robberTargets.has(hex.id);
          const pips = hex.number === null ? 0 : probabilityPips(hex.number);
          const pipColor = hex.number === 6 || hex.number === 8 ? "#c92a2a" : "#1f4d2b";
          const tileFile = TILE_FILES[hex.terrain];
          const hexWidth = Math.sqrt(3) * SCALE;
          const hexHeight = 2 * SCALE;
          return (
            <g key={hex.id}>
              <polygon
                points={pointsForHex(hex.q, hex.r)}
                fill={TERRAIN_FILL[hex.terrain]}
                stroke="none"
                filter="url(#tile-shadow)"
                className={isRobberTarget ? "cursor-pointer transition hover:brightness-110" : ""}
                onClick={isRobberTarget ? () => onHexClick(hex.id) : undefined}
              />
              {!tileFile && (
                <>
                  <polygon
                    points={pointsForHex(hex.q, hex.r, 0.93)}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity="0.28"
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                  <polygon
                    points={pointsForHex(hex.q, hex.r, 0.9)}
                    fill="none"
                    stroke="#3b2c14"
                    strokeOpacity="0.12"
                    strokeWidth="1.2"
                    pointerEvents="none"
                  />
                </>
              )}
              <image
                href={tileFile ?? TILE_FRAME_FILE}
                x={cx - hexWidth / 2}
                y={cy - hexHeight / 2}
                width={hexWidth}
                height={hexHeight}
                pointerEvents="none"
              />
              {!tileFile && <TerrainIcon terrain={hex.terrain} cx={cx} cy={cy} />}
              {hex.number !== null && (
                <g pointerEvents="none" filter="url(#token-shadow)">
                  <circle cx={cx} cy={cy} r="25" fill="#cbbd9a" />
                  <circle cx={cx} cy={cy} r="22.5" fill="#fdf8ea" />
                  <text
                    x={cx}
                    y={cy + 8.5}
                    textAnchor="middle"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    fontSize="27"
                    fontWeight="900"
                    fill={pipColor}
                  >
                    {hex.number}
                  </text>
                  {Array.from({ length: pips }, (_, index) => {
                    const spacing = 6.5;
                    const x = cx - ((pips - 1) * spacing) / 2 + index * spacing;
                    return <circle key={index} cx={x} cy={cy + 19.5} r="1.9" fill={pipColor} />;
                  })}
                </g>
              )}
              {isRobberTarget && (
                <g pointerEvents="none">
                  <polygon points={pointsForHex(hex.q, hex.r, 0.92)} fill="#e5484d" fillOpacity="0.16" />
                  <polygon
                    points={pointsForHex(hex.q, hex.r, 0.92)}
                    fill="none"
                    stroke="#ffe08a"
                    strokeWidth="2.6"
                    strokeDasharray="8 6"
                    className="animate-pulse"
                  />
                </g>
              )}
              {hex.id === game.robberHexId && (
                <g filter="url(#pawn-shadow)" pointerEvents="none">
                  <image
                    href={ROBBER_ICON_FILE}
                    x={cx - 21}
                    y={cy - 26}
                    width="44"
                    height="44"
                    filter="url(#robber-tone)"
                  />
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
          const ux = midpointX / distance;
          const uy = midpointY / distance;
          const rotation = (Math.atan2(uy, ux) * 180) / Math.PI + 90;
          const [iconX, iconY] = project(midpointX + ux * 0.52, midpointY + uy * 0.52);
          const iconFile =
            port.type === "generic" ? GENERIC_PORT_FILE : RESOURCE_PORT_FILES[port.type];
          const size = 56;
          return (
            <g
              key={port.id}
              pointerEvents="none"
              transform={`rotate(${rotation} ${iconX} ${iconY})`}
              filter="url(#token-shadow)"
            >
              <image
                href={iconFile}
                x={iconX - size / 2}
                y={iconY - size / 2}
                width={size}
                height={size}
              />
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
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const roadLength = SCALE * 0.96;
          const roadWidth = roadLength * (40 / 194);
          const rotation = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90;
          return (
            <g key={edge.id}>
              {owner && (
                <g pointerEvents="none" transform={`rotate(${rotation} ${midX} ${midY})`}>
                  <image
                    href={pieceFile("road", owner.color)}
                    x={midX - roadWidth / 2}
                    y={midY - roadLength / 2}
                    width={roadWidth}
                    height={roadLength}
                  />
                </g>
              )}
              {isBuildable && (
                <g
                  className="cursor-pointer transition hover:brightness-110"
                  onClick={() => onEdgeClick(edge.id)}
                >
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isSelected ? "#f5d35f" : "#ffffff"}
                    strokeOpacity={isSelected ? 0.55 : 0.3}
                    strokeWidth="17"
                    strokeLinecap="round"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isSelected ? "#f5d35f" : "#f3c93f"}
                    strokeWidth={isSelected ? 9 : 6.5}
                    strokeDasharray={isSelected ? undefined : "7 7"}
                    strokeLinecap="round"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth="22"
                  />
                </g>
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
                  <ellipse
                    cx={cx}
                    cy={cy + 11}
                    rx={isCity ? 18 : 12}
                    ry={isCity ? 4.6 : 3.4}
                    fill="#04182a"
                    opacity="0.25"
                  />
                  <image
                    href={pieceFile(isCity ? "city" : "settlement", owner.color)}
                    x={cx - (isCity ? 27 : 22)}
                    y={cy - (isCity ? 34 : 28)}
                    width={isCity ? 54 : 44}
                    height={isCity ? 54 : 44}
                  />
                </g>
              )}
              {isBuildable && isMyTurn && (
                <g
                  className="cursor-pointer transition hover:brightness-105"
                  onClick={() => onVertexClick(vertex.id)}
                  aria-label={activeMode === "city" ? "Mejorar a ciudad" : "Construir poblado"}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r="18"
                    fill="none"
                    stroke="#ffe08a"
                    strokeWidth="2.6"
                    strokeDasharray="5 5"
                    className="animate-pulse"
                  />
                  {activeMode === "settlement" ? (
                    <g>
                      <path
                        d={`M${cx - 8} ${cy + 7} V${cy - 1} H${cx + 8} V${cy + 7} Z`}
                        fill="#ffffff"
                        stroke="#6d5c33"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <path
                        d={`M${cx - 10.5} ${cy - 1} L${cx} ${cy - 10.5} L${cx + 10.5} ${cy - 1} Z`}
                        fill="#e6d7ab"
                        stroke="#6d5c33"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </g>
                  ) : (
                    <circle cx={cx} cy={cy} r="11" fill="#fff3c4" fillOpacity="0.6" stroke="#ffffff" strokeWidth="1.6" />
                  )}
                  <circle cx={cx} cy={cy} r="22" fill="transparent" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
