import type { PortType, Resource, Terrain } from "../types";

export interface ScenarioHexSpec {
  q: number;
  r: number;
  sea?: boolean;
  terrain?: Terrain;
  number?: number | null;
  region?: string;
  desert?: boolean;
}

export interface ScenarioRegionSpec {
  id: string;
  name: string;
  kind: "main" | "small-island" | "island";
  bonusVp: number;
  startingArea: boolean;
  exclusive?: boolean;
}

export interface ScenarioPortSpec {
  q: number;
  r: number;
  side: number;
  type: PortType;
  ratio: 2 | 3;
}

export interface ScenarioVariantSpec {
  playerCount: 3 | 4;
  hexes: ScenarioHexSpec[];
  regions: ScenarioRegionSpec[];
  ports: ScenarioPortSpec[];
  robber: { q: number; r: number } | "desert" | "number-12";
  // Hexágono de mar donde empieza el pirata, o "frame" si empieza en el marco.
  pirateStart?: { q: number; r: number } | "frame";
  forbidRedOnGold?: boolean;
  // Solo en setup variable: estos terrenos no reciben las fichas numéricas indicadas.
  variableAvoidNumbers?: { terrains: Resource[]; numbers: number[] };
  winThreshold: number;
  terrainPool: Array<Resource | "gold">;
  numbers: number[];
  randomizeTerrains: boolean;
  randomizeNumbers: boolean;
  randomizePorts: boolean;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  variants: Partial<Record<"3" | "4", ScenarioVariantSpec>>;
  resourcePorts: Resource[];
}
