import {
  COLORS,
  DISPLAY_MODES,
  FORMAT_PRESETS,
  HAND_LABELS,
  getComboNoteLabelLayout,
  getDisplayNoteLabel,
  getDisplayNoteLabelInfo,
  getHandLabel,
  getBaseSubdivision,
  getMaxSystemStepCount,
  getMultiBarFormat,
  getNoteLabelFontSize,
  getStepBeatIndex,
  getSubdivisionClass,
  getSystemStepLabels,
  getSystemSubdivisions,
  getSystemLayout,
  getVisibleCellNote,
  normalizeEditor,
  shouldShowCountLabels,
} from "./notationLayout.js";

const REGULAR_FONT_FAMILY = "MyriadProRegular, Myriad Pro, Arial, sans-serif";
const SEMIBOLD_FONT_FAMILY = "MyriadProSemibold, Myriad Pro, Arial, sans-serif";
const EXPORT_WIDTH = 3840;
const EXPORT_HEIGHT = 2160;
const SUBDIVISION_EXPORT_COLORS = {
  "is-base-dense": "#3f3f3f",
  "is-subdivision-3": "#314252",
  "is-subdivision-5": "#3f4630",
  "is-subdivision-6": "#4a402f",
  "is-subdivision-7": "#4b3533",
  "is-subdivision-9": "#3f3950",
};

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

function drawCenteredText(ctx, text, x, y, width, height, size, fontFamily, weight, offsetY = 0, color = COLORS.text) {
  setFont(ctx, size, fontFamily, weight);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2 + 1 + offsetY);
}

function drawLabelPart(ctx, part, x, y, size, align = "center") {
  if (!part?.text) return;
  setFont(ctx, size, SEMIBOLD_FONT_FAMILY, 600);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(part.text, x, y);
  if (!part.marker) return;
  const marker = part.marker === "up" ? "↑" : "↓";
  setFont(ctx, size * 0.42, SEMIBOLD_FONT_FAMILY, 600);
  ctx.textAlign = "center";
  ctx.fillText(
    marker,
    x + size * 0.48,
    part.marker === "down" ? y + size * 0.42 : y - size * 0.48
  );
}

function drawNoteLabel(ctx, labelInfo, x, y, width, height, size, offsetY = 0) {
  const parts = labelInfo?.parts || [];
  if (!labelInfo?.text || !parts.length) return;
  if (parts.length >= 2) {
    const layout = getComboNoteLabelLayout({ cell: width, noteFont: size }, labelInfo);
    drawLabelPart(ctx, parts[0], x + layout.topX, y + layout.topY, layout.topFont, "left");
    drawCenteredText(ctx, "+", x, y, width, height, layout.plusFont, SEMIBOLD_FONT_FAMILY, 600, 0);
    drawLabelPart(ctx, parts[1], x + layout.bottomX, y + layout.bottomY, layout.bottomFont, "right");
    return;
  }
  drawLabelPart(ctx, parts[0], x + width / 2, y + height / 2 + 1 + offsetY, size, "center");
}

function drawRightText(ctx, text, rightX, y, height, size) {
  setFont(ctx, size, REGULAR_FONT_FAMILY, 400);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(text, rightX, y + height / 2 + 1);
}

function drawSystem(ctx, format, system, systemCount, systemIndex, placement, editor) {
  const { barsInRow, displayMode, showNoteLabels, systemSpacing } = editor;
  const isRhythm = displayMode === DISPLAY_MODES.rhythm;
  const visibleRows = isRhythm ? [0] : HAND_LABELS.map((_, index) => index);
  const stepLabels = getSystemStepLabels(editor, systemIndex);
  const subdivisions = getSystemSubdivisions(editor, systemIndex);
  const baseSubdivision = getBaseSubdivision(editor);
  const stepCount = stepLabels.length;
  const layout = getSystemLayout(format, systemCount, systemIndex, displayMode, systemSpacing, barsInRow, stepCount, editor);
  const headerY = layout.y - format.headerOffset;
  const showCountLabels = shouldShowCountLabels(format, systemIndex);
  const showHandLabels = !isRhythm && layout.columnIndex === 0;
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

  if (showCountLabels) stepLabels.forEach((label, stepIndex) => {
    const x = layout.x + stepIndex * (format.cell + format.gap);
    const size = label === "&" ? format.ampFont : format.headerFont;
    const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
    const subdivisionClass = getSubdivisionClass(subdivisions[beatIndex], baseSubdivision);
    const countColor = subdivisionClass ? SUBDIVISION_EXPORT_COLORS[subdivisionClass] || COLORS.text : COLORS.text;
    drawCenteredText(
      ctx,
      label,
      toExportX(x),
      toExportY(headerY),
      toExportSize(format.cell),
      toExportSize(format.cell * 0.62),
      toExportSize(size),
      REGULAR_FONT_FAMILY,
      400,
      0,
      countColor
    );
  });

  visibleRows.forEach((rowIndex, visibleRowIndex) => {
    const rowY = layout.y + visibleRowIndex * (format.cell + format.rowGap);
    if (showHandLabels) {
      drawRightText(
        ctx,
        getHandLabel(rowIndex, editor.handLabelLanguage),
        toExportX(layout.x - (format.x - format.labelX)),
        toExportY(rowY),
        toExportSize(format.cell),
        toExportSize(format.labelFont)
      );
    }

    stepLabels.forEach((_, stepIndex) => {
      const note = getVisibleCellNote(system, rowIndex, stepIndex, displayMode);
      const label = getDisplayNoteLabel(note, editor);
      const labelInfo = getDisplayNoteLabelInfo(note, editor);
      const x = layout.x + stepIndex * (format.cell + format.gap);
      const rect = toPixelRect(x, rowY, format.cell, format.cell);
      const beatIndex = getStepBeatIndex(editor, systemIndex, stepIndex);
      const subdivisionClass = getSubdivisionClass(subdivisions[beatIndex], baseSubdivision);
      const alternateQuarter = editor.resolution >= 16 && beatIndex % 2 === 1;
      ctx.fillStyle = note
        ? COLORS.noteCell
        : SUBDIVISION_EXPORT_COLORS[subdivisionClass] || (alternateQuarter ? "#2e2e2e" : COLORS.emptyCell);
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (note && showNoteLabels) {
        drawNoteLabel(
          ctx,
          labelInfo,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          toExportSize(getNoteLabelFontSize(format, label, editor.labelMode)),
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
  const baseFormat = FORMAT_PRESETS[normalized.formatKey] || FORMAT_PRESETS.tallTopCount;
  const format = getMultiBarFormat(baseFormat, normalized.systems.length, normalized.barsInRow, getMaxSystemStepCount(normalized));
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
        barsInRow: normalized.barsInRow,
      }
    );
  });

  return canvasToBlob(canvas);
}

export async function exportHandpanPng(editor, filename = "handpan-notation") {
  const blob = await renderHandpanPngBlob(editor);
  downloadPngBlob(blob, filename);
}
