export type WorkflowPhase =
  | 'investigate'
  | 'analyze'
  | 'edit'
  | 'preview'
  | 'build'
  | 'export';

export interface UploadedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

export interface FeatureResult {
  featureId: string;
  shortName: string;
  phase: WorkflowPhase;
  status: 'ok' | 'warn' | 'error' | 'skipped';
  message: string;
  durationMs: number;
  data?: Record<string, string | number>;
}

export interface HandlerContext {
  apk: UploadedFile | null;
  obb: UploadedFile | null;
  results: Record<string, FeatureResult>;
  log: (level: 'info' | 'success' | 'warn' | 'error' | 'debug', message: string) => void;
  scanId?: string;
}

export type FeatureHandler = (ctx: HandlerContext) => Promise<FeatureResult>;
