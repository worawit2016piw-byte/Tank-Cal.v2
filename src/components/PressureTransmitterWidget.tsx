import React from 'react';
import { Gauge, Radio, ShieldCheck, Activity } from 'lucide-react';

import { RealisticPtGauge } from './RealisticPtGauge';

interface PressureTransmitterWidgetProps {
  tankName: string;
  ptValue: number | null;
  indValue: number | null;
  maxSpan?: number;
}

export const PressureTransmitterWidget: React.FC<PressureTransmitterWidgetProps> = ({
  tankName,
  ptValue,
  indValue,
  maxSpan = 60,
}) => {
  // Format PT value to 2 decimal places (like 10.00 in the image, or 52.35)
  const displayPt = ptValue !== null ? Number(ptValue).toFixed(2) : '0.00';
  const numericVal = ptValue !== null ? Number(ptValue) : 0;

  // Percentage for the top horizontal bar indicator (0% - 100%)
  const percentage = Math.max(0, Math.min(100, (numericVal / maxSpan) * 100));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
      {/* Background industrial pattern */}
      <div className="absolute inset-0 bg-radial from-sky-950/20 via-transparent to-transparent pointer-events-none"></div>

      {/* Left side: Information & Instrument metadata */}
      <div className="space-y-3 z-10 flex-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-500/10 border border-sky-500/30 rounded-lg text-sky-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              เครื่องส่งสัญญาณแรงดัน (Pressure Transmitter - PT)
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>เกจวัดแรงดันถัง {tankName || 'ถังเก็บสารเคมี'}</span>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE
              </span>
            </h3>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          แสดงค่าการวัดล่าสุดจากหัววัดแรงดัน <strong className="text-sky-300">PT หลังโหลด (ช่องรวม)</strong> ประจำถังสารเคมี โดยดึงค่าจากช่องรวมล่าสุดของแถว PT หลังโหลดมาแสดงผลบนหน้าจอ LCD ดิจิทัลในหน่วย <strong className="text-sky-300">Kg</strong> ตามอุปกรณ์หน้างานจริง
        </p>

        {/* Quick status metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-[10px] text-slate-400">PT หลังโหลด (ช่องรวม)</div>
            <div className="text-base font-mono font-bold text-sky-300 mt-0.5">
              {displayPt} <span className="text-xs font-normal text-slate-400">Kg</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-[10px] text-slate-400">Indicator หลังโหลด (ช่องรวม)</div>
            <div className="text-base font-mono font-bold text-emerald-300 mt-0.5">
              {indValue !== null ? Number(indValue).toFixed(2) : '-'} <span className="text-xs font-normal text-slate-400">Kg</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400">ระดับสเกล (Span)</div>
            <div className="text-base font-mono font-bold text-purple-300 mt-0.5">
              {percentage.toFixed(1)}% <span className="text-[10px] font-normal text-slate-500">of {maxSpan}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>Explosion Proof Housing • Flameproof Enclosure • IP67 Standard</span>
        </div>
      </div>

      {/* Right side: Detailed Vector Illustration of the Blue Pressure Transmitter matching image.png */}
      <div className="relative shrink-0 flex items-center justify-center p-2 z-10 w-56 sm:w-64">
        <RealisticPtGauge
          ptValue={ptValue}
          maxSpan={maxSpan}
          idPrefix="ptWidget"
          className="w-full h-auto drop-shadow-2xl select-none"
          showPill={true}
        />
      </div>
    </div>
  );
};
