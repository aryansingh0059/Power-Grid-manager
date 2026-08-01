/**
 * Deterministic pseudo-random number generator (Mulberry32).
 * Ensures identical network generation across server runs and environments.
 */
export class SeededRandom {
  private s: number;

  constructor(seed: number = 20260801) {
    this.s = seed;
  }

  /** Return float in [0, 1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Return float in [min, max) */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Return integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  /** Pick random item from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Return true with probability p (0 <= p <= 1) */
  boolean(p: number = 0.5): boolean {
    return this.next() < p;
  }
}
