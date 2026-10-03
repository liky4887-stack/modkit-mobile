export interface FileEntry {
  path: string;
  bytes: number;
}

export interface BuildResult {
  projectId: string;
  files: FileEntry[];
  previewUrl: string;
  summary: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Engine {
  id: string;
  label: string;
  configured: boolean;
  health?: {
    healthy?: boolean;
    bearerValid?: boolean;
    lastChatOk?: boolean;
  };
}

export interface FactoryHealth {
  ok: boolean;
  status: {
    credentialsConfigured: boolean;
    bearerValid: boolean;
    lastChatOk: boolean;
    lastChatError: string | null;
    powWasmLoaded: boolean;
  };
}

export interface BuildLogLine {
  level: 'info' | 'ok' | 'warn' | 'error';
  msg: string;
  ts: number;
}
