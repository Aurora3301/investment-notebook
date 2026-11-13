import { SCHEMA_VERSION, type BackupFile, type Notebook } from "./types";
import { notebookFromImport } from "./normalize";

export function buildBackup(notebook: Notebook, now = new Date()): BackupFile {
  return {
    app: "investment-notebook",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notebook,
  };
}

export function parseBackup(text: string): Notebook {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("這個檔案不是有效的 JSON。");
  }
  const notebook = notebookFromImport(parsed);
  if (!notebook.holdings && !notebook.cashFlows) throw new Error("備份裡找不到手帳資料。");
  return notebook;
}

export function downloadBackup(notebook: Notebook): void {
  const backup = buildBackup(notebook);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const day = backup.exportedAt.slice(0, 10);
  link.href = url;
  link.download = `investment-notebook-${day}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
