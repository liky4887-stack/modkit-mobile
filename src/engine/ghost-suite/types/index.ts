// LAB-ONLY: Type definitions for the Defensive Ghost Analysis Suite.

export interface DeviceProfile {
  soc: string;
  ramGB: number;
  osBuild: string;
  oemSkin: string;
  androidId: string;
  imeiPrefix: string;
}

export interface IdentityEvent {
  timestamp: number;
  userId: string;
  deviceId: string;
  ipRange: string;
  action: 'login' | 'purchase' | 'gameplay';
  label: 'benign' | 'anomalous';
}

export interface BinaryVariation {
  id: string;
  description: string;
  modification: 'nop_sled' | 'section_padding' | 'symbol_rename';
  expectedDetection: 'detected' | 'missed' | 'partial';
}

export interface IntegrityReport {
  variationId: string;
  detected: boolean;
  expected: string;
  blindSpot: boolean;
}
