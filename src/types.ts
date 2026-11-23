export type ThemeName = "light" | "dark";
export type HeightMode = "auto" | "max";

export interface ExportSettings {
  width: number;
  scale: 1 | 2 | 3;
  heightMode: HeightMode;
  maxHeight: number;
  theme: ThemeName;
  padding: number;
  background: string;
}

export type HostToWebviewMessage =
  | {
      type: "update";
      markdown: string;
      settings: ExportSettings;
    }
  | {
      type: "capture";
      requestId: string;
      purpose: "export" | "copy";
      settings: ExportSettings;
    };

export type WebviewToHostMessage =
  | {
      type: "ready";
    }
  | {
      type: "metrics";
      cssWidth: number;
      cssHeight: number;
      exportWidth: number;
      exportHeight: number;
      clipped: boolean;
    }
  | {
      type: "captureResult";
      requestId: string;
      purpose: "export" | "copy";
      dataUrl: string;
      exportWidth: number;
      exportHeight: number;
      clipped: boolean;
    }
  | {
      type: "error";
      message: string;
      requestId?: string;
    }
  | {
      type: "toolbarChange";
      settings: Partial<ExportSettings>;
    };
