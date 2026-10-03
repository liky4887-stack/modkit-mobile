// Client wrapper for the DexKit tool sidecar, reached via the bridge at /tools/*.
import { httpLog, preview } from './httpLog';

const BASE = 'http://127.0.0.1:8790';

async function call<T = any>(path: string, body: any = {}): Promise<T> {
  const url = BASE + path;
  const reqBody = JSON.stringify(body);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: reqBody,
    });
    const text = await res.text();
    httpLog.record({
      method: 'POST',
      url,
      reqPreview: preview(reqBody, 200),
      resStatus: res.status,
      resPreview: preview(text, 300),
      durationMs: Date.now() - t0,
      error: null,
    });
    let json: any;
    try { json = JSON.parse(text); } catch {
      throw new Error('non-JSON from ' + path + ': ' + text.slice(0, 200));
    }
    if (!json.ok) {
      const err = new Error(json.error || ('tool ' + path + ' failed'));
      (err as any).toolError = true;
      throw err;
    }
    return json as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    httpLog.record({
      method: 'POST',
      url,
      reqPreview: preview(reqBody, 200),
      resStatus: null,
      resPreview: '',
      durationMs: Date.now() - t0,
      error: msg,
    });
    throw e;
  }
}

export interface LoadResult {
  ok: true;
  apk_path: string;
  load_ms: number;
  package: string;
  versionName: string;
  dex_count: number;
  permission_count: number;
}

export interface ManifestResult {
  ok: true;
  package: string;
  versionName: string;
  versionCode: string;
  mainActivity: string;
  permissions: string[];
  activity_count: number;
  service_count: number;
  receiver_count: number;
  provider_count: number;
}

export const toolsClient = {
  // ── lifecycle ──────────────────────────────────────────────────
  health: () => fetch(BASE + '/tools/health').then(r => r.json()),
  list: () => fetch(BASE + '/tools/list').then(r => r.json()),
  loaded: () => fetch(BASE + '/tools/loaded').then(r => r.json()),

  load: (apkPath: string) =>
    call<LoadResult>('/tools/load', { apk_path: apkPath }),

  // ── generic tool call ──────────────────────────────────────────
  // Use this for any tool by name. Args object is passed straight through.
  call: <T = any>(name: string, args: Record<string, unknown> = {}) =>
    call<T>('/tools/' + name, args),

  // ── typed shortcuts for the common ones ────────────────────────
  manifest: () => call<ManifestResult>('/tools/manifest', {}),

  findClassesByName: (name: string, limit = 100) =>
    call<any>('/tools/find_classes_by_name', { name, limit }),

  findClassesUsingStrings: (strings: string[], limit = 100) =>
    call<any>('/tools/find_classes_using_strings', { strings, limit }),

  findClassesImplementing: (iface: string, limit = 100) =>
    call<any>('/tools/find_classes_implementing', { interface: iface, limit }),

  findMethodsUsingStrings: (strings: string[], limit = 100) =>
    call<any>('/tools/find_methods_using_strings', { strings, limit }),

  listClassMethods: (fqcn: string, limit = 200) =>
    call<any>('/tools/list_class_methods', { fqcn, limit }),

  listClassStrings: (fqcn: string, limit = 200) =>
    call<any>('/tools/list_class_strings', { fqcn, limit }),

  decompileClass: (fqcn: string) =>
    call<any>('/tools/decompile_class', { fqcn }),

  decompileMethod: (fqcn: string, method: string) =>
    call<any>('/tools/decompile_method', { fqcn, method }),

  findCallSitesTo: (fqcn: string, method?: string, limit = 100) =>
    call<any>('/tools/find_call_sites_to', { fqcn, method: method || '', limit }),

  findCallSitesFrom: (fqcn: string, method?: string, limit = 100) =>
    call<any>('/tools/find_call_sites_from', { fqcn, method: method || '', limit }),

  findTypeReferences: (type: string, limit = 100) =>
    call<any>('/tools/find_type_references', { type, limit }),

  permissionCallers: (permissions: string[] = [], appOnly = true) =>
    call<any>('/tools/permission_callers', { permissions, app_only: appOnly }),

  extractIocs: (withXref = true) =>
    call<any>('/tools/extract_iocs', { with_xref: withXref }),

  detectPermissiveTls: () =>
    call<any>('/tools/detect_permissive_tls', {}),

  detectContentProviders: () =>
    call<any>('/tools/detect_content_providers', {}),

  dangerousPermissionApiCallers: (appOnly = true) =>
    call<any>('/tools/dangerous_permission_api_callers', { app_only: appOnly }),

  listValueStrings: (limit = 500) =>
    call<any>('/tools/list_value_strings', { limit }),
};
