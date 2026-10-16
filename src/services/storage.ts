import { CalibrationRecord, CalibrationCycle } from '../types/calibration';
import { INITIAL_RECORDS, INITIAL_L106B_RECORD } from '../data/initialData';

const STORAGE_KEY = 'chemical_tank_calibrations_v1';
const HISTORY_KEY = 'chemical_tank_history_snapshots_v1';

export interface HistorySnapshot {
  id: string;
  recordId: string;
  tankName: string;
  date: string;
  timestamp: string;
  sumActualWeight: number;
  cyclesCount: number;
  updatedBy: string;
  notes?: string;
  record: CalibrationRecord;
}

export function getStoredRecords(): CalibrationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_RECORDS));
      return INITIAL_RECORDS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_RECORDS;
  } catch (err) {
    console.warn('Error reading from localStorage:', err);
    return INITIAL_RECORDS;
  }
}

export function getHistorySnapshots(): HistorySnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      // Seed initial snapshot from benchmark L106B record
      const initialSnapshot: HistorySnapshot = {
        id: `snap-initial-L106B`,
        recordId: INITIAL_L106B_RECORD.id,
        tankName: INITIAL_L106B_RECORD.tankName,
        date: INITIAL_L106B_RECORD.date,
        timestamp: new Date().toISOString(),
        sumActualWeight: calculateTotals(INITIAL_L106B_RECORD.cycles).sumActualWeight,
        cyclesCount: INITIAL_L106B_RECORD.cycles.length,
        updatedBy: INITIAL_L106B_RECORD.updatedBy || 'ระบบ (ต้นฉบับโรงงาน)',
        notes: 'ข้อมูลการสอบเทียบถัง L106B ต้นฉบับมาตรฐาน (Factory Baseline)',
        record: JSON.parse(JSON.stringify(INITIAL_L106B_RECORD)),
      };
      localStorage.setItem(HISTORY_KEY, JSON.stringify([initialSnapshot]));
      return [initialSnapshot];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn('Error reading history snapshots:', err);
    return [];
  }
}

export function saveHistorySnapshot(record: CalibrationRecord, notes?: string): HistorySnapshot[] {
  const currentSnapshots = getHistorySnapshots();
  const totals = calculateTotals(record.cycles);
  const newSnapshot: HistorySnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    recordId: record.id,
    tankName: record.tankName,
    date: record.date,
    timestamp: new Date().toISOString(),
    sumActualWeight: totals.sumActualWeight,
    cyclesCount: record.cycles.length,
    updatedBy: record.updatedBy || 'ผู้ใช้งาน',
    notes: notes || `บันทึกข้อมูลถัง ${record.tankName} เมื่อ ${new Date().toLocaleTimeString('th-TH')}`,
    record: JSON.parse(JSON.stringify(record)),
  };

  const updatedSnapshots = [newSnapshot, ...currentSnapshots];
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSnapshots));
  } catch (err) {
    console.error('Failed to save history snapshot:', err);
  }
  return updatedSnapshots;
}

export function deleteHistorySnapshot(snapshotId: string): HistorySnapshot[] {
  const currentSnapshots = getHistorySnapshots();
  const updated = currentSnapshots.filter((s) => s.id !== snapshotId);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete history snapshot:', err);
  }
  return updated;
}

export function restoreOriginalRecord(): CalibrationRecord {
  const original = JSON.parse(JSON.stringify(INITIAL_L106B_RECORD));
  saveRecordLocally(original);
  saveHistorySnapshot(original, 'กู้คืนข้อมูลต้นฉบับถัง L106B');
  return original;
}

export function saveRecordLocally(record: CalibrationRecord): CalibrationRecord[] {
  const current = getStoredRecords();
  const index = current.findIndex(
    (r) => r.id === record.id || r.tankName.trim().toUpperCase() === record.tankName.trim().toUpperCase()
  );

  let updatedList: CalibrationRecord[];
  const updatedRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    // Overwrite existing record
    updatedList = [...current];
    updatedList[index] = updatedRecord;
  } else {
    // Insert new record
    updatedList = [updatedRecord, ...current];
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    // Also save snapshot for easy retrieval
    saveHistorySnapshot(updatedRecord);
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
  return updatedList;
}

export function deleteRecordLocally(recordId: string): CalibrationRecord[] {
  const current = getStoredRecords();
  const updatedList = current.filter((r) => r.id !== recordId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (err) {
    console.error('Failed to update localStorage after delete:', err);
  }
  return updatedList;
}

export function calculateTotals(cycles: CalibrationCycle[]) {
  let sumPtBefore = 0;
  let sumIndBefore = 0;
  let sumPtAfter = 0;
  let sumIndAfter = 0;
  let sumActualWeight = 0;
  let maxCounter = 0;

  for (const c of cycles) {
    if (c.ptBefore !== null && !isNaN(c.ptBefore)) sumPtBefore += c.ptBefore;
    if (c.indBefore !== null && !isNaN(c.indBefore)) sumIndBefore += c.indBefore;
    if (c.ptAfter !== null && !isNaN(c.ptAfter)) sumPtAfter += c.ptAfter;
    if (c.indAfter !== null && !isNaN(c.indAfter)) sumIndAfter += c.indAfter;
    if (c.actualWeight !== null && !isNaN(c.actualWeight)) sumActualWeight += c.actualWeight;
    if (c.cumulativeCounter !== null && !isNaN(c.cumulativeCounter)) {
      if (c.cumulativeCounter > maxCounter) maxCounter = c.cumulativeCounter;
    }
  }

  // Find latest entered PT before load (ignoring trailing unused empty rows)
  let latestPtBefore: number | null = null;
  for (let i = cycles.length - 1; i >= 0; i--) {
    const c = cycles[i];
    if (c.ptBefore !== null && c.ptBefore !== undefined && !isNaN(c.ptBefore)) {
      // If trailing row has 0 with no actual weight or after-load data while previous rows have data, skip
      if (c.ptBefore === 0 && i > 0 && (c.actualWeight === null || c.actualWeight === 0) && c.ptAfter === null) {
        continue;
      }
      latestPtBefore = c.ptBefore;
      break;
    }
  }

  // Find latest entered Indicator before load
  let latestIndBefore: number | null = null;
  for (let i = cycles.length - 1; i >= 0; i--) {
    const c = cycles[i];
    if (c.indBefore !== null && c.indBefore !== undefined && !isNaN(c.indBefore)) {
      if (c.indBefore === 0 && i > 0 && (c.actualWeight === null || c.actualWeight === 0) && c.indAfter === null) {
        continue;
      }
      latestIndBefore = c.indBefore;
      break;
    }
  }

  // Find latest entered PT after load
  let latestPtAfter: number | null = null;
  for (let i = cycles.length - 1; i >= 0; i--) {
    const c = cycles[i];
    if (c.ptAfter !== null && c.ptAfter !== undefined && !isNaN(c.ptAfter)) {
      if (c.ptAfter === 0 && i > 0 && (c.actualWeight === null || c.actualWeight === 0)) {
        continue;
      }
      latestPtAfter = c.ptAfter;
      break;
    }
  }

  // Find latest entered Indicator after load
  let latestIndAfter: number | null = null;
  for (let i = cycles.length - 1; i >= 0; i--) {
    const c = cycles[i];
    if (c.indAfter !== null && c.indAfter !== undefined && !isNaN(c.indAfter)) {
      if (c.indAfter === 0 && i > 0 && (c.actualWeight === null || c.actualWeight === 0)) {
        continue;
      }
      latestIndAfter = c.indAfter;
      break;
    }
  }

  return {
    sumPtBefore: Number(sumPtBefore.toFixed(3)),
    latestPtBefore: latestPtBefore !== null ? Number(latestPtBefore.toFixed(3)) : null,
    sumIndBefore: Number(sumIndBefore.toFixed(2)),
    latestIndBefore: latestIndBefore !== null ? Number(latestIndBefore.toFixed(2)) : null,
    sumPtAfter: Number(sumPtAfter.toFixed(3)),
    latestPtAfter: latestPtAfter !== null ? Number(latestPtAfter.toFixed(3)) : null,
    sumIndAfter: Number(sumIndAfter.toFixed(2)),
    latestIndAfter: latestIndAfter !== null ? Number(latestIndAfter.toFixed(2)) : null,
    sumActualWeight: Number(sumActualWeight.toFixed(0)),
    maxCounter,
  };
}

export function createEmptyCycles(count = 11): CalibrationCycle[] {
  const result: CalibrationCycle[] = [];
  for (let i = 0; i < count; i++) {
    result.push({
      cycle: i,
      ptBefore: i === 0 ? 0 : null,
      indBefore: i === 0 ? 0 : null,
      ptAfter: i === 0 ? 0 : null,
      indAfter: i === 0 ? 0 : null,
      actualWeight: i === 0 ? 0 : null,
      cumulativeCounter: 0,
      remark: '',
    });
  }
  return result;
}

export function recalculateCumulativeCounters(cycles: CalibrationCycle[]): CalibrationCycle[] {
  let running = 0;
  return cycles.map((c) => {
    // Sum actual weight of all preceding rows up to current row
    if (c.actualWeight !== null && !isNaN(c.actualWeight)) {
      running += Number(c.actualWeight);
    }
    return {
      ...c,
      cumulativeCounter: Number(running.toFixed(0)),
    };
  });
}
