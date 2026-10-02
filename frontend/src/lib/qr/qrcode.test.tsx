import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { encodeQr, penaltyScore } from './qrcode';
import { QrCode } from './QrCode';

/**
 * The encoder's output for a short otpauth URI, pinned module by module. It was checked with an independent decoder
 * (jsQR) for every mask and lengths up to version 38 when the encoder was written; this keeps it from drifting.
 */
const GOLDEN = [
  '#######.##..####.##...#######',
  '#.....#.########.###..#.....#',
  '#.###.#.#...###....##.#.###.#',
  '#.###.#..#.#..####..#.#.###.#',
  '#.###.#.###.##.#.#.#..#.###.#',
  '#.....#....#.##.#.#.#.#.....#',
  '#######.#.#.#.#.#.#.#.#######',
  '.........####.#...#.#........',
  '#..#######..####.#.###..#.###',
  '..#..#..#.#.#.#...##.#.##.#..',
  '#..##.##...##.##.#.......##..',
  '###..#.##.###.#..#.##.#..#..#',
  '####..#.##.#.####.....##...##',
  '.#...#.#........#...#####.###',
  '##..###.##.#..##...####.#...#',
  '##.....###.#.####.#.#.#####.#',
  '.#..###.#.#.#..##.#.##...#...',
  '#...#...##..#..##..##...##.#.',
  '###...#....#####.#.##....##.#',
  '##..##..##.###......####..###',
  '##..#.##....##......#######..',
  '........##..##...####...#....',
  '#######.#....#.##.###.#.#.#..',
  '#.....#.####.#.#.##.#...#..#.',
  '#.###.#.##.###.#.#.######..##',
  '#.###.#.####.##.#.#.##...#..#',
  '#.###.#..##.####.###.##.#####',
  '#.....#....###.##.#.##.#..#.#',
  '#######.#...##.###.##.#......',
];

const rows = (modules: boolean[][]) => modules.map((r) => r.map((b) => (b ? '#' : '.')).join(''));

describe('encodeQr', () => {
  it('matches the pinned matrix for a short otpauth URI', () => {
    const qr = encodeQr('otpauth://totp/OA:a?secret=JBSWY3DP');
    expect(qr.version).toBe(3);
    expect(qr.size).toBe(29);
    expect(rows(qr.modules)).toEqual(GOLDEN);
  });

  it('picks the smallest version that holds the text (byte mode, level M)', () => {
    expect(encodeQr('x'.repeat(14)).version).toBe(1);
    expect(encodeQr('x'.repeat(15)).version).toBe(2);
    expect(encodeQr('x'.repeat(213)).version).toBe(10);
    expect(encodeQr('x'.repeat(214)).version).toBe(11);
    expect(() => encodeQr('x'.repeat(3000))).toThrow(RangeError);
  });

  it('draws the three finder patterns, the timing patterns and the dark module', () => {
    const { modules, size } = encodeQr(
      'otpauth://totp/Optimize%20All:ada%40example.com?secret=JBSWY3DPEHPK3PXP',
    );
    const finder = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'];
    const at = (x0: number, y0: number) =>
      finder.map((_, y) =>
        finder[y]
          .split('')
          .map((__, x) => (modules[y0 + y][x0 + x] ? '#' : '.'))
          .join(''),
      );
    expect(at(0, 0)).toEqual(finder);
    expect(at(size - 7, 0)).toEqual(finder);
    expect(at(0, size - 7)).toEqual(finder);
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6][i]).toBe(i % 2 === 0);
      expect(modules[i][6]).toBe(i % 2 === 0);
    }
    expect(modules[size - 8][8]).toBe(true);
  });

  it('chooses the mask with the lowest penalty', () => {
    const text =
      'otpauth://totp/Optimize%20All:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Optimize%20All';
    const best = encodeQr(text);
    for (let mask = 0; mask < 8; mask++)
      expect(penaltyScore(encodeQr(text, { mask }).modules)).toBeGreaterThanOrEqual(
        penaltyScore(best.modules),
      );
  });
});

describe('QrCode', () => {
  it('renders an accessible SVG with a white quiet zone', () => {
    const { getByRole } = render(
      <QrCode value="otpauth://totp/OA:a?secret=JBSWY3DP" label="QR code for your app" />,
    );
    const svg = getByRole('img', { name: 'QR code for your app' });
    expect(svg.getAttribute('viewBox')).toBe('0 0 37 37');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
    expect(svg.querySelector('path')?.getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  });
});
