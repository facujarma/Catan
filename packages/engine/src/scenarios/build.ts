import { buildBoardFromDrafts } from "../board";
import { SeededRandom } from "../random";
import type { RandomSource } from "../random";
import type { Board, BoardRegion, Resource, Terrain } from "../types";
import { getScenarioDefinition } from "./index";
import type { ScenarioPortSpec, ScenarioVariantSpec } from "./types";

export type SetupMode = "fixed" | "variable";

export interface BuiltScenario {
  board: Board;
  winThreshold: number;
  setupMode: SetupMode;
  robberHexId: string;
  pirateHexId: string | null;
}

const RED_NUMBERS = new Set([6, 8]);

function hexId(q: number, r: number): string {
  return `h-${q}-${r}`;
}

function placementIsValid(
  hexes: ReadonlyArray<{ id: string; number: number | null; terrain: string }>,
  neighborIds: ReadonlyMap<string, string[]>,
  forbidRedOnGold: boolean,
): boolean {
  const byId = new Map(hexes.map((hex) => [hex.id, hex]));
  for (const hex of hexes) {
    if (hex.number === null) continue;
    if (forbidRedOnGold && hex.terrain === "gold" && RED_NUMBERS.has(hex.number)) return false;
    for (const neighborId of neighborIds.get(hex.id) ?? []) {
      const neighbor = byId.get(neighborId);
      if (!neighbor || neighbor.number === null) continue;
      if (RED_NUMBERS.has(hex.number) && RED_NUMBERS.has(neighbor.number)) return false;
    }
  }
  return true;
}

function assignNumbers(
  hexes: Array<{ id: string; number: number | null; terrain: string; desert: boolean }>,
  neighborIds: ReadonlyMap<string, string[]>,
  numbers: readonly number[],
  random: RandomSource,
  forbidRedOnGold: boolean,
): void {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const shuffled = random.shuffle(numbers);
    let index = 0;
    for (const hex of hexes) hex.number = hex.desert ? null : (shuffled[index++] ?? null);
    if (placementIsValid(hexes, neighborIds, forbidRedOnGold)) return;
  }
}

export function buildScenarioBoard(
  scenarioId: string,
  playerCount: 3 | 4,
  setupMode: SetupMode,
  random: RandomSource,
  options: { forbidRedOnGold?: boolean; mainIslandNoGold?: boolean } = {},
): BuiltScenario {
  const definition = getScenarioDefinition(scenarioId);
  if (!definition) throw new Error(`No existe el escenario ${scenarioId}.`);
  const variant = definition.variants[String(playerCount) as "3" | "4"];
  if (!variant) {
    throw new Error(`El escenario ${scenarioId} no tiene variante para ${playerCount} jugadores.`);
  }
  const forbidRedOnGold = options.forbidRedOnGold ?? variant.forbidRedOnGold ?? false;
  const mainIslandNoGold = options.mainIslandNoGold ?? false;

  const landSlots = variant.hexes.filter((hex) => !hex.sea);
  const seaSlots = variant.hexes.filter((hex) => hex.sea);

  const terrainBySlot = new Map<string, Resource | "gold">();
  if (setupMode === "variable") {
    const pool = random.shuffle(variant.terrainPool);
    if (mainIslandNoGold) {
      // Los campos de oro solo pueden caer en islas no principales.
      const islandSlots = random.shuffle(
        landSlots.filter((slot) => !slot.desert && slot.region !== "main"),
      );
      const mainSlots = landSlots.filter((slot) => !slot.desert && slot.region === "main");
      const golds = pool.filter((terrain) => terrain === "gold");
      const others = pool.filter((terrain) => terrain !== "gold");
      golds.forEach((terrain, index) => {
        const slot = islandSlots[index];
        if (slot) terrainBySlot.set(hexId(slot.q, slot.r), terrain);
      });
      const restSlots = [...islandSlots.slice(golds.length), ...mainSlots];
      others.forEach((terrain, index) => {
        const slot = restSlots[index];
        if (slot) terrainBySlot.set(hexId(slot.q, slot.r), terrain);
      });
    } else {
      let index = 0;
      for (const slot of landSlots) {
        if (slot.desert) continue;
        terrainBySlot.set(hexId(slot.q, slot.r), pool[index++] ?? "wood");
      }
    }
  }

  interface BuiltHex {
    id: string;
    q: number;
    r: number;
    terrain: Terrain;
    number: number | null;
    desert: boolean;
    region: string | null;
  }

  const hexes: BuiltHex[] = [
    ...landSlots.map((slot) => {
      const id = hexId(slot.q, slot.r);
      const terrain: Terrain =
        setupMode === "fixed"
          ? (slot.terrain ?? "desert")
          : (terrainBySlot.get(id) ?? "desert");
      return {
        id,
        q: slot.q,
        r: slot.r,
        terrain,
        number: setupMode === "fixed" ? (slot.number ?? null) : null,
        desert: terrain === "desert",
        region: slot.region ?? null,
      };
    }),
    ...seaSlots.map((slot) => ({
      id: hexId(slot.q, slot.r),
      q: slot.q,
      r: slot.r,
      terrain: "sea" as const,
      number: null,
      desert: false,
      region: null,
    })),
  ];

  const neighborIds = new Map<string, string[]>();
  for (const hex of hexes) neighborIds.set(hex.id, []);
  const directionOffsets: Array<[number, number]> = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  for (const hex of hexes) {
    neighborIds.set(
      hex.id,
      directionOffsets
        .map(([dq, dr]) => hexId(hex.q + dq, hex.r + dr))
        .filter((neighborId) => neighborIds.has(neighborId)),
    );
  }

  if (setupMode === "variable") {
    assignNumbers(hexes, neighborIds, variant.numbers, random, forbidRedOnGold);
  }

  const shouldRandomizePorts = setupMode === "variable" && variant.randomizePorts;
  const portTypePool = shouldRandomizePorts
    ? random.shuffle(variant.ports.map((port) => ({ type: port.type, ratio: port.ratio })))
    : null;
  const portDrafts = variant.ports.map((port: ScenarioPortSpec, index) => {
    if (!portTypePool) return port;
    const selected = portTypePool[index]!;
    return { ...port, type: selected.type, ratio: selected.ratio };
  });

  const board = buildBoardFromDrafts(
    hexes.map((hex) => ({
      q: hex.q,
      r: hex.r,
      terrain: hex.terrain,
      number: hex.number,
    })),
    portDrafts.map(({ q, r, side, type, ratio }) => ({ q, r, side, type, ratio })),
  );

  const regions: BoardRegion[] = variant.regions.map((region) => ({
    id: region.id,
    name: region.name,
    kind: region.kind,
    bonusVp: region.bonusVp,
    startingArea: region.startingArea,
    ...(region.exclusive ? { exclusive: true } : {}),
    hexIds: hexes
      .filter((hex) => hex.region === region.id)
      .map((hex) => hex.id)
      .sort(),
  }));

  board.regions = regions;

  const fallbackSlot = landSlots[0]!;
  const robberHex = (() => {
    if (variant.robber === "desert") {
      const desertHex = hexes.find((hex) => hex.terrain === "desert");
      return desertHex?.id ?? hexId(fallbackSlot.q, fallbackSlot.r);
    }
    if (variant.robber === "number-12") {
      const twelve = hexes.find((hex) => hex.number === 12);
      return twelve?.id ?? hexId(fallbackSlot.q, fallbackSlot.r);
    }
    return hexId(variant.robber.q, variant.robber.r);
  })();

  return {
    board,
    winThreshold: variant.winThreshold,
    setupMode,
    robberHexId: robberHex,
    pirateHexId: buildPirateStart(hexes, regions, variant),
  };
}

function buildPirateStart(
  hexes: ReadonlyArray<{ id: string; q: number; r: number; terrain: string }>,
  regions: readonly BoardRegion[],
  variant: ScenarioVariantSpec,
): string | null {
  const seaHexes = hexes.filter((hex) => hex.terrain === "sea");
  if (variant.pirateStart) {
    const explicitId = hexId(variant.pirateStart.q, variant.pirateStart.r);
    const explicitHex = hexes.find((hex) => hex.id === explicitId);
    if (explicitHex?.terrain !== "sea") {
      throw new Error(
        `El pirata del escenario apunta a un hexágono de mar inexistente en (${variant.pirateStart.q},${variant.pirateStart.r}).`,
      );
    }
    return explicitId;
  }
  if (seaHexes.length === 0) return null;

  const mainRegion = regions.find((region) => region.kind === "main");
  const mainHexes = hexes.filter((hex) => mainRegion?.hexIds.includes(hex.id));
  if (mainHexes.length === 0) return seaHexes[0]!.id;

  const center = mainHexes.reduce(
    (accumulator, hex) => {
      const x = Math.sqrt(3) * (hex.q + hex.r / 2);
      const y = 1.5 * hex.r;
      return { x: accumulator.x + x / mainHexes.length, y: accumulator.y + y / mainHexes.length };
    },
    { x: 0, y: 0 },
  );

  let farthest = seaHexes[0]!;
  let farthestDistance = -1;
  for (const hex of seaHexes) {
    const x = Math.sqrt(3) * (hex.q + hex.r / 2);
    const y = 1.5 * hex.r;
    const distance = Math.hypot(x - center.x, y - center.y);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthest = hex;
    }
  }
  return farthest.id;
}

export function createSeededScenarioRandom(seed: number | string): SeededRandom {
  return new SeededRandom(seed);
}
