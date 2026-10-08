import { cellsFor, nonDesertPool, numbersFrom, waterCells } from "./shared";
import type { LandHex } from "./shared";
import type { ScenarioDefinition, ScenarioPortSpec, ScenarioRegionSpec } from "./types";

// Marco del escenario: 37 casillas entre tierra y mar, con la misma silueta para
// 3 y 4 jugadores. La fila central queda con 3 casillas de agua a cada lado: en 4
// jugadores es la fila del 6 de madera. Cada fila es [r, qInicial, qFinal] en
// coordenadas axiales. El pirata empieza fuera del marco, en la pieza marcada con "x".
const FRAME_ROWS: Array<[number, number, number]> = [
  [-3, 0, 3],
  [-2, -1, 3],
  [-1, -2, 3],
  [0, -3, 3],
  [1, -3, 2],
  [2, -3, 1],
  [3, -3, 0],
];

// Las cuatro islas tienen el mismo valor. Cada jugador funda sus poblados iniciales
// en una o dos islas (sus islas natales); el primer poblado en cada isla extraña
// otorga 2 PV extra, sin importar si otro jugador ya construyó allí.
const REGIONS: ScenarioRegionSpec[] = [
  { id: "island-ne", name: "Isla noreste", kind: "island", bonusVp: 2, startingArea: true },
  { id: "island-nw", name: "Isla noroeste", kind: "island", bonusVp: 2, startingArea: true },
  { id: "island-sw", name: "Isla suroeste", kind: "island", bonusVp: 2, startingArea: true },
  { id: "island-se", name: "Isla sureste", kind: "island", bonusVp: 2, startingArea: true },
];

const LAND_3P: LandHex[] = [
  // Isla noreste
  { q: 2, r: -3, terrain: "wheat", number: 4, region: "island-ne" },
  { q: 3, r: -3, terrain: "sheep", number: 3, region: "island-ne" },
  { q: 2, r: -2, terrain: "wheat", number: 9, region: "island-ne" },
  { q: 3, r: -2, terrain: "brick", number: 5, region: "island-ne" },
  { q: 1, r: -1, terrain: "wood", number: 8, region: "island-ne" },
  { q: 2, r: -1, terrain: "brick", number: 11, region: "island-ne" },
  // Isla noroeste
  { q: -1, r: -2, terrain: "ore", number: 4, region: "island-nw" },
  { q: 0, r: -2, terrain: "wood", number: 9, region: "island-nw" },
  { q: -2, r: -1, terrain: "sheep", number: 6, region: "island-nw" },
  { q: -1, r: -1, terrain: "ore", number: 10, region: "island-nw" },
  // Isla suroeste
  { q: -3, r: 1, terrain: "wheat", number: 11, region: "island-sw" },
  { q: -2, r: 1, terrain: "ore", number: 8, region: "island-sw" },
  { q: -1, r: 1, terrain: "wood", number: 3, region: "island-sw" },
  { q: -3, r: 2, terrain: "wood", number: 5, region: "island-sw" },
  { q: -2, r: 2, terrain: "sheep", number: 9, region: "island-sw" },
  { q: -3, r: 3, terrain: "sheep", number: 12, region: "island-sw" },
  // Isla sureste
  { q: 1, r: 1, terrain: "brick", number: 10, region: "island-se" },
  { q: 2, r: 1, terrain: "brick", number: 6, region: "island-se" },
  { q: 0, r: 2, terrain: "ore", number: 2, region: "island-se" },
  { q: 1, r: 2, terrain: "wheat", number: 5, region: "island-se" },
];

const LAND_4P: LandHex[] = [
  // Isla noreste (8 hexágonos)
  { q: 2, r: -3, terrain: "wood", number: 9, region: "island-ne" },
  { q: 3, r: -3, terrain: "wood", number: 11, region: "island-ne" },
  { q: 2, r: -2, terrain: "wheat", number: 12, region: "island-ne" },
  { q: 3, r: -2, terrain: "sheep", number: 5, region: "island-ne" },
  { q: 1, r: -2, terrain: "ore", number: 3, region: "island-ne" },
  { q: 2, r: -1, terrain: "ore", number: 10, region: "island-ne" },
  { q: 1, r: -1, terrain: "brick", number: 5, region: "island-ne" },
  { q: 0, r: 0, terrain: "wood", number: 6, region: "island-ne" },
  // Isla noroeste
  { q: 0, r: -3, terrain: "sheep", number: 8, region: "island-nw" },
  { q: -1, r: -2, terrain: "brick", number: 10, region: "island-nw" },
  { q: -2, r: -1, terrain: "wheat", number: 5, region: "island-nw" },
  { q: -1, r: -1, terrain: "wood", number: 3, region: "island-nw" },
  // Isla suroeste (7 hexágonos)
  { q: -3, r: 1, terrain: "brick", number: 4, region: "island-sw" },
  { q: -3, r: 2, terrain: "wheat", number: 6, region: "island-sw" },
  { q: -3, r: 3, terrain: "sheep", number: 10, region: "island-sw" },
  { q: -2, r: 1, terrain: "sheep", number: 9, region: "island-sw" },
  { q: -2, r: 2, terrain: "ore", number: 4, region: "island-sw" },
  { q: -2, r: 3, terrain: "wheat", number: 11, region: "island-sw" },
  { q: -1, r: 2, terrain: "brick", number: 2, region: "island-sw" },
  // Isla sureste
  { q: 1, r: 1, terrain: "wood", number: 9, region: "island-se" },
  { q: 2, r: 1, terrain: "sheep", number: 11, region: "island-se" },
  { q: 1, r: 2, terrain: "ore", number: 8, region: "island-se" },
  { q: 0, r: 3, terrain: "wheat", number: 4, region: "island-se" },
];

const SEA_3P: Array<[number, number]> = waterCells(LAND_3P, FRAME_ROWS);
const SEA_4P: Array<[number, number]> = waterCells(LAND_4P, FRAME_ROWS);

// Lados de hexágono: 0 SE, 1 SO, 2 O, 3 NO, 4 NE, 5 E.
const PORTS_3P: ScenarioPortSpec[] = [
  // SE del 9 de la isla noroeste -> puerto de piedra
  { q: 0, r: -2, side: 0, type: "ore", ratio: 2 },
  // NE del 5 de la isla noreste -> 3:1
  { q: 3, r: -2, side: 4, type: "generic", ratio: 3 },
  // SO del 11 de la isla noreste -> puerto de ladrillo
  { q: 2, r: -1, side: 1, type: "brick", ratio: 2 },
  // NO del 6 de la isla noroeste -> 3:1
  { q: -2, r: -1, side: 3, type: "generic", ratio: 3 },
  // SO del 11 de la isla suroeste -> 3:1
  { q: -3, r: 1, side: 1, type: "generic", ratio: 3 },
  // NE del 11 de la isla suroeste -> puerto de madera
  { q: -3, r: 1, side: 4, type: "wood", ratio: 2 },
  // SE del 9 de la isla suroeste -> puerto de ovino
  { q: -2, r: 2, side: 0, type: "sheep", ratio: 2 },
  // NO del 2 de la isla sureste -> 3:1
  { q: 0, r: 2, side: 3, type: "generic", ratio: 3 },
  // SE del 6 de la isla sureste -> puerto de trigo
  { q: 2, r: 1, side: 0, type: "wheat", ratio: 2 },
];

const PORTS_4P: ScenarioPortSpec[] = [
  // O del 10 de la isla noroeste -> puerto de trigo
  { q: -1, r: -2, side: 2, type: "wheat", ratio: 2 },
  // SE del 5 de la isla noroeste -> 3:1
  { q: -2, r: -1, side: 0, type: "generic", ratio: 3 },
  // SE del 5 de la isla noreste -> puerto de madera
  { q: 3, r: -2, side: 0, type: "wood", ratio: 2 },
  // NO del 6 de la isla noreste -> 3:1
  { q: 0, r: 0, side: 3, type: "generic", ratio: 3 },
  // NO del 11 de la isla sureste -> puerto de piedra
  { q: 2, r: 1, side: 3, type: "ore", ratio: 2 },
  // NE del 4 de la isla suroeste -> 3:1
  { q: -2, r: 2, side: 4, type: "generic", ratio: 3 },
  // SE del 11 de la isla sureste -> 3:1
  { q: 2, r: 1, side: 0, type: "generic", ratio: 3 },
  // SO del 4 de la isla suroeste -> puerto de ladrillo
  { q: -3, r: 1, side: 1, type: "brick", ratio: 2 },
  // O del 10 de la isla suroeste -> puerto de ovino
  { q: -3, r: 3, side: 2, type: "sheep", ratio: 2 },
];

const TERRAIN_POOL_3P = nonDesertPool(LAND_3P);
const TERRAIN_POOL_4P = nonDesertPool(LAND_4P);

const NUMBERS_3P = numbersFrom(LAND_3P);
const NUMBERS_4P = numbersFrom(LAND_4P);

// Al armar el mapa al azar, los bosques y los pastos no reciben 2, 3, 11 ni 12.
const VARIABLE_AVOID_NUMBERS = {
  terrains: ["wood" as const, "sheep" as const],
  numbers: [2, 3, 11, 12],
};

export const FOUR_ISLANDS: ScenarioDefinition = {
  id: "four-islands",
  name: "Las cuatro islas",
  description:
    "Cuatro islas separadas por el mar. Cada jugador funda sus poblados iniciales en una o dos islas natales; el primer poblado en cada isla extraña otorga 2 PV extra. El pirata empieza en el marco. Gana quien llegue a 13 PV.",
  resourcePorts: ["wood", "brick", "sheep", "wheat", "ore"],
  variants: {
    "3": {
      playerCount: 3,
      hexes: cellsFor(LAND_3P, SEA_3P),
      regions: REGIONS,
      ports: PORTS_3P,
      robber: "number-12",
      pirateStart: "frame",
      winThreshold: 13,
      terrainPool: TERRAIN_POOL_3P,
      numbers: NUMBERS_3P,
      randomizeTerrains: true,
      randomizeNumbers: true,
      randomizePorts: true,
      variableAvoidNumbers: VARIABLE_AVOID_NUMBERS,
    },
    "4": {
      playerCount: 4,
      hexes: cellsFor(LAND_4P, SEA_4P),
      regions: REGIONS,
      ports: PORTS_4P,
      robber: "number-12",
      pirateStart: "frame",
      winThreshold: 13,
      terrainPool: TERRAIN_POOL_4P,
      numbers: NUMBERS_4P,
      randomizeTerrains: true,
      randomizeNumbers: true,
      randomizePorts: true,
      variableAvoidNumbers: VARIABLE_AVOID_NUMBERS,
    },
  },
};
