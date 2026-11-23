import * as vscode from "vscode";
import type { ExportSettings, HeightMode, ThemeName } from "./types";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function getExportSettings(): ExportSettings {
  const cfg = vscode.workspace.getConfiguration("markdownImage");
  const scaleRaw = cfg.get<number>("scale", 2);
  const scale = ([1, 2, 3].includes(scaleRaw) ? scaleRaw : 2) as 1 | 2 | 3;
  const theme = (cfg.get<string>("theme", "light") === "dark" ? "dark" : "light") as ThemeName;
  const heightMode = (cfg.get<string>("heightMode", "auto") === "max" ? "max" : "auto") as HeightMode;

  return {
    width: clamp(cfg.get<number>("width", 800), 320, 2400),
    scale,
    heightMode,
    maxHeight: clamp(cfg.get<number>("maxHeight", 4000), 200, 20000),
    theme,
    padding: clamp(cfg.get<number>("padding", 32), 0, 120),
    background: (cfg.get<string>("background", "") || "").trim(),
  };
}

export async function updateExportSettings(
  partial: Partial<ExportSettings>
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("markdownImage");
  // Prefer workspace, fall back to global when no folder is open.
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  const entries: Array<[keyof ExportSettings, unknown]> = [];
  if (partial.width !== undefined) entries.push(["width", partial.width]);
  if (partial.scale !== undefined) entries.push(["scale", partial.scale]);
  if (partial.heightMode !== undefined) entries.push(["heightMode", partial.heightMode]);
  if (partial.maxHeight !== undefined) entries.push(["maxHeight", partial.maxHeight]);
  if (partial.theme !== undefined) entries.push(["theme", partial.theme]);
  if (partial.padding !== undefined) entries.push(["padding", partial.padding]);
  if (partial.background !== undefined) entries.push(["background", partial.background]);

  for (const [key, value] of entries) {
    await cfg.update(key, value, target);
  }
}
