import type { ScenarioDefinition, ScenarioPortSpec } from "./types";

interface LandHex {
  q: number;
  r: number;
  terrain: "wood" | "brick" | "sheep" | "wheat" | "ore" | "gold" | "desert";
  number: number | null;
  region: string;
}

const REGIONS_3P = [
  { id: "main", name: "Isla principal", kind: "main" as const, bonusVp: 0, startingArea: true },
  { id: "island-a", name: "Isla pequeña noroeste", kind: "small-island" as const, bonusVp: 2, startingArea: false },
  { id: "island-b", name: "Isla pequeña noreste", kind: "small-island" as const, bonusVp: 2, startingArea: false },
  { id: "island-c", name: "Isla pequeña sureste", kind: "small-island" as const, bonusVp: 2, startingArea: false },
  { id: "island-d", name: "Isla pequeña suroeste", kind: "small-island" as const, bonusVp: 2, startingArea: false },
];

const REGIONS_4P = [
  { id: "main", name: "Isla principal", kind: "main" as const, bonusVp: 0, startingArea: true },
  { id: "island-a", name: "Isla pequeña norte", kind: "small-island" as const, bonusVp: 2, startingArea: false },
  { id: "island-b", name: "Isla pequeña este", kind: "small-island" as const, bonusVp: 2, startingArea: false },
  { id: "island-c", name: "Isla pequeña sureste", kind: "small-island" as const, bonusVp: 2, startingArea: false },
];

const LAND_3P: LandHex[] = [
  { q: 0, r: -3, terrain: "wheat", number: 12, region: "island-a" },
  { q: 1, r: -3, terrain: "gold", number: 5, region: "island-a" },
  { q: 2, r: -2, terrain: "sheep", number: 4, region: "island-b" },
  { q: 3, r: -2, terrain: "ore", number: 9, region: "island-b" },
  { q: 2, r: -1, terrain: "brick", number: 3, region: "island-b" },
  { q: 2, r: 0, terrain: "gold", number: 4, region: "island-b" },
  { q: -1, r: -1, terrain: "wheat", number: 4, region: "main" },
  { q: 0, r: -1, terrain: "sheep", number: 6, region: "main" },
  { q: -2, r: 0, terrain: "sheep", number: 2, region: "main" },
  { q: -1, r: 0, terrain: "ore", number: 5, region: "main" },
  { q: 0, r: 0, terrain: "wood", number: 10, region: "main" },
  { q: -3, r: 1, terrain: "wheat", number: 8, region: "main" },
  { q: -2, r: 1, terrain: "sheep", number: 10, region: "main" },
  { q: -1, r: 1, terrain: "sheep", number: 9, region: "main" },
  { q: 0, r: 1, terrain: "wood", number: 8, region: "main" },
  { q: -3, r: 2, terrain: "brick", number: 11, region: "main" },
  { q: -2, r: 2, terrain: "ore", number: 3, region: "main" },
  { q: -1, r: 2, terrain: "brick", number: 11, region: "main" },
  { q: 1, r: 2, terrain: "ore", number: 8, region: "island-c" },
  { q: -3, r: 3, terrain: "wheat", number: 6, region: "island-d" },
  { q: -2, r: 3, terrain: "wood", number: 5, region: "island-d" },
  { q: 0, r: 3, terrain: "brick", number: 10, region: "island-c" },
];

// La region del tablero se define por filas (r) con su rango de q.
// Las longitudes copian el mapa oficial: 4,5,6,7,6,5,4 (3p) y 5,6,7,8,7,6,5 (4p).
const BOARD_ROWS_3P: Array<[number, number, number]> = [
  [-3, 0, 3],
  [-2, -1, 3],
  [-1, -2, 3],
  [0, -3, 3],
  [1, -3, 2],
  [2, -3, 1],
  [3, -3, 0],
];

const BOARD_ROWS_4P: Array<[number, number, number]> = [
  [-3, -1, 3],
  [-2, -2, 3],
  [-1, -3, 3],
  [0, -4, 3],
  [1, -4, 2],
  [2, -4, 1],
  [3, -4, 0],
];

function waterCells(
  land: LandHex[],
  rows: ReadonlyArray<[number, number, number]>,
): Array<[number, number]> {
  const landKeys = new Set(land.map((hex) => `${hex.q},${hex.r}`));
  const water: Array<[number, number]> = [];
  for (const [r, qStart, qEnd] of rows) {
    for (let q = qStart; q <= qEnd; q += 1) {
      if (landKeys.has(`${q},${r}`)) continue;
      water.push([q, r]);
    }
  }
  return water;
}

const SEA_3P: Array<[number, number]> = waterCells(LAND_3P, BOARD_ROWS_3P);

const PORTS_3P: ScenarioPortSpec[] = [
  // O de 4 (trigo) -> puerto de trigo
  { q: -1, r: -1, side: 2, type: "wheat", ratio: 2 },
  // E de 6 (ovino) -> 3:1
  { q: 0, r: -1, side: 5, type: "generic", ratio: 3 },
  // NO de 8 (costa oeste) -> puerto de piedra
  { q: -3, r: 1, side: 3, type: "ore", ratio: 2 },
  // SO de 8 (costa oeste) -> 3:1
  { q: -3, r: 1, side: 1, type: "generic", ratio: 3 },
  // O de 6 (trigo, isla SO) -> puerto de ladrillo
  { q: -3, r: 3, side: 2, type: "brick", ratio: 2 },
  // SO de 5 (madera) -> puerto de madera
  { q: -2, r: 3, side: 1, type: "wood", ratio: 2 },
  // E de 5 (madera) -> 3:1
  { q: -2, r: 3, side: 5, type: "generic", ratio: 3 },
  // NE de 8 (madera) -> puerto de ovino
  { q: 0, r: 1, side: 4, type: "sheep", ratio: 2 },
];

const LAND_4P: LandHex[] = [
  { q: -1, r: -3, terrain: "ore", number: 8, region: "island-a" },
  { q: 0, r: -3, terrain: "sheep", number: 11, region: "island-a" },
  { q: 2, r: -3, terrain: "gold", number: 4, region: "island-b" },
  { q: 2, r: -2, terrain: "wheat", number: 5, region: "island-b" },
  { q: 3, r: -2, terrain: "ore", number: 2, region: "island-b" },
  { q: 2, r: -1, terrain: "wood", number: 9, region: "island-b" },
  { q: 2, r: 0, terrain: "gold", number: 10, region: "island-b" },
  { q: -2, r: -1, terrain: "sheep", number: 5, region: "main" },
  { q: -1, r: -1, terrain: "wood", number: 6, region: "main" },
  { q: 0, r: -1, terrain: "ore", number: 4, region: "main" },
  { q: -3, r: 0, terrain: "brick", number: 12, region: "main" },
  { q: -2, r: 0, terrain: "brick", number: 11, region: "main" },
  { q: -1, r: 0, terrain: "wheat", number: 3, region: "main" },
  { q: 0, r: 0, terrain: "sheep", number: 9, region: "main" },
  { q: -2, r: 1, terrain: "desert", number: null, region: "main" },
  { q: -4, r: 1, terrain: "brick", number: 6, region: "main" },
  { q: -3, r: 1, terrain: "wood", number: 10, region: "main" },
  { q: -1, r: 1, terrain: "wheat", number: 11, region: "main" },
  { q: 0, r: 1, terrain: "wood", number: 5, region: "main" },
  { q: -4, r: 2, terrain: "ore", number: 3, region: "main" },
  { q: -3, r: 2, terrain: "sheep", number: 4, region: "main" },
  { q: -2, r: 2, terrain: "brick", number: 9, region: "main" },
  { q: -1, r: 2, terrain: "sheep", number: 8, region: "main" },
  { q: 1, r: 2, terrain: "wheat", number: 3, region: "island-c" },
  { q: -4, r: 3, terrain: "brick", number: 8, region: "main" },
  { q: -3, r: 3, terrain: "wood", number: 2, region: "main" },
  { q: -2, r: 3, terrain: "ore", number: 10, region: "main" },
  { q: 0, r: 3, terrain: "wheat", number: 6, region: "island-c" },
];

const SEA_4P: Array<[number, number]> = waterCells(LAND_4P, BOARD_ROWS_4P);

const PORTS_4P: ScenarioPortSpec[] = [
  // O de 5 (ovino) -> 3:1
  { q: -2, r: -1, side: 2, type: "generic", ratio: 3 },
  // NO de 6 (ladrillo) -> puerto de ovino
  { q: -4, r: 1, side: 3, type: "sheep", ratio: 2 },
  // SO de 6 (ladrillo) -> puerto de ladrillo
  { q: -4, r: 1, side: 1, type: "brick", ratio: 2 },
  // O de 8 (costa oeste) -> 3:1
  { q: -4, r: 3, side: 2, type: "generic", ratio: 3 },
  // SO de 2 (madera) -> puerto de madera
  { q: -3, r: 3, side: 1, type: "wood", ratio: 2 },
  // E de 10 (piedra) -> 3:1
  { q: -2, r: 3, side: 5, type: "generic", ratio: 3 },
  // SE de 5 (madera) -> puerto de trigo
  { q: 0, r: 1, side: 0, type: "wheat", ratio: 2 },
  // NE de 9 (ovino) -> 3:1
  { q: 0, r: 0, side: 4, type: "generic", ratio: 3 },
  // NO de 4 (piedra) -> puerto de piedra
  { q: 0, r: -1, side: 3, type: "ore", ratio: 2 },
];

function nonDesertPool(
  land: LandHex[],
): Array<"wood" | "brick" | "sheep" | "wheat" | "ore" | "gold"> {
  return land.flatMap((hex) => (hex.terrain === "desert" ? [] : [hex.terrain]));
}

const TERRAIN_POOL_3P = nonDesertPool(LAND_3P);
const TERRAIN_POOL_4P = nonDesertPool(LAND_4P);

const NUMBERS_3P = LAND_3P.flatMap((hex) => (hex.number === null ? [] : [hex.number]));
const NUMBERS_4P = LAND_4P.flatMap((hex) => (hex.number === null ? [] : [hex.number]));

function cellsFor(land: LandHex[], sea: Array<[number, number]>) {
  return [
    ...land.map((hex) => ({
      q: hex.q,
      r: hex.r,
      terrain: hex.terrain,
      number: hex.number,
      region: hex.region,
      desert: hex.terrain === "desert",
    })),
    ...sea.map(([q, r]) => ({ q, r, sea: true })),
  ];
}

export const HEADING_FOR_NEW_SHORES: ScenarioDefinition = {
  id: "heading-for-new-shores",
  name: "Rumbo a nuevas costas",
  description:
    "",
  resourcePorts: ["wood", "brick", "sheep", "wheat", "ore"],
  variants: {
    "3": {
      playerCount: 3,
      hexes: cellsFor(LAND_3P, SEA_3P),
      regions: REGIONS_3P,
      ports: PORTS_3P,
      robber: "number-12",
      winThreshold: 14,
      terrainPool: TERRAIN_POOL_3P,
      numbers: NUMBERS_3P,
      randomizeTerrains: true,
      randomizeNumbers: true,
      randomizePorts: true,
    },
    "4": {
      playerCount: 4,
      hexes: cellsFor(LAND_4P, SEA_4P),
      regions: REGIONS_4P,
      ports: PORTS_4P,
      robber: "desert",
      winThreshold: 14,
      terrainPool: TERRAIN_POOL_4P,
      numbers: NUMBERS_4P,
      randomizeTerrains: true,
      randomizeNumbers: true,
      randomizePorts: true,
    },
  },
};

export const SCENARIOS = [HEADING_FOR_NEW_SHORES];

export function getScenarioDefinition(id: string): ScenarioDefinition | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}
