/**
 * Persistent rope implemented with a treap for maximum structural sharing.
 *
 * The rope stores UTF-16 strings as slices. All operations are immutable and
 * return a new rope reusing existing nodes where possible.
 */
export class Rope {
  readonly length: number;
  private readonly root: Node | null;

  constructor(root: Node | null = null) {
    this.root = root;
    this.length = root?.size ?? 0;
  }

  static fromString(text: string): Rope {
    if (!text) return new Rope();
    return new Rope(new Node(text));
  }

  toString(): string {
    return flatten(this.root);
  }

  /**
   * Append text to the rope.
   */
  append(text: string): Rope {
    if (!text) return this;
    return new Rope(merge(this.root, new Node(text)));
  }

  /**
   * Delete a range [start, end).
   */
  delete(start: number, end: number): Rope {
    if (start < 0) start = 0;
    if (end > this.length) end = this.length;
    if (start >= end) return this;

    const [left, rest] = split(this.root, start);
    const [_deleted, right] = split(rest, end - start);
    return new Rope(merge(left, right));
  }

  /**
   * Insert text at position.
   */
  insert(pos: number, text: string): Rope {
    if (!text) return this;
    if (pos < 0) pos = 0;
    if (pos > this.length) pos = this.length;

    const [left, right] = split(this.root, pos);
    const mid = new Node(text);
    return new Rope(merge(merge(left, mid), right));
  }

  /**
   * Slice the rope returning the substring in [start, end).
   */
  slice(start: number, end: number = this.length): string {
    if (start < 0) start = 0;
    if (end > this.length) end = this.length;
    if (start >= end) return '';

    const [left, rest] = split(this.root, start);
    const [mid] = split(rest, end - start);
    return flatten(mid);
  }
}

class Node {
  readonly text: string;
  readonly size: number;
  readonly priority: number;
  readonly left: Node | null;
  readonly right: Node | null;

  constructor(text: string, priority: number = nextPriority(), left: Node | null = null, right: Node | null = null) {
    this.text = text;
    this.priority = priority;
    this.left = left;
    this.right = right;
    this.size = (left?.size ?? 0) + text.length + (right?.size ?? 0);
  }

  withLeft(left: Node | null): Node {
    if (left === this.left) return this;
    return new Node(this.text, this.priority, left, this.right);
  }

  withRight(right: Node | null): Node {
    if (right === this.right) return this;
    return new Node(this.text, this.priority, this.left, right);
  }
}

// ----------------------------------------------------------------------------
// Treap utilities
// ----------------------------------------------------------------------------

import { SipHashPRNG } from './siphash-prng.js';

const prng = new SipHashPRNG();

function nextPriority(): number {
  // Use upper 31 bits to keep priorities positive
  return prng.nextUint32() >>> 1;
}

function size(node: Node | null): number {
  return node?.size ?? 0;
}

function update(node: Node | null): Node | null {
  if (!node) return null;
  const newSize = size(node.left) + node.text.length + size(node.right);
  if (newSize === node.size) return node;
  return new Node(node.text, node.priority, node.left, node.right);
}

function merge(left: Node | null, right: Node | null): Node | null {
  if (!left) return right;
  if (!right) return left;

  if (left.priority > right.priority) {
    const newRight = merge(left.right, right);
    return update(left.withRight(newRight));
  } else {
    const newLeft = merge(left, right.left);
    return update(right.withLeft(newLeft));
  }
}

/**
 * Split the treap into [0, pos) and [pos, end)
 */
function split(root: Node | null, pos: number): [Node | null, Node | null] {
  if (!root) return [null, null];

  const leftSize = size(root.left);
  const rootSpan = leftSize + root.text.length;

  if (pos < leftSize) {
    const [l, r] = split(root.left, pos);
    return [l, update(root.withLeft(r))];
  }

  if (pos > rootSpan) {
    const [l, r] = split(root.right, pos - rootSpan);
    return [update(root.withRight(l)), r];
  }

  // Split within root.text
  const leftText = root.text.slice(0, pos - leftSize);
  const rightText = root.text.slice(pos - leftSize);

  let leftPart: Node | null = root.left;
  if (leftText) {
    leftPart = merge(leftPart, new Node(leftText, root.priority));
  }

  let rightPart: Node | null = root.right;
  if (rightText) {
    rightPart = merge(new Node(rightText, root.priority), rightPart);
  }

  return [leftPart, rightPart];
}

function flatten(root: Node | null): string {
  const parts: string[] = [];
  const stack: Node[] = [];
  let current: Node | null = root;

  while (current !== null || stack.length > 0) {
    while (current) {
      stack.push(current);
      current = current.left;
    }
    const node = stack.pop()!;
    parts.push(node.text);
    current = node.right;
  }

  return parts.join('');
}
