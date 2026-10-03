import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "public", "colonist");
const pieces = ["road", "settlement", "city", "ship"] as const;
const sourceByPiece: Record<(typeof pieces)[number], string> = {
  road: "road_gold.svg",
  settlement: "settlement_gold.svg",
  city: "city_gold.svg",
  ship: "ship_north_west.svg",
};
// Los barcos usan un ramp mas saturado para que el color del jugador se note.
const rampByPiece: Record<(typeof pieces)[number], { dark: number; light: number }> = {
  road: { dark: -0.55, light: 0.62 },
  settlement: { dark: -0.55, light: 0.62 },
  city: { dark: -0.55, light: 0.62 },
  ship: { dark: -0.5, light: 0.3 },
};
const players: Record<string, string> = {
  red: "#d94b3d",
  blue: "#3c78c5",
  black: "#3f4249",
  yellow: "#e2b83f",
  purple: "#8457a5",
};

function parse(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function mix(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function shade(hex: string, factor: number): string {
  const [red, green, blue] = parse(hex);
  if (factor >= 0) {
    return toHex(
      red + (255 - red) * factor,
      green + (255 - green) * factor,
      blue + (255 - blue) * factor,
    );
  }
  const keep = 1 + factor;
  return toHex(red * keep, green * keep, blue * keep);
}

function saturation(hex: string): number {
  const [red, green, blue] = parse(hex);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max === 0 ? 0 : (max - min) / max;
}

function luminance(hex: string): number {
  const [red, green, blue] = parse(hex);
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

function expandShorthand(hex: string): string {
  const raw = hex.slice(1).toLowerCase();
  if (raw.length === 6) return `#${raw}`;
  return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
}

function colorVariants(hex: string): string[] {
  const raw = hex.slice(1);
  if (raw[0] === raw[1] && raw[2] === raw[3] && raw[4] === raw[5]) {
    return [hex, `#${raw[0]}${raw[2]}${raw[4]}`];
  }
  return [hex];
}

const HEX_PATTERN = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

for (const [name, player] of Object.entries(players)) {
  mkdirSync(join(root, "pieces", name), { recursive: true });
  for (const piece of pieces) {
    const dark = shade(player, rampByPiece[piece].dark);
    const light = shade(player, rampByPiece[piece].light);
    const svg = readFileSync(join(root, sourceByPiece[piece]), "utf8");
    const palette = [...new Set((svg.match(HEX_PATTERN) ?? []).map(expandShorthand))].filter(
      (color) => saturation(color) >= 0.2,
    );
    const values = palette.map(luminance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    let recolored = svg;
    for (const color of palette) {
      const t = (luminance(color) - min) / (max - min || 1);
      const target =
        t < 0.5 ? mix(dark, player, t * 2) : mix(player, light, (t - 0.5) * 2);
      for (const variant of colorVariants(color)) {
        recolored = recolored.replaceAll(new RegExp(`${variant}\\b`, "gi"), target);
      }
    }
    writeFileSync(join(root, "pieces", name, `${piece}.svg`), recolored);
  }
}

console.log("piezas recoloreadas:", Object.keys(players).join(", "));
