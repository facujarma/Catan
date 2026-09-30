import { RESOURCES, type Resource, type ResourceBundle } from "./types";

export const BUILDING_COSTS = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  ship: { wood: 1, brick: 0, sheep: 1, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
  "development-card": { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 },
} satisfies Record<string, ResourceBundle>;

export function emptyResources(): ResourceBundle {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function totalResources(resources: ResourceBundle): number {
  return RESOURCES.reduce((total, resource) => total + resources[resource], 0);
}

export function isResource(value: string): value is Resource {
  return (RESOURCES as readonly string[]).includes(value);
}

export function validateResourceBundle(resources: ResourceBundle): void {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
    throw new Error("Los recursos deben ser un objeto válido.");
  }
  if (Object.keys(resources).some((key) => !(RESOURCES as readonly string[]).includes(key))) {
    throw new Error("El conjunto contiene un tipo de recurso desconocido.");
  }
  for (const resource of RESOURCES) {
    const amount = resources[resource];
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`La cantidad de ${resource} debe ser un entero no negativo.`);
    }
  }
}

export function hasResources(
  available: ResourceBundle,
  requested: ResourceBundle,
): boolean {
  return RESOURCES.every((resource) => available[resource] >= requested[resource]);
}

export function addResources(
  target: ResourceBundle,
  incoming: ResourceBundle,
): void {
  for (const resource of RESOURCES) target[resource] += incoming[resource];
}

export function subtractResources(
  target: ResourceBundle,
  outgoing: ResourceBundle,
): void {
  for (const resource of RESOURCES) target[resource] -= outgoing[resource];
}
