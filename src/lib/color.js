export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return (
    "#" +
    [r, g, b]
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

// h: 0-360, s/l: 0-100
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export const hslToHex = (h, s, l) => rgbToHex(hslToRgb(h, s, l));

export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.x contrast ratio
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Shifts lightness of `hex` (keeping hue/saturation) until it reaches `min` contrast against `against`.
export function ensureContrast(hex, against, min = 4.5) {
  if (contrast(hex, against) >= min) return hex;
  const [h, s, l] = hexToHsl(hex);
  const preferred = luminance(against) > 0.18 ? -1 : 1;
  for (const dir of [preferred, -preferred]) {
    for (let step = 1; step <= 100; step++) {
      const nl = l + dir * step;
      if (nl < 0 || nl > 100) break;
      const candidate = hslToHex(h, s, nl);
      if (contrast(candidate, against) >= min) return candidate;
    }
  }
  return contrast("#000000", against) >= contrast("#ffffff", against)
    ? "#000000"
    : "#ffffff";
}

// Black or white, whichever reads better on `hex`.
export function readableOn(hex) {
  return contrast("#000000", hex) >= contrast("#ffffff", hex)
    ? "#000000"
    : "#ffffff";
}

export const isValidHex = (v) => /^#[0-9a-f]{6}$/i.test(v);
