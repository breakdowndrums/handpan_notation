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

export function createEmptySystem() {
  return HAND_LABELS.map(() => STEP_LABELS.map(() => ""));
}

export function cloneSystems(systems) {
  return systems.map((system) => system.map((row) => [...row]));
}

export function normalizeSystems(rawSystems) {
  if (!Array.isArray(rawSystems) || rawSystems.length === 0) return [createEmptySystem()];

  const allowedNotes = new Set(NOTES);
  return rawSystems.map((system) => {
    const normalizedSystem = createEmptySystem();
    if (!Array.isArray(system)) return normalizedSystem;
    for (let rowIndex = 0; rowIndex < HAND_LABELS.length; rowIndex += 1) {
      const rawRow = Array.isArray(system[rowIndex]) ? system[rowIndex] : [];
      for (let stepIndex = 0; stepIndex < STEP_LABELS.length; stepIndex += 1) {
        const note = String(rawRow[stepIndex] || "");
        normalizedSystem[rowIndex][stepIndex] = allowedNotes.has(note) ? note : "";
      }
    }
    return normalizedSystem;
  });
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

function getDuplicateNoteBases(noteNameMap) {
  const counts = {};
  Object.entries(noteNameMap || {}).forEach(([slot, value]) => {
    if (!value || slot.includes("+")) return;
    const { base } = splitNoteOctave(value);
    if (!base) return;
    counts[base] = (counts[base] || 0) + 1;
  });
  return new Set(Object.entries(counts).filter(([, count]) => count > 1).map(([base]) => base));
}

export function formatNoteNameLabel(value, editor) {
  const text = String(value || "").trim();
  if (!text) return "";
  const octaveMode = editor?.octaveLabelMode || OCTAVE_LABEL_MODES.always;
  if (octaveMode === OCTAVE_LABEL_MODES.always) return text;
  const { base } = splitNoteOctave(text);
  if (!base) return text;
  if (octaveMode === OCTAVE_LABEL_MODES.never) return base;
  return getDuplicateNoteBases(editor?.noteNameMap).has(base) ? text : base;
}

export function getDisplayNoteLabel(note, editor) {
  if (!note) return "";
  if (note === BLANK_NOTE) return "";
  if (editor?.labelMode !== LABEL_MODES.names) return note;
  if (editor?.noteNameMap?.[note]) return formatNoteNameLabel(editor.noteNameMap[note], editor);
  if (note.includes("+")) {
    return note
      .split("+")
      .map((part) =>
        editor?.noteNameMap?.[part]
          ? formatNoteNameLabel(editor.noteNameMap[part], editor)
          : part
      )
      .join("+");
  }
  return note;
}

export function getHandLabel(rowIndex, language = HAND_LABEL_LANGUAGES.german) {
  const labels = HAND_LABEL_TEXT[language] || HAND_LABEL_TEXT[HAND_LABEL_LANGUAGES.german];
  return labels[rowIndex] || HAND_LABELS[rowIndex] || "";
}

export function getNoteLabelFontSize(format, label, labelMode = LABEL_MODES.numbers) {
  const length = String(label || "").length;
  if (labelMode === LABEL_MODES.names) {
    if (length <= 2) return format.noteFont * 0.72;
    if (length === 3) return format.noteFont * 0.48;
    if (length === 4) return format.noteFont * 0.4;
    return format.noteFont * 0.32;
  }
  if (length <= 2) return format.noteFont;
  if (length === 3) return Math.min(format.comboFont, format.noteFont * 0.58);
  if (length === 4) return Math.min(format.comboFont, format.noteFont * 0.48);
  return Math.min(format.comboFont, format.noteFont * 0.38);
}

export function createSampleOne() {
  const system = createEmptySystem();
  system[0][0] = "D";
  system[0][6] = "5";
  system[1][2] = "1";
  system[1][4] = "4";
  return {
    formatKey: "wide",
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
    systems: [first, second],
  };
}

export function normalizeEditor(rawEditor) {
  const fallback = createSampleOne();
  const formatKey = FORMAT_PRESETS[rawEditor?.formatKey] ? rawEditor.formatKey : fallback.formatKey;
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
  return {
    formatKey,
    displayMode,
    labelMode,
    octaveLabelMode,
    scalePresetKey,
    handLabelLanguage,
    noteNameMap: normalizeNoteNameMap(rawEditor?.noteNameMap, scalePresetKey),
    systemSpacing,
    showNoteLabels:
      typeof rawEditor?.showNoteLabels === "boolean"
        ? rawEditor.showNoteLabels
        : DEFAULT_VISIBILITY.showNoteLabels,
    systems: normalizeSystems(rawEditor?.systems || fallback.systems),
  };
}

export function cloneEditor(editor) {
  const normalized = normalizeEditor(editor);
  return {
    formatKey: normalized.formatKey,
    displayMode: normalized.displayMode,
    labelMode: normalized.labelMode,
    octaveLabelMode: normalized.octaveLabelMode,
    scalePresetKey: normalized.scalePresetKey,
    handLabelLanguage: normalized.handLabelLanguage,
    noteNameMap: normalizeNoteNameMap(normalized.noteNameMap, normalized.scalePresetKey),
    systemSpacing: normalized.systemSpacing,
    showNoteLabels: normalized.showNoteLabels,
    systems: cloneSystems(normalized.systems),
  };
}

export function getGridWidth(format) {
  return STEP_LABELS.length * format.cell + (STEP_LABELS.length - 1) * format.gap;
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
  systemSpacing = SYSTEM_SPACING.defaultValue
) {
  const gridWidth = getGridWidth(format);
  const isRhythm = displayMode === DISPLAY_MODES.rhythm;
  const handsHeight = format.cell * 2 + format.rowGap;
  const systemHeight = isRhythm ? format.cell : handsHeight;
  const baseY = isRhythm ? format.y + (handsHeight - format.cell) / 2 : format.y;
  const systemGap = getSystemGap(format, systemSpacing);
  const lastBottom = baseY + (systemCount - 1) * systemGap + systemHeight;
  const overflow = Math.max(0, lastBottom - (format.height - format.bottomPadding));
  return {
    x: isRhythm ? (format.width - gridWidth) / 2 : format.x,
    y: baseY + systemIndex * systemGap - overflow,
    width: gridWidth,
    height: systemHeight,
  };
}
