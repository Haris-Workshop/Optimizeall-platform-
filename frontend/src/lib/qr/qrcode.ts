/**
 * A small QR Code encoder (ISO/IEC 18004, model 2): byte mode, error correction level M, versions 1–40, automatic mask
 * selection. Enough for otpauth:// URIs (two-step verification set-up) without a third-party library; the structure
 * follows Project Nayuki's reference implementation (MIT). Returns the module matrix; rendering is up to the caller
 * (see QrCode.tsx).
 */

/** Error-correction codewords per block, level M, by version (index 0 unused). */
const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

/** Error-correction blocks, level M, by version (index 0 unused). */
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28,
  29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

/** Format-information bits of level M. */
const FORMAT_BITS_M = 0;

export interface QrMatrix {
  version: number;
  /** Modules per side (without the quiet zone). */
  size: number;
  mask: number;
  /** modules[y][x]: true = dark. */
  modules: boolean[][];
}

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(version: number): number {
  return (
    Math.floor(numRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK_M[version] * NUM_ERROR_CORRECTION_BLOCKS_M[version]
  );
}

function alignmentPatternPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ---------- Reed–Solomon over GF(2^8), polynomial 0x11D ----------

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array<number>(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---------- Encoding ----------

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** The data codewords (mode, length, payload, terminator, padding) for the smallest version that fits. */
function encodeData(bytes: readonly number[]): { version: number; codewords: number[] } {
  for (let version = 1; version <= 40; version++) {
    const countBits = version <= 9 ? 8 : 16;
    const capacityBits = numDataCodewords(version) * 8;
    const usedBits = 4 + countBits + bytes.length * 8;
    if (usedBits > capacityBits) continue;

    const bits: number[] = [];
    const append = (value: number, length: number) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    append(0b0100, 4); // byte mode
    append(bytes.length, countBits);
    for (const b of bytes) append(b, 8);
    append(0, Math.min(4, capacityBits - bits.length)); // terminator
    append(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8);

    const codewords: number[] = [];
    for (let i = 0; i < bits.length; i += 8)
      codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    return { version, codewords };
  }
  throw new RangeError('Text too long for a QR code');
}

/** Splits into blocks, appends each block's error correction and interleaves (ISO 18004 § 7.6). */
function addEccAndInterleave(version: number, data: readonly number[]): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ---------- Matrix ----------

class Grid {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const { size } = grid;
  for (let i = 0; i < size; i++) {
    grid.setFunction(6, i, i % 2 === 0);
    grid.setFunction(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) grid.setFunction(x, y, dist !== 2 && dist !== 4);
      }
  }
  const positions = alignmentPatternPositions(version, size);
  const last = positions.length - 1;
  positions.forEach((py, i) =>
    positions.forEach((px, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          grid.setFunction(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  drawFormatBits(grid, 0); // reserves the area; redrawn with the chosen mask
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.setFunction(a, b, bit);
      grid.setFunction(b, a, bit);
    }
  }
}

function drawFormatBits(grid: Grid, mask: number): void {
  const { size } = grid;
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) grid.setFunction(8, i, getBit(bits, i));
  grid.setFunction(8, 7, getBit(bits, 6));
  grid.setFunction(8, 8, getBit(bits, 7));
  grid.setFunction(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) grid.setFunction(14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i++) grid.setFunction(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) grid.setFunction(8, size - 15 + i, getBit(bits, i));
  grid.setFunction(8, size - 8, true); // the dark module
}

function drawCodewords(grid: Grid, codewords: readonly number[]): void {
  const { size } = grid;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!grid.isFunction[y][x] && i < codewords.length * 8) {
          grid.modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(grid: Grid, mask: number): void {
  for (let y = 0; y < grid.size; y++)
    for (let x = 0; x < grid.size; x++)
      if (!grid.isFunction[y][x] && maskApplies(mask, x, y)) grid.modules[y][x] = !grid.modules[y][x];
}

/** The standard's penalty score (N1 runs, N2 blocks, N3 finder-like patterns, N4 balance); lower reads better. */
export function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // N3: 1:1:3:1:1 with four light modules on either side.
    for (let i = 0; i + 10 < size; i++) {
      const window = Array.from({ length: 11 }, (_, k) => get(i + k));
      const pattern = [true, false, true, true, true, false, true];
      const core = (offset: number) => pattern.every((v, k) => window[offset + k] === v);
      const light = (from: number) => [0, 1, 2, 3].every((k) => !window[from + k]);
      if ((core(0) && light(7)) || (light(0) && core(4))) score += 40;
    }
  };
  for (let y = 0; y < size; y++) line((x) => modules[y][x]);
  for (let x = 0; x < size; x++) line((y) => modules[y][x]);
  for (let y = 0; y + 1 < size; y++)
    for (let x = 0; x + 1 < size; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Encodes text (UTF-8, byte mode, level M) into the smallest QR Code that holds it, with the best-scoring mask. */
export function encodeQr(text: string, options: { mask?: number } = {}): QrMatrix {
  const { version, codewords } = encodeData(utf8Bytes(text));
  const all = addEccAndInterleave(version, codewords);
  const size = version * 4 + 17;

  let best: QrMatrix | null = null;
  let bestScore = Infinity;
  const masks = options.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [options.mask];
  for (const mask of masks) {
    const grid = new Grid(size);
    drawFunctionPatterns(grid, version);
    drawCodewords(grid, all);
    applyMask(grid, mask);
    drawFormatBits(grid, mask);
    const score = penaltyScore(grid.modules);
    if (score < bestScore) {
      bestScore = score;
      best = { version, size, mask, modules: grid.modules };
    }
  }
  return best as QrMatrix;
}
