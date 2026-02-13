import { describe, it, expect } from 'vitest';
import { Rope } from './rope.js';

describe('Rope (treap)', () => {
  it('supports append/delete without mutating previous ropes', () => {
    const r1 = Rope.fromString('hello');
    const r2 = r1.append(' world');
    const r3 = r2.delete(5, 6); // remove space

    expect(r1.toString()).toBe('hello');
    expect(r2.toString()).toBe('hello world');
    expect(r3.toString()).toBe('helloworld');
    expect(r1.length).toBe(5);
    expect(r3.length).toBe(10);
  });

  it('handles insert and slice for retro backspace scenarios', () => {
    const base = Rope.fromString('retro');
    const withSpace = base.insert(base.length, ' ');
    const withWord = withSpace.append('edit');
    const backspaced = withWord.delete(withWord.length - 1, withWord.length);

    expect(withWord.toString()).toBe('retro edit');
    expect(backspaced.toString()).toBe('retro edi');
    expect(backspaced.slice(0, 5)).toBe('retro');
  });
});
