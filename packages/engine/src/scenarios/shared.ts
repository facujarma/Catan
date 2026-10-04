import type { Resource } from "../types";
import type { ScenarioHexSpec } from "./types";

export interface LandHex {
  q: number;
  r: number;
  terrain: Resource | "gold" | "desert";
  number: number | null;
  region: string;
}

export function waterCells(
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

export function cellsFor(
  land: LandHex[],
  sea: Array<[number, number]>,
): ScenarioHexSpec[] {
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

export function nonDesertPool(land: LandHex[]): Array<Resource | "gold"> {
  return land.flatMap((hex) => (hex.terrain === "desert" ? [] : [hex.terrain]));
}

export function numbersFrom(land: LandHex[]): number[] {
  return land.flatMap((hex) => (hex.number === null ? [] : [hex.number]));
}
