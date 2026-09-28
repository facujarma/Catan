import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "public", "colonist");
const pieces = ["road", "settlement", "city"] as const;
const players: Record<string, string> = {
  red: "#d94b3d",
  blue: "#3c78c5",
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

for (const [name, player] of Object.entries(players)) {
  const dark = shade(player, -0.55);
  const light = shade(player, 0.62);
  mkdirSync(join(root, "pieces", name), { recursive: true });
  for (const piece of pieces) {
    const svg = readFileSync(join(root, `${piece}_gold.svg`), "utf8");
    const palette = [...new Set(svg.match(/#[0-9a-fA-F]{6}/g) ?? [])].filter(
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
      recolored = recolored.replaceAll(new RegExp(color, "gi"), target);
    }
    writeFileSync(join(root, "pieces", name, `${piece}.svg`), recolored);
  }
}

console.log("piezas recoloreadas:", Object.keys(players).join(", "));
