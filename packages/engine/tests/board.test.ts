import { describe, expect, it } from "vitest";
import { generateBoard } from "../src";
import { RESOURCES } from "../src/types";

describe("generación del tablero", () => {
  it("es determinista para una misma semilla", () => {
    expect(generateBoard("partida-fixture")).toEqual(generateBoard("partida-fixture"));
    expect(generateBoard("partida-fixture")).not.toEqual(generateBoard("otra-partida"));
  });

  it("genera los hexágonos, vértices, caminos y terrenos oficiales", () => {
    const board = generateBoard(42);
    const terrainCounts = new Map<string, number>();
    for (const hex of board.hexes) {
      terrainCounts.set(hex.terrain, (terrainCounts.get(hex.terrain) ?? 0) + 1);
    }

    expect(board.hexes).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
    expect(board.edges.filter((edge) => edge.hexIds.length === 1)).toHaveLength(30);
    expect(terrainCounts.get("wood")).toBe(4);
    expect(terrainCounts.get("brick")).toBe(3);
    expect(terrainCounts.get("sheep")).toBe(4);
    expect(terrainCounts.get("wheat")).toBe(4);
    expect(terrainCounts.get("ore")).toBe(3);
    expect(terrainCounts.get("desert")).toBe(1);
    expect(board.hexes.find((hex) => hex.terrain === "desert")?.number).toBeNull();
    expect(board.vertices.every((vertex) => vertex.edgeIds.length === 2 || vertex.edgeIds.length === 3)).toBe(true);
  });

  it("usa la distribución correcta de fichas y respeta la separación de números", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const board = generateBoard(seed);
      const hexById = new Map(board.hexes.map((hex) => [hex.id, hex]));
      const numberCounts = new Map<number, number>();
      for (const hex of board.hexes) {
        if (hex.number !== null) {
          numberCounts.set(hex.number, (numberCounts.get(hex.number) ?? 0) + 1);
        }
      }

      expect(numberCounts.get(2)).toBe(1);
      expect(numberCounts.get(12)).toBe(1);
      for (const number of [3, 4, 5, 6, 8, 9, 10, 11]) {
        expect(numberCounts.get(number)).toBe(2);
      }

      for (const hex of board.hexes) {
        if (hex.number === null) continue;
        for (const neighborId of hex.neighborHexIds) {
          const neighbor = hexById.get(neighborId)!;
          expect(neighbor.number).not.toBe(hex.number);
          if (hex.number === 6 || hex.number === 8) {
            expect([6, 8]).not.toContain(neighbor.number);
          }
        }
      }
    }
  });

  it("coloca cuatro puertos 3:1 y uno 2:1 por recurso", () => {
    const board = generateBoard(2026);
    const genericPorts = board.ports.filter((port) => port.type === "generic");
    const resourcePorts = board.ports.filter((port) => port.type !== "generic");

    expect(board.ports).toHaveLength(9);
    expect(genericPorts).toHaveLength(4);
    expect(genericPorts.every((port) => port.ratio === 3)).toBe(true);
    expect(resourcePorts).toHaveLength(5);
    expect(resourcePorts.map((port) => port.type).sort()).toEqual([...RESOURCES].sort());
    expect(resourcePorts.every((port) => port.ratio === 2)).toBe(true);

    for (let left = 0; left < board.ports.length; left += 1) {
      for (let right = left + 1; right < board.ports.length; right += 1) {
        expect(
          board.ports[left]!.vertexIds.some((vertexId) =>
            board.ports[right]!.vertexIds.includes(vertexId),
          ),
        ).toBe(false);
      }
    }
  });
});
