export const BLANK_NOTE = "blank";
export const NOTES = ["D", "1", "2", "3", "4", "5", "6", "7", "8", "9", "1+3", "2+4", "3+5", "4+6", BLANK_NOTE];
export const HAND_LABELS = ["Rechts", "Links"];
export const HAND_LABEL_LANGUAGES = {
  german: "german",
  english: "english",
};
export const HAND_LABEL_TEXT = {
  [HAND_LABEL_LANGUAGES.german]: ["Rechts", "Links"],
  [HAND_LABEL_LANGUAGES.english]: ["Right", "Left"],
};
export const STEP_LABELS = ["1", "&", "2", "&", "3", "&", "4", "&"];
export const RESOLUTION_OPTIONS = [4, 8, 16, 32];
export const TIME_DENOMINATORS = [4, 8];
export const DEFAULT_TIME_SIGNATURE = { n: 4, d: 4 };
export const DEFAULT_RESOLUTION = 8;
export const SUBDIVISION_OPTIONS = [3, 4, 5, 6, 7, 8, 9];
export const DEFAULT_LAST_SUBDIVISION = 3;
export const DISPLAY_MODES = {
  hands: "hands",
  rhythm: "rhythm",
};

export const DEFAULT_VISIBILITY = {
  showNoteLabels: true,
};

export const LABEL_MODES = {
  numbers: "numbers",
  names: "names",
};

export const OCTAVE_LABEL_MODES = {
  always: "always",
  never: "never",
  duplicates: "duplicates",
};

export const SCALE_PRESETS = {
  dKurd8: {
    key: "dKurd8",
    label: "8+1 D Kurd",
    noteNameMap: {
      D: "D3",
      1: "A3",
      2: "Bb3",
      3: "C4",
      4: "D4",
      5: "E4",
      6: "F4",
      7: "G4",
      8: "A4",
      9: "",
    },
  },
  dKurd9: {
    key: "dKurd9",
    label: "9+1 D Kurd",
    noteNameMap: {
      D: "D3",
      1: "A3",
      2: "Bb3",
      3: "C4",
      4: "D4",
      5: "E4",
      6: "F4",
      7: "G4",
      8: "A4",
      9: "C5",
    },
  },
  dCeltic8: {
    key: "dCeltic8",
    label: "8+1 D Celtic",
    noteNameMap: {
      D: "D3",
      1: "A3",
      2: "C4",
      3: "D4",
      4: "E4",
      5: "F4",
      6: "G4",
      7: "A4",
      8: "C5",
      9: "",
    },
  },
};

export const SYSTEM_SPACING = {
  min: -100,
  max: 180,
  step: 20,
  defaultValue: 0,
};
export const BARS_IN_ROW = {
  min: 1,
  max: 4,
  defaultValue: 1,
};
export const PREVIEW_TUNING = {
  gridOffsetMin: -700,
  gridOffsetMax: 200,
  nameOffsetMin: -200,
  nameOffsetMax: 400,
  nameFontMin: 8,
  nameFontMax: 48,
  scaleMin: 0.1,
  scaleMax: 1.5,
  scaleStep: 0.05,
};

export function normalizeResolution(value) {
  const resolution = Number(value);
  return RESOLUTION_OPTIONS.includes(resolution) ? resolution : DEFAULT_RESOLUTION;
}

export function normalizeTimeSignature(value) {
  const n = Math.max(2, Math.min(15, Math.round(Number(value?.n) || DEFAULT_TIME_SIGNATURE.n)));
  const d = TIME_DENOMINATORS.includes(Number(value?.d)) ? Number(value.d) : DEFAULT_TIME_SIGNATURE.d;
  return { n, d };
}

export function getResolutionLabel(resolution) {
  const normalized = normalizeResolution(resolution);
  return normalized === 4 ? "4th" : normalized === 8 ? "8th" : normalized === 16 ? "16th" : "32th";
}

export function getStepCount(settings = {}) {
  const resolution = normalizeResolution(settings?.resolution);
  const timeSig = normalizeTimeSignature(settings?.timeSig);
  return Math.max(1, Math.round((timeSig.n * resolution) / timeSig.d));
}

export function getStepLabels(settings = {}) {
  const resolution = normalizeResolution(settings?.resolution);
  const timeSig = normalizeTimeSignature(settings?.timeSig);
  const subdivisionsPerBeat = Math.max(1, Math.round(resolution / timeSig.d));
  const patterns = {
    1: [""],
    2: ["", "&"],
    4: ["", "e", "&", "a"],
    8: ["", "", "e", "", "&", "", "a", ""],
  };
  const pattern = patterns[subdivisionsPerBeat] || patterns[2];
  const labels = [];
  for (let beat = 1; beat <= timeSig.n; beat += 1) {
    pattern.forEach((label, index) => {
      labels.push(index === 0 ? String(beat) : label);
    });
  }
  return labels.slice(0, getStepCount({ resolution, timeSig }));
}

export function getBaseSubdivision(settings = {}) {
  const resolution = normalizeResolution(settings?.resolution);
  const timeSig = normalizeTimeSignature(settings?.timeSig);
  return Math.max(1, Math.round(resolution / timeSig.d));
}

function normalizeSubdivisionValue(value, baseSubdivision = 2) {
  const subdivision = Number(value);
  if (SUBDIVISION_OPTIONS.includes(subdivision)) return subdivision;
  return baseSubdivision;
}

export function normalizeSubdivisions(rawSubdivisions, systemCount = 1, settings = {}) {
  const timeSig = normalizeTimeSignature(settings?.timeSig);
  const baseSubdivision = getBaseSubdivision(settings);
  return Array.from({ length: Math.max(1, systemCount) }, (_, systemIndex) => {
    const rawSystem = Array.isArray(rawSubdivisions?.[systemIndex]) ? rawSubdivisions[systemIndex] : [];
    return Array.from({ length: timeSig.n }, (_, beatIndex) =>
      normalizeSubdivisionValue(rawSystem[beatIndex], baseSubdivision)
    );
  });
}

export function getSystemSubdivisions(editor = {}, systemIndex = 0) {
  const normalized = normalizeSubdivisions(editor?.subdivisions, Math.max(1, editor?.systems?.length || 1), editor);
  return normalized[systemIndex] || normalized[0] || Array.from({ length: normalizeTimeSignature(editor?.timeSig).n }, () => getBaseSubdivision(editor));
}

export function getSystemStepCount(editor = {}, systemIndex = 0) {
  return getSystemSubdivisions(editor, systemIndex).reduce((sum, subdivision) => sum + subdivision, 0);
}

export function getMaxSystemStepCount(editor = {}) {
  const count = Math.max(1, editor?.systems?.length || 1);
  return Math.max(...Array.from({ length: count }, (_, index) => getSystemStepCount(editor, index)));
}

export function getStepBeatIndex(editor = {}, systemIndex = 0, stepIndex = 0) {
  const subdivisions = getSystemSubdivisions(editor, systemIndex);
  let cursor = 0;
  for (let beatIndex = 0; beatIndex < subdivisions.length; beatIndex += 1) {
    const nextCursor = cursor + subdivisions[beatIndex];
    if (stepIndex < nextCursor) return beatIndex;
    cursor = nextCursor;
  }
  return Math.max(0, subdivisions.length - 1);
}

export function getSystemStepLabels(editor = {}, systemIndex = 0) {
  const subdivisions = getSystemSubdivisions(editor, systemIndex);
  const labels = [];
  subdivisions.forEach((subdivision, beatIndex) => {
    for (let index = 0; index < subdivision; index += 1) {
      if (index === 0) labels.push(String(beatIndex + 1));
      else if (subdivision === 2 && index === 1) labels.push("&");
      else if (subdivision === 4) labels.push(["", "e", "&", "a"][index] || "");
      else if (subdivision === 8) labels.push(index === 2 ? "e" : index === 4 ? "&" : index === 6 ? "a" : "·");
      else labels.push(index === Math.floor(subdivision / 2) ? String(subdivision) : "·");
    }
  });
  return labels;
}

export function getSubdivisionClass(subdivision, baseSubdivision = 2) {
  if (subdivision === baseSubdivision) return subdivision === 4 || subdivision === 8 ? "is-base-dense" : "";
  return `is-subdivision-${subdivision}`;
}

export const COLORS = {
  background: "#000000",
  emptyCell: "#444444",
  noteCell: "#4E93C2",
  text: "#FFFFFF",
};

export const FORMAT_PRESETS = {
  wide: {
    key: "wide",
    label: "Wide",
    width: 2048,
    height: 1152,
    cell: 96,
    gap: 13,
    rowGap: 11,
    systemGap: 280,
    x: 632,
    y: 485,
    labelX: 584,
    headerOffset: 70,
    headerFont: 52,
    ampFont: 34,
    labelFont: 52,
    noteFont: 86,
    comboFont: 47,
    noteTextOffset: 7,
    bottomPadding: 88,
  },
  tall: {
    key: "tall",
    label: "Stacked",
    width: 1690,
    height: 1546,
    cell: 74,
    gap: 9,
    rowGap: 8,
    systemGap: 302,
    countMode: "every",
    spacingAdjustable: true,
    defaultSystemSpacing: 0,
    x: 474,
    y: 731,
    labelX: 436,
    headerOffset: 52,
    headerFont: 40,
    ampFont: 25,
    labelFont: 39,
    noteFont: 66,
    comboFont: 38,
    noteTextOffset: 5,
    bottomPadding: 136,
  },
  tallTopCount: {
    key: "tallTopCount",
    label: "Top Count",
    width: 1690,
    height: 1546,
    cell: 74,
    gap: 9,
    rowGap: 8,
    systemGap: 237,
    countMode: "first",
    spacingAdjustable: true,
    defaultSystemSpacing: 0,
    x: 474,
    y: 731,
    labelX: 436,
    headerOffset: 52,
    headerFont: 40,
    ampFont: 25,
    labelFont: 39,
    noteFont: 66,
    comboFont: 38,
    noteTextOffset: 5,
    bottomPadding: 136,
  },
};

export function createEmptySystem(stepCount = STEP_LABELS.length) {
  const safeStepCount = Math.max(1, Math.round(Number(stepCount) || STEP_LABELS.length));
  return HAND_LABELS.map(() => Array.from({ length: safeStepCount }, () => ""));
}

export function cloneSystems(systems) {
  return systems.map((system) => system.map((row) => [...row]));
}

export function normalizeSystems(rawSystems, stepCount = STEP_LABELS.length) {
  if (!Array.isArray(rawSystems) || rawSystems.length === 0) return [createEmptySystem(stepCount)];

  const allowedNotes = new Set(NOTES);
  return rawSystems.map((system) => {
    const normalizedSystem = createEmptySystem(stepCount);
    if (!Array.isArray(system)) return normalizedSystem;
    for (let rowIndex = 0; rowIndex < HAND_LABELS.length; rowIndex += 1) {
      const rawRow = Array.isArray(system[rowIndex]) ? system[rowIndex] : [];
      for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
        const note = String(rawRow[stepIndex] || "");
        normalizedSystem[rowIndex][stepIndex] = allowedNotes.has(note) ? note : "";
      }
    }
    return normalizedSystem;
  });
}

export function getRhythmDisplayNote(system, stepIndex) {
  const right = system?.[0]?.[stepIndex] || "";
  const left = system?.[1]?.[stepIndex] || "";
  if (!right) return left;
  if (!left) return right;
  if (right.includes("+") || left.includes("+")) return BLANK_NOTE;
  return `${right}+${left}`;
}

export function getVisibleCellNote(system, rowIndex, stepIndex, displayMode = DISPLAY_MODES.hands) {
  if (displayMode === DISPLAY_MODES.rhythm) return getRhythmDisplayNote(system, stepIndex);
  return system?.[rowIndex]?.[stepIndex] || "";
}

export function normalizeNoteNameMap(rawMap, presetKey = "dKurd9") {
  const preset = SCALE_PRESETS[presetKey] || SCALE_PRESETS.dKurd9;
  const source = rawMap && typeof rawMap === "object" ? rawMap : {};
  return Object.fromEntries(
    NOTES.map((note) => [
      note,
      note.includes("+")
        ? String(source[note] || "")
        : String(source[note] ?? preset.noteNameMap[note] ?? ""),
    ])
  );
}

export function splitNoteOctave(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.+?)(-?\d+)$/);
  if (!match) return { base: text, octave: "" };
  return { base: match[1], octave: match[2] };
}

const NOTE_BASE_VALUES = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

function getPitchValue(value) {
  const { base, octave } = splitNoteOctave(value);
  if (!base || octave === "" || NOTE_BASE_VALUES[base] === undefined) return null;
  return Number(octave) * 12 + NOTE_BASE_VALUES[base];
}

function getNoteNameStats(noteNameMap) {
  const stats = {};
  Object.entries(noteNameMap || {}).forEach(([slot, value]) => {
    if (!value || slot.includes("+")) return;
    const { base } = splitNoteOctave(value);
    const pitch = getPitchValue(value);
    if (!base || pitch === null) return;
    if (!stats[base]) stats[base] = { count: 0, min: pitch, max: pitch };
    stats[base].count += 1;
    stats[base].min = Math.min(stats[base].min, pitch);
    stats[base].max = Math.max(stats[base].max, pitch);
  });
  return stats;
}

export function formatNoteNameLabelInfo(value, editor) {
  const text = String(value || "").trim();
  if (!text) return { text: "", marker: "" };
  const octaveMode = editor?.octaveLabelMode || OCTAVE_LABEL_MODES.always;
  if (octaveMode === OCTAVE_LABEL_MODES.always) return { text, marker: "" };
  const { base } = splitNoteOctave(text);
  if (!base) return { text, marker: "" };
  if (octaveMode === OCTAVE_LABEL_MODES.never) return { text: base, marker: "" };

  const pitch = getPitchValue(text);
  const dingPitch = getPitchValue(editor?.noteNameMap?.D);
  const stats = getNoteNameStats(editor?.noteNameMap);
  const baseStats = stats[base];
  let marker = "";
  if (pitch !== null && dingPitch !== null && pitch < dingPitch) {
    marker = "down";
  } else if (pitch !== null && baseStats?.count > 1 && pitch === baseStats.max && baseStats.max > baseStats.min) {
    marker = "up";
  }
  return { text: base, marker };
}

export function formatNoteNameLabel(value, editor) {
  const info = formatNoteNameLabelInfo(value, editor);
  if (!info.text) return "";
  if (info.marker === "up") return `${info.text}↑`;
  if (info.marker === "down") return `${info.text}↓`;
  return info.text;
}

export function getDisplayNoteLabelInfo(note, editor) {
  if (!note) return { text: "", parts: [] };
  if (note === BLANK_NOTE) return { text: "", parts: [] };
  const makePart = (text, marker = "") => ({ text, marker });
  if (editor?.labelMode !== LABEL_MODES.names) {
    const parts = String(note).split("+").map((part) => makePart(part));
    return { text: note, parts };
  }
  if (editor?.noteNameMap?.[note]) {
    const part = formatNoteNameLabelInfo(editor.noteNameMap[note], editor);
    return { text: formatNoteNameLabel(editor.noteNameMap[note], editor), parts: [part] };
  }
  if (note.includes("+")) {
    const parts = note
      .split("+")
      .map((part) => (editor?.noteNameMap?.[part] ? formatNoteNameLabelInfo(editor.noteNameMap[part], editor) : makePart(part)));
    return {
      text: parts.map((part) => {
        if (part.marker === "up") return `${part.text}↑`;
        if (part.marker === "down") return `${part.text}↓`;
        return part.text;
      }).join("+"),
      parts,
    };
  }
  return { text: note, parts: [makePart(note)] };
}

export function getDisplayNoteLabel(note, editor) {
  return getDisplayNoteLabelInfo(note, editor).text || "";
}

export function getHandLabel(rowIndex, language = HAND_LABEL_LANGUAGES.german) {
  const labels = HAND_LABEL_TEXT[language] || HAND_LABEL_TEXT[HAND_LABEL_LANGUAGES.german];
  return labels[rowIndex] || HAND_LABELS[rowIndex] || "";
}

export function getNoteLabelFontSize(format, label, labelMode = LABEL_MODES.numbers) {
  const length = String(label || "").length;
  const isCombo = String(label || "").includes("+");
  if (labelMode === LABEL_MODES.names) {
    if (isCombo) return format.noteFont;
    if (length <= 2) return format.noteFont * 0.72;
    if (length === 3) return format.noteFont * 0.48;
    if (length === 4) return format.noteFont * 0.4;
    return format.noteFont * 0.32;
  }
  if (isCombo) return format.noteFont;
  if (length <= 2) return format.noteFont;
  if (length === 3) return Math.min(format.comboFont, format.noteFont * 0.58);
  if (length === 4) return Math.min(format.comboFont, format.noteFont * 0.48);
  return Math.min(format.comboFont, format.noteFont * 0.38);
}

function estimateLabelWidthFactor(text) {
  return String(text || "")
    .split("")
    .reduce((sum, char) => {
      if (char === "#" || char === "b") return sum + 0.38;
      if (char === "W" || char === "M") return sum + 0.78;
      if (/[0-9]/.test(char)) return sum + 0.5;
      return sum + 0.56;
    }, 0.08);
}

function getComboPartFontSize(format, part, plusFont) {
  const cell = format.cell;
  const markerReserve = part?.marker ? 1.18 : 1;
  const availableWidth = Math.max(8, cell * 0.5 - cell * 0.06 - plusFont * 0.35);
  const availableHeight = cell * 0.48;
  const widthSize = availableWidth / Math.max(0.5, estimateLabelWidthFactor(part?.text) * markerReserve);
  return Math.max(8, Math.min(format.noteFont, availableHeight, widthSize));
}

export function getComboNoteLabelLayout(format, labelInfo) {
  const parts = labelInfo?.parts || [];
  const plusFont = Math.max(9, Math.min(format.noteFont * 0.28, format.cell * 0.22));
  return {
    plusFont,
    topFont: getComboPartFontSize(format, parts[0], plusFont),
    bottomFont: getComboPartFontSize(format, parts[1], plusFont),
    topX: format.cell * 0.06,
    topY: format.cell * 0.25,
    bottomX: format.cell * 0.94,
    bottomY: format.cell * 0.78,
  };
}

export function createSampleOne() {
  const system = createEmptySystem();
  system[0][0] = "D";
  system[0][6] = "5";
  system[1][2] = "1";
  system[1][4] = "4";
  return {
    formatKey: "tallTopCount",
    barsInRow: BARS_IN_ROW.defaultValue,
    systems: [system],
  };
}

export function createSampleTwo() {
  const first = createEmptySystem();
  first[0][0] = "D";
  first[0][2] = "6";
  first[0][4] = "D";
  first[0][6] = "6";
  first[1][1] = "1";
  first[1][3] = "1";
  first[1][5] = "1";
  first[1][7] = "1";

  const second = createEmptySystem();
  second[0][0] = "1+3";
  second[0][2] = "1+3";
  second[0][4] = "1+3";
  second[0][6] = "1+3";
  second[1][0] = "9";
  second[1][2] = "9";
  second[1][4] = "9";
  second[1][6] = "9";

  return {
    formatKey: "tall",
    barsInRow: BARS_IN_ROW.defaultValue,
    systems: [first, second],
  };
}

export function normalizeEditor(rawEditor) {
  const fallback = createSampleOne();
  const rawFormatKey = FORMAT_PRESETS[rawEditor?.formatKey] ? rawEditor.formatKey : fallback.formatKey;
  const formatKey = rawFormatKey === "wide" ? fallback.formatKey : rawFormatKey;
  const displayMode =
    rawEditor?.displayMode === DISPLAY_MODES.rhythm ? DISPLAY_MODES.rhythm : DISPLAY_MODES.hands;
  const labelMode =
    rawEditor?.labelMode === LABEL_MODES.names ? LABEL_MODES.names : LABEL_MODES.numbers;
  const octaveLabelMode = Object.values(OCTAVE_LABEL_MODES).includes(rawEditor?.octaveLabelMode)
    ? rawEditor.octaveLabelMode
    : OCTAVE_LABEL_MODES.always;
  const scalePresetKey = SCALE_PRESETS[rawEditor?.scalePresetKey]
    ? rawEditor.scalePresetKey
    : "dKurd9";
  const handLabelLanguage = Object.values(HAND_LABEL_LANGUAGES).includes(rawEditor?.handLabelLanguage)
    ? rawEditor.handLabelLanguage
    : HAND_LABEL_LANGUAGES.german;
  const systemSpacingRaw = Number(rawEditor?.systemSpacing);
  const systemSpacing = Number.isFinite(systemSpacingRaw)
    ? Math.max(SYSTEM_SPACING.min, Math.min(SYSTEM_SPACING.max, Math.round(systemSpacingRaw)))
    : SYSTEM_SPACING.defaultValue;
  const barsInRowRaw = Number(rawEditor?.barsInRow);
  const barsInRow = Number.isFinite(barsInRowRaw)
    ? Math.max(BARS_IN_ROW.min, Math.min(BARS_IN_ROW.max, Math.round(barsInRowRaw)))
    : BARS_IN_ROW.defaultValue;
  const previewGridOffsetX = Math.max(
    PREVIEW_TUNING.gridOffsetMin,
    Math.min(PREVIEW_TUNING.gridOffsetMax, Math.round(Number(rawEditor?.previewGridOffsetX) || -178))
  );
  const previewGridOffsetY = Math.max(
    PREVIEW_TUNING.gridOffsetMin,
    Math.min(PREVIEW_TUNING.gridOffsetMax, Math.round(Number(rawEditor?.previewGridOffsetY) || -78))
  );
  const previewNameOffsetX = Math.max(
    PREVIEW_TUNING.nameOffsetMin,
    Math.min(PREVIEW_TUNING.nameOffsetMax, Math.round(Number(rawEditor?.previewNameOffsetX) || 262))
  );
  const previewNameOffsetY = Math.max(
    PREVIEW_TUNING.nameOffsetMin,
    Math.min(PREVIEW_TUNING.nameOffsetMax, Math.round(Number(rawEditor?.previewNameOffsetY) || 16))
  );
  const previewScaleRaw = Number(rawEditor?.previewScale);
  const previewScale = Number.isFinite(previewScaleRaw)
    ? Math.max(PREVIEW_TUNING.scaleMin, Math.min(PREVIEW_TUNING.scaleMax, previewScaleRaw))
    : 1;
  const previewNameFontSize = Math.max(
    PREVIEW_TUNING.nameFontMin,
    Math.min(PREVIEW_TUNING.nameFontMax, Math.round(Number(rawEditor?.previewNameFontSize) || 22))
  );
  const resolution = normalizeResolution(rawEditor?.resolution ?? fallback.resolution);
  const timeSig = normalizeTimeSignature(rawEditor?.timeSig ?? fallback.timeSig);
  const rawSystemCount = Array.isArray(rawEditor?.systems) && rawEditor.systems.length
    ? rawEditor.systems.length
    : fallback.systems.length;
  const lastSubdivision = SUBDIVISION_OPTIONS.includes(Number(rawEditor?.lastSubdivision))
    ? Number(rawEditor.lastSubdivision)
    : DEFAULT_LAST_SUBDIVISION;
  const subdivisions = normalizeSubdivisions(rawEditor?.subdivisions, rawSystemCount, { resolution, timeSig });
  const maxStepCount = Math.max(...subdivisions.map((systemSubdivisions) =>
    systemSubdivisions.reduce((sum, subdivision) => sum + subdivision, 0)
  ));
  const systems = normalizeSystems(rawEditor?.systems || fallback.systems, maxStepCount).map((system, systemIndex) => {
    const stepCount = subdivisions[systemIndex]?.reduce((sum, subdivision) => sum + subdivision, 0) || maxStepCount;
    return system.map((row) => row.slice(0, stepCount));
  });
  return {
    formatKey,
    barsInRow,
    resolution,
    timeSig,
    displayMode,
    labelMode,
    octaveLabelMode,
    scalePresetKey,
    lastSubdivision,
    previewGridOffsetX,
    previewGridOffsetY,
    previewNameOffsetX,
    previewNameOffsetY,
    previewScale,
    previewNameFontSize,
    handLabelLanguage,
    noteNameMap: normalizeNoteNameMap(rawEditor?.noteNameMap, scalePresetKey),
    systemSpacing,
    showNoteLabels:
      typeof rawEditor?.showNoteLabels === "boolean"
        ? rawEditor.showNoteLabels
        : DEFAULT_VISIBILITY.showNoteLabels,
    subdivisions,
    systems,
  };
}

export function cloneEditor(editor) {
  const normalized = normalizeEditor(editor);
  return {
    formatKey: normalized.formatKey,
    barsInRow: normalized.barsInRow,
    resolution: normalized.resolution,
    timeSig: { ...normalized.timeSig },
    displayMode: normalized.displayMode,
    labelMode: normalized.labelMode,
    octaveLabelMode: normalized.octaveLabelMode,
    scalePresetKey: normalized.scalePresetKey,
    lastSubdivision: normalized.lastSubdivision,
    previewGridOffsetX: normalized.previewGridOffsetX,
    previewGridOffsetY: normalized.previewGridOffsetY,
    previewNameOffsetX: normalized.previewNameOffsetX,
    previewNameOffsetY: normalized.previewNameOffsetY,
    previewScale: normalized.previewScale,
    previewNameFontSize: normalized.previewNameFontSize,
    handLabelLanguage: normalized.handLabelLanguage,
    noteNameMap: normalizeNoteNameMap(normalized.noteNameMap, normalized.scalePresetKey),
    systemSpacing: normalized.systemSpacing,
    showNoteLabels: normalized.showNoteLabels,
    subdivisions: normalized.subdivisions.map((systemSubdivisions) => [...systemSubdivisions]),
    systems: cloneSystems(normalized.systems),
  };
}

export function getGridWidth(format, stepCount = STEP_LABELS.length) {
  const safeStepCount = Math.max(1, Math.round(Number(stepCount) || STEP_LABELS.length));
  return safeStepCount * format.cell + (safeStepCount - 1) * format.gap;
}

export function getColumnGap(format) {
  return Math.max(format.gap * 4, Math.round(format.cell * 0.62));
}

export function getLayoutColumns(systemCount, barsInRow = BARS_IN_ROW.defaultValue) {
  const safeSystemCount = Math.max(1, Number(systemCount) || 1);
  const safeBarsInRow = Math.max(
    BARS_IN_ROW.min,
    Math.min(BARS_IN_ROW.max, Math.round(Number(barsInRow) || BARS_IN_ROW.defaultValue))
  );
  return Math.max(1, Math.min(safeSystemCount, safeBarsInRow));
}

export function getLayoutRows(systemCount, barsInRow = BARS_IN_ROW.defaultValue) {
  const safeSystemCount = Math.max(1, Number(systemCount) || 1);
  return Math.max(1, Math.ceil(safeSystemCount / getLayoutColumns(safeSystemCount, barsInRow)));
}

export function getMultiBarFormat(format, systemCount, barsInRow = BARS_IN_ROW.defaultValue, stepCount = STEP_LABELS.length) {
  const columns = getLayoutColumns(systemCount, barsInRow);
  if (columns <= 1) return format;
  const gridWidth = getGridWidth(format, stepCount);
  const columnGap = getColumnGap(format);
  const neededWidth = format.x + columns * gridWidth + (columns - 1) * columnGap + format.bottomPadding;
  if (neededWidth <= format.width) return format;
  return { ...format, width: Math.ceil(neededWidth) };
}

export function getEditorRowWidth(format, editor, rowIndex = 0) {
  const systemCount = Math.max(1, editor?.systems?.length || 1);
  const columns = getLayoutColumns(systemCount, editor?.barsInRow);
  const start = rowIndex * columns;
  const end = Math.min(systemCount, start + columns);
  const widths = [];
  for (let systemIndex = start; systemIndex < end; systemIndex += 1) {
    widths.push(getGridWidth(format, getSystemStepCount(editor, systemIndex)));
  }
  return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * getColumnGap(format);
}

export function shouldShowCountLabels(format, systemIndex) {
  return format.countMode !== "first" || systemIndex === 0;
}

export function getSystemGap(format, systemSpacing = SYSTEM_SPACING.defaultValue) {
  const rawSpacing = Number(systemSpacing);
  const spacing = Number.isFinite(rawSpacing)
    ? Math.max(SYSTEM_SPACING.min, Math.min(SYSTEM_SPACING.max, rawSpacing))
    : SYSTEM_SPACING.defaultValue;
  return Math.max(format.cell + format.rowGap, format.systemGap + spacing);
}

export function getSystemLayout(
  format,
  systemCount,
  systemIndex,
  displayMode = DISPLAY_MODES.hands,
  systemSpacing = SYSTEM_SPACING.defaultValue,
  barsInRow = BARS_IN_ROW.defaultValue,
  stepCount = STEP_LABELS.length,
  editor = null
) {
  const gridWidth = getGridWidth(format, stepCount);
  const isRhythm = displayMode === DISPLAY_MODES.rhythm;
  const handsHeight = format.cell * 2 + format.rowGap;
  const systemHeight = isRhythm ? format.cell : handsHeight;
  const baseY = isRhythm ? format.y + (handsHeight - format.cell) / 2 : format.y;
  const systemGap = getSystemGap(format, systemSpacing);
  const columns = getLayoutColumns(systemCount, barsInRow);
  const rowIndex = Math.floor(systemIndex / columns);
  const columnIndex = systemIndex % columns;
  const rowCount = getLayoutRows(systemCount, barsInRow);
  const lastBottom = baseY + (rowCount - 1) * systemGap + systemHeight;
  const overflow = Math.max(0, lastBottom - (format.height - format.bottomPadding));
  const columnGap = getColumnGap(format);
  const rowStartIndex = rowIndex * columns;
  let precedingWidth = 0;
  for (let index = rowStartIndex; index < systemIndex; index += 1) {
    const precedingStepCount = editor ? getSystemStepCount(editor, index) : stepCount;
    precedingWidth += getGridWidth(format, precedingStepCount) + columnGap;
  }
  const totalGridWidth = editor
    ? getEditorRowWidth(format, editor, rowIndex)
    : columns * gridWidth + (columns - 1) * columnGap;
  return {
    x: format.x + precedingWidth,
    y: baseY + rowIndex * systemGap - overflow,
    width: gridWidth,
    height: systemHeight,
    columnIndex,
    rowIndex,
    rowCount,
    totalGridWidth,
  };
}
