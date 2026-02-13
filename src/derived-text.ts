/**
 * DerivedText - a lightweight text derivation node.
 * Each node points to a parent node and appends additional text.
 * Full strings are reconstructed by traversing the chain.
 */
export class DerivedText {
  parent: DerivedText | null;
  append: string;

  constructor(parent: DerivedText | null, append: string) {
    this.parent = parent;
    this.append = append;
  }

  /**
   * Create a derivation node (or chain) from a string value.
   * Returns null when the value is null or empty and no parent is provided.
   */
  static fromString(value: string | null, parent: DerivedText | null = null): DerivedText | null {
    if (value === null) return null;
    if (value.length === 0) return parent;
    return new DerivedText(parent, value);
  }

  /**
   * Append raw text to an existing derivation.
   */
  static append(parent: DerivedText | null, value: string): DerivedText | null {
    if (value.length === 0) return parent;
    return new DerivedText(parent, value);
  }

  /**
   * Append an entire derivation to a parent while preserving the original segments.
   * This creates a new chain that reuses the existing segment ordering without
   * materializing the combined string.
   */
  static appendDerivation(parent: DerivedText | null, derivation: DerivedText | null): DerivedText | null {
    if (derivation === null) return parent;
    if (parent === null) return derivation;
    let node = parent;
    for (const segment of derivation.segments()) {
      node = new DerivedText(node, segment);
    }
    return node;
  }

  /**
   * Derive the full string by walking back through parents.
   */
  derive(): string {
    const parts: string[] = [];
    let node: DerivedText | null = this;
    while (node) {
      parts.push(node.append);
      node = node.parent;
    }
    return parts.reverse().join('');
  }

  /**
   * Get the ordered list of appended segments from root to this node.
   */
  private segments(): string[] {
    const parts: string[] = [];
    let node: DerivedText | null = this;
    while (node) {
      parts.push(node.append);
      node = node.parent;
    }
    return parts.reverse();
  }
}
