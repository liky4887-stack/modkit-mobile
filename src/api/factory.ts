import type {
  BuildResult,
  Engine,
  FactoryHealth,
  FileEntry,
  Project,
} from './types';

export const FACTORY_BASE =
  process.env.EXPO_PUBLIC_FACTORY_URL ?? 'http://192.168.43.101:8790';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FACTORY_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export const factoryApi = {
  health: () => call<FactoryHealth>('/deepseek/health'),
  engines: () => call<{ ok: boolean; engines: Engine[] }>('/engines'),
  projects: () => call<{ ok: boolean; projects: Project[] }>('/projects'),
  files: (id: string) =>
    call<{ ok: boolean; files: FileEntry[] }>(`/projects/${id}/files`),
  file: (id: string, path: string) =>
    call<{ ok: boolean; content: string }>(`/projects/${id}/files/${path}`),
  build: (
    id: string,
    body: { prompt: string; engine?: string; skillsBlock?: string },
  ) =>
    call<{ ok: boolean; result: BuildResult }>(`/projects/${id}/build`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  previewUrl: (id: string) => `${FACTORY_BASE}/projects/${id}/preview/index.html`,
};
