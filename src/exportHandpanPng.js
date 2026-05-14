import {
  COLORS,
  DISPLAY_MODES,
  FORMAT_PRESETS,
  HAND_LABELS,
  STEP_LABELS,
  getDisplayNoteLabel,
  getHandLabel,
  getNoteLabelFontSize,
  getSystemLayout,
  normalizeEditor,
  shouldShowCountLabels,
} from "./notationLayout.js";

const REGULAR_FONT_FAMILY = "MyriadProRegular, Myriad Pro, Arial, sans-serif";
const SEMIBOLD_FONT_FAMILY = "MyriadProSemibold, Myriad Pro, Arial, sans-serif";
const EXPORT_WIDTH = 3840;
const EXPORT_HEIGHT = 2160;

function safeFilename(name) {
  const trimmed = String(name || "").trim();
  return (trimmed || "handpan-notation").replace(/[\\/:*?"<>|]+/g, "-");
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, "image/png");
  });
}

async function ensureFontLoaded(format) {
  if (!document.fonts?.load) return;
  await document.fonts.load(`600 ${format.noteFont}px MyriadProSemibold`);
  await document.fonts.load(`400 ${format.headerFont}px MyriadProRegular`);
  await document.fonts.load(`400 ${format.labelFont}px MyriadProRegular`);
  await document.fonts.ready;
}

function setFont(ctx, size, fontFamily = SEMIBOLD_FONT_FAMILY, weight = 600) {
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  ctx.fillStyle = COLORS.text;
}

function drawCenteredText(ctx, text, x, y, width, height, size, fontFamily, weight, offsetY = 0) {
  setFont(ctx, size, fontFamily, weight);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2 + 1 + offsetY);
}

function drawRightText(ctx, text, rightX, y, height, size) {
  setFont(ctx, size, REGULAR_FONT_FAMILY, 400);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(text, rightX, y + height / 2 + 1);
}

function drawSystem(ctx, format, system, systemCount, systemIndex, placement, editor) {
  const { displayMode, showNoteLabels, systemSpacing } = editor;
  const isRhythm = displayMode === DISPLAY_MODES.rhythm;
  const visibleRows = isRhythm ? [0] : HAND_LABELS.map((_, index) => index);
  const layout = getSystemLayout(format, systemCount, systemIndex, displayMode, systemSpacing);
  const headerY = layout.y - format.headerOffset;
  const showCountLabels = shouldShowCountLabels(format, systemIndex);
  const scale = placement.scale;

  const toExportX = (value) => placement.x + value * scale;
  const toExportY = (value) => placement.y + value * scale;
  const toExportSize = (value) => value * scale;
  const toPixelRect = (x, y, width, height) => {
    const left = Math.round(toExportX(x));
    const top = Math.round(toExportY(y));
    const right = Math.round(toExportX(x + width));
    const bottom = Math.round(toExportY(y + height));
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  };

  if (showCountLabels) STEP_LABELS.forEach((label, stepIndex) => {
    const x = layout.x + stepIndex * (format.cell + format.gap);
    const size = label === "&" ? format.ampFont : format.headerFont;
    drawCenteredText(
      ctx,
      label,
      toExportX(x),
      toExportY(headerY),
      toExportSize(format.cell),
      toExportSize(format.cell * 0.62),
      toExportSize(size),
      REGULAR_FONT_FAMILY,
      400
    );
  });

  visibleRows.forEach((rowIndex, visibleRowIndex) => {
    const rowY = layout.y + visibleRowIndex * (format.cell + format.rowGap);
    if (!isRhythm) {
      drawRightText(
        ctx,
        getHandLabel(rowIndex, editor.handLabelLanguage),
        toExportX(format.labelX),
        toExportY(rowY),
        toExportSize(format.cell),
        toExportSize(format.labelFont)
      );
    }

    STEP_LABELS.forEach((_, stepIndex) => {
      const note = system[rowIndex]?.[stepIndex] || "";
      const label = getDisplayNoteLabel(note, editor);
      const x = layout.x + stepIndex * (format.cell + format.gap);
      const rect = toPixelRect(x, rowY, format.cell, format.cell);
      ctx.fillStyle = note ? COLORS.noteCell : COLORS.emptyCell;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (note && showNoteLabels) {
        drawCenteredText(
          ctx,
          label,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          toExportSize(getNoteLabelFontSize(format, label, editor.labelMode)),
          SEMIBOLD_FONT_FAMILY,
          600,
          toExportSize(format.noteTextOffset || 0)
        );
      }
    });
  });
}

function getExportPlacement(format) {
  const scale = Math.min(EXPORT_WIDTH / format.width, EXPORT_HEIGHT / format.height);
  return {
    scale,
    x: (EXPORT_WIDTH - format.width * scale) / 2,
    y: (EXPORT_HEIGHT - format.height * scale) / 2,
  };
}

export function downloadPngBlob(blob, filename = "handpan-notation") {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(filename)}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function savePngBlob(blob, filename = "handpan-notation") {
  const safeName = `${safeFilename(filename)}.png`;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: safeName,
        types: [
          {
            description: "PNG image",
            accept: { "image/png": [".png"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error?.name === "AbortError") return false;
      throw error;
    }
  }
  downloadPngBlob(blob, filename);
  return true;
}

export async function renderHandpanPngBlob(editor) {
  const normalized = normalizeEditor(editor);
  const format = FORMAT_PRESETS[normalized.formatKey] || FORMAT_PRESETS.wide;
  await ensureFontLoaded(format);

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  // Keep alpha untouched: the export starts transparent and only opaque notation is drawn.
  ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  const placement = getExportPlacement(format);
  normalized.systems.forEach((system, index) => {
    drawSystem(
      ctx,
      format,
      system,
      normalized.systems.length,
      index,
      placement,
      {
        displayMode: normalized.displayMode,
        labelMode: normalized.labelMode,
        handLabelLanguage: normalized.handLabelLanguage,
        octaveLabelMode: normalized.octaveLabelMode,
        noteNameMap: normalized.noteNameMap,
        showNoteLabels: normalized.showNoteLabels,
        systemSpacing: normalized.systemSpacing,
      }
    );
  });

  return canvasToBlob(canvas);
}

export async function exportHandpanPng(editor, filename = "handpan-notation") {
  const blob = await renderHandpanPngBlob(editor);
  downloadPngBlob(blob, filename);
}
