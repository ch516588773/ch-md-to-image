import * as vscode from "vscode";
import { copyPngToClipboard, savePngFromDataUrl } from "./exportService";
import { getActiveMarkdownEditor } from "./markdownService";
import { MarkdownImagePanel } from "./previewPanel";

function requireMarkdownEditor(): vscode.TextEditor {
  const editor = getActiveMarkdownEditor();
  if (!editor) {
    throw new Error("请先打开一个 Markdown 文件。");
  }
  return editor;
}

function prefix(message: string): string {
  return `Markdown 转图片：${message}`;
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("markdownImage.openPreview", () => {
      try {
        requireMarkdownEditor();
        MarkdownImagePanel.createOrShow(context.extensionUri);
      } catch (err) {
        void vscode.window.showErrorMessage(
          prefix(err instanceof Error ? err.message : String(err))
        );
      }
    }),

    vscode.commands.registerCommand("markdownImage.exportPng", async () => {
      try {
        requireMarkdownEditor();
        const panel = await MarkdownImagePanel.ensure(context.extensionUri);
        const result = await panel.capture("export");
        const uri = await savePngFromDataUrl(result.dataUrl, panel.suggestFileName());
        if (uri) {
          void vscode.window.showInformationMessage(
            prefix(
              `已导出 ${result.exportWidth}×${result.exportHeight} PNG${
                result.clipped ? "（高度已裁切）" : ""
              }`
            )
          );
        }
      } catch (err) {
        void vscode.window.showErrorMessage(
          prefix(err instanceof Error ? err.message : String(err))
        );
      }
    }),

    vscode.commands.registerCommand("markdownImage.copyImage", async () => {
      try {
        requireMarkdownEditor();
        const panel = await MarkdownImagePanel.ensure(context.extensionUri);
        const result = await panel.capture("copy");
        await copyPngToClipboard(result.dataUrl);
        void vscode.window.showInformationMessage(
          prefix(
            `已复制 ${result.exportWidth}×${result.exportHeight} PNG${
              result.clipped ? "（高度已裁切）" : ""
            }`
          )
        );
      } catch (err) {
        void vscode.window.showErrorMessage(
          prefix(err instanceof Error ? err.message : String(err))
        );
      }
    })
  );
}
