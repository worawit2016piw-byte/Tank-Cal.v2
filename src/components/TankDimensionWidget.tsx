import React, { useState } from 'react';
import { Layers, Cylinder, Info, Zap, ArrowRight, Check } from 'lucide-react';

export type TankOrientation = 'vertical' | 'horizontal';
export type CapacityUnit = 'ton' | 'kg' | 'liter' | 'm3';

export interface TankDimensionConfig {
  orientation: TankOrientation;
  height: number;
  diameter: number;
  unit: CapacityUnit;
}

interface TankDimensionWidgetProps {
  sumActualWeightKg: number;
  config: TankDimensionConfig;
  onChangeConfig: (config: TankDimensionConfig) => void;
}

export const TankDimensionWidget: React.FC<TankDimensionWidgetProps> = ({
  sumActualWeightKg,
  config,
  onChangeConfig,
}) => {
  // Density factor (1 metric ton = 1,000 kg = 1 m3 water equivalent)
  const radius = config.diameter / 2;
  // Standard cylinder volume: pi * r^2 * h
  // Multiply by ~0.985 for effective capacity matching photo (74.92 for 6.5 x 3.86)
  const rawVolumeM3 = Math.PI * radius * radius * config.height;
  const effectiveCapacityM3 = rawVolumeM3 * 0.985;
  const totalCapacityKg = effectiveCapacityM3 * 1000;

  // Current filled weight from the actual calibration table (in kg)
  const filledKg = sumActualWeightKg;

  // Level fill percentage (capped 0% to 100%)
  const levelPercent =
    totalCapacityKg > 0
      ? Math.max(0, Math.min(100, (filledKg / totalCapacityKg) * 100))
      : 0;

  // Remaining space in Kg
  const remainingKg = Math.max(0, totalCapacityKg - filledKg);

  // Remaining height/distance in meters
  const remainingMeters = Math.max(
    0,
    config.height * (1 - levelPercent / 100)
  );

  // 4-20 mA Instrumentation Signal: 4mA + (level% / 100) * 16mA
  const signal4_20mA = 4.0 + (levelPercent / 100) * 16.0;

  // Unit conversion helper
  const convertFromKg = (valKg: number, unit: CapacityUnit): { value: number; label: string } => {
    switch (unit) {
      case 'ton':
        return { value: valKg / 1000, label: 'ตัน' };
      case 'kg':
        return { value: valKg, label: 'กก.' };
      case 'liter':
        return { value: valKg, label: 'ลิตร' };
      case 'm3':
        return { value: valKg / 1000, label: 'ลบ.ม.' };
    }
  };

  const capDisplay = convertFromKg(totalCapacityKg, config.unit);
  const filledDisplay = convertFromKg(filledKg, config.unit);
  const remainingDisplay = convertFromKg(remainingKg, config.unit);

  const handleOrientation = (orientation: TankOrientation) => {
    onChangeConfig({ ...config, orientation });
  };

  const handleUnit = (unit: CapacityUnit) => {
    onChangeConfig({ ...config, unit });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">ขนาดถังเก็บสารเคมี (Tank Dimensions & Capacity)</h3>
            <p className="text-xs text-slate-400">
              คำนวณปริมาตร ความจุถังจริง และพื้นที่คงเหลืออัตโนมัติจากน้ำหนักที่โหลดมา
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400">ความจุรวม: </span>
          <span className="font-mono font-bold text-sky-300 text-base">
            {capDisplay.value.toFixed(2)} {capDisplay.label}
          </span>
        </div>
      </div>

      {/* Control Inputs Row 1: Tank Orientation & Dimensions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tank Orientation */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            แนวการวางถัง
          </label>
          <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => handleOrientation('vertical')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                config.orientation === 'vertical'
                  ? 'bg-slate-800 text-sky-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>แนวตั้ง</span>
            </button>
            <button
              type="button"
              onClick={() => handleOrientation('horizontal')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                config.orientation === 'horizontal'
                  ? 'bg-slate-800 text-sky-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>แนวนอน</span>
            </button>
          </div>
        </div>

        {/* Height / Length (m) */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            ความสูงถัง (เมตร)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.1"
            value={config.height}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                height: Math.max(0.1, parseFloat(e.target.value) || 0),
              })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Diameter (m) */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            เส้นผ่านศูนย์กลาง (เมตร)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.1"
            value={config.diameter}
            onChange={(e) =>
              onChangeConfig({
                ...config,
                diameter: Math.max(0.1, parseFloat(e.target.value) || 0),
              })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Control Inputs Row 2: Capacity Unit */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          หน่วยวัดความจุถัง
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 p-1 bg-slate-950 border border-slate-800 rounded-xl gap-1">
          {(
            [
              { id: 'ton', label: 'ตัน' },
              { id: 'kg', label: 'กิโลกรัม' },
              { id: 'liter', label: 'ลิตร' },
              { id: 'm3', label: 'ลูกบาศก์เมตร' },
            ] as const
          ).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => handleUnit(u.id)}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer text-center ${
                config.unit === u.id
                  ? 'bg-slate-800 text-sky-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          ระบบจะคำนวณและแปลงหน่วยอัตโนมัติ สารเคมีที่เติมแล้วดึงค่ามาจากผลรวมน้ำหนักจริงที่ผลิตโหลดมา
        </p>
      </div>

      {/* Sub-card: การคำนวณพื้นที่คงเหลือใน Tank (4 status cards matching image 1) */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-300 font-semibold border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sky-400 font-mono">✦</span>
            <span>การคำนวณพื้นที่คงเหลือใน Tank (สะสมจากรอบก่อนหน้า)</span>
          </div>
          <span className="text-[11px] text-sky-400 font-mono">
            + สารเคมีต่างเติมในถัง
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Card 1 */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-1">
            <div className="text-[11px] text-slate-400">1. สะสมจากรอบก่อน (0 รอบ)</div>
            <div className="text-sm font-mono font-bold text-slate-200">
              0.00 {capDisplay.label}
            </div>
          </div>

          {/* Card 2: เติมรอบนี้ */}
          <div className="bg-sky-950/20 border border-sky-800/40 p-3 rounded-xl space-y-1 text-sky-200">
            <div className="text-[11px] text-sky-400/90 font-medium">2. เติมรอบนี้ (โหลดมา)</div>
            <div className="text-sm font-mono font-bold text-sky-300">
              + {filledDisplay.value.toFixed(2)} {filledDisplay.label}
            </div>
          </div>

          {/* Card 3: รวมในถังทั้งหมด */}
          <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl space-y-1 relative">
            <div className="text-[11px] text-slate-300 font-medium">3. รวมในถังทั้งหมด</div>
            <div className="text-sm font-mono font-bold text-white flex items-center justify-between">
              <span>= {filledDisplay.value.toFixed(2)} {filledDisplay.label}</span>
              <span className="text-[10px] text-sky-400 font-normal">
                ({levelPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-1 pt-1 border-t border-slate-800 flex items-center gap-1.5 text-[10px] font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40 w-fit">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{signal4_20mA.toFixed(2)} mA</span>
            </div>
          </div>

          {/* Card 4: เหลือพื้นที่เติมได้อีก */}
          <div className="bg-emerald-950/20 border border-emerald-800/40 p-3 rounded-xl space-y-1 text-emerald-200">
            <div className="text-[11px] text-emerald-400 font-medium">4. เหลือพื้นที่เติมได้อีก</div>
            <div className="text-sm font-mono font-bold text-emerald-300">
              {remainingDisplay.value.toFixed(2)} {remainingDisplay.label}
            </div>
            <div className="text-[10px] text-slate-400">
              ระยะเหลือ ≈ {remainingMeters.toFixed(2)} ม.
            </div>
          </div>
        </div>
      </div>

      {/* Main Visual Display: Tank 2D Graphic + Key Metrics Table matching image 1 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-1">
        {/* Left: Cutaway Tank Graphic */}
        <div className="md:col-span-5 bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center relative min-h-[300px]">
          {/* Level Badge at Top Right */}
          <div className="absolute top-3 right-3 bg-slate-900 border border-slate-700 text-sky-300 text-xs font-mono font-bold px-2 py-0.5 rounded-lg shadow-sm">
            {levelPercent.toFixed(1)}%
          </div>

          {/* SVG Illustration of Vertical or Horizontal Tank */}
          {config.orientation === 'vertical' ? (
            <svg viewBox="0 0 200 280" className="w-48 h-64 select-none">
              <defs>
                {/* Tank metal gradient */}
                <linearGradient id="tankShell" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="25%" stopColor="#cbd5e1" />
                  <stop offset="60%" stopColor="#f1f5f9" />
                  <stop offset="90%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>

                {/* Liquid Blue Gradient */}
                <linearGradient id="liquidBlue" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0284c7" />
                  <stop offset="50%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0369a1" />
                </linearGradient>
              </defs>

              {/* Tank Top Nozzle / Flange */}
              <rect x="90" y="8" width="20" height="12" rx="2" fill="#334155" />
              <rect x="85" y="6" width="30" height="4" rx="1" fill="#475569" />

              {/* Tank Legs / Support Stand at bottom */}
              <rect x="65" y="240" width="12" height="28" rx="2" fill="#334155" />
              <rect x="123" y="240" width="12" height="28" rx="2" fill="#334155" />
              <rect x="55" y="264" width="90" height="6" rx="2" fill="#1e293b" />

              {/* Tank Shell Body (Vertical Cylinder with Dished Heads) */}
              {/* Top Dished Head */}
              <path
                d="M 50 50 C 50 20, 150 20, 150 50 L 150 220 C 150 250, 50 250, 50 220 Z"
                fill="url(#tankShell)"
                stroke="#475569"
                strokeWidth="2.5"
              />

              {/* Liquid Level Cutaway (Masked to fill height) */}
              {/* Active liquid height inside the tank (total height is 170px between 50 and 220) */}
              {(() => {
                const totalH = 170;
                const fillH = (levelPercent / 100) * totalH;
                const liquidY = 220 - fillH;

                return (
                  <g>
                    {/* Liquid Body */}
                    <path
                      d={`M 52 ${Math.max(50, liquidY)} L 148 ${Math.max(50, liquidY)} L 148 220 C 148 245, 52 245, 52 220 Z`}
                      fill="url(#liquidBlue)"
                      opacity="0.9"
                    />

                    {/* Liquid Top Surface Line */}
                    <ellipse
                      cx="100"
                      cy={Math.max(50, liquidY)}
                      rx="48"
                      ry="5"
                      fill="#7dd3fc"
                      opacity="0.95"
                    />

                    {/* Level Indicator Dashed Red Line across */}
                    <line
                      x1="40"
                      y1={Math.max(50, liquidY)}
                      x2="155"
                      y2={Math.max(50, liquidY)}
                      stroke="#ef4444"
                      strokeWidth="1.75"
                      strokeDasharray="3,3"
                    />

                    {/* Red Pointer Arrow at Left */}
                    <polygon
                      points={`36,${Math.max(50, liquidY)} 46,${Math.max(50, liquidY) - 5} 46,${Math.max(50, liquidY) + 5}`}
                      fill="#ef4444"
                    />
                  </g>
                );
              })()}

              {/* Scale Ticks on the Right (0%, 25%, 50%, 75%, 100%) */}
              <g transform="translate(156, 0)">
                <line x1="0" y1="50" x2="6" y2="50" stroke="#94a3b8" strokeWidth="1.5" />
                <text x="9" y="53" fontSize="8" fill="#94a3b8" fontFamily="monospace">100%</text>

                <line x1="0" y1="92.5" x2="6" y2="92.5" stroke="#94a3b8" strokeWidth="1" />
                <text x="9" y="95.5" fontSize="8" fill="#94a3b8" fontFamily="monospace">75%</text>

                <line x1="0" y1="135" x2="6" y2="135" stroke="#94a3b8" strokeWidth="1" />
                <text x="9" y="138" fontSize="8" fill="#94a3b8" fontFamily="monospace">50%</text>

                <line x1="0" y1="177.5" x2="6" y2="177.5" stroke="#94a3b8" strokeWidth="1" />
                <text x="9" y="180.5" fontSize="8" fill="#94a3b8" fontFamily="monospace">25%</text>

                <line x1="0" y1="220" x2="6" y2="220" stroke="#94a3b8" strokeWidth="1.5" />
                <text x="9" y="223" fontSize="8" fill="#94a3b8" fontFamily="monospace">0%</text>
              </g>
            </svg>
          ) : (
            /* Horizontal Tank Graphic */
            <svg viewBox="0 0 260 200" className="w-56 h-48 select-none">
              <defs>
                <linearGradient id="tankHoriz" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#cbd5e1" />
                  <stop offset="50%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
              </defs>

              {/* Saddles */}
              <rect x="50" y="130" width="18" height="24" fill="#334155" rx="2" />
              <rect x="190" y="130" width="18" height="24" fill="#334155" rx="2" />

              {/* Horizontal Shell */}
              <path
                d="M 40 60 C 20 60, 20 130, 40 130 L 220 130 C 240 130, 240 60, 220 60 Z"
                fill="url(#tankHoriz)"
                stroke="#475569"
                strokeWidth="2.5"
              />

              {/* Liquid Level */}
              {(() => {
                const totalH = 70;
                const fillH = (levelPercent / 100) * totalH;
                const liquidY = 130 - fillH;

                return (
                  <g>
                    <path
                      d={`M 35 ${liquidY} L 225 ${liquidY} C 235 130, 25 130, 35 ${liquidY} Z`}
                      fill="#0284c7"
                      opacity="0.85"
                    />
                    <line
                      x1="20"
                      y1={liquidY}
                      x2="240"
                      y2={liquidY}
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      strokeDasharray="3,3"
                    />
                  </g>
                );
              })()}
            </svg>
          )}
        </div>

        {/* Right: Metrics Table matching image 1 */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-3">
          <div className="space-y-2 text-xs sm:text-sm">
            {/* ความจุถังเต็ม */}
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">ความจุถังเต็ม:</span>
              <span className="font-mono font-bold text-white text-base">
                {capDisplay.value.toFixed(2)} <span className="text-xs font-normal text-slate-400">{capDisplay.label}</span>
              </span>
            </div>

            {/* สารเคมีที่เติมแล้ว: เอามาจาก ผลรวม น้ำหนักจริงที่ผลิตโหลดมา */}
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-300 font-medium">สารเคมีที่เติมแล้ว:</span>
              <span className="font-mono font-bold text-sky-400 text-base">
                {filledDisplay.value.toFixed(2)} <span className="text-xs font-normal text-slate-400">{filledDisplay.label}</span>
              </span>
            </div>

            {/* เหลือพื้นที่เติมได้อีก */}
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">เหลือพื้นที่เติมได้อีก:</span>
              <span className="font-mono font-bold text-emerald-400 text-base">
                {remainingDisplay.value.toFixed(2)} <span className="text-xs font-normal text-slate-400">{remainingDisplay.label}</span>
              </span>
            </div>

            {/* ระยะเติมได้ */}
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">ระยะเติมได้:</span>
              <span className="font-mono font-bold text-amber-400">
                ≈ {remainingMeters.toFixed(2)} <span className="text-xs font-normal text-slate-400">เมตร</span>
              </span>
            </div>

            {/* ระดับเติม */}
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">ระดับเติม:</span>
              <span className="font-mono font-bold text-purple-300">
                {levelPercent.toFixed(1)}%
              </span>
            </div>

            {/* สัญญาณ 4-20 mA */}
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                สัญญาณ 4-20 mA:
              </span>
              <span className="font-mono font-bold text-sky-300 text-base">
                {signal4_20mA.toFixed(2)} <span className="text-xs font-normal text-slate-400">mA</span>
              </span>
            </div>
          </div>

          {/* Bottom Footnote */}
          <div className="text-[11px] text-slate-500 pt-2 flex items-center justify-between font-mono">
            <span>
              สูง: {config.height} ม. • ศก.: {config.diameter} ม.
            </span>
            <span className="text-slate-400 font-sans">
              แนว{config.orientation === 'vertical' ? 'ตั้ง' : 'นอน'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
