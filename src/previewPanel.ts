import * as vscode from "vscode";
import { getExportSettings, updateExportSettings } from "./config";
import { copyPngToClipboard, savePngFromDataUrl } from "./exportService";
import { getActiveMarkdownEditor, rewriteMarkdownImages } from "./markdownService";
import type {
  ExportSettings,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "./types";

export class MarkdownImagePanel {
  public static current: MarkdownImagePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private updateTimer: NodeJS.Timeout | undefined;
  private documentUri: vscode.Uri | undefined;
  private pendingCaptures = new Map<
    string,
    {
      purpose: "export" | "copy";
      resolve: (value: WebviewToHostMessage & { type: "captureResult" }) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private webviewReady = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToHostMessage) => this.onMessage(msg),
      null,
      this.disposables
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.documentUri && e.document.uri.toString() === this.documentUri.toString()) {
          this.scheduleUpdate();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.languageId === "markdown") {
          this.documentUri = editor.document.uri;
          this.scheduleUpdate();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("markdownImage")) {
          this.scheduleUpdate();
        }
      })
    );
  }

  public static createOrShow(extensionUri: vscode.Uri): MarkdownImagePanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (MarkdownImagePanel.current) {
      MarkdownImagePanel.current.panel.reveal(column + 1);
      MarkdownImagePanel.current.attachActiveDocument();
      MarkdownImagePanel.current.scheduleUpdate();
      return MarkdownImagePanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      "markdownImagePreview",
      "Markdown 转图片",
      column + 1,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "media"),
          ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
        ],
      }
    );

    MarkdownImagePanel.current = new MarkdownImagePanel(panel, extensionUri);
    MarkdownImagePanel.current.attachActiveDocument();
    MarkdownImagePanel.current.scheduleUpdate();
    return MarkdownImagePanel.current;
  }

  public static async ensure(extensionUri: vscode.Uri): Promise<MarkdownImagePanel> {
    return MarkdownImagePanel.createOrShow(extensionUri);
  }

  public attachActiveDocument(): void {
    const editor = getActiveMarkdownEditor();
    if (editor) {
      this.documentUri = editor.document.uri;
    }
  }

  public scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.updateTimer = setTimeout(() => {
      void this.pushUpdate();
    }, 180);
  }

  private async pushUpdate(): Promise<void> {
    const editor = getActiveMarkdownEditor();
    const doc =
      editor?.document ??
      (this.documentUri
        ? vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.documentUri!.toString())
        : undefined);

    if (!doc || doc.languageId !== "markdown") {
      return;
    }

    this.documentUri = doc.uri;
    const settings = getExportSettings();
    const markdown = rewriteMarkdownImages(doc.getText(), doc.uri, this.panel.webview);

    const message: HostToWebviewMessage = {
      type: "update",
      markdown,
      settings,
    };
    await this.panel.webview.postMessage(message);
  }

  public async capture(
    purpose: "export" | "copy",
    settingsOverride?: Partial<ExportSettings>
  ): Promise<WebviewToHostMessage & { type: "captureResult" }> {
    if (!this.webviewReady) {
      await this.waitUntilReady();
    }

    await this.pushUpdate();

    const settings: ExportSettings = {
      ...getExportSettings(),
      ...settingsOverride,
    };

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const resultPromise = new Promise<WebviewToHostMessage & { type: "captureResult" }>(
      (resolve, reject) => {
        this.pendingCaptures.set(requestId, { purpose, resolve, reject });
        setTimeout(() => {
          if (this.pendingCaptures.has(requestId)) {
            this.pendingCaptures.delete(requestId);
            reject(new Error("截图超时"));
          }
        }, 30000);
      }
    );

    const message: HostToWebviewMessage = {
      type: "capture",
      requestId,
      purpose,
      settings,
    };
    await this.panel.webview.postMessage(message);
    return resultPromise;
  }

  private waitUntilReady(): Promise<void> {
    if (this.webviewReady) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (this.webviewReady) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 10000) {
          clearInterval(timer);
          reject(new Error("预览面板未就绪"));
        }
      }, 50);
    });
  }

  private async onMessage(msg: WebviewToHostMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.webviewReady = true;
        this.scheduleUpdate();
        break;
      case "metrics":
        // Metrics are shown inside the webview toolbar; nothing required here.
        break;
      case "toolbarChange":
        await updateExportSettings(msg.settings);
        this.scheduleUpdate();
        break;
      case "captureResult": {
        const pending = this.pendingCaptures.get(msg.requestId);
        if (pending) {
          this.pendingCaptures.delete(msg.requestId);
          pending.resolve(msg);
        } else {
          await this.handleOrphanCapture(msg);
        }
        break;
      }
      case "error": {
        const pending = msg.requestId ? this.pendingCaptures.get(msg.requestId) : undefined;
        if (pending) {
          this.pendingCaptures.delete(msg.requestId!);
          pending.reject(new Error(msg.message));
        } else {
          void vscode.window.showErrorMessage(`Markdown 转图片：${msg.message}`);
        }
        break;
      }
    }
  }

  private async handleOrphanCapture(
    msg: WebviewToHostMessage & { type: "captureResult" }
  ): Promise<void> {
    try {
      if (msg.purpose === "export") {
        const name = this.suggestFileName();
        const uri = await savePngFromDataUrl(msg.dataUrl, name);
        if (uri) {
          void vscode.window.showInformationMessage(
            `Markdown 转图片：已导出 ${msg.exportWidth}×${msg.exportHeight} PNG${
              msg.clipped ? "（高度已裁切）" : ""
            }`
          );
        }
      } else {
        await copyPngToClipboard(msg.dataUrl);
        void vscode.window.showInformationMessage(
          `Markdown 转图片：已复制 ${msg.exportWidth}×${msg.exportHeight} PNG${
            msg.clipped ? "（高度已裁切）" : ""
          }`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Markdown 转图片：${message}`);
    }
  }

  public suggestFileName(): string {
    if (!this.documentUri) {
      return "markdown.png";
    }
    const base = this.documentUri.path.split("/").pop() ?? "markdown.md";
    return base.replace(/\.md$/i, "") + ".png";
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "dist", "media");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "styles.css"));
    const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "katex.min.css"));
    const hljsLightUri = webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, "hljs-github.min.css")
    );
    const hljsDarkUri = webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, "hljs-github-dark.min.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob: https:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${katexUri}" />
  <link id="hljs-theme" rel="stylesheet" href="${hljsLightUri}" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Markdown 转图片</title>
</head>
<body>
  <div id="toolbar">
    <label>宽度 <input id="width" type="number" min="320" max="2400" step="10" /></label>
    <label>清晰度
      <select id="scale">
        <option value="1">1x</option>
        <option value="2">2x</option>
        <option value="3">3x</option>
      </select>
    </label>
    <label>主题
      <select id="theme">
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </label>
    <label>高度
      <select id="heightMode">
        <option value="auto">自适应</option>
        <option value="max">限制最大</option>
      </select>
    </label>
    <label class="max-height-field">最大高度 <input id="maxHeight" type="number" min="200" max="20000" step="100" /></label>
    <label>边距 <input id="padding" type="number" min="0" max="120" step="4" /></label>
    <label>背景 <input id="background" type="text" placeholder="主题默认" /></label>
    <span id="metrics">—</span>
    <button id="btn-export" type="button">导出 PNG</button>
    <button id="btn-copy" type="button">复制图片</button>
  </div>
  <div id="stage">
    <div id="capture-root" data-theme="light">
      <article id="content" class="markdown-body"></article>
    </div>
  </div>
  <script nonce="${nonce}">
    window.__HLJS_LIGHT__ = ${JSON.stringify(hljsLightUri.toString())};
    window.__HLJS_DARK__ = ${JSON.stringify(hljsDarkUri.toString())};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    MarkdownImagePanel.current = undefined;
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    for (const [, pending] of this.pendingCaptures) {
      pending.reject(new Error("预览面板已关闭"));
    }
    this.pendingCaptures.clear();
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
