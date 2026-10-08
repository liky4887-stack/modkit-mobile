# Security Sandbox

Execution-first mobile console for sandboxed binary analysis, patch validation, and module orchestration. All subsystems operate on local mock data.

## Stack

- Expo Router (file-based routing)
- React Native + TypeScript
- Zustand store (`@/store/useAppStore`)
- lucide-react-native icons
- JetBrains Mono + Inter fonts

## Layout

- `app/(tabs)/index.tsx` — Console: sandbox overview, live logs, signature rotation
- `app/(tabs)/patch.tsx` — Patch wizard: import → analyze → design → preview → export
- `app/(tabs)/features.tsx` — Module registry and search
- `app/(tabs)/settings.tsx` — Config toggles, data management
- `app/(tabs)/clean.tsx` — Cleaning workflow (select → scan → results)
- `app/feature/[id].tsx` — Per-module configuration
- `components/` — TopBar, Panel, StatCard, RiskMeter, LogLine, StatusBadge, WarningBanner, CodeBlock, Toggle, Chip, FeatureCard, FeatureIcon, SectionHeader
- `features/registry.ts` — Sandbox module manifest (id, category, risk, icon)
- `utils/mockData.ts` — Deterministic generators for signatures, logs, targets, analyses, patches, cleaning results
- `store/useAppStore.ts` — Module states, logs, actions
- `theme/` — colors and spacing tokens
- `types/` — shared TypeScript types

## Commands

```bash
npm start        # Expo dev server
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # Web bundle
npm run typecheck
```

## Note

This is a simulation and educational tool. No real binaries are processed, no kernel code is executed, and nothing escapes the sandbox. Every output is generated from mock data in `utils/mockData.ts`.

This project does not ship, bundle, link, or reference any external software. Requests to embed "real powerful viruses" or fully functional exploit tooling are out of scope and are refused. The module registry is a static manifest of conceptual labels used for UI demonstration only.
