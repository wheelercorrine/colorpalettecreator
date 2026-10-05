import {
  clamp,
  contrast,
  ensureContrast,
  hexToHsl,
  hslToHex,
  luminance,
  readableOn,
  rgbToHsl,
} from "./color.js";

export const ROLES = [
  { id: "background", label: "Background" },
  { id: "surface", label: "Surface" },
  { id: "text", label: "Text" },
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "accent", label: "Accent" },
];

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function neutralsFor(h) {
  const background = hslToHex(h, rand(20, 40), rand(95, 97));
  return {
    background,
    surface: hslToHex(h, rand(20, 40), 91),
    text: hslToHex(h, rand(30, 50), rand(9, 13)),
  };
}

// Hue offsets from the primary for [secondary, accent]; mono schemes vary saturation/lightness instead.
const HARMONIES = [
  { name: "analogous", offsets: [30, -30] },
  { name: "analogous-wide", offsets: [25, 50] },
  { name: "complementary", offsets: [180, 165] },
  { name: "split-complementary", offsets: [150, 210] },
  { name: "triadic", offsets: [120, 240] },
  { name: "tetradic", offsets: [60, 180] },
  { name: "square", offsets: [90, 270] },
  { name: "double-split", offsets: [30, 180] },
  { name: "monochromatic", offsets: [0, 0], mono: true },
  { name: "accented-analogous", offsets: [30, 180] },
];

function harmonize(h) {
  const scheme = pick(HARMONIES);
  const jitter = () => rand(-8, 8);
  const [o1, o2] = scheme.offsets;
  const flip = Math.random() < 0.5 ? 1 : -1;
  return scheme.mono
    ? {
        scheme,
        secondary: [h + jitter(), rand(25, 45), rand(30, 42)],
        accent: [h + jitter(), rand(80, 95), rand(50, 62)],
      }
    : {
        scheme,
        secondary: [h + flip * o1 + jitter(), rand(40, 75), rand(35, 55)],
        accent: [h + flip * o2 + jitter(), rand(65, 92), rand(42, 58)],
      };
}

export function randomPartial(locked) {
  const anchor = locked.primary ?? locked.secondary ?? locked.accent;
  const h = anchor ? hexToHsl(anchor)[0] : rand(0, 360);
  const { secondary, accent } = harmonize(h);
  return {
    ...neutralsFor(h + rand(-10, 10)),
    primary: hslToHex(h, rand(50, 88), rand(33, 52)),
    secondary: hslToHex(...secondary),
    accent: hslToHex(...accent),
  };
}

// Applies locks and makes unlocked values consistent with them (light-mode seed).
export function finalize(partial, locked) {
  const out = { ...partial, ...locked };

  if (locked.background && !locked.text) {
    out.text = ensureContrast(partial.text, out.background, 7);
  } else if (locked.text && !locked.background) {
    out.background = ensureContrast(partial.background, out.text, 7);
  }

  if (!locked.surface) {
    const [h, s, l] = hexToHsl(out.background);
    const lighter = luminance(out.background) <= 0.3;
    out.surface = ensureContrast(
      hslToHex(h, s, l + (lighter ? 6 : -4)),
      out.text,
      4.5,
    );
  }

  for (const id of ["primary", "secondary", "accent"]) {
    if (!locked[id]) out[id] = ensureContrast(out[id], out.background, 4.5);
  }
  return out;
}

const seedMode = (seed) =>
  luminance(seed.background) > 0.3 ? "light" : "dark";

// Resolves a seed palette to a concrete light or dark palette meeting WCAG 2.2 AA.
export function deriveMode(seed, mode) {
  const c = { ...seed };

  if (seedMode(seed) !== mode) {
    const [bh, bs, bl] = hexToHsl(seed.background);
    const [th, ts] = hexToHsl(seed.text);
    if (mode === "dark") {
      c.background = hslToHex(bh, Math.min(bs, 30), clamp(100 - bl, 7, 14));
      c.text = hslToHex(th, Math.min(ts, 25), 93);
    } else {
      c.background = hslToHex(bh, Math.min(bs, 40), clamp(100 - bl, 94, 98));
      c.text = hslToHex(th, Math.max(ts, 30), 11);
    }
    const [h, s, l] = hexToHsl(c.background);
    c.surface = hslToHex(h, s, l + (mode === "dark" ? 6 : -4));
  }

  c.text = ensureContrast(c.text, c.background, 7);
  c.text = ensureContrast(c.text, c.surface, 4.5);
  for (const id of ["primary", "secondary", "accent"]) {
    c[id] = ensureContrast(
      ensureContrast(seed[id], c.background, 4.5),
      c.surface,
      4.5,
    );
  }

  const adjusted = ROLES.map((r) => r.id).filter(
    (id) => c[id] !== seed[id] && seedMode(seed) === mode,
  );
  return {
    ...c,
    onPrimary: readableOn(c.primary),
    onSecondary: readableOn(c.secondary),
    onAccent: readableOn(c.accent),
    adjusted,
  };
}

export function contrastReport(p) {
  const pairs = [
    ["Text on background", p.text, p.background, 4.5],
    ["Text on surface", p.text, p.surface, 4.5],
    ["Primary on background", p.primary, p.background, 4.5],
    ["Secondary on background", p.secondary, p.background, 4.5],
    ["Accent on background", p.accent, p.background, 4.5],
    ["Text on primary", p.onPrimary, p.primary, 4.5],
    ["Text on secondary", p.onSecondary, p.secondary, 4.5],
    ["Text on accent", p.onAccent, p.accent, 4.5],
  ];
  return pairs.map(([label, fg, bg, min]) => {
    const ratio = contrast(fg, bg);
    return { label, fg, bg, ratio, pass: ratio >= min, aaa: ratio >= 7 };
  });
}

// ---- Image extraction ----

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function samplePixels(file) {
  if (!file.type.startsWith("image/"))
    throw new Error("Please choose an image file.");
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("Image is larger than 15 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return pixels;
}

function kmeans(pixels, k, iterations = 10) {
  let centers = Array.from({ length: k }, () =>
    pixels[Math.floor(Math.random() * pixels.length)].slice(),
  );
  let counts = new Array(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const d =
          (p[0] - centers[i][0]) ** 2 +
          (p[1] - centers[i][1]) ** 2 +
          (p[2] - centers[i][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      counts[best]++;
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
    }
    centers = centers.map((c, i) =>
      counts[i] ? sums[i].map((v) => v / counts[i]) : c,
    );
  }
  return centers
    .map((c, i) => ({ rgb: c, count: counts[i] }))
    .filter((c) => c.count > 0);
}

const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export async function paletteFromImage(file, locked) {
  const pixels = await samplePixels(file);
  if (pixels.length === 0) throw new Error("Image has no visible pixels.");

  const total = pixels.length;
  const clusters = kmeans(pixels, 8).map(({ rgb, count }) => {
    const [h, s, l] = rgbToHsl(rgb);
    return { h, s, l, weight: count / total };
  });

  const candidates = clusters.filter((c) => c.s > 12 && c.l > 12 && c.l < 88);
  const dominant = [...clusters].sort((a, b) => b.weight - a.weight)[0];

  // Anchor on a locked color, else a random image color (weighted toward saturated, common ones).
  const lockedAnchor = locked.primary ?? locked.secondary ?? locked.accent;
  let anchor;
  if (lockedAnchor) {
    const [h, s, l] = hexToHsl(lockedAnchor);
    anchor = { h, s, l };
  } else if (candidates.length) {
    const weights = candidates.map((c) => c.s * (0.3 + Math.sqrt(c.weight)));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    anchor = candidates.find((_, i) => (r -= weights[i]) <= 0) ?? candidates[0];
  } else {
    anchor = { h: dominant.h, s: 50, l: 45 };
  }

  // Harmony hues are pulled partway toward the nearest image hue so the palette stays related to the image.
  const pull = (hsl) => {
    const [h, s, l] = hsl;
    const near = candidates
      .filter((c) => hueDistance(c.h, h) < 45)
      .sort((a, b) => hueDistance(a.h, h) - hueDistance(b.h, h))[0];
    if (!near) return hsl;
    const delta = ((near.h - h + 540) % 360) - 180;
    return [h + delta * 0.5, (s + near.s) / 2, (l + near.l) / 2];
  };

  const { secondary, accent } = harmonize(anchor.h);
  return {
    ...neutralsFor((candidates[0]?.h ?? dominant.h) + rand(-12, 12)),
    primary: hslToHex(
      anchor.h + rand(-10, 10),
      clamp(anchor.s + rand(-10, 15), 40, 90),
      clamp(anchor.l + rand(-8, 8), 33, 55),
    ),
    secondary: hslToHex(...pull(secondary)),
    accent: hslToHex(...pull(accent)),
  };
}

export function toCss(light, dark) {
  const vars = (p) =>
    [
      "background",
      "surface",
      "text",
      "primary",
      "secondary",
      "accent",
      "onPrimary",
      "onSecondary",
      "onAccent",
    ]
      .map(
        (k) =>
          `  --color-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${p[k]};`,
      )
      .join("\n");
  return `:root {\n${vars(light)}\n}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n${vars(
    dark,
  )
    .split("\n")
    .map((l) => "  " + l)
    .join("\n")}\n  }\n}\n`;
}
