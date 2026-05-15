import React from "react";
import { renderHandpanPngBlob, savePngBlob } from "./exportHandpanPng.js";
import {
  getNextExportFilename as getNextExportFilenameForStorage,
  recordExportFilename,
} from "./exportSequence.js";
import {
  BLANK_NOTE,
  BARS_IN_ROW,
  COLORS,
  DISPLAY_MODES,
  FORMAT_PRESETS,
  HAND_LABEL_LANGUAGES,
  HAND_LABELS,
  LABEL_MODES,
  NOTES,
  OCTAVE_LABEL_MODES,
  PREVIEW_TUNING,
  SCALE_PRESETS,
  RESOLUTION_OPTIONS,
  SUBDIVISION_OPTIONS,
  SYSTEM_SPACING,
  STEP_LABELS,
  TIME_DENOMINATORS,
  cloneEditor,
  createEmptySystem,
  createSampleOne,
  getComboNoteLabelLayout,
  getDisplayNoteLabel,
  getDisplayNoteLabelInfo,
  getBaseSubdivision,
  getEditorRowWidth,
  getHandLabel,
  getLayoutRows,
  getMaxSystemStepCount,
  getMultiBarFormat,
  getNoteLabelFontSize,
  getResolutionLabel,
  getStepCount,
  getStepBeatIndex,
  getSubdivisionClass,
  getSystemStepCount,
  getSystemStepLabels,
  getSystemSubdivisions,
  getVisibleCellNote,
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
const ROW_SPACING_DEFAULTS_STORAGE_KEY = "handpan-notation-row-spacing-defaults-v1";
const HISTORY_LIMIT = 120;
const SELECTION_HOLD_MS = 260;
const PREVIEW_MODES = {
  editor: "editor",
  print: "print",
};
const SIDEBAR_TABS = {
  settings: "settings",
  notes: "notes",
  a4: "a4",
  library: "library",
};
const PREFERENCE_TABS = [
  { id: "defaults", label: "Defaults" },
  { id: "grid", label: "Grid" },
  { id: "layout", label: "Layout" },
];
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
const DEFAULT_ROW_SPACING_BY_MODE = {
  [DISPLAY_MODES.hands]: 0,
  [DISPLAY_MODES.rhythm]: -100,
};
const COUNT_HOLD_MS = 360;
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
const EDITOR_PREVIEW_FIRST_ROW_Y = 126;

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

function normalizeRowSpacingDefaults(raw) {
  return {
    [DISPLAY_MODES.hands]: clampNumber(
      raw?.[DISPLAY_MODES.hands],
      SYSTEM_SPACING.min,
      SYSTEM_SPACING.max,
      DEFAULT_ROW_SPACING_BY_MODE[DISPLAY_MODES.hands]
    ),
    [DISPLAY_MODES.rhythm]: clampNumber(
      raw?.[DISPLAY_MODES.rhythm],
      SYSTEM_SPACING.min,
      SYSTEM_SPACING.max,
      DEFAULT_ROW_SPACING_BY_MODE[DISPLAY_MODES.rhythm]
    ),
  };
}

function readRowSpacingDefaults() {
  return normalizeRowSpacingDefaults(readJson(ROW_SPACING_DEFAULTS_STORAGE_KEY, DEFAULT_ROW_SPACING_BY_MODE));
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

function normalizeSelection(anchor, focus, stepCount = STEP_LABELS.length) {
  if (!anchor || !focus) return null;
  const anchorStep = getAbsoluteStep(anchor, stepCount);
  const focusStep = getAbsoluteStep(focus, stepCount);
  return {
    rowStart: Math.min(anchor.rowIndex, focus.rowIndex),
    rowEnd: Math.max(anchor.rowIndex, focus.rowIndex),
    stepStart: Math.min(anchorStep, focusStep),
    stepEnd: Math.max(anchorStep, focusStep),
  };
}

function getAbsoluteStep(cell, stepCount = STEP_LABELS.length) {
  return cell.systemIndex * stepCount + cell.stepIndex;
}

function getSubdivisionRanges(subdivisions = []) {
  let cursor = 0;
  return subdivisions.map((count) => {
    const start = cursor;
    cursor += count;
    return { start, end: cursor, count };
  });
}

function remapSystemToSubdivisions(system, previousSubdivisions, nextSubdivisions) {
  const previousRanges = getSubdivisionRanges(previousSubdivisions);
  const nextRanges = getSubdivisionRanges(nextSubdivisions);
  return system.map((row) => {
    const nextRow = Array.from({ length: nextSubdivisions.reduce((sum, value) => sum + value, 0) }, () => "");
    nextRanges.forEach((range, beatIndex) => {
      const previousRange = previousRanges[beatIndex] || { start: 0, end: 0, count: 0 };
      const copyCount = Math.min(previousRange.count, range.count);
      for (let offset = 0; offset < copyCount; offset += 1) {
        nextRow[range.start + offset] = row[previousRange.start + offset] || "";
      }
    });
    return nextRow;
  });
}

function getStepDurationMs(editor, systemIndex, stepIndex, effectiveBpm) {
  const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
  const subdivision = getSystemSubdivisions(editor, systemIndex)[beatIndex] || getBaseSubdivision(editor);
  return (60_000 / effectiveBpm) / Math.max(1, subdivision);
}

function getCellFromAbsoluteStep(absoluteStep, rowIndex, stepCount = STEP_LABELS.length) {
  return {
    systemIndex: Math.floor(absoluteStep / stepCount),
    rowIndex,
    stepIndex: absoluteStep % stepCount,
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

function normalizeEditorForDisplayMode(editor, displayMode) {
  return { ...cloneEditor(editor), displayMode };
}

function isCellInSelection(cell, selection, stepCount = STEP_LABELS.length) {
  if (!cell || !selection) return false;
  const absoluteStep = getAbsoluteStep(cell, stepCount);
  return (
    cell.rowIndex >= selection.rowStart &&
    cell.rowIndex <= selection.rowEnd &&
    absoluteStep >= selection.stepStart &&
    absoluteStep <= selection.stepEnd
  );
}

function normalizeArrangementSelection(anchor, focus, stepCount = STEP_LABELS.length) {
  if (!anchor || !focus || anchor.sectionId !== focus.sectionId) return null;
  const anchorStep = getAbsoluteStep(anchor, stepCount);
  const focusStep = getAbsoluteStep(focus, stepCount);
  return {
    sectionId: anchor.sectionId,
    rowStart: Math.min(anchor.rowIndex, focus.rowIndex),
    rowEnd: Math.max(anchor.rowIndex, focus.rowIndex),
    stepStart: Math.min(anchorStep, focusStep),
    stepEnd: Math.max(anchorStep, focusStep),
  };
}

function isArrangementCellInSelection(cell, selection, stepCount = STEP_LABELS.length) {
  if (!cell || !selection || cell.sectionId !== selection.sectionId) return false;
  const absoluteStep = getAbsoluteStep(cell, stepCount);
  return (
    cell.rowIndex >= selection.rowStart &&
    cell.rowIndex <= selection.rowEnd &&
    absoluteStep >= selection.stepStart &&
    absoluteStep <= selection.stepEnd
  );
}

function useSheetScale(format) {
  const frameRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const update = () => {
      setScale(1);
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

function SettingsIcon() {
  return (
    <span aria-hidden="true" className="masked-panel-icon settings-mask" />
  );
}

function LibraryIcon() {
  return (
    <span aria-hidden="true" className="masked-panel-icon library-mask" />
  );
}

function A4Icon() {
  return (
    <span aria-hidden="true" className="masked-panel-icon a4-mask" />
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" className="share-icon" viewBox="0 0 24 24">
      <path d="M18 2A3 3 0 0 0 15 5A3 3 0 0 0 15.054688 5.560547L7.939453 9.710938A3 3 0 0 0 6 9A3 3 0 0 0 3 12A3 3 0 0 0 6 15A3 3 0 0 0 7.935547 14.287109L15.054688 18.439453A3 3 0 0 0 15 19A3 3 0 0 0 18 22A3 3 0 0 0 21 19A3 3 0 0 0 18 16A3 3 0 0 0 16.0625 16.712891L8.945312 12.560547A3 3 0 0 0 9 12A3 3 0 0 0 8.945312 11.439453L16.060547 7.289062A3 3 0 0 0 18 8A3 3 0 0 0 21 5A3 3 0 0 0 18 2Z" />
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <span aria-hidden="true" className="masked-panel-icon music-note-mask" />
  );
}

function VolumeIcon() {
  return <span aria-hidden="true" className="volume-icon" />;
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="trash-icon" viewBox="0 0 16 16">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
      <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
    </svg>
  );
}

function NoteLabelPart({ part, className = "", style = undefined }) {
  if (!part?.text) return null;
  return (
    <span className={`note-label-part${className ? ` ${className}` : ""}`} style={style}>
      {part.text}
      {part.marker ? <span className={`note-label-marker is-${part.marker}`}>{part.marker === "up" ? "↑" : "↓"}</span> : null}
    </span>
  );
}

function CellNoteLabel({ format, labelInfo }) {
  const parts = labelInfo?.parts || [];
  if (!labelInfo?.text || parts.length === 0) return null;
  if (parts.length >= 2) {
    const comboLayout = getComboNoteLabelLayout(format, labelInfo);
    return (
      <span className="cell-note cell-note-combo">
        <NoteLabelPart
          className="combo-part combo-top-left"
          part={parts[0]}
          style={{
            fontSize: comboLayout.topFont,
            left: comboLayout.topX,
            top: comboLayout.topY,
          }}
        />
        <span className="combo-plus" style={{ fontSize: comboLayout.plusFont }}>+</span>
        <NoteLabelPart
          className="combo-part combo-bottom-right"
          part={parts[1]}
          style={{
            bottom: format.cell - comboLayout.bottomY,
            fontSize: comboLayout.bottomFont,
            right: format.cell - comboLayout.bottomX,
          }}
        />
      </span>
    );
  }
  return (
    <span className="cell-note">
      <NoteLabelPart part={parts[0]} />
    </span>
  );
}

function TransportHeader({
  bpm,
  canRedo,
  canUndo,
  isPlaying,
  onBpmPointerDown,
  onRedo,
  onShareToggle,
  onSettingsToggle,
  onTogglePlay,
  onUndo,
  shareOpen,
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
      </div>
      <div className="history-controls">
        <button
          aria-expanded={shareOpen}
          aria-label="Share and export"
          className={shareOpen ? "is-active" : ""}
          onClick={onShareToggle}
          title="Share and export"
          type="button"
        >
          <ShareIcon />
        </button>
        <button aria-label="Undo" disabled={!canUndo} onClick={onUndo} type="button">←</button>
        <button aria-label="Redo" disabled={!canRedo} onClick={onRedo} type="button">→</button>
      </div>
    </header>
  );
}

function ShareExportPopup({ exportStatus, onClose, onExportPng }) {
  return (
    <div className="share-popover" role="dialog" aria-label="Share and export">
      <div className="share-popover-header">
        <span>Export</span>
        <button aria-label="Close export menu" onClick={onClose} type="button">×</button>
      </div>
      <button className="share-action-button" onClick={onExportPng} type="button">
        Export 4K PNG
      </button>
      {exportStatus ? <div className="share-export-status">{exportStatus}</div> : null}
    </div>
  );
}

function PreferencesDialog({
  activeTab,
  editor,
  onClose,
  onHandLabelLanguageChange,
  onPreviewTuningChange,
  onRowSpacingDefaultChange,
  onSetTab,
  onSystemSpacingChange,
  rowSpacingDefaults,
}) {
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="preferences-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Preferences"
      >
        <div className="preferences-header">
          <h3>Preferences</h3>
          <button aria-label="Close preferences" onClick={onClose} title="Close preferences" type="button">
            ×
          </button>
        </div>
        <div className="preferences-body">
          <aside className="preferences-nav">
            {PREFERENCE_TABS.map((tab) => (
              <button
                className={activeTab === tab.id ? "is-active" : ""}
                key={tab.id}
                onClick={() => onSetTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </aside>
          <section className="preferences-panel">
            {activeTab === "defaults" ? (
              <div className="preference-group">
                <div className="preference-title">Language</div>
                <HandLanguageSwitch
                  language={editor.handLabelLanguage}
                  onChange={onHandLabelLanguageChange}
                />
                <div className="preference-title">Default row spacing</div>
                <RowSpacingDefaultSlider
                  label="Hands"
                  onChange={(value) => onRowSpacingDefaultChange(DISPLAY_MODES.hands, value)}
                  value={rowSpacingDefaults[DISPLAY_MODES.hands]}
                />
                <RowSpacingDefaultSlider
                  label="Rhythm"
                  onChange={(value) => onRowSpacingDefaultChange(DISPLAY_MODES.rhythm, value)}
                  value={rowSpacingDefaults[DISPLAY_MODES.rhythm]}
                />
              </div>
            ) : activeTab === "layout" ? (
              <div className="preference-group">
                <div className="preference-title">PNG layout</div>
                <SpacingSlider
                  disabled={!FORMAT_PRESETS[editor.formatKey]?.spacingAdjustable || editor.systems.length <= 1}
                  onChange={onSystemSpacingChange}
                  value={editor.systemSpacing}
                />
                <div className="preference-title">Editor preview</div>
                <PreviewTuningControls editor={editor} onChange={onPreviewTuningChange} showScale={false} />
              </div>
            ) : (
              <div className="preferences-empty">
                {PREFERENCE_TABS.find((tab) => tab.id === activeTab)?.label || "Preferences"} preferences will live here.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function LegalDialog({ onClose }) {
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="legal-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Legal information"
      >
        <div className="preferences-header">
          <h3>Legal</h3>
          <button aria-label="Close legal information" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <p>Legal information will be added here.</p>
      </div>
    </div>
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

function FooterActions({ onLegalClick, onPreferencesClick }) {
  return (
    <div className="footer-actions" aria-label="Footer links">
      <button onClick={onPreferencesClick} title="Preferences" type="button">
        Preferences
      </button>
      <span>·</span>
      <button onClick={onLegalClick} title="Legal information" type="button">
        Legal
      </button>
      <span>·</span>
      <a
        href="https://buymeacoffee.com/onlinedrumnotation"
        rel="noreferrer"
        target="_blank"
        title="Buy me a coffee"
      >
        Buy me a coffee
      </a>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-logo">
        <img alt="Arne Hertstein" loading="lazy" src="/arnehertstein-logo-text-white.png" />
      </div>
    </footer>
  );
}

function FooterSeoContent() {
  const [openPanel, setOpenPanel] = React.useState("");
  const panels = [
    {
      id: "about",
      title: "About",
      text: "Create compact handpan grid notation, collect sections, and export clean A4 print sheets.",
    },
  ];
  return (
    <section className="seo-content" aria-label="Handpan notation tool information">
      <div className="seo-panel">
        {panels.map((panel) => {
          const open = openPanel === panel.id;
          return (
            <div className={`seo-details${open ? " is-open" : ""}`} key={panel.id}>
              <button
                aria-expanded={open}
                className="seo-summary"
                onClick={() => setOpenPanel(open ? "" : panel.id)}
                type="button"
              >
                <span className="seo-caret">▸</span>
                <span>{panel.title}</span>
              </button>
              <div className="seo-body">
                <p>{panel.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NotePalette({
  activeNote,
  editor,
  listenMode,
  onPreviewNote,
  onSelectNote,
  onSwitchHandsModeChange,
  switchHandsMode,
}) {
  const [additionalOpen, setAdditionalOpen] = React.useState(false);
  const availableNotes = getAvailablePaletteNotes(editor).filter((note) => note !== BLANK_NOTE);
  const handleNoteClick = (note) => {
    onSelectNote(note);
    if (listenMode) onPreviewNote(note, editor.noteNameMap);
  };

  return (
    <div className="note-palette-wrap">
      <div className="note-palette" aria-label="Notes">
        {availableNotes.map((note) => (
          <ToolbarButton
            active={activeNote === note}
            key={note}
            onClick={() => handleNoteClick(note)}
          >
            {getDisplayNoteLabel(note, editor)}
          </ToolbarButton>
        ))}
      </div>
      <button
        aria-expanded={additionalOpen}
        className="disclosure-button compact-disclosure"
        onClick={() => setAdditionalOpen((value) => !value)}
        type="button"
      >
        <span>Additional</span>
        <span className="disclosure-caret">{additionalOpen ? "Hide" : "Show"}</span>
      </button>
      {additionalOpen ? (
        <div className="note-palette additional-palette">
          <ToolbarButton active={activeNote === BLANK_NOTE} onClick={() => handleNoteClick(BLANK_NOTE)}>
            Blank
          </ToolbarButton>
          <ToolbarButton active={switchHandsMode} onClick={() => onSwitchHandsModeChange(!switchHandsMode)}>
            Switch hand
          </ToolbarButton>
        </div>
      ) : null}
    </div>
  );
}

function FormatSwitch({ formatKey, onChange }) {
  return (
    <div className="segmented-control" aria-label="Layout">
      {Object.values(FORMAT_PRESETS).filter((format) => format.key !== "wide").map((format) => (
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

function RowSpacingDefaultSlider({ label, onChange, value }) {
  return (
    <div className="spacing-control">
      <label className="field-label">{label}</label>
      <input
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

function PreviewTuneSlider({ label, max, min, onChange, step = 1, suffix = "px", value }) {
  const displayValue = suffix === "x" ? `${Number(value).toFixed(2)}x` : `${value > 0 ? "+" : ""}${value}${suffix}`;
  return (
    <div className="spacing-control">
      <label className="field-label">{label}</label>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span>{displayValue}</span>
    </div>
  );
}

function CompactScaleSlider({ onChange, value }) {
  return (
    <div className="compact-scale-control">
      <label className="stepper-label">Grid scale</label>
      <input
        max={PREVIEW_TUNING.scaleMax}
        min={PREVIEW_TUNING.scaleMin}
        onChange={(event) => onChange(Number(event.target.value))}
        step={PREVIEW_TUNING.scaleStep}
        type="range"
        value={value}
      />
      <span>{`${Number(value).toFixed(2).replace(".", ",")}x`}</span>
    </div>
  );
}

function PreviewTuningControls({ editor, onChange, showScale = true }) {
  return (
    <section className="panel-section preview-tuning-section">
      <PreviewTuneSlider
        label="Grid X"
        max={PREVIEW_TUNING.gridOffsetMax}
        min={PREVIEW_TUNING.gridOffsetMin}
        onChange={(value) => onChange("previewGridOffsetX", value)}
        value={editor.previewGridOffsetX}
      />
      <PreviewTuneSlider
        label="Grid Y"
        max={PREVIEW_TUNING.gridOffsetMax}
        min={PREVIEW_TUNING.gridOffsetMin}
        onChange={(value) => onChange("previewGridOffsetY", value)}
        value={editor.previewGridOffsetY}
      />
      <PreviewTuneSlider
        label="Name X"
        max={PREVIEW_TUNING.nameOffsetMax}
        min={PREVIEW_TUNING.nameOffsetMin}
        onChange={(value) => onChange("previewNameOffsetX", value)}
        value={editor.previewNameOffsetX}
      />
      <PreviewTuneSlider
        label="Name Y"
        max={PREVIEW_TUNING.nameOffsetMax}
        min={PREVIEW_TUNING.nameOffsetMin}
        onChange={(value) => onChange("previewNameOffsetY", value)}
        value={editor.previewNameOffsetY}
      />
      <PreviewTuneSlider
        label="Name font size"
        max={PREVIEW_TUNING.nameFontMax}
        min={PREVIEW_TUNING.nameFontMin}
        onChange={(value) => onChange("previewNameFontSize", value)}
        value={editor.previewNameFontSize}
      />
      {showScale ? (
        <PreviewTuneSlider
          label="Grid scale"
          max={PREVIEW_TUNING.scaleMax}
          min={PREVIEW_TUNING.scaleMin}
          onChange={(value) => onChange("previewScale", value)}
          step={PREVIEW_TUNING.scaleStep}
          suffix="x"
          value={editor.previewScale}
        />
      ) : null}
    </section>
  );
}

function StepperControl({
  className = "",
  disabledMinus = false,
  disabledPlus = false,
  label,
  onMinus,
  onPlus,
  value,
}) {
  return (
    <div className={`stepper-row${className ? ` ${className}` : ""}`}>
      <div className="stepper-label">{label}</div>
      <div className="stepper-control">
        <button
          aria-label={`Decrease ${label}`}
          disabled={disabledMinus || !onMinus}
          onClick={onMinus}
          type="button"
        >
          −
        </button>
        <div className="stepper-value">{value}</div>
        <button
          aria-label={`Increase ${label}`}
          disabled={disabledPlus || !onPlus}
          onClick={onPlus}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TimeStepperControl({ onDenominatorStep, onNumeratorStep, timeSig }) {
  const safeN = Math.max(2, Math.min(15, Number(timeSig?.n) || 4));
  const safeD = Number(timeSig?.d) === 8 ? 8 : 4;
  return (
    <div className="stepper-row">
      <div className="stepper-label">Time</div>
      <div className="time-stepper-control">
        <div className="time-stepper-buttons">
          <button aria-label="Increase time signature numerator" onClick={() => onNumeratorStep(1)} type="button">+</button>
          <button aria-label="Decrease time signature numerator" onClick={() => onNumeratorStep(-1)} type="button">−</button>
        </div>
        <div className="time-stepper-value">
          {safeN}<span>/</span>{safeD}
        </div>
        <div className="time-stepper-buttons">
          <button aria-label="Next time signature denominator" onClick={() => onDenominatorStep(1)} type="button">+</button>
          <button aria-label="Previous time signature denominator" onClick={() => onDenominatorStep(-1)} type="button">−</button>
        </div>
      </div>
    </div>
  );
}

function SettingsSteppers({
  bars,
  barsInRow,
  formatKey,
  resolution,
  timeSig,
  onAddBar,
  onBarsInRowChange,
  onResolutionChange,
  onRemoveBar,
  onSetFormat,
  onTimeSigChange,
}) {
  const formats = Object.values(FORMAT_PRESETS).filter((format) => format.key !== "wide");
  const currentFormatIndex = Math.max(0, formats.findIndex((format) => format.key === formatKey));
  const nextFormat = (direction) => {
    const nextIndex = (currentFormatIndex + direction + formats.length) % formats.length;
    onSetFormat(formats[nextIndex].key);
  };
  const currentResolutionIndex = Math.max(0, RESOLUTION_OPTIONS.indexOf(resolution));
  const stepResolution = (direction) => {
    const nextIndex = (currentResolutionIndex + direction + RESOLUTION_OPTIONS.length) % RESOLUTION_OPTIONS.length;
    onResolutionChange(RESOLUTION_OPTIONS[nextIndex]);
  };
  const stepTimeSigNumerator = (direction) => {
    onTimeSigChange({ ...timeSig, n: Math.max(2, Math.min(15, (Number(timeSig?.n) || 4) + direction)) });
  };
  const stepTimeSigDenominator = (direction) => {
    const currentIndex = Math.max(0, TIME_DENOMINATORS.indexOf(Number(timeSig?.d) || 4));
    const nextIndex = (currentIndex + direction + TIME_DENOMINATORS.length) % TIME_DENOMINATORS.length;
    onTimeSigChange({ ...timeSig, d: TIME_DENOMINATORS[nextIndex] });
  };

  return (
    <section className="panel-section settings-steppers">
      <StepperControl
        label="Resolution"
        onMinus={() => stepResolution(-1)}
        onPlus={() => stepResolution(1)}
        value={getResolutionLabel(resolution)}
      />
      <StepperControl
        disabledMinus={bars <= 1}
        label="Bars"
        onMinus={onRemoveBar}
        onPlus={onAddBar}
        value={bars}
      />
      <TimeStepperControl
        onDenominatorStep={stepTimeSigDenominator}
        onNumeratorStep={stepTimeSigNumerator}
        timeSig={timeSig}
      />
      <StepperControl
        label="Tuplets"
        value="Off"
      />
      <StepperControl
        className="layout-stepper-row"
        label="Layout"
        onMinus={() => nextFormat(-1)}
        onPlus={() => nextFormat(1)}
        value={FORMAT_PRESETS[formatKey]?.label || formats[0]?.label || "Stacked"}
      />
      <StepperControl
        disabledMinus={barsInRow <= BARS_IN_ROW.min}
        disabledPlus={barsInRow >= BARS_IN_ROW.max}
        label="Bars in row"
        onMinus={() => onBarsInRowChange(barsInRow - 1)}
        onPlus={() => onBarsInRowChange(barsInRow + 1)}
        value={barsInRow}
      />
    </section>
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
    <div className="tab-switcher three-way" aria-label="Octave display">
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

function LabelSection({
  editor,
  onLabelDisplayModeChange,
  onOctaveModeChange,
}) {
  const chooseMode = (mode) => {
    onLabelDisplayModeChange(mode);
  };

  return (
    <section className="panel-section notes-label-section">
      <div className="notes-mode-buttons" aria-label="Label type">
        <button
          className={editor.showNoteLabels && editor.labelMode === LABEL_MODES.numbers ? "is-active" : ""}
          onClick={() => chooseMode(LABEL_MODES.numbers)}
          type="button"
        >
          Numbers
        </button>
        <button
          className={editor.showNoteLabels && editor.labelMode === LABEL_MODES.names ? "is-active" : ""}
          onClick={() => chooseMode(LABEL_MODES.names)}
          type="button"
        >
          Notes
        </button>
      </div>
      {editor.showNoteLabels && editor.labelMode === LABEL_MODES.names ? (
        <OctaveModeSwitch octaveLabelMode={editor.octaveLabelMode} onChange={onOctaveModeChange} />
      ) : null}
    </section>
  );
}

function ScaleSection({ editor, onPresetChange, onMapChange }) {
  const [expanded, setExpanded] = React.useState(false);
  const presets = Object.values(SCALE_PRESETS);
  const currentIndex = Math.max(0, presets.findIndex((preset) => preset.key === editor.scalePresetKey));
  const stepScale = (direction) => {
    const nextIndex = (currentIndex + direction + presets.length) % presets.length;
    onPresetChange(presets[nextIndex].key);
  };
  const scaleName = SCALE_PRESETS[editor.scalePresetKey]?.label || "Scale";
  return (
    <section className="panel-section scale-section">
      <div className="stepper-control scale-stepper">
        <button aria-label="Previous scale" onClick={() => stepScale(-1)} type="button">−</button>
        <button
          aria-expanded={expanded}
          className="scale-stepper-name"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {scaleName}
        </button>
        <button aria-label="Next scale" onClick={() => stepScale(1)} type="button">+</button>
      </div>
      {expanded ? (
        <ScaleEditor
          editor={editor}
          onMapChange={onMapChange}
          onPresetChange={onPresetChange}
          showPreset={false}
        />
      ) : null}
    </section>
  );
}

function ScaleEditor({ editor, onPresetChange, onMapChange, showPreset = true }) {
  return (
    <div className="scale-editor">
      {showPreset ? (
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
      ) : null}
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
  onGridLeftChange,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onCountClick,
  onCountPointerDown,
  onCountPointerUp,
  onRowLabelClick,
  playheadStep,
  selection,
}) {
  const baseFormat = FORMAT_PRESETS[editor.formatKey] || FORMAT_PRESETS.tallTopCount;
  const format = getEditorPreviewFormat(baseFormat, editor);
  const stepCount = getMaxSystemStepCount(editor);
  const [frameRef] = useSheetScale(format);
  const scale = editor.previewScale || 1;
  const previewHeight = getEditorPreviewVisibleHeight(format, editor);
  const frameHeight = Math.max(1, Math.round(previewHeight * scale));

  React.useLayoutEffect(() => {
    if (!frameRef.current || !onGridLeftChange) return;
    const previewPanel = frameRef.current.closest(".preview-panel");
    if (!previewPanel) return;
    const frameRect = frameRef.current.getBoundingClientRect();
    const panelRect = previewPanel.getBoundingClientRect();
    const layout = getSystemLayout(
      format,
      editor.systems.length,
      0,
      editor.displayMode,
      editor.systemSpacing,
      editor.barsInRow,
      stepCount,
      editor
    );
    onGridLeftChange(frameRect.left - panelRect.left + layout.x * scale);
  }, [editor.barsInRow, editor.displayMode, editor.resolution, editor.subdivisions, editor.systemSpacing, editor.systems.length, editor.timeSig, format, frameRef, onGridLeftChange, scale, stepCount]);

  return (
    <div
      className="sheet-frame"
      ref={frameRef}
      style={{ height: `${frameHeight}px`, width: `${Math.round(format.width * scale)}px` }}
    >
      <div
        className="notation-sheet"
        style={{
          "--sheet-w": `${format.width}px`,
          "--sheet-h": `${format.height}px`,
          "--sheet-scale": scale,
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
            onCountClick={onCountClick}
            onCountPointerDown={onCountPointerDown}
            onCountPointerUp={onCountPointerUp}
            onRowLabelClick={onRowLabelClick}
            system={system}
            systemCount={editor.systems.length}
            systemIndex={systemIndex}
            barsInRow={editor.barsInRow}
            displayMode={editor.displayMode}
            systemSpacing={editor.systemSpacing}
            editor={editor}
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
  const multiBarFormat = getMultiBarFormat(format, systemCount, editor.barsInRow, getMaxSystemStepCount(editor));
  const previewX = Math.max(0, multiBarFormat.x - 150 + editor.previewGridOffsetX);
  const handLabelInset = multiBarFormat.x - multiBarFormat.labelX;
  const isRhythm = editor.displayMode === DISPLAY_MODES.rhythm;
  const handsHeight = multiBarFormat.cell * 2 + multiBarFormat.rowGap;
  const previewY = isRhythm
    ? EDITOR_PREVIEW_FIRST_ROW_Y - (handsHeight - multiBarFormat.cell) / 2
    : EDITOR_PREVIEW_FIRST_ROW_Y;
  const previewFormat = {
    ...multiBarFormat,
    x: previewX,
    labelX: previewX - handLabelInset,
    y: previewY + editor.previewGridOffsetY,
  };
  const rowCount = getLayoutRows(systemCount, editor.barsInRow);
  const widestRow = Math.max(...Array.from({ length: rowCount }, (_, rowIndex) => getEditorRowWidth(previewFormat, editor, rowIndex)));
  const neededWidth = previewFormat.x + widestRow + 32;
  previewFormat.width = Math.ceil(neededWidth);
  const systemHeight = isRhythm ? previewFormat.cell : handsHeight;
  const baseY = isRhythm
    ? previewFormat.y + (handsHeight - previewFormat.cell) / 2
    : previewFormat.y;
  const neededHeight =
    baseY +
    (rowCount - 1) * getSystemGap(previewFormat, editor.systemSpacing) +
    systemHeight +
    previewFormat.bottomPadding;
  if (neededHeight <= previewFormat.height) return previewFormat;
  return { ...previewFormat, height: Math.ceil(neededHeight) };
}

function getEditorPreviewVisibleHeight(format, editor) {
  const systemCount = Math.max(1, editor.systems.length);
  const rowCount = getLayoutRows(systemCount, editor.barsInRow);
  const isRhythm = editor.displayMode === DISPLAY_MODES.rhythm;
  const handsHeight = format.cell * 2 + format.rowGap;
  const systemHeight = isRhythm ? format.cell : handsHeight;
  const firstLayout = getSystemLayout(
    format,
    systemCount,
    0,
    editor.displayMode,
    editor.systemSpacing,
    editor.barsInRow,
    getMaxSystemStepCount(editor),
    editor
  );
  const compactBottomPadding = Math.max(44, Math.round(format.bottomPadding * 0.25));
  const visibleHeight =
    firstLayout.y +
    (rowCount - 1) * getSystemGap(format, editor.systemSpacing) +
    systemHeight +
    compactBottomPadding;
  return Math.max(1, Math.min(format.height, Math.ceil(visibleHeight)));
}

function SystemView({
  activeNote,
  barsInRow,
  displayMode,
  editor,
  format,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onCountClick,
  onCountPointerDown,
  onCountPointerUp,
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
  const labels = getSystemStepLabels(editor, systemIndex);
  const subdivisions = getSystemSubdivisions(editor, systemIndex);
  const baseSubdivision = getBaseSubdivision(editor);
  const stepCount = labels.length;
  const layout = getSystemLayout(format, systemCount, systemIndex, displayMode, systemSpacing, barsInRow, stepCount, editor);
  const headerY = layout.y - format.headerOffset;
  const showCountLabels = shouldShowCountLabels(format, systemIndex);
  const showHandLabels = !isRhythm && layout.columnIndex === 0;

  return (
    <>
      {showCountLabels ? labels.map((label, stepIndex) => {
        const x = layout.x + stepIndex * (format.cell + format.gap);
        const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
        const subdivisionClass = getSubdivisionClass(subdivisions[beatIndex], baseSubdivision);
        return (
          <button
            aria-label={`Subdivision beat ${beatIndex + 1}`}
            className={`step-label${label === "&" ? " is-amp" : ""} ${subdivisionClass}`}
            data-count-cell="1"
            key={`${systemIndex}-step-${stepIndex}`}
            onClick={() => onCountClick?.(systemIndex, beatIndex)}
            onPointerDown={(event) => onCountPointerDown?.(event, systemIndex, beatIndex)}
            onPointerUp={onCountPointerUp}
            onPointerCancel={onCountPointerUp}
            style={{
              left: x,
              top: headerY,
              width: format.cell,
              height: format.cell * 0.62,
              fontSize: label === "&" ? format.ampFont : format.headerFont,
            }}
            type="button"
          >
            {label}
          </button>
        );
      }) : null}

      {visibleRows.map((rowIndex, visibleRowIndex) => {
        const hand = getHandLabel(rowIndex, handLabelLanguage);
        const rowY = layout.y + visibleRowIndex * (format.cell + format.rowGap);
        return (
          <React.Fragment key={`${systemIndex}-${hand}`}>
            {showHandLabels ? (
              <div
                className="hand-label"
                onClick={() => onRowLabelClick(systemIndex, rowIndex)}
                style={{
                  left: layout.x - format.labelX,
                  top: rowY,
                  width: format.labelX - (format.x - format.labelX),
                  height: format.cell,
                  fontSize: format.labelFont,
                }}
              >
                {hand}
              </div>
            ) : null}
            {labels.map((_, stepIndex) => {
              const note = getVisibleCellNote(system, rowIndex, stepIndex, displayMode);
              const labelInfo = getDisplayNoteLabelInfo(note, { labelMode, noteNameMap, octaveLabelMode });
              const label = labelInfo.text;
              const cell = { systemIndex, rowIndex, stepIndex };
              const selected = isCellInSelection(cell, selection, stepCount);
              const isPlayingStep =
                playheadStep?.systemIndex === systemIndex && playheadStep?.stepIndex === stepIndex;
              const x = layout.x + stepIndex * (format.cell + format.gap);
              const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
              const subdivisionClass = getSubdivisionClass(subdivisions[beatIndex], baseSubdivision);
              const quarterClass = editor.resolution >= 16 && beatIndex % 2 === 1 ? " is-quarter-alt" : "";
              return (
                <button
                  aria-label={`${hand} ${labels[stepIndex] || stepIndex + 1} ${note || "empty"}`}
                  className={`notation-cell ${subdivisionClass}${quarterClass}${note ? " is-note" : ""}${activeNote && note === activeNote ? " is-matching-note" : ""}${selected ? " is-selected" : ""}${isPlayingStep ? " is-playing-step" : ""}`}
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
                  {showNoteLabels ? <CellNoteLabel format={format} labelInfo={labelInfo} /> : null}
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
    <div className="segmented-control preview-tabs" aria-label="Preview mode">
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

function CanvasNameField({
  arrangementTitle,
  gridLeft = null,
  nameOffsetX = 0,
  nameOffsetY = 0,
  nameFontSize = 22,
  onArrangementTitleChange,
  onTitleChange,
  previewMode,
  title,
}) {
  const isPrint = previewMode === PREVIEW_MODES.print;
  const left = !isPrint && Number.isFinite(gridLeft) ? gridLeft + nameOffsetX : 126 + nameOffsetX;
  return (
    <label
      className="canvas-name-field"
      style={{
        fontSize: `${nameFontSize}px`,
        left: `${Math.round(left)}px`,
        transform: `translateY(${nameOffsetY}px)`,
      }}
    >
      <input
        aria-label={isPrint ? "A4 arrangement name" : "Notation name"}
        onChange={(event) =>
          isPrint ? onArrangementTitleChange(event.target.value) : onTitleChange(event.target.value)
        }
        spellCheck="false"
        type="text"
        value={isPrint ? arrangementTitle : title}
      />
    </label>
  );
}

function WorkspaceIconRail({ onSidebarToggle, sidebarTab }) {
  return (
    <div className="workspace-icon-rail" aria-label="Panels">
      <button
        aria-label="Settings"
        aria-pressed={sidebarTab === SIDEBAR_TABS.settings}
        className={`workspace-icon-button${sidebarTab === SIDEBAR_TABS.settings ? " is-active" : ""}`}
        onClick={() => onSidebarToggle(SIDEBAR_TABS.settings)}
        type="button"
      >
        <SettingsIcon />
      </button>
      <button
        aria-label="Notes"
        aria-pressed={sidebarTab === SIDEBAR_TABS.notes}
        className={`workspace-icon-button${sidebarTab === SIDEBAR_TABS.notes ? " is-active" : ""}`}
        onClick={() => onSidebarToggle(SIDEBAR_TABS.notes)}
        type="button"
      >
        <MusicNoteIcon />
      </button>
      <button
        aria-label="Library"
        aria-pressed={sidebarTab === SIDEBAR_TABS.library}
        className={`workspace-icon-button${sidebarTab === SIDEBAR_TABS.library ? " is-active" : ""}`}
        onClick={() => onSidebarToggle(SIDEBAR_TABS.library)}
        type="button"
      >
        <LibraryIcon />
      </button>
      <button
        aria-label="A4"
        aria-pressed={sidebarTab === SIDEBAR_TABS.a4}
        className={`workspace-icon-button${sidebarTab === SIDEBAR_TABS.a4 ? " is-active" : ""}`}
        onClick={() => onSidebarToggle(SIDEBAR_TABS.a4)}
        type="button"
      >
        <A4Icon />
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
      <input
        aria-label="A4 arrangement title"
        onChange={(event) => onArrangementTitleChange(event.target.value)}
        placeholder="A4 arrangement title"
        spellCheck="false"
        type="text"
        value={arrangementTitle}
      />
      <label className="stepper-label" htmlFor="arrangement-scale">
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
              <button
                aria-label={`Edit ${section.name}`}
                className="arrangement-card"
                onClick={() => onLoad(section)}
                type="button"
              >
                <input
                  aria-label="Arrangement section name"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onNameChange(section.id, event.target.value)}
                  spellCheck="false"
                  style={{ width: `${Math.max(2, section.name.length + 1)}ch` }}
                  type="text"
                  value={section.name}
                />
                <small>
                  {section.editor.systems.length} bar{section.editor.systems.length === 1 ? "" : "s"}
                </small>
              </button>
              <div className="arrangement-mode-switch" aria-label="Section print mode">
                <button
                  aria-label="Hands mode"
                  className={section.editor.displayMode === DISPLAY_MODES.hands ? "is-selected" : ""}
                  onClick={() => onSectionModeChange(section.id, DISPLAY_MODES.hands)}
                  title="Hands"
                  type="button"
                >
                  H
                </button>
                <button
                  aria-label="Rhythm mode"
                  className={section.editor.displayMode === DISPLAY_MODES.rhythm ? "is-selected" : ""}
                  onClick={() => onSectionModeChange(section.id, DISPLAY_MODES.rhythm)}
                  title="Rhythm"
                  type="button"
                >
                  R
                </button>
              </div>
              <button
                aria-label={`Move ${section.name} up`}
                className="library-icon-button arrangement-up"
                disabled={index === 0}
                onClick={() => onMove(section.id, -1)}
                title="Move up"
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Move ${section.name} down`}
                className="library-icon-button arrangement-down"
                disabled={index === sections.length - 1}
                onClick={() => onMove(section.id, 1)}
                title="Move down"
                type="button"
              >
                ↓
              </button>
              <button
                aria-label={`Delete ${section.name}`}
                className="library-icon-button arrangement-remove"
                onClick={() => onRemove(section.id)}
                title="Delete"
                type="button"
              >
                ×
              </button>
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

function SvgNoteLabelPart({ part, x, y, fontSize, anchor = "middle" }) {
  if (!part?.text) return null;
  const marker = part.marker === "up" ? "↑" : part.marker === "down" ? "↓" : "";
  return (
    <g>
      <text
        dominantBaseline="middle"
        fill="#ffffff"
        fontFamily="MyriadProSemibold, Myriad Pro, Arial, sans-serif"
        fontSize={fontSize}
        fontWeight="600"
        textAnchor={anchor}
        x={x}
        y={y}
      >
        {part.text}
      </text>
      {marker ? (
        <text
          dominantBaseline="middle"
          fill="#ffffff"
          fontFamily="MyriadProSemibold, Myriad Pro, Arial, sans-serif"
          fontSize={fontSize * 0.42}
          fontWeight="600"
          textAnchor="middle"
          x={x + fontSize * 0.48}
          y={part.marker === "down" ? y + fontSize * 0.42 : y - fontSize * 0.48}
        >
          {marker}
        </text>
      ) : null}
    </g>
  );
}

function SvgCellNoteLabel({ cell, fontSize, labelInfo, x, y }) {
  const parts = labelInfo?.parts || [];
  if (!labelInfo?.text || !parts.length) return null;
  if (parts.length >= 2) {
    const comboLayout = getComboNoteLabelLayout({ cell, noteFont: fontSize }, labelInfo);
    return (
      <g>
        <SvgNoteLabelPart anchor="start" fontSize={comboLayout.topFont} part={parts[0]} x={x + comboLayout.topX} y={y + comboLayout.topY} />
        <text
          dominantBaseline="middle"
          fill="#ffffff"
          fontFamily="MyriadProSemibold, Myriad Pro, Arial, sans-serif"
          fontSize={comboLayout.plusFont}
          fontWeight="600"
          textAnchor="middle"
          x={x + cell / 2}
          y={y + cell / 2 + 1}
        >
          +
        </text>
        <SvgNoteLabelPart anchor="end" fontSize={comboLayout.bottomFont} part={parts[1]} x={x + comboLayout.bottomX} y={y + comboLayout.bottomY} />
      </g>
    );
  }
  return <SvgNoteLabelPart fontSize={fontSize} part={parts[0]} x={x + cell / 2} y={y + cell / 2 + 3} />;
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
  const { headerHeight, rowGap } = PRINT_BAR;
  const gap = PRINT_BAR.gap;
  const systemIndex = bar.systemIndex || 0;
  const stepLabels = getSystemStepLabels(editor, systemIndex);
  const subdivisions = getSystemSubdivisions(editor, systemIndex);
  const baseSubdivision = getBaseSubdivision(editor);
  const stepCount = stepLabels.length;
  const cell = Math.min(PRINT_BAR.cell, (width - (stepCount - 1) * gap) / stepCount);
  const gridWidth = stepCount * cell + (stepCount - 1) * gap;
  const gridX = x + (width - gridWidth) / 2;
  const isRhythm = editor.displayMode === DISPLAY_MODES.rhythm;
  const visibleRows = isRhythm ? [0] : HAND_LABELS.map((_, index) => index);
  const system = bar.system || bar;
  const isPlayingSystem = playhead?.sectionId === sectionId && playhead?.systemIndex === bar.systemIndex;

  return (
    <g>
      {stepLabels.map((label, stepIndex) => {
        const stepX = gridX + stepIndex * (cell + gap);
        const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
        const subdivisionClass = getSubdivisionClass(subdivisions[beatIndex], baseSubdivision);
        return (
          <text
            dominantBaseline="middle"
            fill={subdivisionClass ? "#555555" : "#111111"}
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
            {stepLabels.map((_, stepIndex) => {
              const note = getVisibleCellNote(system, rowIndex, stepIndex, editor.displayMode);
              const remapped = remapNoteToScale(note, sourceNoteNameMap, editor.noteNameMap);
              const displayNote = remapped.note;
              const labelInfo = remapped.missing
                ? { text: "!", parts: [{ text: "!", marker: "" }] }
                : getDisplayNoteLabelInfo(displayNote, editor);
              const label = labelInfo.text;
              const noteFont = Math.min(30, getNoteLabelFontSize({ noteFont: 36, comboFont: 23 }, label, editor.labelMode));
              const stepX = gridX + stepIndex * (cell + gap);
              const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
              const subdivisionClass = getSubdivisionClass(subdivisions[beatIndex], baseSubdivision);
              const alternateQuarter = editor.resolution >= 16 && beatIndex % 2 === 1;
              const isPlayingCell = isPlayingSystem && playhead?.rowIndex === rowIndex && playhead?.stepIndex === stepIndex;
              const cellRef = { sectionId, systemIndex: bar.systemIndex, rowIndex, stepIndex };
              const selected = isArrangementCellInSelection(cellRef, arrangementSelection, stepCount);
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
                    fill={remapped.missing ? "#d56b5f" : note ? COLORS.noteCell : subdivisionClass ? "#cfcfcf" : alternateQuarter ? "#d4d4d4" : "#d9d9d9"}
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
                    <SvgCellNoteLabel cell={cell} fontSize={noteFont} labelInfo={labelInfo} x={stepX} y={rowY} />
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
  const [rowSpacingDefaults, setRowSpacingDefaults] = React.useState(readRowSpacingDefaults);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playheadStep, setPlayheadStep] = React.useState(null);
  const [arrangementPlayhead, setArrangementPlayhead] = React.useState(null);
  const [transportMenuOpen, setTransportMenuOpen] = React.useState(false);
  const [shareMenuOpen, setShareMenuOpen] = React.useState(false);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
  const [preferencesTab, setPreferencesTab] = React.useState("defaults");
  const [legalOpen, setLegalOpen] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState("");
  const [selection, setSelection] = React.useState(null);
  const [arrangementSelection, setArrangementSelection] = React.useState(null);
  const [switchHandsMode, setSwitchHandsMode] = React.useState(false);
  const [noteListenMode, setNoteListenMode] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState(null);
  const [editorGridLeft, setEditorGridLeft] = React.useState(null);
  const [previewNoteRequest, setPreviewNoteRequest] = React.useState(null);
  const [subdivisionPopover, setSubdivisionPopover] = React.useState(null);
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
  const hoveredArrangementCellRef = React.useRef(null);
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
  const countHoldRef = React.useRef({
    timer: null,
    opened: false,
  });

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
    writeJson(ROW_SPACING_DEFAULTS_STORAGE_KEY, rowSpacingDefaults);
  }, [rowSpacingDefaults]);

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
      let noteToPreview = "";
      let noteNameMapForPreview = null;
      commitEditor((draft) => {
        if (switchHandsMode && draft.displayMode === DISPLAY_MODES.hands) {
          const system = draft.systems[systemIndex];
          if (!system?.[0] || !system?.[1]) return draft;
          [system[0][stepIndex], system[1][stepIndex]] = [system[1][stepIndex], system[0][stepIndex]];
          return draft;
        }
        const current = getVisibleCellNote(draft.systems[systemIndex], rowIndex, stepIndex, draft.displayMode);
        const nextNote = activeNote && current !== activeNote ? activeNote : "";
        if (draft.displayMode === DISPLAY_MODES.rhythm) {
          draft.systems[systemIndex][0][stepIndex] = nextNote;
          draft.systems[systemIndex][1][stepIndex] = "";
        } else {
          draft.systems[systemIndex][rowIndex][stepIndex] = nextNote;
        }
        if (nextNote) {
          noteToPreview = nextNote;
          noteNameMapForPreview = draft.noteNameMap;
        }
        return draft;
      });
      if (noteListenMode && noteToPreview) {
        setPreviewNoteRequest({ id: performance.now(), note: noteToPreview, noteNameMap: noteNameMapForPreview });
      }
    },
    [activeNote, commitEditor, noteListenMode, switchHandsMode]
  );

  const selectEditorRow = React.useCallback((systemIndex, rowIndex) => {
    const stepCount = getStepCount(editorRef.current);
    const stepStart = systemIndex * stepCount;
    setSelection({
      rowStart: rowIndex,
      rowEnd: rowIndex,
      stepStart,
      stepEnd: stepStart + stepCount - 1,
    });
  }, []);

  const setCellToNote = React.useCallback(
    (cell, note) => {
      if (!cell || !note) return;
      let noteNameMapForPreview = null;
      commitEditor((draft) => {
        const system = draft.systems[cell.systemIndex];
        const targetRow = draft.displayMode === DISPLAY_MODES.rhythm ? system?.[0] : system?.[cell.rowIndex];
        if (!targetRow || cell.stepIndex < 0 || cell.stepIndex >= targetRow.length) return draft;
        targetRow[cell.stepIndex] = note;
        if (draft.displayMode === DISPLAY_MODES.rhythm && system?.[1]) system[1][cell.stepIndex] = "";
        noteNameMapForPreview = draft.noteNameMap;
        return draft;
      });
      if (noteListenMode) {
        setPreviewNoteRequest({ id: performance.now(), note, noteNameMap: noteNameMapForPreview });
      }
    },
    [commitEditor, noteListenMode]
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
    const stepCount = getStepCount(source);
    const rows = [];
    for (let row = selected.rowStart; row <= selected.rowEnd; row += 1) {
      const values = [];
      for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
        const cell = getCellFromAbsoluteStep(absoluteStep, row, stepCount);
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
    const stepCount = getStepCount(editorRef.current);
    const targetStartStep = getAbsoluteStep(target, stepCount);
    commitEditor((draft) => {
      copied.rows.forEach((rowValues, rowOffset) => {
        const targetRowIndex = target.rowIndex + rowOffset;
        if (targetRowIndex < 0 || targetRowIndex >= HAND_LABELS.length) return;
        rowValues.forEach((value, colOffset) => {
          const targetCell = getCellFromAbsoluteStep(targetStartStep + colOffset, targetRowIndex, stepCount);
          const targetRow = draft.systems[targetCell.systemIndex]?.[targetCell.rowIndex];
          if (!targetRow) return;
          targetRow[targetCell.stepIndex] = value || "";
        });
      });
      return draft;
    });
    const pasteEndStep = targetStartStep + copied.width - 1;
    const maxStep = editorRef.current.systems.length * stepCount - 1;
    setSelection({
      rowStart: target.rowIndex,
      rowEnd: Math.min(target.rowIndex + copied.height - 1, HAND_LABELS.length - 1),
      stepStart: targetStartStep,
      stepEnd: Math.min(pasteEndStep, maxStep),
    });
  }, [commitEditor]);

  const copyArrangementSelection = React.useCallback(() => {
    const selected = arrangementSelection;
    if (!selected) return;
    const section = arrangementSectionsRef.current.find((item) => item.id === selected.sectionId);
    if (!section?.editor?.systems?.length) return;
    const stepCount = getStepCount(section.editor);
    const rows = [];
    for (let row = selected.rowStart; row <= selected.rowEnd; row += 1) {
      const values = [];
      for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
        const cell = getCellFromAbsoluteStep(absoluteStep, row, stepCount);
        values.push(section.editor.systems[cell.systemIndex]?.[cell.rowIndex]?.[cell.stepIndex] || "");
      }
      rows.push(values);
    }
    clipboardRef.current = {
      kind: "arrangement",
      sectionId: selected.sectionId,
      width: selected.stepEnd - selected.stepStart + 1,
      height: selected.rowEnd - selected.rowStart + 1,
      rows,
    };
  }, [arrangementSelection]);

  const pasteArrangementClipboardAtPointer = React.useCallback(() => {
    const target = hoveredArrangementCellRef.current;
    const copied = clipboardRef.current;
    if (!target || !copied?.rows?.length) return;
    const targetSection = arrangementSectionsRef.current.find((item) => item.id === target.sectionId);
    const stepCount = getStepCount(targetSection?.editor);
    const targetStartStep = getAbsoluteStep(target, stepCount);
    let maxStep = targetStartStep;
    let nextSelection = null;
    setArrangementSections((items) =>
      items.map((section) => {
        if (section.id !== target.sectionId) return section;
        const editorCopy = cloneEditor(section.editor);
        maxStep = Math.max(0, editorCopy.systems.length * stepCount - 1);
        copied.rows.forEach((rowValues, rowOffset) => {
          const targetRowIndex = target.rowIndex + rowOffset;
          if (targetRowIndex < 0 || targetRowIndex >= HAND_LABELS.length) return;
          rowValues.forEach((value, colOffset) => {
            const absoluteStep = targetStartStep + colOffset;
            if (absoluteStep > maxStep) return;
            const targetCell = getCellFromAbsoluteStep(absoluteStep, targetRowIndex, stepCount);
            const targetRow = editorCopy.systems[targetCell.systemIndex]?.[targetCell.rowIndex];
            if (!targetRow) return;
            targetRow[targetCell.stepIndex] = value || "";
          });
        });
        nextSelection = {
          sectionId: target.sectionId,
          rowStart: target.rowIndex,
          rowEnd: Math.min(target.rowIndex + copied.height - 1, HAND_LABELS.length - 1),
          stepStart: targetStartStep,
          stepEnd: Math.min(targetStartStep + copied.width - 1, maxStep),
        };
        return { ...section, editor: editorCopy };
      })
    );
    if (nextSelection) setArrangementSelection(nextSelection);
  }, []);

  const clearSelection = React.useCallback(() => {
    const selected = selectionRef.current;
    if (!selected) return;
    commitEditor((draft) => {
      const stepCount = getStepCount(draft);
      for (let rowIndex = selected.rowStart; rowIndex <= selected.rowEnd; rowIndex += 1) {
        for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
          const cell = getCellFromAbsoluteStep(absoluteStep, rowIndex, stepCount);
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
        const stepCount = getStepCount(editorCopy);
        for (let rowIndex = selected.rowStart; rowIndex <= selected.rowEnd; rowIndex += 1) {
          for (let absoluteStep = selected.stepStart; absoluteStep <= selected.stepEnd; absoluteStep += 1) {
            const cell = getCellFromAbsoluteStep(absoluteStep, rowIndex, stepCount);
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
        if (previewModeRef.current === PREVIEW_MODES.print && arrangementSelection) copyArrangementSelection();
        else copySelection();
      } else if (key === "v") {
        event.preventDefault();
        if (previewModeRef.current === PREVIEW_MODES.print) pasteArrangementClipboardAtPointer();
        else pasteClipboardAtPointer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [arrangementSelection, copyArrangementSelection, copySelection, pasteArrangementClipboardAtPointer, pasteClipboardAtPointer]);

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
        setSelection(normalizeSelection(cell, cell, getStepCount(editorRef.current)));
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
      setSelection(normalizeSelection(gesture.anchor, pointedCell, getStepCount(editorRef.current)));
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

  const changeResolution = React.useCallback(
    (resolution) => {
      commitEditor((draft) => {
        const nextDraft = { ...draft, resolution };
        const baseSubdivision = getBaseSubdivision(nextDraft);
        const nextSubdivisions = draft.systems.map(() => Array.from({ length: nextDraft.timeSig.n }, () => baseSubdivision));
        nextDraft.systems = draft.systems.map((system, systemIndex) =>
          remapSystemToSubdivisions(system, draft.subdivisions[systemIndex], nextSubdivisions[systemIndex])
        );
        nextDraft.subdivisions = nextSubdivisions;
        return nextDraft;
      });
      setSelection(null);
      setArrangementSelection(null);
    },
    [commitEditor]
  );

  const changeTimeSignature = React.useCallback(
    (timeSig) => {
      commitEditor((draft) => {
        const nextDraft = { ...draft, timeSig };
        const baseSubdivision = getBaseSubdivision(nextDraft);
        const nextSubdivisions = draft.systems.map(() => Array.from({ length: nextDraft.timeSig.n }, () => baseSubdivision));
        nextDraft.systems = draft.systems.map((system, systemIndex) =>
          remapSystemToSubdivisions(system, draft.subdivisions[systemIndex], nextSubdivisions[systemIndex])
        );
        nextDraft.subdivisions = nextSubdivisions;
        return nextDraft;
      });
      setSelection(null);
      setArrangementSelection(null);
    },
    [commitEditor]
  );

  const applySubdivision = React.useCallback(
    (systemIndex, beatIndex, subdivision = null) => {
      if (countHoldRef.current.opened) {
        countHoldRef.current.opened = false;
        return;
      }
      commitEditor((draft) => {
        const baseSubdivision = getBaseSubdivision(draft);
        const nextSubdivision = subdivision || draft.lastSubdivision || 3;
        const nextSubdivisions = draft.subdivisions.map((systemSubdivisions) => [...systemSubdivisions]);
        const previousSystemSubdivisions = [...(nextSubdivisions[systemIndex] || [])];
        const current = previousSystemSubdivisions[beatIndex] || baseSubdivision;
        previousSystemSubdivisions[beatIndex] = current === nextSubdivision ? baseSubdivision : nextSubdivision;
        nextSubdivisions[systemIndex] = previousSystemSubdivisions;
        draft.systems[systemIndex] = remapSystemToSubdivisions(
          draft.systems[systemIndex],
          draft.subdivisions[systemIndex],
          previousSystemSubdivisions
        );
        draft.subdivisions = nextSubdivisions;
        if (subdivision) draft.lastSubdivision = subdivision;
        return draft;
      });
      setSelection(null);
    },
    [commitEditor]
  );

  const openSubdivisionPopover = React.useCallback((rect, systemIndex, beatIndex) => {
    setSubdivisionPopover({
      systemIndex,
      beatIndex,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  }, []);

  const handleCountPointerDown = React.useCallback((event, systemIndex, beatIndex) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (countHoldRef.current.timer) window.clearTimeout(countHoldRef.current.timer);
    countHoldRef.current.opened = false;
    countHoldRef.current.timer = window.setTimeout(() => {
      countHoldRef.current.opened = true;
      openSubdivisionPopover(rect, systemIndex, beatIndex);
    }, COUNT_HOLD_MS);
  }, [openSubdivisionPopover]);

  const handleCountPointerUp = React.useCallback(() => {
    if (countHoldRef.current.timer) window.clearTimeout(countHoldRef.current.timer);
    countHoldRef.current.timer = null;
  }, []);

  const chooseSubdivision = React.useCallback(
    (value) => {
      if (!subdivisionPopover) return;
      countHoldRef.current.opened = false;
      applySubdivision(subdivisionPopover.systemIndex, subdivisionPopover.beatIndex, value);
      setSubdivisionPopover(null);
    },
    [applySubdivision, subdivisionPopover]
  );

  const changeDisplayMode = React.useCallback(
    (displayMode) => {
      commitEditor((draft) => ({
        ...normalizeEditorForDisplayMode(draft, displayMode),
        systemSpacing: rowSpacingDefaults[displayMode] ?? DEFAULT_ROW_SPACING_BY_MODE[displayMode],
      }));
    },
    [commitEditor, rowSpacingDefaults]
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

  const changeLabelDisplayMode = React.useCallback(
    (labelMode) => {
      commitEditor((draft) => {
        const hideLabels = draft.showNoteLabels && draft.labelMode === labelMode;
        return {
          ...draft,
          labelMode,
          showNoteLabels: !hideLabels,
        };
      });
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

  const stepScalePreset = React.useCallback(
    (direction) => {
      const presets = Object.values(SCALE_PRESETS);
      const currentIndex = Math.max(0, presets.findIndex((preset) => preset.key === editorRef.current.scalePresetKey));
      const nextIndex = (currentIndex + direction + presets.length) % presets.length;
      changeScalePreset(presets[nextIndex].key);
    },
    [changeScalePreset]
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

  const changeRowSpacingDefault = React.useCallback((displayMode, value) => {
    const nextValue = clampNumber(value, SYSTEM_SPACING.min, SYSTEM_SPACING.max, DEFAULT_ROW_SPACING_BY_MODE[displayMode]);
    setRowSpacingDefaults((current) => ({
      ...current,
      [displayMode]: nextValue,
    }));
    if (editorRef.current.displayMode === displayMode) {
      commitEditor((draft) => ({ ...draft, systemSpacing: nextValue }));
    }
  }, [commitEditor]);

  const changeBarsInRow = React.useCallback(
    (barsInRow) => {
      const nextBarsInRow = Math.max(
        BARS_IN_ROW.min,
        Math.min(BARS_IN_ROW.max, Math.round(Number(barsInRow) || BARS_IN_ROW.defaultValue))
      );
      commitEditor((draft) => ({ ...draft, barsInRow: nextBarsInRow }));
    },
    [commitEditor]
  );

  const changeVisibility = React.useCallback(
    (key, value) => {
      commitEditor((draft) => ({ ...draft, [key]: value }));
    },
    [commitEditor]
  );

  const changePreviewTuning = React.useCallback(
    (key, value) => {
      commitEditor((draft) => ({ ...draft, [key]: value }));
    },
    [commitEditor]
  );

  const addSystem = React.useCallback(() => {
    commitEditor((draft) => {
      const baseSubdivision = getBaseSubdivision(draft);
      const subdivisions = Array.from({ length: draft.timeSig.n }, () => baseSubdivision);
      draft.subdivisions.push(subdivisions);
      draft.systems.push(createEmptySystem(subdivisions.reduce((sum, value) => sum + value, 0)));
      return draft;
    });
  }, [commitEditor]);

  const removeSystem = React.useCallback(() => {
    commitEditor((draft) => {
      if (draft.systems.length > 1) draft.systems.pop();
      if (draft.subdivisions.length > 1) draft.subdivisions.pop();
      return draft;
    });
  }, [commitEditor]);

  const clearPattern = React.useCallback(() => {
    commitEditor((draft) => ({
      ...draft,
      systems: draft.systems.map((_, systemIndex) => createEmptySystem(getSystemStepCount(draft, systemIndex))),
    }));
  }, [commitEditor]);

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
    let noteToPreview = "";
    let noteNameMapForPreview = null;
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
        const targetRow = editorCopy.displayMode === DISPLAY_MODES.rhythm
          ? editorCopy.systems[systemIndex]?.[0]
          : editorCopy.systems[systemIndex]?.[rowIndex];
        if (!targetRow) return section;
        const current = getVisibleCellNote(editorCopy.systems[systemIndex], rowIndex, stepIndex, editorCopy.displayMode);
        const arrangementNoteNameMap = normalizeNoteNameMap(null, arrangementScalePresetRef.current);
        const sourceNote = mapNoteBetweenScales(activeNote, arrangementNoteNameMap, editorCopy.noteNameMap);
        const currentArrangementNote = mapNoteBetweenScales(current, editorCopy.noteNameMap, arrangementNoteNameMap);
        const nextNote = sourceNote && currentArrangementNote !== activeNote ? sourceNote : "";
        targetRow[stepIndex] = nextNote;
        if (editorCopy.displayMode === DISPLAY_MODES.rhythm && editorCopy.systems[systemIndex]?.[1]) {
          editorCopy.systems[systemIndex][1][stepIndex] = "";
        }
        if (nextNote) {
          noteToPreview = nextNote;
          noteNameMapForPreview = editorCopy.noteNameMap;
        }
        return { ...section, editor: editorCopy };
      })
    );
    if (noteListenMode && noteToPreview) {
      setPreviewNoteRequest({ id: performance.now(), note: noteToPreview, noteNameMap: noteNameMapForPreview });
    }
  }, [activeNote, noteListenMode, switchHandsMode]);

  const handleArrangementCellPointerDown = React.useCallback((event, cell) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    hoveredArrangementCellRef.current = cell;
    arrangementSelectionGestureRef.current = {
      anchor: cell,
      active: true,
      didSelect: false,
    };
  }, []);

  const handleArrangementCellPointerEnter = React.useCallback((cell) => {
    hoveredArrangementCellRef.current = cell;
    const gesture = arrangementSelectionGestureRef.current;
    if (!gesture.active || !gesture.anchor) return;
    const section = arrangementSectionsRef.current.find((item) => item.id === cell.sectionId);
    const nextSelection = normalizeArrangementSelection(gesture.anchor, cell, getStepCount(section?.editor));
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
    const section = arrangementSectionsRef.current.find((item) => item.id === sectionId);
    const stepCount = getStepCount(section?.editor);
    setArrangementSelection({
      sectionId,
      rowStart: rowIndex,
      rowEnd: rowIndex,
      stepStart: startSystemIndex * stepCount,
      stepEnd: endSystemIndex * stepCount + stepCount - 1,
    });
  }, []);

  const removeArrangementSection = React.useCallback((id) => {
    setArrangementSections((items) => items.filter((section) => section.id !== id));
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
    audio.running = false;
    audio.step = 0;
    setIsPlaying(false);
    setPlayheadStep(null);
    setArrangementPlayhead(null);
  }, []);

  const playPlaybackStep = React.useCallback(async () => {
    const audio = audioRef.current;
    const settings = playbackSettingsRef.current;
    const effectiveBpm = Math.max(20, settings.bpm * settings.playbackRate);
    let nextDelay = 60_000 / effectiveBpm;
    if (previewModeRef.current === PREVIEW_MODES.print && arrangementSectionsRef.current.length) {
      const entries = arrangementSectionsRef.current.flatMap((section) =>
        section.editor.systems.flatMap((system, systemIndex) =>
          getSystemStepLabels(section.editor, systemIndex).map((_, stepIndex) => ({ section, system, systemIndex, stepIndex }))
        )
      );
      if (!entries.length) {
        stopPlayback();
        return;
      }
      const entry = entries[audio.step % entries.length];
      nextDelay = getStepDurationMs(entry.section.editor, entry.systemIndex, entry.stepIndex, effectiveBpm);
      setPlayheadStep(null);
      setArrangementPlayhead({
        sectionId: entry.section.id,
        systemIndex: entry.systemIndex,
        rowIndex: entry.section.editor.displayMode === DISPLAY_MODES.rhythm ? 0 : -1,
        stepIndex: entry.stepIndex,
      });
      const currentBeat = getStepBeatIndex(entry.section.editor, entry.systemIndex, entry.stepIndex);
      const previousBeat = entry.stepIndex > 0 ? getStepBeatIndex(entry.section.editor, entry.systemIndex, entry.stepIndex - 1) : -1;
      if (settings.metronomeEnabled && currentBeat !== previousBeat) {
        playMetronomeClick(currentBeat === 0);
      }
      let firstPlayedRow = null;
      const targetMap = normalizeNoteNameMap(null, arrangementScalePresetRef.current);
      const playbackRows =
        entry.section.editor.displayMode === DISPLAY_MODES.rhythm
          ? HAND_LABELS.map((_, rowIndex) => rowIndex)
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
      if (audio.running) audio.timeout = window.setTimeout(playPlaybackStep, nextDelay);
      return;
    }

    const current = editorRef.current;
    const entries = current.systems.flatMap((system, systemIndex) =>
      getSystemStepLabels(current, systemIndex).map((_, stepIndex) => ({ system, systemIndex, stepIndex }))
    );
    if (!entries.length) {
      stopPlayback();
      return;
    }
    const entry = entries[audio.step % entries.length];
    const { system, systemIndex, stepIndex } = entry;
    nextDelay = getStepDurationMs(current, systemIndex, stepIndex, effectiveBpm);
    setPlayheadStep({ systemIndex, stepIndex });
    setArrangementPlayhead(null);
    const currentBeat = getStepBeatIndex(current, systemIndex, stepIndex);
    const previousBeat = stepIndex > 0 ? getStepBeatIndex(current, systemIndex, stepIndex - 1) : -1;
    if (settings.metronomeEnabled && currentBeat !== previousBeat) {
      playMetronomeClick(currentBeat === 0);
    }
    system?.forEach((row) => {
      const note = row?.[stepIndex] || "";
      if (note) playHandpanTone(note, null, current.noteNameMap);
    });
    audio.step += 1;
    if (audio.running) audio.timeout = window.setTimeout(playPlaybackStep, nextDelay);
  }, [playHandpanTone, playMetronomeClick, stopPlayback]);

  const startPlayback = React.useCallback(async () => {
    stopPlayback();
    await loadMetronomeBuffers();
    const settings = playbackSettingsRef.current;
    const effectiveBpm = Math.max(20, settings.bpm * settings.playbackRate);
    const begin = () => {
      setIsPlaying(true);
      audioRef.current.running = true;
      audioRef.current.step = 0;
      playPlaybackStep();
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

  const togglePlayback = React.useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  React.useEffect(() => {
    if (!previewNoteRequest?.note) return;
    playHandpanTone(previewNoteRequest.note, null, previewNoteRequest.noteNameMap);
  }, [playHandpanTone, previewNoteRequest]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      togglePlayback();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlayback]);

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

  const toggleSidebarTab = React.useCallback((tab) => {
    setPreviewMode(tab === SIDEBAR_TABS.a4 ? PREVIEW_MODES.print : PREVIEW_MODES.editor);
    setSidebarTab((current) => (current === tab ? null : tab));
  }, []);

  return (
    <>
    <div className={`app-shell ${previewMode === PREVIEW_MODES.print ? "is-print-mode" : "is-editor-mode"}`}>
      <TransportHeader
        bpm={playbackSettings.bpm}
        canRedo={future.length > 0}
        canUndo={past.length > 0}
        isPlaying={isPlaying}
        onBpmPointerDown={handleBpmScrubPointerDown}
        onRedo={redo}
        onShareToggle={() => setShareMenuOpen((value) => !value)}
        onSettingsToggle={() => {
          if (performance.now() < bpmClickSuppressUntilRef.current) return;
          setTransportMenuOpen((value) => !value);
        }}
        onTogglePlay={togglePlayback}
        onUndo={undo}
        shareOpen={shareMenuOpen}
        settingsOpen={transportMenuOpen}
      />
      {shareMenuOpen ? (
        <ShareExportPopup
          exportStatus={exportStatus}
          onClose={() => setShareMenuOpen(false)}
          onExportPng={exportPng}
        />
      ) : null}
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
      {preferencesOpen ? (
        <PreferencesDialog
          activeTab={preferencesTab}
          editor={editor}
          onClose={() => setPreferencesOpen(false)}
          onHandLabelLanguageChange={changeHandLabelLanguage}
          onPreviewTuningChange={changePreviewTuning}
          onRowSpacingDefaultChange={changeRowSpacingDefault}
          onSetTab={setPreferencesTab}
          onSystemSpacingChange={changeSystemSpacing}
          rowSpacingDefaults={rowSpacingDefaults}
        />
      ) : null}
      {legalOpen ? <LegalDialog onClose={() => setLegalOpen(false)} /> : null}
      {subdivisionPopover ? (
        <div
          className="subdivision-popover"
          style={{ left: subdivisionPopover.x, top: subdivisionPopover.y }}
        >
          <div className="subdivision-popover-title">Subdivision</div>
          <div className="subdivision-options">
            {SUBDIVISION_OPTIONS.map((value) => (
              <button
                className={editor.lastSubdivision === value ? "is-selected" : ""}
                key={value}
                onClick={() => chooseSubdivision(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`workspace${sidebarTab ? " has-sidebar" : ""}`}>
        <WorkspaceIconRail onSidebarToggle={toggleSidebarTab} sidebarTab={sidebarTab} />
        <CanvasNameField
          arrangementTitle={arrangementTitle}
          gridLeft={editorGridLeft}
          nameFontSize={editor.previewNameFontSize}
          nameOffsetX={editor.previewNameOffsetX}
          nameOffsetY={editor.previewNameOffsetY}
          onArrangementTitleChange={setArrangementTitle}
          onTitleChange={setTitle}
          previewMode={previewMode}
          title={title}
        />
        <div className="workspace-scroll">
          <div className="workspace-content">
        {sidebarTab ? (
        <aside className="tool-panel">
          <div className="tool-panel-header">
            <h2>
              {sidebarTab === SIDEBAR_TABS.settings
                ? "Settings"
                : sidebarTab === SIDEBAR_TABS.notes
                  ? "Notes"
                  : sidebarTab === SIDEBAR_TABS.a4
                    ? "Arrangement"
                    : "Library"}
            </h2>
            <button aria-label="Close sidebar" onClick={() => setSidebarTab(null)} type="button">×</button>
          </div>

          {sidebarTab === SIDEBAR_TABS.settings ? (
            <div className="sidebar-tab-panel">
              <section className="panel-section settings-mode-section">
                <ModeSwitch displayMode={editor.displayMode} onChange={changeDisplayMode} />
              </section>

              <SettingsSteppers
                bars={editor.systems.length}
                barsInRow={editor.barsInRow}
                formatKey={editor.formatKey}
                resolution={editor.resolution}
                timeSig={editor.timeSig}
                onAddBar={addSystem}
                onBarsInRowChange={changeBarsInRow}
                onResolutionChange={changeResolution}
                onRemoveBar={removeSystem}
                onSetFormat={changeFormat}
                onTimeSigChange={changeTimeSignature}
              />

              <section className="panel-section settings-actions-section">
                <CompactScaleSlider
                  onChange={(value) => changePreviewTuning("previewScale", value)}
                  value={editor.previewScale}
                />
                <button
                  aria-label="Clear all notes"
                  className="settings-trash-button"
                  onClick={clearPattern}
                  title="Clear all notes"
                  type="button"
                >
                  <TrashIcon />
                </button>
              </section>
            </div>
          ) : sidebarTab === SIDEBAR_TABS.notes ? (
            <div className="sidebar-tab-panel">
              <ScaleSection
                editor={editor}
                onMapChange={changeNoteName}
                onPresetChange={changeScalePreset}
              />

              <LabelSection
                editor={editor}
                onLabelDisplayModeChange={changeLabelDisplayMode}
                onOctaveModeChange={changeOctaveMode}
              />

              <section className="panel-section notes-palette-section">
                <div className="note-preview-row">
                  <ToolbarButton
                    active={noteListenMode}
                    aria-label="Preview note sounds"
                    className={`toolbar-button note-preview-button${noteListenMode ? " is-active" : ""}`}
                    onClick={() => setNoteListenMode((value) => !value)}
                  >
                    <VolumeIcon />
                  </ToolbarButton>
                </div>
                <NotePalette
                  activeNote={activeNote}
                  editor={editor}
                  listenMode={noteListenMode}
                  onPreviewNote={(note, noteNameMap) => playHandpanTone(note, null, noteNameMap)}
                  onSelectNote={setActiveNote}
                  onSwitchHandsModeChange={setSwitchHandsMode}
                  switchHandsMode={switchHandsMode}
                />
              </section>
            </div>
          ) : sidebarTab === SIDEBAR_TABS.a4 ? (
            <div className="sidebar-tab-panel">
              <ArrangementPanel
                arrangementTitle={arrangementTitle}
                scalePresetKey={arrangementScalePresetKey}
                sections={arrangementSections}
                onAddCurrent={addCurrentToArrangement}
                onArrangementTitleChange={setArrangementTitle}
                onLoad={loadArrangementSection}
                onMove={moveArrangementSection}
                onNameChange={renameArrangementSection}
                onPrint={printArrangement}
                onRemove={removeArrangementSection}
                onScaleChange={(value) => setArrangementScalePresetKey(normalizeArrangementScale(value))}
                onSectionModeChange={changeArrangementSectionMode}
              />
            </div>
          ) : (
            <div className="sidebar-tab-panel">
              <section className="panel-section library-section">
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
            </div>
          )}
        </aside>
        ) : null}

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
            onGridLeftChange={setEditorGridLeft}
            onCellClick={setCell}
            onCellPointerDown={handleCellPointerDown}
            onCellPointerEnter={handleCellPointerEnter}
            onCountClick={applySubdivision}
            onCountPointerDown={handleCountPointerDown}
            onCountPointerUp={handleCountPointerUp}
            onRowLabelClick={selectEditorRow}
            playheadStep={playheadStep}
            selection={selection}
          />
        )}
        </main>
          </div>
        </div>
      <FooterActions
        onLegalClick={() => setLegalOpen(true)}
        onPreferencesClick={() => setPreferencesOpen(true)}
      />
      </div>
      <SiteFooter />
    </div>
    <FooterSeoContent />
    </>
  );
}
