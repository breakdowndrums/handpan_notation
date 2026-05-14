export const EXPORT_SEQUENCE_STORAGE_KEY = "handpan-notation-export-sequences-v1";
export const EXPORT_HISTORY_STORAGE_KEY = "handpan-notation-export-history-v1";

export function normalizeExportBaseName(name) {
  return (String(name || "").trim() || "handpan-notation").replace(/\s+\d{2}$/, "");
}

export function formatExportFilename(baseName, number) {
  return `${baseName} ${String(number).padStart(2, "0")}`;
}

export function getNextExportNumber(usedNumbers) {
  const usedSet = new Set(
    (Array.isArray(usedNumbers) ? usedNumbers : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
  let next = 1;
  while (usedSet.has(next)) next += 1;
  return next;
}

export function parseExportFilename(filename) {
  const match = String(filename || "").trim().match(/^(.+?)\s+(\d{2})(?:\.png)?$/i);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isInteger(number) || number <= 0) return null;
  return {
    baseName: normalizeExportBaseName(match[1]),
    number,
  };
}

function readUsedNumbersFromHistory(baseName, history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => parseExportFilename(entry?.filename || entry))
    .filter((entry) => entry?.baseName === baseName)
    .map((entry) => entry.number);
}

export function reserveNextExportFilename(name, readJson, writeJson) {
  const filename = getNextExportFilename(name, readJson);
  recordExportFilename(filename, readJson, writeJson);
  return filename;
}

export function getNextExportFilename(name, readJson) {
  const baseName = normalizeExportBaseName(name);
  const sequences = readJson(EXPORT_SEQUENCE_STORAGE_KEY, {});
  const history = readJson(EXPORT_HISTORY_STORAGE_KEY, []);
  const used = Array.isArray(sequences?.[baseName]) ? sequences[baseName] : [];
  const historyUsed = readUsedNumbersFromHistory(baseName, history);
  const next = getNextExportNumber([...used, ...historyUsed]);
  return formatExportFilename(baseName, next);
}

export function recordExportFilename(filename, readJson, writeJson) {
  const parsed = parseExportFilename(filename);
  if (!parsed) return;
  const { baseName, number } = parsed;
  const sequences = readJson(EXPORT_SEQUENCE_STORAGE_KEY, {});
  const history = readJson(EXPORT_HISTORY_STORAGE_KEY, []);
  const used = Array.isArray(sequences?.[baseName]) ? sequences[baseName] : [];
  const historyUsed = readUsedNumbersFromHistory(baseName, history);
  const nextUsed = Array.from(new Set([...used, ...historyUsed, number].map(Number)))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);

  writeJson(EXPORT_SEQUENCE_STORAGE_KEY, {
    ...(sequences && typeof sequences === "object" ? sequences : {}),
    [baseName]: nextUsed,
  });
  writeJson(EXPORT_HISTORY_STORAGE_KEY, [
    {
      filename,
      exportedAt: new Date().toISOString(),
    },
    ...(Array.isArray(history) ? history : []),
  ].slice(0, 200));
}
