import MarkdownIt from "markdown-it";
import markdownItKatex from "@traptitech/markdown-it-katex";
import hljs from "highlight.js/lib/common";
import mermaid from "mermaid";
import { domToPng } from "modern-screenshot";
import DOMPurify from "dompurify";

type ThemeName = "light" | "dark";
type HeightMode = "auto" | "max";

interface ExportSettings {
  width: number;
  scale: 1 | 2 | 3;
  heightMode: HeightMode;
  maxHeight: number;
  theme: ThemeName;
  padding: number;
  background: string;
}

type HostMessage =
  | { type: "update"; markdown: string; settings: ExportSettings }
  | {
      type: "capture";
      requestId: string;
      purpose: "export" | "copy";
      settings: ExportSettings;
    };

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare global {
  interface Window {
    __HLJS_LIGHT__?: string;
    __HLJS_DARK__?: string;
  }
}

const vscode = acquireVsCodeApi();

const widthInput = document.getElementById("width") as HTMLInputElement;
const scaleSelect = document.getElementById("scale") as HTMLSelectElement;
const themeSelect = document.getElementById("theme") as HTMLSelectElement;
const heightModeSelect = document.getElementById("heightMode") as HTMLSelectElement;
const maxHeightInput = document.getElementById("maxHeight") as HTMLInputElement;
const paddingInput = document.getElementById("padding") as HTMLInputElement;
const backgroundInput = document.getElementById("background") as HTMLInputElement;
const metricsEl = document.getElementById("metrics") as HTMLSpanElement;
const maxHeightField = document.querySelector(".max-height-field") as HTMLElement;
const captureRoot = document.getElementById("capture-root") as HTMLDivElement;
const contentEl = document.getElementById("content") as HTMLElement;
const hljsThemeLink = document.getElementById("hljs-theme") as HTMLLinkElement;
const btnExport = document.getElementById("btn-export") as HTMLButtonElement;
const btnCopy = document.getElementById("btn-copy") as HTMLButtonElement;

let currentSettings: ExportSettings = {
  width: 800,
  scale: 2,
  heightMode: "auto",
  maxHeight: 4000,
  theme: "light",
  padding: 32,
  background: "",
};

let currentMarkdown = "";
let renderToken = 0;
let applyingToolbar = false;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
});

const md = new MarkdownIt({
  // Match VS Code Markdown preview: allow inline HTML such as <br>.
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>"
        );
      } catch {
        // fall through
      }
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + "</code></pre>";
  },
});

md.use(markdownItKatex, { throwOnError: false, errorColor: "#cc0000" });

const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || "").trim().split(/\s+/)[0];
  if (info === "mermaid") {
    return `<div class="mermaid">${md.utils.escapeHtml(token.content.trim())}</div>\n`;
  }
  if (defaultFence) {
    return defaultFence(tokens, idx, options, env, self);
  }
  return self.renderToken(tokens, idx, options);
};

function readToolbarSettings(): ExportSettings {
  const scale = Number(scaleSelect.value);
  return {
    width: clamp(Number(widthInput.value) || 800, 320, 2400),
    scale: ([1, 2, 3].includes(scale) ? scale : 2) as 1 | 2 | 3,
    heightMode: heightModeSelect.value === "max" ? "max" : "auto",
    maxHeight: clamp(Number(maxHeightInput.value) || 4000, 200, 20000),
    theme: themeSelect.value === "dark" ? "dark" : "light",
    padding: clamp(Number(paddingInput.value) || 0, 0, 120),
    background: backgroundInput.value.trim(),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function syncToolbar(settings: ExportSettings): void {
  applyingToolbar = true;
  widthInput.value = String(settings.width);
  scaleSelect.value = String(settings.scale);
  themeSelect.value = settings.theme;
  heightModeSelect.value = settings.heightMode;
  maxHeightInput.value = String(settings.maxHeight);
  paddingInput.value = String(settings.padding);
  backgroundInput.value = settings.background;
  maxHeightField.hidden = settings.heightMode !== "max";
  applyingToolbar = false;
}

function applyChrome(settings: ExportSettings): void {
  captureRoot.dataset.theme = settings.theme;
  captureRoot.style.width = `${settings.width}px`;
  captureRoot.style.padding = `${settings.padding}px`;
  captureRoot.style.background = settings.background || "";
  captureRoot.style.maxHeight =
    settings.heightMode === "max" ? `${settings.maxHeight}px` : "";
  captureRoot.style.overflow = settings.heightMode === "max" ? "hidden" : "visible";

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: settings.theme === "dark" ? "dark" : "default",
  });

  if (settings.theme === "dark" && window.__HLJS_DARK__) {
    hljsThemeLink.href = window.__HLJS_DARK__;
  } else if (window.__HLJS_LIGHT__) {
    hljsThemeLink.href = window.__HLJS_LIGHT__;
  }
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) {
    return Promise.resolve();
  }
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  ).then(() => undefined);
}

async function renderMermaid(root: HTMLElement): Promise<void> {
  const nodes = root.querySelectorAll<HTMLElement>(".mermaid");
  if (nodes.length === 0) {
    return;
  }
  await mermaid.run({ nodes: Array.from(nodes) });
}

function computeMetrics(settings: ExportSettings): {
  cssWidth: number;
  cssHeight: number;
  exportWidth: number;
  exportHeight: number;
  clipped: boolean;
} {
  const cssWidth = Math.round(captureRoot.offsetWidth);
  const fullHeight = Math.round(captureRoot.scrollHeight);
  const clipped =
    settings.heightMode === "max" && fullHeight > settings.maxHeight + 1;
  const cssHeight =
    settings.heightMode === "max"
      ? Math.min(fullHeight, settings.maxHeight)
      : fullHeight;
  return {
    cssWidth,
    cssHeight,
    exportWidth: Math.round(cssWidth * settings.scale),
    exportHeight: Math.round(cssHeight * settings.scale),
    clipped,
  };
}

function publishMetrics(settings: ExportSettings): void {
  const m = computeMetrics(settings);
  metricsEl.textContent = `预计导出 ≈ ${m.exportWidth}×${m.exportHeight}px${
    m.clipped ? "（已裁切）" : ""
  }`;
  vscode.postMessage({ type: "metrics", ...m });
}

async function renderMarkdown(markdown: string, settings: ExportSettings): Promise<void> {
  const token = ++renderToken;
  currentMarkdown = markdown;
  currentSettings = settings;
  syncToolbar(settings);
  applyChrome(settings);

  const rendered = md.render(markdown);
  contentEl.innerHTML = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["target"],
  });

  await waitForImages(contentEl);
  if (token !== renderToken) {
    return;
  }

  try {
    await renderMermaid(contentEl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.postMessage({ type: "error", message: `Mermaid: ${message}` });
  }

  if (token !== renderToken) {
    return;
  }

  // Allow layout to settle
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  publishMetrics(settings);
}

async function capturePng(
  settings: ExportSettings
): Promise<{ dataUrl: string; exportWidth: number; exportHeight: number; clipped: boolean }> {
  applyChrome(settings);
  await waitForImages(contentEl);
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));

  const metrics = computeMetrics(settings);
  const dataUrl = await domToPng(captureRoot, {
    scale: settings.scale,
    backgroundColor:
      settings.background ||
      (settings.theme === "dark" ? "#0d1117" : "#ffffff"),
    width: metrics.cssWidth,
    height: metrics.cssHeight,
  });

  return {
    dataUrl,
    exportWidth: metrics.exportWidth,
    exportHeight: metrics.exportHeight,
    clipped: metrics.clipped,
  };
}

function emitToolbarChange(): void {
  if (applyingToolbar) {
    return;
  }
  const settings = readToolbarSettings();
  currentSettings = settings;
  maxHeightField.hidden = settings.heightMode !== "max";
  vscode.postMessage({ type: "toolbarChange", settings });
  void renderMarkdown(currentMarkdown, settings);
}

for (const el of [
  widthInput,
  scaleSelect,
  themeSelect,
  heightModeSelect,
  maxHeightInput,
  paddingInput,
  backgroundInput,
]) {
  el.addEventListener("change", emitToolbarChange);
}

widthInput.addEventListener("change", emitToolbarChange);
paddingInput.addEventListener("change", emitToolbarChange);
maxHeightInput.addEventListener("change", emitToolbarChange);
backgroundInput.addEventListener("change", emitToolbarChange);

btnExport.addEventListener("click", () => {
  vscode.postMessage({
    type: "toolbarChange",
    settings: readToolbarSettings(),
  });
  // Ask host to run capture via command path; also support direct capture request from host.
  // Trigger host-side export by posting a pseudo request through capture from extension.
  // Use local capture then post result as orphan handled by panel.
  void (async () => {
    try {
      const settings = readToolbarSettings();
      const result = await capturePng(settings);
      vscode.postMessage({
        type: "captureResult",
        requestId: `toolbar-${Date.now()}`,
        purpose: "export",
        ...result,
      });
    } catch (err) {
      vscode.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

btnCopy.addEventListener("click", () => {
  void (async () => {
    try {
      const settings = readToolbarSettings();
      const result = await capturePng(settings);
      vscode.postMessage({
        type: "captureResult",
        requestId: `toolbar-${Date.now()}`,
        purpose: "copy",
        ...result,
      });
    } catch (err) {
      vscode.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") {
    return;
  }

  if (msg.type === "update") {
    void renderMarkdown(msg.markdown, msg.settings);
    return;
  }

  if (msg.type === "capture") {
    void (async () => {
      try {
        if (msg.settings) {
          currentSettings = msg.settings;
          syncToolbar(msg.settings);
          applyChrome(msg.settings);
        }
        const result = await capturePng(msg.settings ?? currentSettings);
        vscode.postMessage({
          type: "captureResult",
          requestId: msg.requestId,
          purpose: msg.purpose,
          ...result,
        });
      } catch (err) {
        vscode.postMessage({
          type: "error",
          requestId: msg.requestId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }
});

vscode.postMessage({ type: "ready" });
