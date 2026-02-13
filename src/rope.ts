/**
 * Rope implemented as an implicit-key treap for memory-efficient text storage.
 * Supports fast concatenation and string derivation without duplicating data.
 */
export class Rope {
  private root: RopeNode | null;

  private constructor(root: RopeNode | null) {
    this.root = root;
  }

  static fromString(value: string | null, parent: Rope | null = null): Rope | null {
    if (value === null || value.length === 0) {
      return parent;
    }
    const node = new RopeNode(value);
    return Rope.concat(parent, new Rope(node));
  }

  static append(parent: Rope | null, value: string | null): Rope | null {
    if (value === null || value.length === 0) {
      return parent;
    }
    return Rope.concat(parent, Rope.fromString(value, null));
  }

  static appendRope(parent: Rope | null, rope: Rope | null): Rope | null {
    if (rope === null) return parent;
    if (parent === null) return rope;
    return Rope.concat(parent, rope);
  }

  toString(): string {
    const parts: string[] = [];
    this.walk(this.root, parts);
    return parts.join('');
  }

  private walk(node: RopeNode | null, out: string[]): void {
    if (!node) return;
    this.walk(node.left, out);
    if (node.chunk) out.push(node.chunk);
    this.walk(node.right, out);
  }

  private static concat(a: Rope | null, b: Rope | null): Rope | null {
    if (a === null) return b;
    if (b === null) return a;
    return new Rope(Rope.merge(a.root, b.root));
  }

  private static merge(a: RopeNode | null, b: RopeNode | null): RopeNode | null {
    if (!a) return b;
    if (!b) return a;
    if (a.priority > b.priority) {
      a.right = Rope.merge(a.right, b);
      a.recalc();
      return a;
    }
    b.left = Rope.merge(a, b.left);
    b.recalc();
    return b;
  }
}

class RopeNode {
  left: RopeNode | null = null;
  right: RopeNode | null = null;
  chunk: string;
  size: number;
  priority: number;

  constructor(chunk: string) {
    this.chunk = chunk;
    this.size = chunk.length;
    this.priority = nextPriority();
  }

  recalc(): void {
    this.size = (this.left?.size ?? 0) + this.chunk.length + (this.right?.size ?? 0);
  }
}

// Simple deterministic PRNG for treap priorities to keep behavior reproducible.
let _seed = 0x12345678;

export function setRopeSeed(seed: number): void {
  _seed = seed >>> 0;
}

function nextPriority(): number {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0x100000000;
}
