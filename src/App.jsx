import React from "react";
import { renderHandpanPngBlob, savePngBlob } from "./exportHandpanPng.js";
import {
  getNextExportFilename as getNextExportFilenameForStorage,
  recordExportFilename,
} from "./exportSequence.js";
import {
  BLANK_NOTE,
  COLORS,
  DISPLAY_MODES,
  FORMAT_PRESETS,
  HAND_LABEL_LANGUAGES,
  HAND_LABELS,
  LABEL_MODES,
  NOTES,
  OCTAVE_LABEL_MODES,
  SCALE_PRESETS,
  SYSTEM_SPACING,
  STEP_LABELS,
  cloneEditor,
  createEmptySystem,
  createSampleOne,
  createSampleTwo,
  getDisplayNoteLabel,
  getHandLabel,
  getNoteLabelFontSize,
  getSystemGap,
  getSystemLayout,
  normalizeEditor,
  normalizeNoteNameMap,
  shouldShowCountLabels,
  splitNoteOctave,
} from "./notationLayout.js";

const DRAFT_STORAGE_KEY = "handpan-notation-draft-v1";
const LIBRARY_STORAGE_KEY = "handpan-notation-library-v1";
const ARRANGEMENT_STORAGE_KEY = "handpan-notation-print-arrangement-v1";
const HISTORY_LIMIT = 120;
const SELECTION_HOLD_MS = 260;
const PREVIEW_MODES = {
  editor: "editor",
  print: "print",
};
const PLAYBACK_STORAGE_KEY = "handpan-notation-playback-v1";
const METRONOME_SAMPLES = {
  hi: "/samples/metronome_clave_hi.mp3",
  lo: "/samples/metronome_clave_lo.mp3",
};
const DEFAULT_PLAYBACK = {
  bpm: 90,
  playbackRate: 1,
  metronomeEnabled: true,
  countInEnabled: false,
  volume: 0.75,
  metronomeVolume: 0.55,
};
const NOTE_FREQUENCIES = {
  D3: 146.83,
  A3: 220,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  C5: 523.25,
};
const A4_PRINT = {
  width: 2100,
  height: 2970,
  marginX: 130,
  marginTop: 150,
  marginBottom: 130,
  titleHeight: 140,
  sectionTitleHeight: 62,
  rowHeight: 176,
  rowGap: 28,
  barGap: 30,
  handLabelWidth: 116,
};

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizePlaybackSettings(raw) {
  return {
    bpm: Math.round(clampNumber(raw?.bpm, 20, 400, DEFAULT_PLAYBACK.bpm)),
    playbackRate: clampNumber(raw?.playbackRate, 0.25, 2, DEFAULT_PLAYBACK.playbackRate),
    metronomeEnabled:
      typeof raw?.metronomeEnabled === "boolean"
        ? raw.metronomeEnabled
        : DEFAULT_PLAYBACK.metronomeEnabled,
    countInEnabled:
      typeof raw?.countInEnabled === "boolean"
        ? raw.countInEnabled
        : DEFAULT_PLAYBACK.countInEnabled,
    volume: clampNumber(raw?.volume, 0, 1, DEFAULT_PLAYBACK.volume),
    metronomeVolume: clampNumber(raw?.metronomeVolume, 0, 1, DEFAULT_PLAYBACK.metronomeVolume),
  };
}
const PRINT_BAR = {
  cell: 38,
  gap: 5,
  rowGap: 5,
  headerHeight: 42,
};

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function getNextExportFilename(name) {
  return getNextExportFilenameForStorage(name, readJson);
}

function markExportFilenameUsed(filename) {
  recordExportFilename(filename, readJson, writeJson);
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `handpan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readDraft() {
  return normalizeEditor(readJson(DRAFT_STORAGE_KEY, createSampleOne()));
}

function readLibrary() {
  const entries = readJson(LIBRARY_STORAGE_KEY, []);
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      id: String(entry?.id || makeId()),
      name: String(entry?.name || "Untitled").trim() || "Untitled",
      updatedAt: String(entry?.updatedAt || new Date().toISOString()),
      editor: normalizeEditor(entry?.editor),
    }))
    .slice(0, 80);
}

function normalizeArrangementSection(section) {
  return {
    id: String(section?.id || makeId()),
    name: String(section?.name || "Section").trim() || "Section",
    editor: cloneEditor(section?.editor),
  };
}

function normalizeArrangementScale(value) {
  return SCALE_PRESETS[value] ? value : "dKurd9";
}

function readArrangement() {
  const value = readJson(ARRANGEMENT_STORAGE_KEY, []);
  if (Array.isArray(value)) {
    return {
      title: "handpan-notation",
      scalePresetKey: "dKurd9",
      sections: value.map(normalizeArrangementSection).slice(0, 80),
    };
  }
  const sections = Array.isArray(value?.sections) ? value.sections : [];
  return {
    title: String(value?.title || "handpan-notation").trim() || "handpan-notation",
    scalePresetKey: normalizeArrangementScale(value?.scalePresetKey),
    sections: sections.map(normalizeArrangementSection).slice(0, 80),
  };
}

function readPlaybackSettings() {
  return normalizePlaybackSettings(readJson(PLAYBACK_STORAGE_KEY, DEFAULT_PLAYBACK));
}

function formatLibraryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isTextEntryTarget(target) {
  const tagName = target?.tagName ? target.tagName.toLowerCase() : "";
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable;
}

function normalizeSelection(anchor, focus) {
  if (!anchor || !focus) return null;
  const anchorStep = getAbsoluteStep(anchor);
  const focusStep = getAbsoluteStep(focus);
  return {
    rowStart: Math.min(anchor.rowIndex, focus.rowIndex),
    rowEnd: Math.max(anchor.rowIndex, focus.rowIndex),
    stepStart: Math.min(anchorStep, focusStep),
    stepEnd: Math.max(anchorStep, focusStep),
  };
}

function getAbsoluteStep(cell) {
  return cell.systemIndex * STEP_LABELS.length + cell.stepIndex;
}

function getCellFromAbsoluteStep(absoluteStep, rowIndex) {
  return {
    systemIndex: Math.floor(absoluteStep / STEP_LABELS.length),
    rowIndex,
    stepIndex: absoluteStep % STEP_LABELS.length,
  };
}

function readCellFromElement(element) {
  const cell = element?.closest?.("[data-notation-cell='1']");
  if (!cell) return null;
  const systemIndex = Number(cell.getAttribute("data-system"));
  const rowIndex = Number(cell.getAttribute("data-row"));
  const stepIndex = Number(cell.getAttribute("data-step"));
  if (![systemIndex, rowIndex, stepIndex].every(Number.isInteger)) return null;
  return { systemIndex, rowIndex, stepIndex };
}

function getNoteSlotForKey(key, editor) {
  const normalizedKey = String(key || "").toUpperCase();
  if (!normalizedKey) return "";
  if (normalizedKey === "0") return isNoteAvailableForScale("D", editor?.noteNameMap) ? "D" : "";
  if (/^[1-9]$/.test(normalizedKey)) {
    return isNoteAvailableForScale(normalizedKey, editor?.noteNameMap) ? normalizedKey : "";
  }
  if (!/^[A-G]$/.test(normalizedKey)) return "";

  const match = NOTES.find((slot) => {
    if (slot === BLANK_NOTE || slot.includes("+")) return false;
    if (!isNoteAvailableForScale(slot, editor?.noteNameMap)) return false;
    const { base } = splitNoteOctave(editor?.noteNameMap?.[slot] || "");
    return base.toUpperCase() === normalizedKey;
  });
  return match || "";
}

function isNoteAvailableForScale(note, noteNameMap) {
  if (!note) return false;
  if (note === BLANK_NOTE) return true;
  if (note.includes("+")) {
    return note.split("+").every((part) => isNoteAvailableForScale(part, noteNameMap));
  }
  return Boolean(String(noteNameMap?.[note] || "").trim());
}

function getAvailablePaletteNotes(editor) {
  return NOTES.filter((note) => isNoteAvailableForScale(note, editor?.noteNameMap));
}

function normalizePitchName(value) {
  return String(value || "").trim().replace("♭", "b").replace("♯", "#").toUpperCase();
}

function getPitchForSlot(slot, noteNameMap) {
  return normalizePitchName(noteNameMap?.[slot] || "");
}

function findSlotByPitch(pitch, noteNameMap) {
  if (!pitch) return "";
  return NOTES.find((slot) => {
    if (!slot || slot === BLANK_NOTE || slot.includes("+")) return false;
    return getPitchForSlot(slot, noteNameMap) === pitch;
  }) || "";
}

function remapNoteToScale(note, sourceMap, targetMap) {
  if (!note || note === BLANK_NOTE) {
    return { note, missing: false, missingPitches: [] };
  }
  const parts = String(note).split("+");
  const mappedParts = [];
  const missingPitches = [];
  parts.forEach((part) => {
    const pitch = getPitchForSlot(part, sourceMap);
    const mapped = findSlotByPitch(pitch, targetMap);
    if (mapped) mappedParts.push(mapped);
    else if (pitch) missingPitches.push(sourceMap?.[part] || part);
    else missingPitches.push(part);
  });
  if (missingPitches.length) return { note, missing: true, missingPitches };
  return { note: mappedParts.join("+"), missing: false, missingPitches: [] };
}

function mapNoteBetweenScales(note, sourceMap, targetMap) {
  if (!note || note === BLANK_NOTE) return note;
  const mapped = remapNoteToScale(note, sourceMap, targetMap);
  return mapped.missing ? "" : mapped.note;
}

function clearHiddenRhythmRows(editor) {
  const copy = cloneEditor(editor);
  copy.systems = copy.systems.map((system) =>
    system.map((row, rowIndex) => (rowIndex === 0 ? [...row] : row.map(() => "")))
  );
  return copy;
}

function normalizeEditorForDisplayMode(editor, displayMode) {
  const next = { ...cloneEditor(editor), displayMode };
  return displayMode === DISPLAY_MODES.rhythm ? clearHiddenRhythmRows(next) : next;
}

function isCellInSelection(cell, selection) {
  if (!cell || !selection) return false;
  const absoluteStep = getAbsoluteStep(cell);
  return (
    cell.rowIndex >= selection.rowStart &&
    cell.rowIndex <= selection.rowEnd &&
    absoluteStep >= selection.stepStart &&
    absoluteStep <= selection.stepEnd
  );
}

function normalizeArrangementSelection(anchor, focus) {
  if (!anchor || !focus || anchor.sectionId !== focus.sectionId) return null;
  const anchorStep = getAbsoluteStep(anchor);
  const focusStep = getAbsoluteStep(focus);
  return {
    sectionId: anchor.sectionId,
    rowStart: Math.min(anchor.rowIndex, focus.rowIndex),
    rowEnd: Math.max(anchor.rowIndex, focus.rowIndex),
    stepStart: Math.min(anchorStep, focusStep),
    stepEnd: Math.max(anchorStep, focusStep),
  };
}

function isArrangementCellInSelection(cell, selection) {
  if (!cell || !selection || cell.sectionId !== selection.sectionId) return false;
  const absoluteStep = getAbsoluteStep(cell);
  return (
    cell.rowIndex >= selection.rowStart &&
    cell.rowIndex <= selection.rowEnd &&
    absoluteStep >= selection.stepStart &&
    absoluteStep <= selection.stepEnd
  );
}

function useSheetScale(format) {
  const frameRef = React.useRef(null);
  const [scale, setScale] = React.useState(0.5);

  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const update = () => {
      const width = el.getBoundingClientRect().width || format.width;
      setScale(Math.min(1, width / format.width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [format.width]);

  return [frameRef, scale];
}

function ToolbarButton({ active = false, disabled = false, children, ...props }) {
  return (
    <button
      className={`toolbar-button${active ? " is-active" : ""}`}
      disabled={disabled}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

function TransportHeader({
  bpm,
  isPlaying,
  onBpmPointerDown,
  onSettingsToggle,
  onTapTempo,
  onTogglePlay,
  settingsOpen,
}) {
  return (
    <header className="app-header">
      <div className="header-title">Handpan Notation</div>
      <div className="transport-controls">
        <button
          aria-label={isPlaying ? "Stop playback" : "Start playback"}
          className={`transport-play${isPlaying ? " is-playing" : ""}`}
          onClick={onTogglePlay}
          type="button"
        >
          {isPlaying ? "■" : "▶"}
        </button>
        <button
          aria-expanded={settingsOpen}
          className="transport-bpm"
          onClick={onSettingsToggle}
          onPointerDown={onBpmPointerDown}
          type="button"
        >
          {bpm} BPM
        </button>
        <button className="transport-tap" onClick={onTapTempo} type="button">
          Tap
        </button>
      </div>
      <div className="header-spacer" />
    </header>
  );
}

function PlaybackSettingsPopup({
  bpm,
  countInEnabled,
  effectiveBpm,
  metronomeEnabled,
  metronomeVolume,
  onBpmChange,
  onClose,
  onCountInChange,
  onMetronomeChange,
  onMetronomeVolumeChange,
  onPlaybackRateChange,
  onTapTempo,
  onVolumeChange,
  playbackRate,
  volume,
}) {
  return (
    <div className="transport-popover" role="dialog" aria-label="Playback settings">
      <div className="transport-popover-header">
        <strong>Playback</strong>
        <button onClick={onClose} type="button">×</button>
      </div>
      <div className="transport-row">
        <span>Tap</span>
        <button onClick={onTapTempo} type="button">Tap tempo</button>
      </div>
      <label className="transport-row">
        <span>BPM</span>
        <input
          max="400"
          min="20"
          onChange={(event) => onBpmChange(Math.round(Number(event.target.value)))}
          type="number"
          value={bpm}
        />
      </label>
      <div className="transport-row">
        <span>Multiplier</span>
        <div className="mini-stepper">
          <button onClick={() => onPlaybackRateChange(playbackRate - 0.05)} type="button">−</button>
          <button onClick={() => onPlaybackRateChange(1)} type="button">
            {playbackRate.toFixed(2)}×
          </button>
          <button onClick={() => onPlaybackRateChange(playbackRate + 0.05)} type="button">+</button>
        </div>
      </div>
      <div className="transport-hint">{Math.round(effectiveBpm)} effective BPM</div>
      <div className="transport-row">
        <span>Metronome</span>
        <button className={metronomeEnabled ? "is-on" : ""} onClick={() => onMetronomeChange(!metronomeEnabled)} type="button">
          {metronomeEnabled ? "On" : "Off"}
        </button>
      </div>
      <div className="transport-row">
        <span>Count-in</span>
        <button className={countInEnabled ? "is-on" : ""} onClick={() => onCountInChange(!countInEnabled)} type="button">
          {countInEnabled ? "On" : "Off"}
        </button>
      </div>
      <label className="transport-slider">
        <span>Handpan volume {Math.round(volume * 100)}%</span>
        <input
          max="100"
          min="0"
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
          type="range"
          value={Math.round(volume * 100)}
        />
      </label>
      <label className="transport-slider">
        <span>Metronome volume {Math.round(metronomeVolume * 100)}%</span>
        <input
          max="100"
          min="0"
          onChange={(event) => onMetronomeVolumeChange(Number(event.target.value) / 100)}
          type="range"
          value={Math.round(metronomeVolume * 100)}
        />
      </label>
    </div>
  );
}

function SiteFooter() {
  const [openPanel, setOpenPanel] = React.useState("");
  const panels = [
    {
      id: "about",
      title: "About",
      text: "Create compact handpan grid notation, collect sections, and export clean A4 print sheets.",
    },
  ];
  return (
    <footer className="site-footer">
      <div className="footer-logo">
        <img alt="Arne Hertstein" src="/arnehertstein-logo-text-white.png" />
      </div>
      <div className="footer-accordion">
        {panels.map((panel) => {
          const open = openPanel === panel.id;
          return (
            <div className={`footer-panel${open ? " is-open" : ""}`} key={panel.id}>
              <button
                aria-expanded={open}
                className="footer-panel-trigger"
                onClick={() => setOpenPanel(open ? "" : panel.id)}
                type="button"
              >
                <span className="footer-caret">▸</span>
                <span>{panel.title}</span>
              </button>
              <div className="footer-panel-body">
                <p>{panel.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <a
        className="footer-coffee"
        href="https://buymeacoffee.com/onlinedrumnotation"
        rel="noreferrer"
        target="_blank"
      >
        Buy me a coffee
      </a>
    </footer>
  );
}

function NotePalette({
  activeNote,
  editor,
  listenMode,
  onPreviewNote,
  onSelectNote,
  onSwitchHandsModeChange,
  onVisibilityChange,
  switchHandsMode,
}) {
  const availableNotes = getAvailablePaletteNotes(editor);
  const handleNoteClick = (note) => {
    onSelectNote(note);
    if (listenMode) onPreviewNote(note, editor.noteNameMap);
  };

  return (
    <div className="note-palette" aria-label="Notes">
      {availableNotes.map((note) => (
        <ToolbarButton
          active={activeNote === note}
          key={note}
          onClick={() => handleNoteClick(note)}
        >
          {note === BLANK_NOTE ? "Blank" : getDisplayNoteLabel(note, editor)}
        </ToolbarButton>
      ))}
      <ToolbarButton active={activeNote === ""} onClick={() => onSelectNote("")}>
        Erase
      </ToolbarButton>
      <ToolbarButton active={switchHandsMode} onClick={() => onSwitchHandsModeChange(!switchHandsMode)}>
        Switch hands
      </ToolbarButton>
      <label className="inline-toggle">
        <input
          checked={editor.showNoteLabels}
          onChange={(event) => onVisibilityChange("showNoteLabels", event.target.checked)}
          type="checkbox"
        />
        <span>Labels</span>
      </label>
    </div>
  );
}

function FormatSwitch({ formatKey, onChange }) {
  return (
    <div className="segmented-control" aria-label="Layout">
      {Object.values(FORMAT_PRESETS).map((format) => (
        <button
          className={format.key === formatKey ? "is-selected" : ""}
          key={format.key}
          onClick={() => onChange(format.key)}
          type="button"
        >
          {format.label}
        </button>
      ))}
    </div>
  );
}

function SpacingSlider({ disabled, value, onChange }) {
  return (
    <div className="spacing-control">
      <label className="field-label" htmlFor="system-spacing">
        Row spacing
      </label>
      <input
        disabled={disabled}
        id="system-spacing"
        max={SYSTEM_SPACING.max}
        min={SYSTEM_SPACING.min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={SYSTEM_SPACING.step}
        type="range"
        value={value}
      />
      <span>{value > 0 ? `+${value}` : value}px</span>
    </div>
  );
}

function ModeSwitch({ displayMode, onChange }) {
  return (
    <div className="segmented-control" aria-label="Notation mode">
      <button
        className={displayMode === DISPLAY_MODES.hands ? "is-selected" : ""}
        onClick={() => onChange(DISPLAY_MODES.hands)}
        type="button"
      >
        Hands
      </button>
      <button
        className={displayMode === DISPLAY_MODES.rhythm ? "is-selected" : ""}
        onClick={() => onChange(DISPLAY_MODES.rhythm)}
        type="button"
      >
        Rhythm
      </button>
    </div>
  );
}

function HandLanguageSwitch({ language, onChange }) {
  return (
    <div className="segmented-control" aria-label="Hand label language">
      <button
        className={language === HAND_LABEL_LANGUAGES.german ? "is-selected" : ""}
        onClick={() => onChange(HAND_LABEL_LANGUAGES.german)}
        type="button"
      >
        Deutsch
      </button>
      <button
        className={language === HAND_LABEL_LANGUAGES.english ? "is-selected" : ""}
        onClick={() => onChange(HAND_LABEL_LANGUAGES.english)}
        type="button"
      >
        English
      </button>
    </div>
  );
}

function LabelModeSwitch({ labelMode, onChange }) {
  return (
    <div className="segmented-control" aria-label="Label type">
      <button
        className={labelMode === LABEL_MODES.numbers ? "is-selected" : ""}
        onClick={() => onChange(LABEL_MODES.numbers)}
        type="button"
      >
        Numbers
      </button>
      <button
        className={labelMode === LABEL_MODES.names ? "is-selected" : ""}
        onClick={() => onChange(LABEL_MODES.names)}
        type="button"
      >
        Notes
      </button>
    </div>
  );
}

function OctaveModeSwitch({ octaveLabelMode, onChange }) {
  return (
    <div className="segmented-control three-way" aria-label="Octave display">
      <button
        className={octaveLabelMode === OCTAVE_LABEL_MODES.always ? "is-selected" : ""}
        onClick={() => onChange(OCTAVE_LABEL_MODES.always)}
        type="button"
      >
        F4
      </button>
      <button
        className={octaveLabelMode === OCTAVE_LABEL_MODES.never ? "is-selected" : ""}
        onClick={() => onChange(OCTAVE_LABEL_MODES.never)}
        type="button"
      >
        F
      </button>
      <button
        className={octaveLabelMode === OCTAVE_LABEL_MODES.duplicates ? "is-selected" : ""}
        onClick={() => onChange(OCTAVE_LABEL_MODES.duplicates)}
        type="button"
      >
        Smart
      </button>
    </div>
  );
}

function LabelSection({ editor, onLabelModeChange, onOctaveModeChange }) {
  return (
    <section className="panel-section">
      <div className="section-title">Labels</div>
      <LabelModeSwitch labelMode={editor.labelMode} onChange={onLabelModeChange} />
      {editor.labelMode === LABEL_MODES.names ? (
        <OctaveModeSwitch octaveLabelMode={editor.octaveLabelMode} onChange={onOctaveModeChange} />
      ) : null}
    </section>
  );
}

function ScaleSection({ editor, onPresetChange, onMapChange }) {
  const [expanded, setExpanded] = React.useState(false);
  const scaleName = SCALE_PRESETS[editor.scalePresetKey]?.label || "Scale";
  return (
    <section className="panel-section">
      <div className="section-title">Scale</div>
      <button
        className="disclosure-button"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span>{scaleName}</span>
        <span className="disclosure-caret">{expanded ? "Hide" : "Edit"}</span>
      </button>
      {expanded ? (
        <ScaleEditor
          editor={editor}
          onMapChange={onMapChange}
          onPresetChange={onPresetChange}
        />
      ) : null}
    </section>
  );
}

function ScaleEditor({ editor, onPresetChange, onMapChange }) {
  return (
    <div className="scale-editor">
      <select
        aria-label="Scale preset"
        onChange={(event) => onPresetChange(event.target.value)}
        value={editor.scalePresetKey}
      >
        {Object.values(SCALE_PRESETS).map((preset) => (
          <option key={preset.key} value={preset.key}>
            {preset.label}
          </option>
        ))}
      </select>
      <div className="scale-map-grid">
        {NOTES.filter((note) => note !== BLANK_NOTE && !note.includes("+")).map((note) => (
          <label key={note}>
            <span>{note}</span>
            <input
              onChange={(event) => onMapChange(note, event.target.value)}
              spellCheck="false"
              type="text"
              value={editor.noteNameMap[note] || ""}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function NotationStage({
  editor,
  activeNote,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onRowLabelClick,
  playheadStep,
  selection,
}) {
  const baseFormat = FORMAT_PRESETS[editor.formatKey] || FORMAT_PRESETS.wide;
  const format = getEditorPreviewFormat(baseFormat, editor);
  const [frameRef, scale] = useSheetScale(format);
  const frameHeight = Math.max(1, Math.round(format.height * scale));

  return (
    <div
      className="sheet-frame"
      ref={frameRef}
      style={{ height: `${frameHeight}px` }}
    >
      <div
        className="notation-sheet"
        style={{
          "--sheet-w": `${format.width}px`,
          "--sheet-h": `${format.height}px`,
          "--sheet-scale": scale,
          background: COLORS.background,
        }}
      >
        {editor.systems.map((system, systemIndex) => (
          <SystemView
            activeNote={activeNote}
            format={format}
            key={systemIndex}
            onCellClick={onCellClick}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={onCellPointerEnter}
            onRowLabelClick={onRowLabelClick}
            system={system}
            systemCount={editor.systems.length}
            systemIndex={systemIndex}
            displayMode={editor.displayMode}
            systemSpacing={editor.systemSpacing}
            showNoteLabels={editor.showNoteLabels}
            labelMode={editor.labelMode}
            handLabelLanguage={editor.handLabelLanguage}
            octaveLabelMode={editor.octaveLabelMode}
            noteNameMap={editor.noteNameMap}
            playheadStep={playheadStep}
            selection={selection}
          />
        ))}
      </div>
    </div>
  );
}

function getEditorPreviewFormat(format, editor) {
  const systemCount = Math.max(1, editor.systems.length);
  const isRhythm = editor.displayMode === DISPLAY_MODES.rhythm;
  const handsHeight = format.cell * 2 + format.rowGap;
  const systemHeight = isRhythm ? format.cell : handsHeight;
  const baseY = isRhythm ? format.y + (handsHeight - format.cell) / 2 : format.y;
  const neededHeight =
    baseY +
    (systemCount - 1) * getSystemGap(format, editor.systemSpacing) +
    systemHeight +
    format.bottomPadding;
  if (neededHeight <= format.height) return format;
  return { ...format, height: Math.ceil(neededHeight) };
}

function SystemView({
  activeNote,
  displayMode,
  format,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onRowLabelClick,
  system,
  systemCount,
  systemIndex,
  systemSpacing,
  showNoteLabels,
  labelMode,
  handLabelLanguage,
  octaveLabelMode,
  noteNameMap,
  playheadStep,
  selection,
}) {
  const isRhythm = displayMode === DISPLAY_MODES.rhythm;
  const visibleRows = isRhythm ? [0] : HAND_LABELS.map((_, index) => index);
  const layout = getSystemLayout(format, systemCount, systemIndex, displayMode, systemSpacing);
  const headerY = layout.y - format.headerOffset;
  const showCountLabels = shouldShowCountLabels(format, systemIndex);

  return (
    <>
      {showCountLabels ? STEP_LABELS.map((label, stepIndex) => {
        const x = layout.x + stepIndex * (format.cell + format.gap);
        return (
          <div
            className={`step-label${label === "&" ? " is-amp" : ""}`}
            key={`${systemIndex}-step-${stepIndex}`}
            style={{
              left: x,
              top: headerY,
              width: format.cell,
              height: format.cell * 0.62,
              fontSize: label === "&" ? format.ampFont : format.headerFont,
            }}
          >
            {label}
          </div>
        );
      }) : null}

      {visibleRows.map((rowIndex, visibleRowIndex) => {
        const hand = getHandLabel(rowIndex, handLabelLanguage);
        const rowY = layout.y + visibleRowIndex * (format.cell + format.rowGap);
        return (
          <React.Fragment key={`${systemIndex}-${hand}`}>
            {!isRhythm ? (
              <div
                className="hand-label"
                onClick={() => onRowLabelClick(systemIndex, rowIndex)}
                style={{
                  left: 0,
                  top: rowY,
                  width: format.labelX,
                  height: format.cell,
                  fontSize: format.labelFont,
                }}
              >
                {hand}
              </div>
            ) : null}
            {STEP_LABELS.map((_, stepIndex) => {
              const note = system[rowIndex]?.[stepIndex] || "";
              const label = getDisplayNoteLabel(note, { labelMode, noteNameMap, octaveLabelMode });
              const cell = { systemIndex, rowIndex, stepIndex };
              const selected = isCellInSelection(cell, selection);
              const isPlayingStep = playheadStep === getAbsoluteStep(cell);
              const x = layout.x + stepIndex * (format.cell + format.gap);
              return (
                <button
                  aria-label={`${hand} ${STEP_LABELS[stepIndex]} ${note || "empty"}`}
                  className={`notation-cell${note ? " is-note" : ""}${activeNote && note === activeNote ? " is-matching-note" : ""}${selected ? " is-selected" : ""}${isPlayingStep ? " is-playing-step" : ""}`}
                  data-notation-cell="1"
                  data-system={systemIndex}
                  data-row={rowIndex}
                  data-step={stepIndex}
                  key={`${systemIndex}-${rowIndex}-${stepIndex}`}
                  onClick={() => onCellClick(systemIndex, rowIndex, stepIndex)}
                  onPointerDown={(event) => onCellPointerDown(event, cell)}
                  onPointerEnter={() => onCellPointerEnter(cell)}
                  style={{
                    left: x,
                    top: rowY,
                    width: format.cell,
                    height: format.cell,
                    fontSize: getNoteLabelFontSize(format, label, labelMode),
                  }}
                  type="button"
                >
                  {showNoteLabels ? <span className="cell-note">{label}</span> : null}
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

function LibraryPanel({ library, onAddToArrangement, onDelete, onLoad, onRename, onUpdate }) {
  return (
    <div className="library-list">
      {library.length === 0 ? (
        <div className="empty-library">No saved patterns</div>
      ) : (
        library.map((entry) => (
          <div className="library-item" key={entry.id}>
            <button
              aria-label={`Load ${entry.name}`}
              className="library-card"
              onClick={() => onLoad(entry)}
              type="button"
            >
              <input
                aria-label="Library pattern name"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onRename(entry.id, event.target.value)}
                spellCheck="false"
                style={{ width: `${Math.max(2, entry.name.length + 1)}ch` }}
                type="text"
                value={entry.name}
              />
              <small>{formatLibraryDate(entry.updatedAt)}</small>
            </button>
            <button
              aria-label={`Add ${entry.name} to arrangement`}
              className="library-icon-button library-add"
              onClick={() => onAddToArrangement(entry)}
              title="Add to A4 arrangement"
              type="button"
            >
              +
            </button>
            <button
              aria-label={`Update ${entry.name} with current pattern`}
              className="library-icon-button library-update"
              onClick={() => onUpdate(entry.id)}
              title="Update with current"
              type="button"
            >
              ↻
            </button>
            <button
              aria-label={`Delete ${entry.name}`}
              className="library-icon-button library-remove"
              onClick={() => onDelete(entry.id)}
              title="Delete"
              type="button"
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function PreviewModeSwitch({ mode, onChange }) {
  return (
    <div className="segmented-control" aria-label="Preview mode">
      <button
        className={mode === PREVIEW_MODES.editor ? "is-selected" : ""}
        onClick={() => onChange(PREVIEW_MODES.editor)}
        type="button"
      >
        Editor
      </button>
      <button
        className={mode === PREVIEW_MODES.print ? "is-selected" : ""}
        onClick={() => onChange(PREVIEW_MODES.print)}
        type="button"
      >
        A4 Print
      </button>
    </div>
  );
}

function ArrangementPanel({
  arrangementTitle,
  scalePresetKey,
  sections,
  onAddCurrent,
  onArrangementTitleChange,
  onDuplicate,
  onLoad,
  onMove,
  onNameChange,
  onPrint,
  onRemove,
  onScaleChange,
  onSectionModeChange,
}) {
  return (
    <section className="panel-section arrangement-section">
      <div className="section-title">A4 Arrangement</div>
      <input
        aria-label="A4 arrangement title"
        onChange={(event) => onArrangementTitleChange(event.target.value)}
        placeholder="A4 arrangement title"
        spellCheck="false"
        type="text"
        value={arrangementTitle}
      />
      <label className="field-label" htmlFor="arrangement-scale">
        A4 scale
      </label>
      <select
        aria-label="A4 arrangement scale"
        id="arrangement-scale"
        onChange={(event) => onScaleChange(event.target.value)}
        value={scalePresetKey}
      >
        {Object.values(SCALE_PRESETS).map((preset) => (
          <option key={preset.key} value={preset.key}>
            {preset.label}
          </option>
        ))}
      </select>
      <div className="button-row">
        <ToolbarButton onClick={onAddCurrent}>Add current as section</ToolbarButton>
        <ToolbarButton disabled={!sections.length} onClick={onPrint}>Export PDF</ToolbarButton>
      </div>
      <div className="arrangement-list">
        {sections.length === 0 ? (
          <div className="empty-library">Add sections to build an A4 print sheet.</div>
        ) : (
          sections.map((section, index) => (
            <div className="arrangement-item" key={section.id}>
              <input
                aria-label="Arrangement section name"
                onChange={(event) => onNameChange(section.id, event.target.value)}
                spellCheck="false"
                type="text"
                value={section.name}
              />
              <small>
                {section.editor.systems.length} bar{section.editor.systems.length === 1 ? "" : "s"}
              </small>
              <div className="arrangement-mode-switch" aria-label="Section print mode">
                <button
                  className={section.editor.displayMode === DISPLAY_MODES.hands ? "is-selected" : ""}
                  onClick={() => onSectionModeChange(section.id, DISPLAY_MODES.hands)}
                  type="button"
                >
                  Hands
                </button>
                <button
                  className={section.editor.displayMode === DISPLAY_MODES.rhythm ? "is-selected" : ""}
                  onClick={() => onSectionModeChange(section.id, DISPLAY_MODES.rhythm)}
                  type="button"
                >
                  Rhythm
                </button>
              </div>
              <div className="arrangement-actions">
                <ToolbarButton disabled={index === 0} onClick={() => onMove(section.id, -1)}>Up</ToolbarButton>
                <ToolbarButton disabled={index === sections.length - 1} onClick={() => onMove(section.id, 1)}>
                  Down
                </ToolbarButton>
                <ToolbarButton onClick={() => onLoad(section)}>Edit</ToolbarButton>
                <ToolbarButton onClick={() => onDuplicate(section.id)}>Copy</ToolbarButton>
                <ToolbarButton onClick={() => onRemove(section.id)}>Delete</ToolbarButton>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildPrintRows(sections) {
  return sections.flatMap((section) =>
    chunkArray(
      section.editor.systems.map((system, systemIndex) => ({ system, systemIndex })),
      4
    ).map((bars, rowIndex) => ({
      bars,
      section,
      showTitle: rowIndex === 0,
    }))
  );
}

function paginatePrintRows(rows) {
  const pages = [];
  let page = [];
  let y = A4_PRINT.marginTop + A4_PRINT.titleHeight;
  const maxY = A4_PRINT.height - A4_PRINT.marginBottom;

  rows.forEach((row) => {
    const height = (row.showTitle ? A4_PRINT.sectionTitleHeight : 0) + A4_PRINT.rowHeight + A4_PRINT.rowGap;
    if (page.length && y + height > maxY) {
      pages.push(page);
      page = [];
      y = A4_PRINT.marginTop + A4_PRINT.titleHeight;
    }
    page.push({ ...row, y });
    y += height;
  });

  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

function getScaleLabel(editor) {
  return SCALE_PRESETS[editor?.scalePresetKey]?.label || "";
}

function MiniNotationBar({
  activeNote,
  arrangementSelection,
  bar,
  editor,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  playhead,
  sectionId,
  sourceNoteNameMap,
  x,
  y,
  width,
}) {
  const { cell, gap, headerHeight, rowGap } = PRINT_BAR;
  const gridWidth = STEP_LABELS.length * cell + (STEP_LABELS.length - 1) * gap;
  const gridX = x + (width - gridWidth) / 2;
  const isRhythm = editor.displayMode === DISPLAY_MODES.rhythm;
  const visibleRows = isRhythm ? [0] : HAND_LABELS.map((_, index) => index);
  const system = bar.system || bar;
  const isPlayingSystem = playhead?.sectionId === sectionId && playhead?.systemIndex === bar.systemIndex;

  return (
    <g>
      {STEP_LABELS.map((label, stepIndex) => {
        const stepX = gridX + stepIndex * (cell + gap);
        return (
          <text
            dominantBaseline="middle"
            fill="#111111"
            fontFamily="MyriadProRegular, Myriad Pro, Arial, sans-serif"
            fontSize={label === "&" ? 19 : 27}
            key={`step-${stepIndex}`}
            textAnchor="middle"
            x={stepX + cell / 2}
            y={y + 16}
          >
            {label}
          </text>
        );
      })}
      {visibleRows.map((rowIndex, visibleRowIndex) => {
        const rowY = y + headerHeight + visibleRowIndex * (cell + rowGap);
        return (
          <g key={`row-${rowIndex}`}>
            {STEP_LABELS.map((_, stepIndex) => {
              const note = system[rowIndex]?.[stepIndex] || "";
              const remapped = remapNoteToScale(note, sourceNoteNameMap, editor.noteNameMap);
              const displayNote = remapped.note;
              const label = remapped.missing
                ? "!"
                : getDisplayNoteLabel(displayNote, editor);
              const noteFont = Math.min(30, getNoteLabelFontSize({ noteFont: 36, comboFont: 23 }, label, editor.labelMode));
              const stepX = gridX + stepIndex * (cell + gap);
              const isPlayingCell = isPlayingSystem && playhead?.rowIndex === rowIndex && playhead?.stepIndex === stepIndex;
              const cellRef = { sectionId, systemIndex: bar.systemIndex, rowIndex, stepIndex };
              const selected = isArrangementCellInSelection(cellRef, arrangementSelection);
              return (
                <g
                  key={`cell-${stepIndex}`}
                  onClick={() => onCellClick(sectionId, bar.systemIndex, rowIndex, stepIndex)}
                  onPointerDown={(event) => onCellPointerDown(event, cellRef)}
                  onPointerEnter={() => onCellPointerEnter(cellRef)}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    data-a4-cell="1"
                    fill={remapped.missing ? "#d56b5f" : note ? COLORS.noteCell : "#d9d9d9"}
                    height={cell}
                    stroke={isPlayingCell ? "#ff6f3c" : selected ? "#8f8f8f" : "transparent"}
                    strokeWidth={isPlayingCell ? 5 : selected ? 4 : 0}
                    width={cell}
                    x={stepX}
                    y={rowY}
                  />
                  {remapped.missing ? (
                    <title>
                      {`Needs reassignment: ${remapped.missingPitches.join(", ")} is not in ${getScaleLabel(editor)}.`}
                    </title>
                  ) : null}
                  {remapped.missing || (note && editor.showNoteLabels) ? (
                    <text
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontFamily="MyriadProSemibold, Myriad Pro, Arial, sans-serif"
                      fontSize={noteFont}
                      fontWeight="600"
                      textAnchor="middle"
                      x={stepX + cell / 2}
                      y={rowY + cell / 2 + 3}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function PrintPage({
  activeNote,
  arrangementSelection,
  displayEditor,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onRowLabelClick,
  pageRows,
  pageIndex,
  pageCount,
  playhead,
  scaleLabel,
  title,
}) {
  const contentWidth = A4_PRINT.width - A4_PRINT.marginX * 2;

  return (
    <svg
      aria-label={`A4 print page ${pageIndex + 1}`}
      className="print-page"
      viewBox={`0 0 ${A4_PRINT.width} ${A4_PRINT.height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#ffffff" height={A4_PRINT.height} width={A4_PRINT.width} />
      <text
        fill="#111111"
        fontFamily="MyriadProSemibold, Myriad Pro, Arial, sans-serif"
        fontSize="62"
        fontWeight="600"
        x={A4_PRINT.marginX}
        y={A4_PRINT.marginTop}
      >
        {title || "handpan-notation"}
      </text>
      {pageCount > 1 ? (
        <text
          fill="#777777"
          fontFamily="MyriadProRegular, Myriad Pro, Arial, sans-serif"
          fontSize="26"
          textAnchor="end"
          x={A4_PRINT.width - A4_PRINT.marginX}
          y={A4_PRINT.marginTop}
        >
          {pageIndex + 1}
        </text>
      ) : null}
      {scaleLabel ? (
        <text
          fill="#666666"
          fontFamily="MyriadProRegular, Myriad Pro, Arial, sans-serif"
          fontSize="34"
          x={A4_PRINT.marginX}
          y={A4_PRINT.marginTop + 50}
        >
          {scaleLabel}
        </text>
      ) : null}
      {pageRows.map((row, rowIndex) => {
        const sectionY = row.y;
        const barsY = sectionY + (row.showTitle ? A4_PRINT.sectionTitleHeight : 0);
        const printEditor = {
          ...row.section.editor,
          handLabelLanguage: displayEditor.handLabelLanguage,
          labelMode: displayEditor.labelMode,
          noteNameMap: displayEditor.noteNameMap,
          octaveLabelMode: displayEditor.octaveLabelMode,
          showNoteLabels: displayEditor.showNoteLabels,
        };
        const isRhythm = printEditor.displayMode === DISPLAY_MODES.rhythm;
        const labelWidth = A4_PRINT.handLabelWidth;
        const barsX = A4_PRINT.marginX + labelWidth;
        const barWidth = (contentWidth - labelWidth - A4_PRINT.barGap * 3) / 4;
        const visibleRows = isRhythm ? [0] : HAND_LABELS.map((_, index) => index);
        return (
          <g key={`${row.section.id}-${rowIndex}`}>
            {row.showTitle ? (
              <text
                fill="#111111"
                fontFamily="MyriadProSemibold, Myriad Pro, Arial, sans-serif"
                fontSize="40"
                fontWeight="600"
                x={A4_PRINT.marginX}
                y={sectionY + 38}
              >
                {row.section.name}
              </text>
            ) : null}
            {!isRhythm ? (
              <g>
                {visibleRows.map((handRowIndex, visibleRowIndex) => (
                  <text
                    data-a4-row-label="1"
                    dominantBaseline="middle"
                    fill="#111111"
                    fontFamily="MyriadProRegular, Myriad Pro, Arial, sans-serif"
                    fontSize="25"
                    key={handRowIndex}
                    onClick={() =>
                      onRowLabelClick(
                        row.section.id,
                        row.bars[0]?.systemIndex || 0,
                        row.bars[row.bars.length - 1]?.systemIndex || 0,
                        handRowIndex
                      )
                    }
                    textAnchor="end"
                    x={A4_PRINT.marginX + labelWidth - 24}
                    y={
                      barsY +
                      PRINT_BAR.headerHeight +
                      visibleRowIndex * (PRINT_BAR.cell + PRINT_BAR.rowGap) +
                      PRINT_BAR.cell / 2
                    }
                  >
                    {getHandLabel(handRowIndex, printEditor.handLabelLanguage)}
                  </text>
                ))}
              </g>
            ) : null}
            {row.bars.map((bar, barIndex) => (
              <MiniNotationBar
                activeNote={activeNote}
                arrangementSelection={arrangementSelection}
                bar={bar}
                editor={printEditor}
                key={barIndex}
                onCellClick={onCellClick}
                onCellPointerDown={onCellPointerDown}
                onCellPointerEnter={onCellPointerEnter}
                playhead={playhead}
                sectionId={row.section.id}
                sourceNoteNameMap={row.section.editor.noteNameMap}
                width={barWidth}
                x={barsX + barIndex * (barWidth + A4_PRINT.barGap)}
                y={barsY}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PrintArrangementPreview({
  activeNote,
  arrangementSelection,
  editor,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onRowLabelClick,
  playhead,
  scalePresetKey,
  sections,
  title,
}) {
  const pages = paginatePrintRows(buildPrintRows(sections));
  const arrangementScaleEditor = React.useMemo(
    () => ({
      ...editor,
      scalePresetKey,
      noteNameMap: normalizeNoteNameMap(null, scalePresetKey),
    }),
    [editor, scalePresetKey]
  );
  const scaleLabel = getScaleLabel(arrangementScaleEditor);
  return (
    <div className="print-preview">
      {sections.length === 0 ? (
        <div className="print-empty">Add sections in the sidebar to build an A4 print arrangement.</div>
      ) : (
        pages.map((pageRows, pageIndex) => (
          <PrintPage
            key={pageIndex}
            activeNote={activeNote}
            arrangementSelection={arrangementSelection}
            displayEditor={arrangementScaleEditor}
            onCellClick={onCellClick}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={onCellPointerEnter}
            onRowLabelClick={onRowLabelClick}
            pageIndex={pageIndex}
            pageCount={pages.length}
            pageRows={pageRows}
            playhead={playhead}
            scaleLabel={scaleLabel}
            title={title}
          />
        ))
      )}
    </div>
  );
}

export default function App() {
  const initialArrangement = React.useMemo(readArrangement, []);
  const [editor, setEditor] = React.useState(readDraft);
  const [activeNote, setActiveNote] = React.useState("D");
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  const [title, setTitle] = React.useState("handpan-notation");
  const [library, setLibrary] = React.useState(readLibrary);
  const [arrangementTitle, setArrangementTitle] = React.useState(initialArrangement.title);
  const [arrangementScalePresetKey, setArrangementScalePresetKey] = React.useState(initialArrangement.scalePresetKey);
  const [arrangementSections, setArrangementSections] = React.useState(initialArrangement.sections);
  const [previewMode, setPreviewMode] = React.useState(PREVIEW_MODES.editor);
  const [playbackSettings, setPlaybackSettings] = React.useState(readPlaybackSettings);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playheadStep, setPlayheadStep] = React.useState(null);
  const [arrangementPlayhead, setArrangementPlayhead] = React.useState(null);
  const [transportMenuOpen, setTransportMenuOpen] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState("");
  const [selection, setSelection] = React.useState(null);
  const [arrangementSelection, setArrangementSelection] = React.useState(null);
  const [switchHandsMode, setSwitchHandsMode] = React.useState(false);
  const [noteListenMode, setNoteListenMode] = React.useState(false);
  const editorRef = React.useRef(editor);
  const arrangementSectionsRef = React.useRef(arrangementSections);
  const arrangementScalePresetRef = React.useRef(arrangementScalePresetKey);
  const previewModeRef = React.useRef(previewMode);
  const playbackSettingsRef = React.useRef(playbackSettings);
  const audioRef = React.useRef({
    context: null,
    buffers: {},
    interval: null,
    timeout: null,
    step: 0,
  });
  const bpmScrubRef = React.useRef({
    active: false,
    dragging: false,
    lastBpm: DEFAULT_PLAYBACK.bpm,
    startBpm: DEFAULT_PLAYBACK.bpm,
    startX: 0,
    startY: 0,
  });
  const bpmClickSuppressUntilRef = React.useRef(0);
  const tapTimesRef = React.useRef([]);
  const selectionRef = React.useRef(null);
  const clipboardRef = React.useRef(null);
  const hoveredCellRef = React.useRef(null);
  const selectionGestureRef = React.useRef({
    anchor: null,
    active: false,
    didSelect: false,
    timer: null,
    pointerId: null,
  });
  const arrangementSelectionGestureRef = React.useRef({
    anchor: null,
    active: false,
    didSelect: false,
  });
  const suppressNextClickRef = React.useRef(false);
  const suppressNextArrangementClickRef = React.useRef(false);
  const suppressNextPreviewClearRef = React.useRef(false);

  React.useEffect(() => {
    editorRef.current = editor;
    writeJson(DRAFT_STORAGE_KEY, editor);
  }, [editor]);

  React.useEffect(() => {
    arrangementSectionsRef.current = arrangementSections;
  }, [arrangementSections]);

  React.useEffect(() => {
    arrangementScalePresetRef.current = arrangementScalePresetKey;
  }, [arrangementScalePresetKey]);

  React.useEffect(() => {
    previewModeRef.current = previewMode;
  }, [previewMode]);

  React.useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  React.useEffect(() => {
    writeJson(LIBRARY_STORAGE_KEY, library);
  }, [library]);

  React.useEffect(() => {
    playbackSettingsRef.current = playbackSettings;
    writeJson(PLAYBACK_STORAGE_KEY, playbackSettings);
  }, [playbackSettings]);

  React.useEffect(() => {
    writeJson(ARRANGEMENT_STORAGE_KEY, {
      title: arrangementTitle,
      scalePresetKey: arrangementScalePresetKey,
      sections: arrangementSections,
    });
  }, [arrangementScalePresetKey, arrangementSections, arrangementTitle]);

  const commitEditor = React.useCallback((updater) => {
    const before = cloneEditor(editorRef.current);
    const after = normalizeEditor(updater(cloneEditor(before)));
    setPast((items) => [...items, before].slice(-HISTORY_LIMIT));
    setFuture([]);
    setEditor(after);
  }, []);

  const undo = React.useCallback(() => {
    setPast((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setFuture((next) => [cloneEditor(editorRef.current), ...next].slice(0, HISTORY_LIMIT));
      setEditor(previous);
      return items.slice(0, -1);
    });
  }, []);

  const redo = React.useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setPast((previous) => [...previous, cloneEditor(editorRef.current)].slice(-HISTORY_LIMIT));
      setEditor(next);
      return items.slice(1);
    });
  }, []);

  const clearVisibleSelection = React.useCallback(() => {
    setSelection(null);
    setArrangementSelection(null);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (event.key !== "Escape" && event.key !== "Enter") return;
      if (!selectionRef.current && !arrangementSelection) return;
      event.preventDefault();
      clearVisibleSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [arrangementSelection, clearVisibleSelection]);

  const setCell = React.useCallback(
    (systemIndex, rowIndex, stepIndex) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      commitEditor((draft) => {
        if (switchHandsMode && draft.displayMode === DISPLAY_MODES.hands) {
          const system = draft.systems[systemIndex];
          if (!system?.[0] || !system?.[1]) return draft;
          [system[0][stepIndex], system[1][stepIndex]] = [system[1][stepIndex], system[0][stepIndex]];
          return draft;
        }
        const current = draft.systems[systemIndex]?.[rowIndex]?.[stepIndex] || "";
        draft.systems[systemIndex][rowIndex][stepIndex] =
          activeNote && current !== activeNote ? activeNote : "";
        return draft;
      });
    },
    [activeNote, commitEditor, switchHandsMode]
  );

  const selectEditorRow = React.useCallback((systemIndex, rowIndex) => {
    const stepStart = systemIndex * STEP_LABELS.length;
    setSelection({
      rowStart: rowIndex,
      rowEnd: rowIndex,
      stepStart,
      stepEnd: stepStart + STEP_LABELS.length - 1,
    });
  }, []);

  const setCellToNote = React.useCallback(
    (cell, note) => {
      if (!cell || !note) return;
      commitEditor((draft) => {
        const system = draft.systems[cell.systemIndex];
        const row = system?.[cell.rowIndex];
        if (!row || cell.stepIndex < 0 || cell.stepIndex >= row.length) return draft;
        row[cell.stepIndex] = note;
        return draft;
      });
    },
    [commitEditor]
  );

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      const note = getNoteSlotForKey(event.key, editorRef.current);
      if (!note) return;
      event.preventDefault();
      setActiveNote(note);
      setCellToNote(hoveredCellRef.current, note);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCellToNote]);

  const copySelection = React.useCallback(() => {
    const selected = selectionRef.current;
    const source = editorRef.current;
    if (!selected || !source?.systems?.length) return;
    const rows = [];
    for (let row = selected.rowStart; row <= selected.rowEnd; row += 1) {
      const values = [];
      for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
        const cell = getCellFromAbsoluteStep(absoluteStep, row);
        values.push(source.systems[cell.systemIndex]?.[cell.rowIndex]?.[cell.stepIndex] || "");
      }
      rows.push(values);
    }
    clipboardRef.current = {
      width: selected.stepEnd - selected.stepStart + 1,
      height: selected.rowEnd - selected.rowStart + 1,
      rows,
    };
  }, []);

  const pasteClipboardAtPointer = React.useCallback(() => {
    const target = hoveredCellRef.current;
    const copied = clipboardRef.current;
    if (!target || !copied?.rows?.length) return;
    const targetStartStep = getAbsoluteStep(target);
    commitEditor((draft) => {
      copied.rows.forEach((rowValues, rowOffset) => {
        const targetRowIndex = target.rowIndex + rowOffset;
        if (targetRowIndex < 0 || targetRowIndex >= HAND_LABELS.length) return;
        rowValues.forEach((value, colOffset) => {
          const targetCell = getCellFromAbsoluteStep(targetStartStep + colOffset, targetRowIndex);
          const targetRow = draft.systems[targetCell.systemIndex]?.[targetCell.rowIndex];
          if (!targetRow) return;
          targetRow[targetCell.stepIndex] = value || "";
        });
      });
      return draft;
    });
    const pasteEndStep = targetStartStep + copied.width - 1;
    const maxStep = editorRef.current.systems.length * STEP_LABELS.length - 1;
    setSelection({
      rowStart: target.rowIndex,
      rowEnd: Math.min(target.rowIndex + copied.height - 1, HAND_LABELS.length - 1),
      stepStart: targetStartStep,
      stepEnd: Math.min(pasteEndStep, maxStep),
    });
  }, [commitEditor]);

  const clearSelection = React.useCallback(() => {
    const selected = selectionRef.current;
    if (!selected) return;
    commitEditor((draft) => {
      for (let rowIndex = selected.rowStart; rowIndex <= selected.rowEnd; rowIndex += 1) {
        for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
          const cell = getCellFromAbsoluteStep(absoluteStep, rowIndex);
          const row = draft.systems[cell.systemIndex]?.[cell.rowIndex];
          if (row) row[cell.stepIndex] = "";
        }
      }
      return draft;
    });
  }, [commitEditor]);

  const clearArrangementSelection = React.useCallback(() => {
    const selected = arrangementSelection;
    if (!selected) return;
    setArrangementSections((items) =>
      items.map((section) => {
        if (section.id !== selected.sectionId) return section;
        const editorCopy = cloneEditor(section.editor);
        for (let rowIndex = selected.rowStart; rowIndex <= selected.rowEnd; rowIndex += 1) {
          for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
            const cell = getCellFromAbsoluteStep(absoluteStep, rowIndex);
            const row = editorCopy.systems[cell.systemIndex]?.[cell.rowIndex];
            if (row) row[cell.stepIndex] = "";
          }
        }
        return { ...section, editor: editorCopy };
      })
    );
  }, [arrangementSelection]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        copySelection();
      } else if (key === "v") {
        event.preventDefault();
        pasteClipboardAtPointer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelection, pasteClipboardAtPointer]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (previewModeRef.current === PREVIEW_MODES.print && arrangementSelection) {
        event.preventDefault();
        clearArrangementSelection();
        return;
      }
      if (!selectionRef.current) return;
      event.preventDefault();
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [arrangementSelection, clearArrangementSelection, clearSelection]);

  const handleCellPointerEnter = React.useCallback((cell) => {
    hoveredCellRef.current = cell;
  }, []);

  const handleCellPointerDown = React.useCallback((event, cell) => {
    if (event.button !== 0 || isTextEntryTarget(event.target)) return;
    hoveredCellRef.current = cell;
    const gesture = selectionGestureRef.current;
    if (gesture.timer) window.clearTimeout(gesture.timer);
    selectionGestureRef.current = {
      anchor: cell,
      active: false,
      didSelect: false,
      pointerId: event.pointerId,
      timer: window.setTimeout(() => {
        selectionGestureRef.current.active = true;
        selectionGestureRef.current.didSelect = true;
        setSelection(normalizeSelection(cell, cell));
      }, SELECTION_HOLD_MS),
    };
  }, []);

  React.useEffect(() => {
    const onPointerMove = (event) => {
      const gesture = selectionGestureRef.current;
      if (!gesture.anchor) return;
      const pointedCell = readCellFromElement(document.elementFromPoint(event.clientX, event.clientY));
      if (pointedCell) hoveredCellRef.current = pointedCell;
      if (!gesture.active) return;
      if (!pointedCell) return;
      setSelection(normalizeSelection(gesture.anchor, pointedCell));
    };
    const onPointerUp = () => {
      const gesture = selectionGestureRef.current;
      if (gesture.timer) window.clearTimeout(gesture.timer);
      if (gesture.didSelect) {
        suppressNextClickRef.current = true;
        suppressNextPreviewClearRef.current = true;
      }
      selectionGestureRef.current = {
        anchor: null,
        active: false,
        didSelect: false,
        timer: null,
        pointerId: null,
      };
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const changeFormat = React.useCallback(
    (formatKey) => {
      commitEditor((draft) => ({ ...draft, formatKey }));
    },
    [commitEditor]
  );

  const changeDisplayMode = React.useCallback(
    (displayMode) => {
      commitEditor((draft) => normalizeEditorForDisplayMode(draft, displayMode));
    },
    [commitEditor]
  );

  const changeHandLabelLanguage = React.useCallback(
    (handLabelLanguage) => {
      commitEditor((draft) => ({ ...draft, handLabelLanguage }));
    },
    [commitEditor]
  );

  const changeLabelMode = React.useCallback(
    (labelMode) => {
      commitEditor((draft) => ({ ...draft, labelMode }));
    },
    [commitEditor]
  );

  const changeOctaveMode = React.useCallback(
    (octaveLabelMode) => {
      commitEditor((draft) => ({ ...draft, octaveLabelMode }));
    },
    [commitEditor]
  );

  const changeScalePreset = React.useCallback(
    (scalePresetKey) => {
      const nextNoteNameMap = normalizeNoteNameMap(null, scalePresetKey);
      commitEditor((draft) => ({
        ...draft,
        scalePresetKey,
        noteNameMap: nextNoteNameMap,
      }));
      setActiveNote((note) => (isNoteAvailableForScale(note, nextNoteNameMap) ? note : "D"));
    },
    [commitEditor]
  );

  const changeNoteName = React.useCallback(
    (note, value) => {
      commitEditor((draft) => ({
        ...draft,
        noteNameMap: {
          ...draft.noteNameMap,
          [note]: value,
        },
      }));
    },
    [commitEditor]
  );

  const changeSystemSpacing = React.useCallback(
    (systemSpacing) => {
      commitEditor((draft) => ({ ...draft, systemSpacing }));
    },
    [commitEditor]
  );

  const changeVisibility = React.useCallback(
    (key, value) => {
      commitEditor((draft) => ({ ...draft, [key]: value }));
    },
    [commitEditor]
  );

  const addSystem = React.useCallback(() => {
    commitEditor((draft) => {
      draft.systems.push(createEmptySystem());
      return draft;
    });
  }, [commitEditor]);

  const removeSystem = React.useCallback(() => {
    commitEditor((draft) => {
      if (draft.systems.length > 1) draft.systems.pop();
      return draft;
    });
  }, [commitEditor]);

  const clearPattern = React.useCallback(() => {
    commitEditor((draft) => ({
      ...draft,
      systems: draft.systems.map(() => createEmptySystem()),
    }));
  }, [commitEditor]);

  const loadSample = React.useCallback(
    (sample) => {
      commitEditor(() => sample());
    },
    [commitEditor]
  );

  const savePattern = React.useCallback(() => {
    const name = title.trim() || "Untitled";
    const entry = {
      id: makeId(),
      name,
      updatedAt: new Date().toISOString(),
      editor: cloneEditor(editorRef.current),
    };
    setLibrary((items) => [entry, ...items].slice(0, 80));
  }, [title]);

  const loadPattern = React.useCallback(
    (entry) => {
      setTitle(entry.name);
      commitEditor(() => entry.editor);
    },
    [commitEditor]
  );

  const deletePattern = React.useCallback((id) => {
    setLibrary((items) => items.filter((entry) => entry.id !== id));
  }, []);

  const renamePattern = React.useCallback((id, name) => {
    setLibrary((items) =>
      items.map((entry) =>
        entry.id === id
          ? { ...entry, name, updatedAt: new Date().toISOString() }
          : entry
      )
    );
  }, []);

  const updatePattern = React.useCallback((id) => {
    setLibrary((items) =>
      items.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              updatedAt: new Date().toISOString(),
              editor: cloneEditor(editorRef.current),
            }
          : entry
      )
    );
  }, []);

  const addLibraryEntryToArrangement = React.useCallback((entry) => {
    const section = {
      id: makeId(),
      name: entry.name || "Section",
      editor: cloneEditor(entry.editor),
    };
    setArrangementSections((items) => [...items, section].slice(0, 80));
    setPreviewMode(PREVIEW_MODES.print);
  }, []);

  const addCurrentToArrangement = React.useCallback(() => {
    const name = title.trim() || "Section";
    const section = {
      id: makeId(),
      name,
      editor: cloneEditor(editorRef.current),
    };
    setArrangementSections((items) => [...items, section].slice(0, 80));
    setPreviewMode(PREVIEW_MODES.print);
  }, [title]);

  const renameArrangementSection = React.useCallback((id, name) => {
    setArrangementSections((items) =>
      items.map((section) => (section.id === id ? { ...section, name } : section))
    );
  }, []);

  const changeArrangementSectionMode = React.useCallback((id, displayMode) => {
    setArrangementSections((items) =>
      items.map((section) =>
        section.id === id
          ? {
              ...section,
              editor: normalizeEditorForDisplayMode(section.editor, displayMode),
            }
          : section
      )
    );
  }, []);

  const setArrangementCell = React.useCallback((sectionId, systemIndex, rowIndex, stepIndex) => {
    if (suppressNextArrangementClickRef.current) {
      suppressNextArrangementClickRef.current = false;
      return;
    }
    setArrangementSections((items) =>
      items.map((section) => {
        if (section.id !== sectionId) return section;
        const editorCopy = cloneEditor(section.editor);
        if (switchHandsMode && editorCopy.displayMode === DISPLAY_MODES.hands) {
          const system = editorCopy.systems[systemIndex];
          if (!system?.[0] || !system?.[1]) return section;
          [system[0][stepIndex], system[1][stepIndex]] = [system[1][stepIndex], system[0][stepIndex]];
          return { ...section, editor: editorCopy };
        }
        const current = editorCopy.systems[systemIndex]?.[rowIndex]?.[stepIndex] || "";
        if (!editorCopy.systems[systemIndex]?.[rowIndex]) return section;
        const arrangementNoteNameMap = normalizeNoteNameMap(null, arrangementScalePresetRef.current);
        const sourceNote = mapNoteBetweenScales(activeNote, arrangementNoteNameMap, editorCopy.noteNameMap);
        const currentArrangementNote = mapNoteBetweenScales(current, editorCopy.noteNameMap, arrangementNoteNameMap);
        editorCopy.systems[systemIndex][rowIndex][stepIndex] =
          sourceNote && currentArrangementNote !== activeNote ? sourceNote : "";
        return { ...section, editor: editorCopy };
      })
    );
  }, [activeNote, switchHandsMode]);

  const handleArrangementCellPointerDown = React.useCallback((event, cell) => {
    if (event.button != null && event.button !== 0) return;
    arrangementSelectionGestureRef.current = {
      anchor: cell,
      active: true,
      didSelect: false,
    };
  }, []);

  const handleArrangementCellPointerEnter = React.useCallback((cell) => {
    const gesture = arrangementSelectionGestureRef.current;
    if (!gesture.active || !gesture.anchor) return;
    const nextSelection = normalizeArrangementSelection(gesture.anchor, cell);
    if (!nextSelection) return;
    gesture.didSelect = true;
    setArrangementSelection(nextSelection);
  }, []);

  React.useEffect(() => {
    const finish = () => {
      const gesture = arrangementSelectionGestureRef.current;
      if (gesture.didSelect) {
        suppressNextArrangementClickRef.current = true;
        suppressNextPreviewClearRef.current = true;
      }
      arrangementSelectionGestureRef.current = {
        anchor: null,
        active: false,
        didSelect: false,
      };
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);

  const selectArrangementRow = React.useCallback((sectionId, startSystemIndex, endSystemIndex, rowIndex) => {
    setArrangementSelection({
      sectionId,
      rowStart: rowIndex,
      rowEnd: rowIndex,
      stepStart: startSystemIndex * STEP_LABELS.length,
      stepEnd: endSystemIndex * STEP_LABELS.length + STEP_LABELS.length - 1,
    });
  }, []);

  const removeArrangementSection = React.useCallback((id) => {
    setArrangementSections((items) => items.filter((section) => section.id !== id));
  }, []);

  const duplicateArrangementSection = React.useCallback((id) => {
    setArrangementSections((items) => {
      const index = items.findIndex((section) => section.id === id);
      if (index < 0) return items;
      const copy = {
        ...items[index],
        id: makeId(),
        name: `${items[index].name} copy`,
        editor: cloneEditor(items[index].editor),
      };
      return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)].slice(0, 80);
    });
  }, []);

  const moveArrangementSection = React.useCallback((id, direction) => {
    setArrangementSections((items) => {
      const index = items.findIndex((section) => section.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }, []);

  const loadArrangementSection = React.useCallback(
    (section) => {
      setTitle(section.name);
      setPreviewMode(PREVIEW_MODES.editor);
      commitEditor(() => section.editor);
    },
    [commitEditor]
  );

  const printArrangement = React.useCallback(() => {
    setPreviewMode(PREVIEW_MODES.print);
    clearVisibleSelection();
    window.setTimeout(() => window.print(), 80);
  }, [clearVisibleSelection]);

  React.useEffect(() => {
    window.addEventListener("beforeprint", clearVisibleSelection);
    return () => window.removeEventListener("beforeprint", clearVisibleSelection);
  }, [clearVisibleSelection]);

  const clearPreviewSelection = React.useCallback((event) => {
    if (suppressNextPreviewClearRef.current) {
      suppressNextPreviewClearRef.current = false;
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const keepsSelection = target.closest(
      "[data-notation-cell='1'], [data-a4-cell='1'], .hand-label, [data-a4-row-label='1']"
    );
    if (keepsSelection) return;
    clearVisibleSelection();
  }, [clearVisibleSelection]);

  const updatePlaybackSetting = React.useCallback((key, value) => {
    setPlaybackSettings((settings) => normalizePlaybackSettings({ ...settings, [key]: value }));
  }, []);

  const handleBpmScrubPointerDown = React.useCallback((event) => {
    if (event.button != null && event.button !== 0) return;
    const scrub = bpmScrubRef.current;
    scrub.active = true;
    scrub.dragging = false;
    scrub.startX = event.clientX;
    scrub.startY = event.clientY;
    scrub.startBpm = playbackSettingsRef.current.bpm;
    scrub.lastBpm = playbackSettingsRef.current.bpm;
  }, []);

  React.useEffect(() => {
    const onPointerMove = (event) => {
      const scrub = bpmScrubRef.current;
      if (!scrub.active) return;
      const dy = scrub.startY - event.clientY;
      const dx = event.clientX - scrub.startX;
      if (!scrub.dragging) {
        if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) return;
        scrub.dragging = true;
      }
      const nextBpm = Math.round(clampNumber(scrub.startBpm + Math.trunc(dy / 4), 20, 400, scrub.startBpm));
      if (nextBpm !== scrub.lastBpm) {
        scrub.lastBpm = nextBpm;
        updatePlaybackSetting("bpm", nextBpm);
      }
      event.preventDefault();
    };
    const finish = () => {
      const scrub = bpmScrubRef.current;
      if (scrub.dragging) bpmClickSuppressUntilRef.current = performance.now() + 250;
      scrub.active = false;
      scrub.dragging = false;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [updatePlaybackSetting]);

  const getAudioContext = React.useCallback(async () => {
    const audio = audioRef.current;
    if (!audio.context) {
      audio.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audio.context.state !== "running") await audio.context.resume();
    return audio.context;
  }, []);

  const loadMetronomeBuffers = React.useCallback(async () => {
    const audio = audioRef.current;
    const context = await getAudioContext();
    const entries = Object.entries(METRONOME_SAMPLES);
    await Promise.all(
      entries.map(async ([key, url]) => {
        if (audio.buffers[key]) return;
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        audio.buffers[key] = await context.decodeAudioData(arrayBuffer);
      })
    );
  }, [getAudioContext]);

  const playMetronomeClick = React.useCallback(async (accented = false, time = null) => {
    await loadMetronomeBuffers();
    const context = audioRef.current.context;
    const buffer = audioRef.current.buffers[accented ? "hi" : "lo"];
    if (!context || !buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = (accented ? 0.95 : 0.78) * playbackSettingsRef.current.metronomeVolume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.start(time ?? context.currentTime);
  }, [loadMetronomeBuffers]);

  const playHandpanTone = React.useCallback(async (note, time = null, noteNameMap = editorRef.current.noteNameMap) => {
    if (!note || note === BLANK_NOTE) return;
    const context = await getAudioContext();
    const parts = String(note).split("+");
    parts.forEach((part, index) => {
      const pitch = noteNameMap?.[part] || editorRef.current.noteNameMap?.[part] || "";
      const frequency = NOTE_FREQUENCIES[pitch];
      if (!frequency) return;
      const start = time ?? context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * (index ? 1.005 : 1);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28 * playbackSettingsRef.current.volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.58);
    });
  }, [getAudioContext]);

  const stopPlayback = React.useCallback(() => {
    const audio = audioRef.current;
    if (audio.interval) window.clearInterval(audio.interval);
    if (audio.timeout) window.clearTimeout(audio.timeout);
    audio.interval = null;
    audio.timeout = null;
    audio.step = 0;
    setIsPlaying(false);
    setPlayheadStep(null);
    setArrangementPlayhead(null);
  }, []);

  const playPlaybackStep = React.useCallback(async () => {
    const audio = audioRef.current;
    if (previewModeRef.current === PREVIEW_MODES.print && arrangementSectionsRef.current.length) {
      const entries = arrangementSectionsRef.current.flatMap((section) =>
        section.editor.systems.flatMap((system, systemIndex) =>
          STEP_LABELS.map((_, stepIndex) => ({ section, system, systemIndex, stepIndex }))
        )
      );
      if (!entries.length) {
        stopPlayback();
        return;
      }
      const entry = entries[audio.step % entries.length];
      setPlayheadStep(null);
      setArrangementPlayhead({
        sectionId: entry.section.id,
        systemIndex: entry.systemIndex,
        rowIndex: entry.section.editor.displayMode === DISPLAY_MODES.rhythm ? 0 : -1,
        stepIndex: entry.stepIndex,
      });
      if (playbackSettingsRef.current.metronomeEnabled && entry.stepIndex % 2 === 0) {
        playMetronomeClick(entry.stepIndex === 0);
      }
      let firstPlayedRow = null;
      const targetMap = normalizeNoteNameMap(null, arrangementScalePresetRef.current);
      const playbackRows =
        entry.section.editor.displayMode === DISPLAY_MODES.rhythm
          ? [0]
          : HAND_LABELS.map((_, rowIndex) => rowIndex);
      playbackRows.forEach((rowIndex) => {
        const row = entry.system[rowIndex];
        const note = row?.[entry.stepIndex] || "";
        if (note) {
          const remapped = remapNoteToScale(note, entry.section.editor.noteNameMap, targetMap);
          if (!remapped.missing) {
            if (firstPlayedRow == null) firstPlayedRow = rowIndex;
            playHandpanTone(remapped.note, null, targetMap);
          }
        }
      });
      setArrangementPlayhead({
        sectionId: entry.section.id,
        systemIndex: entry.systemIndex,
        rowIndex: firstPlayedRow ?? (entry.section.editor.displayMode === DISPLAY_MODES.rhythm ? 0 : 0),
        stepIndex: entry.stepIndex,
      });
      audio.step += 1;
      return;
    }

    const current = editorRef.current;
    const totalSteps = current.systems.length * STEP_LABELS.length;
    if (totalSteps < 1) {
      stopPlayback();
      return;
    }
    const absoluteStep = audio.step % totalSteps;
    const systemIndex = Math.floor(absoluteStep / STEP_LABELS.length);
    const stepIndex = absoluteStep % STEP_LABELS.length;
    setPlayheadStep(absoluteStep);
    setArrangementPlayhead(null);
    if (playbackSettingsRef.current.metronomeEnabled && stepIndex % 2 === 0) {
      playMetronomeClick(stepIndex === 0);
    }
    const editorPlaybackRows =
      current.displayMode === DISPLAY_MODES.rhythm
        ? [current.systems[systemIndex]?.[0]]
        : current.systems[systemIndex];
    editorPlaybackRows?.forEach((row) => {
      const note = row?.[stepIndex] || "";
      if (note) playHandpanTone(note, null, current.noteNameMap);
    });
    audio.step += 1;
  }, [playHandpanTone, playMetronomeClick, stopPlayback]);

  const startPlayback = React.useCallback(async () => {
    stopPlayback();
    await loadMetronomeBuffers();
    const settings = playbackSettingsRef.current;
    const effectiveBpm = Math.max(20, settings.bpm * settings.playbackRate);
    const stepMs = (60_000 / effectiveBpm) / 2;
    const begin = () => {
      setIsPlaying(true);
      audioRef.current.step = 0;
      playPlaybackStep();
      audioRef.current.interval = window.setInterval(playPlaybackStep, stepMs);
    };
    if (settings.countInEnabled) {
      const beatMs = 60_000 / effectiveBpm;
      setIsPlaying(true);
      setPlayheadStep(null);
      for (let beat = 0; beat < 4; beat += 1) {
        window.setTimeout(() => playMetronomeClick(beat === 0), beat * beatMs);
      }
      audioRef.current.timeout = window.setTimeout(begin, beatMs * 4);
    } else {
      begin();
    }
  }, [loadMetronomeBuffers, playMetronomeClick, playPlaybackStep, stopPlayback]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!isPlaying || !audio.interval) return undefined;
    const effectiveBpm = Math.max(20, playbackSettings.bpm * playbackSettings.playbackRate);
    const stepMs = (60_000 / effectiveBpm) / 2;
    window.clearInterval(audio.interval);
    audio.interval = window.setInterval(playPlaybackStep, stepMs);
    return undefined;
  }, [isPlaying, playbackSettings.bpm, playbackSettings.playbackRate, playPlaybackStep]);

  const togglePlayback = React.useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  const handleTapTempo = React.useCallback(() => {
    const now = performance.now();
    tapTimesRef.current = [...tapTimesRef.current.filter((time) => now - time < 2200), now].slice(-6);
    if (tapTimesRef.current.length < 3) return;
    const intervals = tapTimesRef.current.slice(1).map((time, index) => time - tapTimesRef.current[index]);
    const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    updatePlaybackSetting("bpm", Math.round(clampNumber(60_000 / average, 20, 400, playbackSettingsRef.current.bpm)));
  }, [updatePlaybackSetting]);

  React.useEffect(() => () => stopPlayback(), [stopPlayback]);

  const exportPng = React.useCallback(async () => {
    setExportStatus("Exporting");
    try {
      const blob = await renderHandpanPngBlob(editorRef.current);
      const filename = getNextExportFilename(title);
      const saved = await savePngBlob(blob, filename);
      if (!saved) {
        setExportStatus("Export cancelled");
        window.setTimeout(() => setExportStatus(""), 1600);
        return;
      }
      markExportFilenameUsed(filename);
      setExportStatus(`Exported ${filename}`);
      window.setTimeout(() => setExportStatus(""), 1600);
    } catch (error) {
      setExportStatus(error?.message || "Export failed");
    }
  }, [title]);

  return (
    <div className="app-shell">
      <TransportHeader
        bpm={playbackSettings.bpm}
        isPlaying={isPlaying}
        onBpmPointerDown={handleBpmScrubPointerDown}
        onSettingsToggle={() => {
          if (performance.now() < bpmClickSuppressUntilRef.current) return;
          setTransportMenuOpen((value) => !value);
        }}
        onTapTempo={handleTapTempo}
        onTogglePlay={togglePlayback}
        settingsOpen={transportMenuOpen}
      />
      {transportMenuOpen ? (
        <PlaybackSettingsPopup
          bpm={playbackSettings.bpm}
          countInEnabled={playbackSettings.countInEnabled}
          effectiveBpm={playbackSettings.bpm * playbackSettings.playbackRate}
          metronomeEnabled={playbackSettings.metronomeEnabled}
          metronomeVolume={playbackSettings.metronomeVolume}
          onBpmChange={(value) => updatePlaybackSetting("bpm", value)}
          onClose={() => setTransportMenuOpen(false)}
          onCountInChange={(value) => updatePlaybackSetting("countInEnabled", value)}
          onMetronomeChange={(value) => updatePlaybackSetting("metronomeEnabled", value)}
          onMetronomeVolumeChange={(value) => updatePlaybackSetting("metronomeVolume", value)}
          onPlaybackRateChange={(value) => updatePlaybackSetting("playbackRate", value)}
          onTapTempo={handleTapTempo}
          onVolumeChange={(value) => updatePlaybackSetting("volume", value)}
          playbackRate={playbackSettings.playbackRate}
          volume={playbackSettings.volume}
        />
      ) : null}
      <aside className="tool-panel">
        <div className="brand-lockup">
          <span>Handpan</span>
          <strong>Notation</strong>
        </div>

        <section className="panel-section">
          <label className="field-label" htmlFor="notation-title">
            Name
          </label>
          <input
            id="notation-title"
            onChange={(event) => setTitle(event.target.value)}
            spellCheck="false"
            type="text"
            value={title}
          />
        </section>

        <section className="panel-section">
          <div className="section-title">View</div>
          <PreviewModeSwitch mode={previewMode} onChange={setPreviewMode} />
        </section>

        <section className="panel-section">
          <div className="section-title">Mode</div>
          <ModeSwitch displayMode={editor.displayMode} onChange={changeDisplayMode} />
          <HandLanguageSwitch language={editor.handLabelLanguage} onChange={changeHandLabelLanguage} />
        </section>

        <LabelSection
          editor={editor}
          onLabelModeChange={changeLabelMode}
          onOctaveModeChange={changeOctaveMode}
        />

        <ScaleSection
          editor={editor}
          onMapChange={changeNoteName}
          onPresetChange={changeScalePreset}
        />

        <section className="panel-section">
          <div className="section-title-row">
            <div className="section-title">Notes</div>
            <ToolbarButton
              active={noteListenMode}
              aria-label="Preview note sounds"
              onClick={() => setNoteListenMode((value) => !value)}
            >
              Speaker
            </ToolbarButton>
          </div>
          <NotePalette
            activeNote={activeNote}
            editor={editor}
            listenMode={noteListenMode}
            onPreviewNote={(note, noteNameMap) => playHandpanTone(note, null, noteNameMap)}
            onSelectNote={setActiveNote}
            onSwitchHandsModeChange={setSwitchHandsMode}
            onVisibilityChange={changeVisibility}
            switchHandsMode={switchHandsMode}
          />
        </section>

        <section className="panel-section">
          <div className="section-title">Grid</div>
          <div className="button-row">
            <ToolbarButton onClick={undo} disabled={!past.length}>Undo</ToolbarButton>
            <ToolbarButton onClick={redo} disabled={!future.length}>Redo</ToolbarButton>
          </div>
          <div className="button-row">
            <ToolbarButton onClick={addSystem}>Add line</ToolbarButton>
            <ToolbarButton disabled={editor.systems.length <= 1} onClick={removeSystem}>
              Remove
            </ToolbarButton>
          </div>
          <div className="button-row">
            <ToolbarButton onClick={clearPattern}>Clear</ToolbarButton>
            <ToolbarButton onClick={() => loadSample(createSampleOne)}>Example 1</ToolbarButton>
            <ToolbarButton onClick={() => loadSample(createSampleTwo)}>Example 2</ToolbarButton>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-title">PNG</div>
          <FormatSwitch formatKey={editor.formatKey} onChange={changeFormat} />
          <SpacingSlider
            disabled={!FORMAT_PRESETS[editor.formatKey]?.spacingAdjustable || editor.systems.length <= 1}
            onChange={changeSystemSpacing}
            value={editor.systemSpacing}
          />
          <ToolbarButton onClick={exportPng}>Export 4K PNG</ToolbarButton>
          {exportStatus ? <div className="export-status">{exportStatus}</div> : null}
        </section>

        <ArrangementPanel
          arrangementTitle={arrangementTitle}
          scalePresetKey={arrangementScalePresetKey}
          sections={arrangementSections}
          onAddCurrent={addCurrentToArrangement}
          onArrangementTitleChange={setArrangementTitle}
          onDuplicate={duplicateArrangementSection}
          onLoad={loadArrangementSection}
          onMove={moveArrangementSection}
          onNameChange={renameArrangementSection}
          onPrint={printArrangement}
          onRemove={removeArrangementSection}
          onScaleChange={(value) => setArrangementScalePresetKey(normalizeArrangementScale(value))}
          onSectionModeChange={changeArrangementSectionMode}
        />

        <section className="panel-section library-section">
          <div className="section-title">Library</div>
          <ToolbarButton onClick={savePattern}>Save current</ToolbarButton>
          <LibraryPanel
            library={library}
            onAddToArrangement={addLibraryEntryToArrangement}
            onDelete={deletePattern}
            onLoad={loadPattern}
            onRename={renamePattern}
            onUpdate={updatePattern}
          />
        </section>
      </aside>

      <main className="preview-panel" onClick={clearPreviewSelection}>
        {previewMode === PREVIEW_MODES.print ? (
          <PrintArrangementPreview
            activeNote={activeNote}
            arrangementSelection={arrangementSelection}
            editor={editor}
            onCellClick={setArrangementCell}
            onCellPointerDown={handleArrangementCellPointerDown}
            onCellPointerEnter={handleArrangementCellPointerEnter}
            onRowLabelClick={selectArrangementRow}
            playhead={arrangementPlayhead}
            scalePresetKey={arrangementScalePresetKey}
            sections={arrangementSections}
            title={arrangementTitle}
          />
        ) : (
          <NotationStage
            activeNote={activeNote}
            editor={editor}
            onCellClick={setCell}
            onCellPointerDown={handleCellPointerDown}
            onCellPointerEnter={handleCellPointerEnter}
            onRowLabelClick={selectEditorRow}
            playheadStep={playheadStep}
            selection={selection}
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
