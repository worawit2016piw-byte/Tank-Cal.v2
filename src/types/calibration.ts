export interface CalibrationCycle {
  cycle: number;
  ptBefore: number | null;
  indBefore: number | null;
  ptAfter: number | null;
  indAfter: number | null;
  actualWeight: number | null;
  cumulativeCounter: number | null;
  remark: string;
}

export interface CalibrationRecord {
  id: string;
  tankName: string;
  date: string;
  cycles: CalibrationCycle[];
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  folderId?: string;
  updatedAt: string;
  updatedBy?: string;
  lastNotifiedAt?: string;
  notificationEmail: string;
  notes?: string;
}

export interface CalibrationTotals {
  sumPtBefore: number;
  latestPtBefore: number | null;
  sumIndBefore: number;
  latestIndBefore: number | null;
  sumPtAfter: number;
  latestPtAfter: number | null;
  sumIndAfter: number;
  latestIndAfter: number | null;
  sumActualWeight: number;
  maxCounter: number;
}

export type TankOrientation = 'vertical' | 'horizontal';
export type CapacityUnit = 'ton' | 'kg' | 'liter' | 'm3';

export interface TankDimensionConfig {
  orientation: TankOrientation;
  height: number;
  diameter: number;
  unit: CapacityUnit;
  density?: number;
}
