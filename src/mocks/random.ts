/**
 * Seeded PRNG (mulberry32) for reproducible demo data. Not for anything
 * security related — card codes in production use crypto (features/cards/code.ts).
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("pick() from an empty list");
    return item;
  }

  /** Picks a key with probability proportional to its weight. */
  weighted<K extends string | number>(weights: readonly (readonly [K, number])[]): K {
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [key, weight] of weights) {
      roll -= weight;
      if (roll < 0) return key;
    }
    const last = weights.at(-1);
    if (!last) throw new Error("weighted() with no options");
    return last[0];
  }

  /** Poisson-distributed count (Knuth); fine for the small means used in demo data. */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    const limit = Math.exp(-mean);
    let count = 0;
    let product = this.next();
    while (product > limit) {
      count++;
      product *= this.next();
    }
    return count;
  }

  /** RFC 4122 version-4 shaped UUID from the seeded stream. */
  uuid(): string {
    const bytes = Array.from({ length: 16 }, () => Math.floor(this.next() * 256));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** Stream of bytes for code generators that take a randomBytes function. */
  bytes(length: number): Uint8Array {
    return Uint8Array.from({ length }, () => Math.floor(this.next() * 256));
  }
}
