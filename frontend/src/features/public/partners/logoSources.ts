/**
 * Responsive, modern-format sources for the built-in partner logos.
 *
 * The baseline partners (backend PartnerBaselineSeeder) point at PNG/JPEG files in frontend/public/partners/. Next to
 * each, the build ships WebP renditions at 128 and 256 px (`<name>-128.webp`, `<name>-256.webp`), a fraction of the
 * original's bytes at the sizes logos are shown (48-152 CSS px). Logos uploaded by editors (any other URL) are served as
 * they are. partners.test.tsx checks that every file listed here exists.
 */
export const PARTNER_LOGO_RENDITIONS: Readonly<Record<string, string>> = {
  '/partners/certuvo.jpg': '/partners/certuvo',
  '/partners/pci-ai.png': '/partners/pci-ai',
};

/** `srcSet`/`sizes` for a logo shown at `size` CSS px, or nothing when the logo has no built-in renditions. */
export function partnerLogoSources(logoUrl: string, size: number): { srcSet?: string; sizes?: string } {
  const base = PARTNER_LOGO_RENDITIONS[logoUrl];
  if (!base) return {};
  return { srcSet: `${base}-128.webp 128w, ${base}-256.webp 256w`, sizes: `${size}px` };
}
