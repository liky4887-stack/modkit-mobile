import { create } from 'zustand';
import type { FeatureStatus, LogEntry } from '@/types';
import { features } from '@/features/registry';

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
  clearLogs: () => void;
  setSidebarOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
}

function initialFeatureStates(): FeatureState {
  const state: FeatureState = {};
  for (const f of features) {
    state[f.id] = {
      status: f.status,
      enabled: f.status === 'active',
      lastActivated: Date.now(),
      metrics: { uptime: 0, events: 0, riskScore: 0 },
    };
  }
  return state;
}

export const useAppStore = create<AppState>((set) => ({
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
    set((state) => ({ logs: [log, ...state.logs].slice(0, 200) }));
  },

  clearLogs: () => set({ logs: [] }),

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  setInspectorOpen: (open: boolean) => set({ inspectorOpen: open }),
  setActiveTab: (tab: string) => set({ activeTab: tab }),
}));
