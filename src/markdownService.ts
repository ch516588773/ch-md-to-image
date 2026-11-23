import * as vscode from "vscode";
import * as path from "node:path";

/**
 * Rewrite relative / workspace image paths to webview-safe URIs.
 */
export function rewriteMarkdownImages(
  markdown: string,
  documentUri: vscode.Uri,
  webview: vscode.Webview
): string {
  return markdown.replace(
    /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
    (full, alt: string, src: string) => {
      if (/^(https?:|data:|vscode-webview:|file:)/i.test(src)) {
        if (src.startsWith("file:")) {
          try {
            const fileUri = vscode.Uri.parse(src);
            return `![${alt}](${webview.asWebviewUri(fileUri).toString()})`;
          } catch {
            return full;
          }
        }
        return full;
      }

      if (src.startsWith("/")) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.[0]) {
          const abs = vscode.Uri.joinPath(folders[0].uri, src.replace(/^\//, ""));
          return `![${alt}](${webview.asWebviewUri(abs).toString()})`;
        }
      }

      const dir = path.posix.dirname(documentUri.path);
      const joined = path.posix.normalize(path.posix.join(dir, src));
      const abs = documentUri.with({ path: joined });
      return `![${alt}](${webview.asWebviewUri(abs).toString()})`;
    }
  );
}

export function getActiveMarkdownEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  if (editor.document.languageId !== "markdown") {
    return undefined;
  }
  return editor;
}

export function collectLocalResourceRoots(
  documentUri: vscode.Uri,
  extensionUri: vscode.Uri
): vscode.Uri[] {
  const roots: vscode.Uri[] = [
    vscode.Uri.joinPath(extensionUri, "dist", "media"),
    vscode.Uri.joinPath(documentUri, ".."),
  ];

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.push(folder.uri);
  }

  return roots;
}
