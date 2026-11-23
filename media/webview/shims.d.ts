declare module "@traptitech/markdown-it-katex" {
  import type MarkdownIt from "markdown-it";
  const markdownItKatex: MarkdownIt.PluginWithOptions<Record<string, unknown>>;
  export default markdownItKatex;
}

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
