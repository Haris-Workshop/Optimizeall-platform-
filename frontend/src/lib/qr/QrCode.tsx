import { useMemo } from 'react';
import { encodeQr } from './qrcode';

export interface QrCodeProps {
  /** The text to encode (e.g. an otpauth:// URI). */
  value: string;
  /** Accessible name of the image. */
  label: string;
  /** Rendered width and height in CSS pixels. */
  size?: number;
  className?: string;
}

/**
 * A QR code as an inline SVG (no network, no canvas): dark modules on a white square with the standard four-module
 * quiet zone, in both colour themes, since scanners need dark-on-light.
 */
export function QrCode({ value, label, size = 192, className }: QrCodeProps) {
  const { path, dimension } = useMemo(() => {
    const qr = encodeQr(value);
    const quiet = 4;
    let d = '';
    qr.modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      }),
    );
    return { path: d, dimension: qr.size + quiet * 2 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
    >
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
