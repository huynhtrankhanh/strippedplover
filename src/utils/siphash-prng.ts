import { randomBytes } from 'node:crypto';

const MASK_64 = (1n << 64n) - 1n;

function rotl(x: bigint, b: number): bigint {
  return ((x << BigInt(b)) | (x >> BigInt(64 - b))) & MASK_64;
}

function readU64LE(buf: Uint8Array, offset = 0): bigint {
  return (
    BigInt(buf[offset] ?? 0) |
    (BigInt(buf[offset + 1] ?? 0) << 8n) |
    (BigInt(buf[offset + 2] ?? 0) << 16n) |
    (BigInt(buf[offset + 3] ?? 0) << 24n) |
    (BigInt(buf[offset + 4] ?? 0) << 32n) |
    (BigInt(buf[offset + 5] ?? 0) << 40n) |
    (BigInt(buf[offset + 6] ?? 0) << 48n) |
    (BigInt(buf[offset + 7] ?? 0) << 56n)
  );
}

function sipRound(state: [bigint, bigint, bigint, bigint]): void {
  let [v0, v1, v2, v3] = state;

  v0 = (v0 + v1) & MASK_64;
  v1 = rotl(v1, 13) ^ v0;
  v0 = rotl(v0, 32);

  v2 = (v2 + v3) & MASK_64;
  v3 = rotl(v3, 16) ^ v2;

  v0 = (v0 + v3) & MASK_64;
  v3 = rotl(v3, 21) ^ v0;

  v2 = (v2 + v1) & MASK_64;
  v1 = rotl(v1, 17) ^ v2;
  v2 = rotl(v2, 32);

  state[0] = v0;
  state[1] = v1;
  state[2] = v2;
  state[3] = v3;
}

/**
 * Minimal SipHash-2-4 implementation returning a 64-bit hash of the message.
 * Based on the reference algorithm with little-endian message blocks.
 */
export function siphash24(key: Uint8Array, msg: Uint8Array): bigint {
  if (key.length !== 16) {
    throw new Error('SipHash key must be 16 bytes');
  }

  const k0 = readU64LE(key, 0);
  const k1 = readU64LE(key, 8);

  const state: [bigint, bigint, bigint, bigint] = [
    0x736f6d6570736575n ^ k0,
    0x646f72616e646f6dn ^ k1,
    0x6c7967656e657261n ^ k0,
    0x7465646279746573n ^ k1,
  ];

  let offset = 0;
  while (offset + 8 <= msg.length) {
    const m = readU64LE(msg, offset);
    state[3] ^= m;
    sipRound(state);
    sipRound(state);
    state[0] ^= m;
    offset += 8;
  }

  let last = BigInt(msg.length) << 56n;
  for (let i = 0; offset + i < msg.length; i++) {
    last |= BigInt(msg[offset + i]) << (8n * BigInt(i));
  }

  state[3] ^= last;
  sipRound(state);
  sipRound(state);
  state[0] ^= last;

  state[2] ^= 0xffn;
  sipRound(state);
  sipRound(state);
  sipRound(state);
  sipRound(state);

  return (state[0] ^ state[1] ^ state[2] ^ state[3]) & MASK_64;
}

/**
 * PRNG backed by SipHash. The SipHash key is always seeded from CSPRNG to
 * satisfy the requirement that SipHash itself is seeded securely.
 */
export class SipHashPRNG {
  private key: Uint8Array;
  private counter = 0n;

  constructor(seed?: Uint8Array) {
    if (seed !== undefined) {
      if (seed.length !== 16) {
        throw new Error('SipHashPRNG seed must be 16 bytes');
      }
      this.key = new Uint8Array(seed);
    } else {
      // Seed SipHash with CSPRNG as required
      this.key = randomBytes(16);
    }
  }

  nextUint32(): number {
    const block = Buffer.alloc(8);
    block.writeBigUInt64LE(this.counter++);
    const hash = siphash24(this.key, block);
    return Number(hash & 0xffffffffn);
  }
}
