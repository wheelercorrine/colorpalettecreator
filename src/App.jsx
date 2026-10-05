import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { contrast, isValidHex } from "./lib/color.js";
import {
  ROLES,
  contrastReport,
  deriveMode,
  finalize,
  paletteFromImage,
  randomPartial,
  toCss,
} from "./lib/palette.js";

const initialMode = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

function Swatch({
  role,
  color,
  locked,
  adjusted,
  onToggleLock,
  onCopy,
  onEdit,
}) {
  const label =
    contrast(color, "#ffffff") >= contrast(color, "#000000")
      ? "#ffffff"
      : "#000000";
  return (
    <li className="swatch">
      <div
        className="swatch-color"
        style={{ background: color, color: label }}
        aria-hidden="true"
      >
        {locked ? "Locked" : ""}
      </div>
      <div className="swatch-body">
        <h3>{role.label}</h3>
        <label className="hex-field">
          <span className="visually-hidden">{role.label} hex value</span>
          <input
            type="text"
            defaultValue={color}
            key={color}
            maxLength={7}
            spellCheck="false"
            onBlur={(e) => onEdit(role.id, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        {adjusted && <p className="note">Adjusted to meet AA contrast.</p>}
        <div className="swatch-actions">
          <button
            type="button"
            aria-pressed={locked}
            onClick={() => onToggleLock(role.id)}
          >
            {locked ? "Locked" : "Lock"}
            <span className="visually-hidden"> {role.label}</span>
          </button>
          <button type="button" onClick={() => onCopy(role.label, color)}>
            Copy<span className="visually-hidden"> {role.label} hex</span>
          </button>
        </div>
      </div>
    </li>
  );
}

function Preview({ p }) {
  const style = {
    "--p-bg": p.background,
    "--p-surface": p.surface,
    "--p-text": p.text,
    "--p-primary": p.primary,
    "--p-secondary": p.secondary,
    "--p-accent": p.accent,
    "--p-on-primary": p.onPrimary,
    "--p-on-secondary": p.onSecondary,
    "--p-on-accent": p.onAccent,
  };
  return (
    <div className="preview" style={style}>
      <h3>Sample card</h3>
      <p>
        Body text sits on the background color and stays readable in both modes.
      </p>
      <div className="preview-card">
        <p>
          A <span className="preview-link">primary colored link</span> on a
          surface.
        </p>
        <span className="preview-badge">Accent</span>
      </div>
      <div className="preview-buttons">
        <button type="button" className="p-primary">
          Primary
        </button>
        <button type="button" className="p-secondary">
          Secondary
        </button>
        <button type="button" className="p-accent">
          Accent
        </button>
      </div>
    </div>
  );
}

function ContrastReport({ rows }) {
  return (
    <table className="report">
      <caption>WCAG 2.2 contrast (AA requires 4.5:1 for text)</caption>
      <thead>
        <tr>
          <th scope="col">Pair</th>
          <th scope="col">Ratio</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">
              <span
                className="chip"
                style={{ background: r.bg, color: r.fg }}
                aria-hidden="true"
              >
                Aa
              </span>
              {r.label}
            </th>
            <td>{r.ratio.toFixed(2)}:1</td>
            <td>{r.aaa ? "Pass AAA" : r.pass ? "Pass AA" : "Fail"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function App() {
  const [seed, setSeed] = useState(() => finalize(randomPartial({}), {}));
  const [locks, setLocks] = useState({});
  const [mode, setMode] = useState(initialMode);
  const [source, setSource] = useState("random");
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const light = useMemo(() => deriveMode(seed, "light"), [seed]);
  const dark = useMemo(() => deriveMode(seed, "dark"), [seed]);
  const palette = mode === "dark" ? dark : light;
  const report = useMemo(() => contrastReport(palette), [palette]);
  const css = useMemo(() => toCss(light, dark), [light, dark]);

  useEffect(() => () => imageUrl && URL.revokeObjectURL(imageUrl), [imageUrl]);

  const lockedMap = () =>
    Object.fromEntries(
      ROLES.filter((r) => locks[r.id]).map((r) => [r.id, seed[r.id]]),
    );

  async function generate(nextSource = source, nextFile = file) {
    const locked = lockedMap();
    const kept = Object.keys(locked).length;
    setBusy(true);
    try {
      const partial =
        nextSource === "image" && nextFile
          ? await paletteFromImage(nextFile, locked)
          : randomPartial(locked);
      setSeed(finalize(partial, locked));
      setStatus(
        `New palette generated.${kept ? ` ${kept} locked ${kept === 1 ? "color" : "colors"} kept.` : ""}`,
      );
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setImageUrl(URL.createObjectURL(f));
    setSource("image");
    generate("image", f);
  }

  function toggleLock(id) {
    const next = !locks[id];
    setLocks({ ...locks, [id]: next });
    setStatus(
      `${ROLES.find((r) => r.id === id).label} ${next ? "locked" : "unlocked"}.`,
    );
  }

  function editColor(id, value) {
    const v = (value.startsWith("#") ? value : `#${value}`).toLowerCase();
    if (!isValidHex(v)) {
      setStatus("Enter a 6-digit hex color such as #1a2b3c.");
      return;
    }
    if (v === palette[id].toLowerCase()) return;
    setSeed(finalize({ ...seed, [id]: v }, { ...lockedMap(), [id]: v }));
    setLocks({ ...locks, [id]: true });
    setStatus(
      `${ROLES.find((r) => r.id === id).label} set to ${v} and locked.`,
    );
  }

  async function copy(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch {
      setStatus("Copy failed. Select the text and copy manually.");
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Accessible Color Palette Generator</h1>
        <p>
          Every text and background pairing meets WCAG 2.2 AA in both light and
          dark mode.
        </p>
      </header>

      <main>
        <section aria-labelledby="controls-h" className="panel">
          <h2 id="controls-h">Generate</h2>
          <fieldset>
            <legend>Source</legend>
            <label>
              <input
                type="radio"
                name="source"
                checked={source === "random"}
                onChange={() => setSource("random")}
              />
              Random
            </label>
            <label>
              <input
                type="radio"
                name="source"
                checked={source === "image"}
                onChange={() => setSource("image")}
              />
              From image
            </label>
          </fieldset>

          {source === "image" && (
            <div className="image-upload">
              <label htmlFor="image-file">Upload an image</label>
              <input
                id="image-file"
                type="file"
                accept="image/*"
                onChange={onFile}
              />
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={`Uploaded source image: ${file?.name ?? ""}`}
                  className="thumb"
                />
              )}
              {!file && (
                <p className="note">Choose an image to extract colors from.</p>
              )}
            </div>
          )}

          <div className="row">
            <button
              type="button"
              className="primary-btn"
              disabled={busy || (source === "image" && !file)}
              onClick={() => generate()}
            >
              {busy ? "Generating…" : "Generate palette"}
            </button>
            <fieldset className="inline">
              <legend>Color mode</legend>
              {["light", "dark"].map((m) => (
                <label key={m}>
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {m === "light" ? "Light" : "Dark"}
                </label>
              ))}
            </fieldset>
          </div>
          <p className="status" role="status">
            {status}
          </p>
        </section>

        <section aria-labelledby="palette-h" className="panel">
          <h2 id="palette-h">{mode === "dark" ? "Dark" : "Light"} palette</h2>
          <ul className="swatches">
            {ROLES.map((role) => (
              <Swatch
                key={role.id}
                role={role}
                color={palette[role.id]}
                locked={!!locks[role.id]}
                adjusted={palette.adjusted.includes(role.id)}
                onToggleLock={toggleLock}
                onCopy={copy}
                onEdit={editColor}
              />
            ))}
          </ul>
        </section>

        <section aria-labelledby="preview-h" className="panel">
          <h2 id="preview-h">Preview</h2>
          <Preview p={palette} />
        </section>

        <section aria-labelledby="report-h" className="panel">
          <h2 id="report-h">Accessibility report</h2>
          <ContrastReport rows={report} />
        </section>

        <section aria-labelledby="export-h" className="panel">
          <h2 id="export-h">CSS export (light and dark)</h2>
          <label htmlFor="css-out" className="visually-hidden">
            CSS custom properties
          </label>
          <textarea id="css-out" readOnly rows={22} value={css} />
          <button type="button" onClick={() => copy("CSS", css)}>
            Copy CSS
          </button>
        </section>
      </main>
    </div>
  );
}

export default App;
