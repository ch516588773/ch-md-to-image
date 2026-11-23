import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { MarkdownImagePanel } from "./previewPanel";

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);

  if (MarkdownImagePanel.current) {
    // Panel cannot survive extension host restarts as a singleton restore;
    // users reopen via command.
  }
}

export function deactivate(): void {
  MarkdownImagePanel.current?.dispose();
}
