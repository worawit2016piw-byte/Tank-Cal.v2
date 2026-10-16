import React, { useMemo } from 'react';
import { CalibrationCycle, CalibrationTotals } from '../types/calibration';
import { Plus, Trash2, RotateCcw, Calculator, Eraser, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface TrendDeviationInfo {
  expected: number;
  residual: number;
  deviationPercent: number;
  severity: 'normal' | 'moderate' | 'significant';
  message: string;
}

/**
 * Calculates linear regression for PT and Indicator vs ground truth cumulative counter
 * and flags points that deviate significantly from expected linear trends.
 */
export function analyzeLinearTrends(cycles: CalibrationCycle[]) {
  const ptDeviations: Record<number, TrendDeviationInfo> = {};
  const indDeviations: Record<number, TrendDeviationInfo> = {};

  // 1. PT Trend vs Cumulative Counter
  const validPt = cycles.filter(
    (c) =>
      c.cycle > 0 &&
      c.ptAfter !== null &&
      !isNaN(c.ptAfter) &&
      c.cumulativeCounter !== null &&
      !isNaN(c.cumulativeCounter)
  );

  if (validPt.length >= 2) {
    const n = validPt.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of validPt) {
      const x = p.cumulativeCounter!;
      const y = p.ptAfter!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const yValues = validPt.map((p) => p.ptAfter!);
      const range = Math.max(...yValues) - Math.min(...yValues) || 1;

      validPt.forEach((p) => {
        const expected = slope * p.cumulativeCounter! + intercept;
        const actual = p.ptAfter!;
        const residual = actual - expected;
        const absDiff = Math.abs(residual);
        const relRangeDiff = (absDiff / range) * 100;
        const relExpectedDiff = Math.abs(expected) > 0.5 ? (absDiff / Math.abs(expected)) * 100 : 0;

        let severity: 'normal' | 'moderate' | 'significant' = 'normal';
        if (relRangeDiff >= 7 || relExpectedDiff >= 25) {
          severity = 'significant';
        } else if (relRangeDiff >= 3.5 || relExpectedDiff >= 12) {
          severity = 'moderate';
        }

        ptDeviations[p.cycle] = {
          expected,
          residual,
          deviationPercent: relRangeDiff,
          severity,
          message:
            severity === 'significant'
              ? `⚠️ เบี่ยงเบนจากแนวโน้มเชิงเส้นสูง: ค่าจริง ${actual} | คาดหมาย ~${expected.toFixed(2)} (Δ ${residual >= 0 ? '+' : ''}${residual.toFixed(2)})`
              : severity === 'moderate'
              ? `⚡ คลาดเคลื่อนปานกลาง: ค่าจริง ${actual} | คาดหมาย ~${expected.toFixed(2)} (Δ ${residual >= 0 ? '+' : ''}${residual.toFixed(2)})`
              : `✓ สอดคล้องตามแนวโน้มเชิงเส้น (~${expected.toFixed(2)})`,
        };
      });
    }
  }

  // 2. Indicator Trend vs Cumulative Counter
  const validInd = cycles.filter(
    (c) =>
      c.cycle > 0 &&
      c.indAfter !== null &&
      !isNaN(c.indAfter) &&
      c.cumulativeCounter !== null &&
      !isNaN(c.cumulativeCounter)
  );

  if (validInd.length >= 2) {
    const n = validInd.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of validInd) {
      const x = p.cumulativeCounter!;
      const y = p.indAfter!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const yValues = validInd.map((p) => p.indAfter!);
      const range = Math.max(...yValues) - Math.min(...yValues) || 1;

      validInd.forEach((p) => {
        const expected = slope * p.cumulativeCounter! + intercept;
        const actual = p.indAfter!;
        const residual = actual - expected;
        const absDiff = Math.abs(residual);
        const relRangeDiff = (absDiff / range) * 100;
        const relExpectedDiff = Math.abs(expected) > 0.5 ? (absDiff / Math.abs(expected)) * 100 : 0;

        let severity: 'normal' | 'moderate' | 'significant' = 'normal';
        if (relRangeDiff >= 7 || relExpectedDiff >= 25) {
          severity = 'significant';
        } else if (relRangeDiff >= 3.5 || relExpectedDiff >= 12) {
          severity = 'moderate';
        }

        indDeviations[p.cycle] = {
          expected,
          residual,
          deviationPercent: relRangeDiff,
          severity,
          message:
            severity === 'significant'
              ? `⚠️ เบี่ยงเบนจากแนวโน้มเชิงเส้นสูง: ค่าจริง ${actual} | คาดหมาย ~${expected.toFixed(2)} (Δ ${residual >= 0 ? '+' : ''}${residual.toFixed(2)})`
              : severity === 'moderate'
              ? `⚡ คลาดเคลื่อนปานกลาง: ค่าจริง ${actual} | คาดหมาย ~${expected.toFixed(2)} (Δ ${residual >= 0 ? '+' : ''}${residual.toFixed(2)})`
              : `✓ สอดคล้องตามแนวโน้มเชิงเส้น (~${expected.toFixed(2)})`,
        };
      });
    }
  }

  return { ptDeviations, indDeviations };
}

interface CalibrationTableProps {
  cycles: CalibrationCycle[];
  totals: CalibrationTotals;
  isEditing: boolean;
  onUpdateCycle: (index: number, field: keyof CalibrationCycle, value: any) => void;
  onAddCycle: () => void;
  onRemoveCycle: (index: number) => void;
  onRecalculateCounters: () => void;
  onClearData: () => void;
}

export const CalibrationTable: React.FC<CalibrationTableProps> = ({
  cycles,
  totals,
  isEditing,
  onUpdateCycle,
  onAddCycle,
  onRemoveCycle,
  onRecalculateCounters,
  onClearData,
}) => {
  const { ptDeviations, indDeviations } = useMemo(() => analyzeLinearTrends(cycles), [cycles]);

  const significantCount = useMemo(() => {
    let count = 0;
    Object.values(ptDeviations).forEach((d) => {
      if (d.severity === 'significant') count++;
    });
    Object.values(indDeviations).forEach((d) => {
      if (d.severity === 'significant') count++;
    });
    return count;
  }, [ptDeviations, indDeviations]);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/70 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="font-semibold text-sky-400">ตารางข้อมูลการสอบเทียบ (Calibration Table)</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">{cycles.length} Cycles</span>
        </div>
        {isEditing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRecalculateCounters}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 font-medium transition cursor-pointer"
              title="คำนวณตัวนับสะสมอัตโนมัติจากน้ำหนักจริงที่โหลดมา"
            >
              <Calculator className="w-3.5 h-3.5 text-sky-400" />
              คำนวณตัวนับสะสมอัตโนมัติ
            </button>
            <button
              type="button"
              onClick={onAddCycle}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่ม Cycle
            </button>
            <button
              type="button"
              onClick={onClearData}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded font-medium transition cursor-pointer"
              title="ล้างค่าตัวเลขการวัดค่าทั้งหมดของถังนี้ เพื่อเริ่มลงข้อมูลใหม่"
            >
              <Eraser className="w-3.5 h-3.5 text-rose-400" />
              ล้างข้อมูลที่เคยลงไว้
            </button>
          </div>
        )}
      </div>

      {/* Linear Trend Deviation Legend & Notification Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-950/90 border-b border-slate-800/80 text-[11px] text-slate-300">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-slate-200">ตรวจสอบความสัมพันธ์เชิงเส้น (Linear Trend):</span>
          <span className="text-slate-400 hidden sm:inline">เปรียบเทียบค่าจริง PT / Indicator กับเส้นความชันสมดุลย์</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
            ปกติ
          </span>
          <span className="flex items-center gap-1.5 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
            คลาดเคลื่อนปานกลาง
          </span>
          <span className="flex items-center gap-1.5 text-rose-300 font-semibold">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block ring-2 ring-rose-500/40"></span>
            เบี่ยงเบนสูงผิดปกติ
          </span>
          {significantCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10.5px] font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              พบ {significantCount} จุดที่เบี่ยงเบน
            </span>
          )}
        </div>
      </div>

      {/* Responsive Table Scroll Container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-800/90 text-slate-200 border-b border-slate-700 font-semibold text-center select-none">
              <th className="py-2.5 px-3 w-16 border-r border-slate-700/60">Cycle</th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-slate-300">
                PT ก่อนโหลด
              </th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-slate-300">
                Indicator ก่อนโหลด
              </th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-sky-300 bg-sky-950/20">
                PT หลังโหลด
              </th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-sky-300 bg-sky-950/20">
                Indicator หลังโหลด
              </th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-emerald-300 bg-emerald-950/20">
                น้ำหนักจริงที่ผลิตโหลดมา
              </th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-amber-300 bg-amber-950/20">
                ตัวนับ
              </th>
              <th className="py-2.5 px-3 border-r border-slate-700/60 text-slate-400">หมายเหตุ</th>
              {isEditing && <th className="py-2.5 px-2 w-12 text-center">จัดการ</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 font-mono text-center">
            {cycles.map((row, idx) => {
              const ptInfo = ptDeviations[row.cycle];
              const indInfo = indDeviations[row.cycle];

              return (
                <tr
                  key={`cycle-${row.cycle}-${idx}`}
                  className="hover:bg-slate-800/50 transition-colors group"
                >
                  {/* Cycle Index */}
                  <td className="py-2 px-3 font-bold text-slate-300 bg-slate-950/40 border-r border-slate-800">
                    {row.cycle}
                  </td>

                  {/* PT ก่อนโหลด */}
                  <td className="py-1 px-1 border-r border-slate-800">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={row.ptBefore === null ? '' : row.ptBefore}
                        onChange={(e) =>
                          onUpdateCycle(
                            idx,
                            'ptBefore',
                            e.target.value === '' ? null : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-slate-950/60 border border-slate-700/70 rounded px-2 py-1 text-center text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono text-xs"
                      />
                    ) : (
                      <span className="text-slate-300">
                        {row.ptBefore !== null ? row.ptBefore : '-'}
                      </span>
                    )}
                  </td>

                  {/* Indicator ก่อนโหลด */}
                  <td className="py-1 px-1 border-r border-slate-800">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={row.indBefore === null ? '' : row.indBefore}
                        onChange={(e) =>
                          onUpdateCycle(
                            idx,
                            'indBefore',
                            e.target.value === '' ? null : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-slate-950/60 border border-slate-700/70 rounded px-2 py-1 text-center text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono text-xs"
                      />
                    ) : (
                      <span className="text-slate-300">
                        {row.indBefore !== null ? row.indBefore : '-'}
                      </span>
                    )}
                  </td>

                  {/* PT หลังโหลด (พร้อมระบบเตือนและไฮไลต์สีเมื่อเบี่ยงเบนจากแนวโน้มเชิงเส้น) */}
                  <td
                    className={`py-1 px-1 border-r border-slate-800 transition-colors ${
                      ptInfo?.severity === 'significant'
                        ? 'bg-rose-950/40'
                        : ptInfo?.severity === 'moderate'
                        ? 'bg-amber-950/30'
                        : 'bg-sky-950/10'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          step="any"
                          placeholder="PT หลัง"
                          title={ptInfo ? ptInfo.message : 'เมื่อใส่ค่า PT หลังโหลดนี้ จะนำไปแสดงที่ PT ก่อนโหลด ในแถวถัดไปอัตโนมัติ'}
                          value={row.ptAfter === null ? '' : row.ptAfter}
                          onChange={(e) =>
                            onUpdateCycle(
                              idx,
                              'ptAfter',
                              e.target.value === '' ? null : parseFloat(e.target.value)
                            )
                          }
                          className={`w-full rounded px-2 py-1 text-center font-mono text-xs font-medium focus:outline-none focus:ring-1 ${
                            ptInfo?.severity === 'significant'
                              ? 'bg-rose-950/80 border-2 border-rose-500 text-rose-100 placeholder-rose-400/50 focus:border-rose-400 focus:ring-rose-400 ring-1 ring-rose-500/50'
                              : ptInfo?.severity === 'moderate'
                              ? 'bg-amber-950/70 border-2 border-amber-500 text-amber-100 placeholder-amber-400/50 focus:border-amber-400 focus:ring-amber-400'
                              : 'bg-slate-950/60 border border-sky-900/60 text-sky-200 focus:border-sky-400 focus:ring-sky-400'
                          }`}
                        />
                        {ptInfo && ptInfo.severity !== 'normal' && (
                          <div
                            className={`text-[9.5px] font-sans px-1 text-center flex items-center justify-center gap-1 ${
                              ptInfo.severity === 'significant' ? 'text-rose-300 font-semibold' : 'text-amber-300 font-medium'
                            }`}
                            title={ptInfo.message}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 inline shrink-0" />
                            คาดหมาย ~{ptInfo.expected.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-0.5" title={ptInfo?.message}>
                        <div className="flex items-center gap-1">
                          <span
                            className={`font-medium ${
                              ptInfo?.severity === 'significant'
                                ? 'text-rose-200 font-bold bg-rose-900/50 border border-rose-500 px-2 py-0.5 rounded shadow-sm'
                                : ptInfo?.severity === 'moderate'
                                ? 'text-amber-200 font-semibold bg-amber-900/40 border border-amber-500/80 px-1.5 py-0.5 rounded'
                                : 'text-sky-300'
                            }`}
                          >
                            {row.ptAfter !== null ? row.ptAfter : '-'}
                          </span>
                          {ptInfo?.severity === 'significant' && (
                            <span title={ptInfo.message} className="cursor-help inline-flex">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse shrink-0" />
                            </span>
                          )}
                          {ptInfo?.severity === 'moderate' && (
                            <span title={ptInfo.message} className="cursor-help text-[10px] text-amber-400 shrink-0">
                              ⚡
                            </span>
                          )}
                        </div>
                        {ptInfo && ptInfo.severity !== 'normal' && (
                          <span
                            className={`text-[9px] mt-0.5 font-sans ${
                              ptInfo.severity === 'significant' ? 'text-rose-400 font-semibold' : 'text-amber-400'
                            }`}
                          >
                            คาดหมาย ~{ptInfo.expected.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Indicator หลังโหลด (พร้อมระบบเตือนและไฮไลต์สีเมื่อเบี่ยงเบนจากแนวโน้มเชิงเส้น) */}
                  <td
                    className={`py-1 px-1 border-r border-slate-800 transition-colors ${
                      indInfo?.severity === 'significant'
                        ? 'bg-rose-950/40'
                        : indInfo?.severity === 'moderate'
                        ? 'bg-amber-950/30'
                        : 'bg-sky-950/10'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          step="any"
                          placeholder="Ind หลัง"
                          title={indInfo ? indInfo.message : 'เมื่อใส่ค่า Indicator หลังโหลดนี้ จะนำไปแสดงที่ Indicator ก่อนโหลด ในแถวถัดไปอัตโนมัติ'}
                          value={row.indAfter === null ? '' : row.indAfter}
                          onChange={(e) =>
                            onUpdateCycle(
                              idx,
                              'indAfter',
                              e.target.value === '' ? null : parseFloat(e.target.value)
                            )
                          }
                          className={`w-full rounded px-2 py-1 text-center font-mono text-xs font-medium focus:outline-none focus:ring-1 ${
                            indInfo?.severity === 'significant'
                              ? 'bg-rose-950/80 border-2 border-rose-500 text-rose-100 placeholder-rose-400/50 focus:border-rose-400 focus:ring-rose-400 ring-1 ring-rose-500/50'
                              : indInfo?.severity === 'moderate'
                              ? 'bg-amber-950/70 border-2 border-amber-500 text-amber-100 placeholder-amber-400/50 focus:border-amber-400 focus:ring-amber-400'
                              : 'bg-slate-950/60 border border-sky-900/60 text-sky-200 focus:border-sky-400 focus:ring-sky-400'
                          }`}
                        />
                        {indInfo && indInfo.severity !== 'normal' && (
                          <div
                            className={`text-[9.5px] font-sans px-1 text-center flex items-center justify-center gap-1 ${
                              indInfo.severity === 'significant' ? 'text-rose-300 font-semibold' : 'text-amber-300 font-medium'
                            }`}
                            title={indInfo.message}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 inline shrink-0" />
                            คาดหมาย ~{indInfo.expected.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-0.5" title={indInfo?.message}>
                        <div className="flex items-center gap-1">
                          <span
                            className={`font-medium ${
                              indInfo?.severity === 'significant'
                                ? 'text-rose-200 font-bold bg-rose-900/50 border border-rose-500 px-2 py-0.5 rounded shadow-sm'
                                : indInfo?.severity === 'moderate'
                                ? 'text-amber-200 font-semibold bg-amber-900/40 border border-amber-500/80 px-1.5 py-0.5 rounded'
                                : 'text-sky-300'
                            }`}
                          >
                            {row.indAfter !== null ? row.indAfter : '-'}
                          </span>
                          {indInfo?.severity === 'significant' && (
                            <span title={indInfo.message} className="cursor-help inline-flex">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse shrink-0" />
                            </span>
                          )}
                          {indInfo?.severity === 'moderate' && (
                            <span title={indInfo.message} className="cursor-help text-[10px] text-amber-400 shrink-0">
                              ⚡
                            </span>
                          )}
                        </div>
                        {indInfo && indInfo.severity !== 'normal' && (
                          <span
                            className={`text-[9px] mt-0.5 font-sans ${
                              indInfo.severity === 'significant' ? 'text-rose-400 font-semibold' : 'text-amber-400'
                            }`}
                          >
                            คาดหมาย ~{indInfo.expected.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* น้ำหนักจริงที่ผลิตโหลดมา */}
                  <td className="py-1 px-1 border-r border-slate-800 bg-emerald-950/10">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={row.actualWeight === null ? '' : row.actualWeight}
                        onChange={(e) =>
                          onUpdateCycle(
                            idx,
                            'actualWeight',
                            e.target.value === '' ? null : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-slate-950/60 border border-emerald-900/60 rounded px-2 py-1 text-center text-emerald-300 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 font-mono text-xs font-semibold"
                      />
                    ) : (
                      <span className="text-emerald-300 font-semibold">
                        {row.actualWeight !== null ? row.actualWeight.toLocaleString() : '-'}
                      </span>
                    )}
                  </td>

                  {/* ตัวนับ */}
                  <td className="py-1 px-1 border-r border-slate-800 bg-amber-950/10">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={row.cumulativeCounter === null ? '' : row.cumulativeCounter}
                        onChange={(e) =>
                          onUpdateCycle(
                            idx,
                            'cumulativeCounter',
                            e.target.value === '' ? null : parseFloat(e.target.value)
                          )
                        }
                        className="w-full bg-slate-950/60 border border-amber-900/60 rounded px-2 py-1 text-center text-amber-300 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-mono text-xs font-bold"
                        title={`ตัวนับสะสม Cycle ${row.cycle}`}
                      />
                    ) : (
                      <span className="text-amber-300 font-bold">
                        {row.cumulativeCounter !== null ? row.cumulativeCounter.toLocaleString() : '-'}
                      </span>
                    )}
                  </td>

                  {/* หมายเหตุ */}
                  <td className="py-1 px-1 border-r border-slate-800">
                    {isEditing ? (
                      <input
                        type="text"
                        value={row.remark}
                        placeholder="หมายเหตุ..."
                        onChange={(e) => onUpdateCycle(idx, 'remark', e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-700/60 rounded px-2 py-1 text-left text-slate-300 focus:outline-none focus:border-slate-500 text-xs font-sans"
                      />
                    ) : (
                      <span className="text-slate-400 text-xs font-sans">
                        {row.remark || '-'}
                      </span>
                    )}
                  </td>

                  {/* Delete button (editing mode only) */}
                  {isEditing && (
                    <td className="py-1 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveCycle(idx)}
                        disabled={cycles.length <= 1}
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="ลบแถว Cycle นี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* Summary Row "รวม" matching the user's Excel sheet */}
          <tfoot>
            <tr className="bg-slate-950 text-slate-100 font-bold border-t-2 border-slate-700 font-mono text-center">
              <td className="py-3 px-3 bg-slate-900 text-sky-400 border-r border-slate-700 font-sans text-sm">
                รวม
              </td>
              {/* PT ก่อนโหลด - ค่าล่าสุด */}
              <td className="py-2.5 px-2 border-r border-slate-700 text-sky-300 bg-sky-950/20 font-bold">
                <div className="flex flex-col items-center">
                  <span>{totals.latestPtBefore !== null ? totals.latestPtBefore : '-'}</span>
                  <span className="text-[9.5px] text-sky-400/80 font-normal font-sans">(ค่าล่าสุด)</span>
                </div>
              </td>

              {/* Indicator ก่อนโหลด - ค่าล่าสุด */}
              <td className="py-2.5 px-2 border-r border-slate-700 text-sky-300 bg-sky-950/20 font-bold">
                <div className="flex flex-col items-center">
                  <span>{totals.latestIndBefore !== null ? totals.latestIndBefore : '-'}</span>
                  <span className="text-[9.5px] text-sky-400/80 font-normal font-sans">(ค่าล่าสุด)</span>
                </div>
              </td>

              {/* PT หลังโหลด - ค่าล่าสุด */}
              <td className="py-2.5 px-2 border-r border-slate-700 text-sky-300 bg-sky-950/30 font-bold">
                <div className="flex flex-col items-center">
                  <span>{totals.latestPtAfter !== null ? totals.latestPtAfter : '-'}</span>
                  <span className="text-[9.5px] text-sky-400/80 font-normal font-sans">(ค่าล่าสุด)</span>
                </div>
              </td>

              {/* Indicator หลังโหลด - ค่าล่าสุด */}
              <td className="py-2.5 px-2 border-r border-slate-700 text-sky-300 bg-sky-950/30 font-bold">
                <div className="flex flex-col items-center">
                  <span>{totals.latestIndAfter !== null ? totals.latestIndAfter : '-'}</span>
                  <span className="text-[9.5px] text-sky-400/80 font-normal font-sans">(ค่าล่าสุด)</span>
                </div>
              </td>

              {/* น้ำหนักจริงรวม */}
              <td className="py-2.5 px-2 border-r border-slate-700 text-emerald-300 bg-emerald-950/30 font-bold">
                <div className="flex flex-col items-center">
                  <span>{totals.sumActualWeight.toLocaleString()}</span>
                  <span className="text-[9.5px] text-emerald-400/80 font-normal font-sans">(ผลรวม)</span>
                </div>
              </td>

              {/* ตัวนับสะสม */}
              <td className="py-2.5 px-2 border-r border-slate-700 text-amber-300 bg-amber-950/30 font-bold">
                <div className="flex flex-col items-center">
                  <span>{totals.maxCounter.toLocaleString()}</span>
                  <span className="text-[9.5px] text-amber-400/80 font-normal font-sans">(ยอดสะสม)</span>
                </div>
              </td>
              <td className="py-3 px-2 border-r border-slate-700 text-slate-500 text-xs font-sans">
                {totals.sumActualWeight > 0 ? `โหลดรวม ${totals.sumActualWeight} kg` : '-'}
              </td>
              {isEditing && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
