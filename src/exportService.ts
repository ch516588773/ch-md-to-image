import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid PNG data URL");
  }
  return Buffer.from(match[1], "base64");
}

export async function savePngFromDataUrl(
  dataUrl: string,
  suggestedName?: string
): Promise<vscode.Uri | undefined> {
  const defaultName = suggestedName ?? "markdown.png";
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(os.homedir(), "Desktop", defaultName)),
    filters: { PNG: ["png"] },
    saveLabel: "导出 PNG",
  });
  if (!uri) {
    return undefined;
  }

  const buffer = dataUrlToBuffer(dataUrl);
  await fs.writeFile(uri.fsPath, buffer);
  return uri;
}

async function copyImageWindows(pngPath: string): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile(${JSON.stringify(pngPath)})
try {
  [System.Windows.Forms.Clipboard]::SetImage($img)
} finally {
  $img.Dispose()
}
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { windowsHide: true }
  );
}

async function copyImageMac(pngPath: string): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    `set the clipboard to (read (POSIX file ${JSON.stringify(pngPath)}) as «class PNGf»)`,
  ]);
}

async function copyImageLinux(pngPath: string): Promise<void> {
  try {
    await execFileAsync("xclip", [
      "-selection",
      "clipboard",
      "-t",
      "image/png",
      "-i",
      pngPath,
    ]);
    return;
  } catch {
    // try Wayland
  }
  await execFileAsync("bash", [
    "-lc",
    `wl-copy --type image/png < ${JSON.stringify(pngPath)}`,
  ]);
}

export async function copyPngToClipboard(dataUrl: string): Promise<void> {
  const buffer = dataUrlToBuffer(dataUrl);
  const tmp = path.join(
    os.tmpdir(),
    `markdown-to-image-${Date.now()}-${Math.random().toString(16).slice(2)}.png`
  );
  await fs.writeFile(tmp, buffer);

  try {
    if (process.platform === "win32") {
      await copyImageWindows(tmp);
    } else if (process.platform === "darwin") {
      await copyImageMac(tmp);
    } else {
      await copyImageLinux(tmp);
    }
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}
