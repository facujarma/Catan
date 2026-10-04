import { HEADING_FOR_NEW_SHORES } from "./heading-for-new-shores";
import { THROUGH_THE_DESERT } from "./through-the-desert";
import type { ScenarioDefinition } from "./types";

export const SCENARIOS: ScenarioDefinition[] = [HEADING_FOR_NEW_SHORES, THROUGH_THE_DESERT];

export function getScenarioDefinition(id: string): ScenarioDefinition | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}
