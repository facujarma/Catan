export interface RandomSource {
  readonly state: number;
  nextUint32(): number;
  nextInt(maxExclusive: number): number;
  shuffle<T>(values: readonly T[]): T[];
}

export function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new Error("La semilla debe ser un número finito o texto.");
    }
    return Math.trunc(seed) >>> 0;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom implements RandomSource {
  private currentState: number;

  constructor(seed: number | string) {
    this.currentState = hashSeed(seed);
  }

  static fromState(state: number): SeededRandom {
    const random = new SeededRandom(0);
    random.currentState = state >>> 0;
    return random;
  }

  get state(): number {
    return this.currentState;
  }

  nextUint32(): number {
    this.currentState = (this.currentState + 0x6d2b79f5) >>> 0;
    let value = this.currentState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("El límite del entero aleatorio debe ser positivo.");
    }

    const range = 0x1_0000_0000;
    const limit = range - (range % maxExclusive);
    let value = this.nextUint32();
    while (value >= limit) {
      value = this.nextUint32();
    }
    return value % maxExclusive;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const otherIndex = this.nextInt(index + 1);
      [shuffled[index], shuffled[otherIndex]] = [
        shuffled[otherIndex]!,
        shuffled[index]!,
      ];
    }
    return shuffled;
  }
}
