import { create } from 'zustand';
import type { FeatureStatus, LogEntry } from '@/types';
import { features } from '@/features/registry';
import { genLog } from '@/utils/mockData';

interface FeatureState {
  [featureId: string]: {
    status: FeatureStatus;
    enabled: boolean;
    lastActivated: number;
    metrics: Record<string, number>;
  };
}

interface AppState {
  featureStates: FeatureState;
  logs: LogEntry[];
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  activeTab: string;
  toggleFeature: (featureId: string) => void;
  setFeatureStatus: (featureId: string, status: FeatureStatus) => void;
  addLog: (log: LogEntry) => void;
  addRandomLog: () => void;
  clearLogs: () => void;
  setSidebarOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  initLogs: () => void;
}

function initialFeatureStates(): FeatureState {
  const state: FeatureState = {};
  for (const f of features) {
    state[f.id] = {
      status: f.status,
      enabled: f.status === 'active',
      lastActivated: Date.now(),
      metrics: {
        uptime: Math.floor(Math.random() * 86400),
        events: Math.floor(Math.random() * 1000),
        riskScore: Math.random() * 0.5,
      },
    };
  }
  return state;
}

export const useAppStore = create<AppState>((set, get) => ({
  featureStates: initialFeatureStates(),
  logs: [],
  sidebarOpen: false,
  inspectorOpen: false,
  activeTab: 'workspace',

  toggleFeature: (featureId: string) => {
    set((state) => {
      const current = state.featureStates[featureId];
      if (!current) return state;
      const newEnabled = !current.enabled;
      return {
        featureStates: {
          ...state.featureStates,
          [featureId]: {
            ...current,
            enabled: newEnabled,
            status: newEnabled ? 'active' : 'standby',
            lastActivated: Date.now(),
          },
        },
      };
    });
  },

  setFeatureStatus: (featureId: string, status: FeatureStatus) => {
    set((state) => {
      const current = state.featureStates[featureId];
      if (!current) return state;
      return {
        featureStates: {
          ...state.featureStates,
          [featureId]: { ...current, status, enabled: status === 'active' },
        },
      };
    });
  },

  addLog: (log: LogEntry) => {
    set((state) => ({
      logs: [log, ...state.logs].slice(0, 200),
    }));
  },

  addRandomLog: () => {
    get().addLog(genLog());
  },

  clearLogs: () => set({ logs: [] }),

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  setInspectorOpen: (open: boolean) => set({ inspectorOpen: open }),
  setActiveTab: (tab: string) => set({ activeTab: tab }),

  initLogs: () => {
    const existing = get().logs;
    if (existing.length === 0) {
      const initialLogs = Array.from({ length: 15 }, () => genLog());
      set({ logs: initialLogs });
    }
  },
}));
