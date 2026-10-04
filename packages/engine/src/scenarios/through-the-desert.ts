import { cellsFor, nonDesertPool, numbersFrom, waterCells } from "./shared";
import type { LandHex } from "./shared";
import type { ScenarioDefinition, ScenarioPortSpec } from "./types";

const REGIONS = [
  { id: "main", name: "Isla principal", kind: "main" as const, bonusVp: 0, startingArea: true },
  {
    id: "strip",
    name: "Franja de tierra",
    kind: "small-island" as const,
    bonusVp: 2,
    startingArea: false,
  },
  {
    id: "island-a",
    name: "Isla del noreste",
    kind: "small-island" as const,
    bonusVp: 2,
    startingArea: false,
  },
  {
    id: "island-b",
    name: "Isla del este",
    kind: "small-island" as const,
    bonusVp: 2,
    startingArea: false,
  },
  {
    id: "island-c",
    name: "Isla del sureste",
    kind: "small-island" as const,
    bonusVp: 2,
    startingArea: false,
  },
];

const LAND_3P: LandHex[] = [
  { q: 0, r: -3, terrain: "gold", number: 4, region: "strip" },
  { q: 1, r: -3, terrain: "desert", number: null, region: "main" },
  { q: 3, r: -3, terrain: "ore", number: 8, region: "island-a" },
  { q: -1, r: -2, terrain: "wood", number: 3, region: "strip" },
  { q: 0, r: -2, terrain: "desert", number: null, region: "main" },
  { q: 1, r: -2, terrain: "wood", number: 4, region: "main" },
  { q: 3, r: -2, terrain: "sheep", number: 12, region: "island-a" },
  { q: -2, r: -1, terrain: "wheat", number: 6, region: "strip" },
  { q: -1, r: -1, terrain: "desert", number: null, region: "main" },
  { q: 0, r: -1, terrain: "brick", number: 5, region: "main" },
  { q: 1, r: -1, terrain: "sheep", number: 6, region: "main" },
  { q: -1, r: 0, terrain: "ore", number: 3, region: "main" },
  { q: 0, r: 0, terrain: "wood", number: 10, region: "main" },
  { q: 2, r: 0, terrain: "gold", number: 5, region: "island-b" },
  { q: -3, r: 1, terrain: "wood", number: 11, region: "main" },
  { q: -2, r: 1, terrain: "brick", number: 6, region: "main" },
  { q: -1, r: 1, terrain: "wheat", number: 2, region: "main" },
  { q: 0, r: 1, terrain: "brick", number: 9, region: "main" },
  { q: -3, r: 2, terrain: "ore", number: 10, region: "main" },
  { q: -2, r: 2, terrain: "wheat", number: 9, region: "main" },
  { q: -1, r: 2, terrain: "wood", number: 8, region: "main" },
  { q: 1, r: 2, terrain: "wheat", number: 9, region: "island-c" },
  { q: -3, r: 3, terrain: "sheep", number: 8, region: "main" },
  { q: -2, r: 3, terrain: "sheep", number: 4, region: "main" },
  { q: 0, r: 3, terrain: "ore", number: 5, region: "island-c" },
];

const BOARD_ROWS_3P: Array<[number, number, number]> = [
  [-3, 0, 3],
  [-2, -1, 3],
  [-1, -2, 3],
  [0, -3, 3],
  [1, -3, 2],
  [2, -3, 1],
  [3, -3, 0],
];

const SEA_3P: Array<[number, number]> = waterCells(LAND_3P, BOARD_ROWS_3P);

const PORTS_3P: ScenarioPortSpec[] = [
  // NE de 4 madera -> puerto de madera
  { q: 1, r: -2, side: 4, type: "wood", ratio: 2 },
  // NE de 9 ladrillo -> 3:1
  { q: 0, r: 1, side: 4, type: "generic", ratio: 3 },
  // SE de 9 ladrillo -> 3:1
  { q: 0, r: 1, side: 0, type: "generic", ratio: 3 },
  // E de 4 ovino -> 3:1
  { q: -2, r: 3, side: 5, type: "generic", ratio: 3 },
  // SE de 8 ovino -> puerto de ladrillo
  { q: -3, r: 3, side: 0, type: "brick", ratio: 2 },
  // O de 8 ovino -> puerto de piedra
  { q: -3, r: 3, side: 2, type: "ore", ratio: 2 },
  // SO de 11 madera -> puerto de ganado
  { q: -3, r: 1, side: 1, type: "sheep", ratio: 2 },
  // NO de 6 ladrillo -> puerto de trigo
  { q: -2, r: 1, side: 3, type: "wheat", ratio: 2 },
];

const TERRAIN_POOL_3P = nonDesertPool(LAND_3P);
const NUMBERS_3P = numbersFrom(LAND_3P);

const LAND_4P: LandHex[] = [
  { q: -1, r: -3, terrain: "gold", number: 10, region: "strip" },
  { q: 0, r: -3, terrain: "desert", number: null, region: "main" },
  { q: 1, r: -3, terrain: "wood", number: 5, region: "main" },
  { q: 3, r: -3, terrain: "ore", number: 9, region: "island-a" },
  { q: -2, r: -2, terrain: "ore", number: 11, region: "strip" },
  { q: -1, r: -2, terrain: "desert", number: null, region: "main" },
  { q: 0, r: -2, terrain: "brick", number: 3, region: "main" },
  { q: 1, r: -2, terrain: "sheep", number: 6, region: "main" },
  { q: 3, r: -2, terrain: "wheat", number: 4, region: "island-a" },
  { q: -3, r: -1, terrain: "wheat", number: 8, region: "strip" },
  { q: -2, r: -1, terrain: "desert", number: null, region: "main" },
  { q: -1, r: -1, terrain: "ore", number: 8, region: "main" },
  { q: 0, r: -1, terrain: "wheat", number: 10, region: "main" },
  { q: 1, r: -1, terrain: "wood", number: 4, region: "main" },
  { q: 3, r: -1, terrain: "brick", number: 2, region: "island-a" },
  { q: -2, r: 0, terrain: "wood", number: 10, region: "main" },
  { q: -1, r: 0, terrain: "brick", number: 11, region: "main" },
  { q: 0, r: 0, terrain: "sheep", number: 9, region: "main" },
  { q: -4, r: 1, terrain: "brick", number: 12, region: "main" },
  { q: -3, r: 1, terrain: "brick", number: 6, region: "main" },
  { q: -2, r: 1, terrain: "wheat", number: 5, region: "main" },
  { q: -1, r: 1, terrain: "wood", number: 8, region: "main" },
  { q: 1, r: 1, terrain: "gold", number: 5, region: "island-b" },
  { q: 2, r: 1, terrain: "sheep", number: 3, region: "island-b" },
  { q: -4, r: 2, terrain: "sheep", number: 3, region: "main" },
  { q: -3, r: 2, terrain: "sheep", number: 11, region: "main" },
  { q: -2, r: 2, terrain: "ore", number: 4, region: "main" },
  { q: -3, r: 3, terrain: "wood", number: 9, region: "main" },
  { q: -1, r: 3, terrain: "ore", number: 6, region: "island-c" },
  { q: 0, r: 3, terrain: "wheat", number: 12, region: "island-c" },
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

const SEA_4P: Array<[number, number]> = waterCells(LAND_4P, BOARD_ROWS_4P);

const PORTS_4P: ScenarioPortSpec[] = [
  // E de 5 madera -> puerto de ladrillo
  { q: 1, r: -3, side: 5, type: "brick", ratio: 2 },
  // NE de 4 madera -> 3:1
  { q: 1, r: -1, side: 4, type: "generic", ratio: 3 },
  // SE de 4 madera -> 3:1
  { q: 1, r: -1, side: 0, type: "generic", ratio: 3 },
  // SE de 8 madera -> 3:1
  { q: -1, r: 1, side: 0, type: "generic", ratio: 3 },
  // E de 9 madera -> puerto de madera
  { q: -3, r: 3, side: 5, type: "wood", ratio: 2 },
  // SO de 9 madera -> 3:1
  { q: -3, r: 3, side: 1, type: "generic", ratio: 3 },
  // SE de 3 ovino -> puerto de piedra
  { q: -4, r: 2, side: 0, type: "ore", ratio: 2 },
  // O de 3 ovino -> puerto de trigo
  { q: -4, r: 2, side: 2, type: "wheat", ratio: 2 },
  // O de 10 madera -> puerto de ganado
  { q: -2, r: 0, side: 2, type: "sheep", ratio: 2 },
];

const TERRAIN_POOL_4P = nonDesertPool(LAND_4P);
const NUMBERS_4P = numbersFrom(LAND_4P);

export const THROUGH_THE_DESERT: ScenarioDefinition = {
  id: "through-the-desert",
  name: "A través del desierto",
  description:
    "La isla del desierto. Los poblados iniciales van en la isla principal; cada primera fundación en la franja de tierra o en las islas del este otorga 2 PV extra. Gana quien llegue a 14 PV.",
  resourcePorts: ["wood", "brick", "sheep", "wheat", "ore"],
  variants: {
    "3": {
      playerCount: 3,
      hexes: cellsFor(LAND_3P, SEA_3P),
      regions: REGIONS,
      ports: PORTS_3P,
      robber: { q: 0, r: -2 },
      pirateStart: { q: 2, r: -2 },
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
      regions: REGIONS,
      ports: PORTS_4P,
      robber: { q: -1, r: -2 },
      pirateStart: { q: 3, r: 0 },
      winThreshold: 14,
      terrainPool: TERRAIN_POOL_4P,
      numbers: NUMBERS_4P,
      randomizeTerrains: true,
      randomizeNumbers: true,
      randomizePorts: true,
    },
  },
};
