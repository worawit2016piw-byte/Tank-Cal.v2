import React, { useState } from 'react';
import { Activity, ShieldCheck, Zap, Radio, Bell } from 'lucide-react';

interface PrimusIndicatorWidgetProps {
  tankName: string;
  indValue: number | null; // Value from Indicator ช่องรวม (e.g. 54.93)
  ptValue?: number | null;
  maxSpan?: number;
}

// 7-segment display segment mapping
// Segments: a (top), b (top-right), c (bottom-right), d (bottom), e (bottom-left), f (top-left), g (middle)
const SEGMENTS_MAP: Record<string, string[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
  ' ': [],
};

// SVG 7-segment digit component
const SevenSegmentDigit: React.FC<{
  char: string;
  hasDot: boolean;
  isLit?: boolean;
}> = ({ char, hasDot, isLit = true }) => {
  const activeSegments = SEGMENTS_MAP[char] || [];

  return (
    <svg viewBox="0 0 54 84" className="w-10 h-16 sm:w-12 sm:h-20 select-none">
      <defs>
        {/* Glow filter for lit LED segments */}
        <filter id="ledGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Segment Definitions with slanted LED style */}
      <g transform="skewX(-5) translate(4, 0)">
        {/* a: Top */}
        <polygon
          points="8,4 38,4 34,11 12,11"
          fill={isLit && activeSegments.includes('a') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('a') ? 'url(#ledGlow)' : undefined}
        />
        {/* b: Top-Right */}
        <polygon
          points="39,5 44,10 39,40 33,35 37,11"
          fill={isLit && activeSegments.includes('b') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('b') ? 'url(#ledGlow)' : undefined}
        />
        {/* c: Bottom-Right */}
        <polygon
          points="39,43 44,48 39,78 33,72 37,48"
          fill={isLit && activeSegments.includes('c') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('c') ? 'url(#ledGlow)' : undefined}
        />
        {/* d: Bottom */}
        <polygon
          points="8,79 38,79 34,72 12,72"
          fill={isLit && activeSegments.includes('d') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('d') ? 'url(#ledGlow)' : undefined}
        />
        {/* e: Bottom-Left */}
        <polygon
          points="7,43 13,48 9,72 3,78 7,48"
          fill={isLit && activeSegments.includes('e') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('e') ? 'url(#ledGlow)' : undefined}
        />
        {/* f: Top-Left */}
        <polygon
          points="7,5 13,10 9,35 3,40 7,11"
          fill={isLit && activeSegments.includes('f') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('f') ? 'url(#ledGlow)' : undefined}
        />
        {/* g: Middle */}
        <polygon
          points="9,41 13,38 33,38 37,41 33,44 13,44"
          fill={isLit && activeSegments.includes('g') ? '#ffffff' : '#222831'}
          filter={isLit && activeSegments.includes('g') ? 'url(#ledGlow)' : undefined}
        />
        {/* dp: Decimal point dot */}
        <circle
          cx="46"
          cy="77"
          r="3.5"
          fill={hasDot ? '#ffffff' : '#222831'}
          filter={hasDot ? 'url(#ledGlow)' : undefined}
        />
      </g>
    </svg>
  );
};

export const PrimusIndicatorWidget: React.FC<PrimusIndicatorWidgetProps> = ({
  tankName,
  indValue,
  ptValue,
  maxSpan = 60,
}) => {
  const [selectedUnit, setSelectedUnit] = useState<'C' | 'F' | 'Pk'>('C');
  const [isAlarmed, setIsAlarmed] = useState<boolean>(false);

  // Format indicator value from ช่องรวม (e.g. 54.93 or 54.9)
  // Format to standard 4-digit display matching Primus TIM-94N hardware meter
  let displayStr = '0.0';
  if (indValue !== null && !isNaN(indValue)) {
    // If value has decimals, format with 1 or 2 decimals
    const num = Number(indValue);
    if (num >= 100) {
      displayStr = num.toFixed(1);
    } else if (num >= 10) {
      displayStr = num.toFixed(2); // e.g. "54.93"
    } else {
      displayStr = num.toFixed(2); // e.g. "0.50"
    }
  }

  // Parse formatted string into digits and decimal points
  // Target 4 display slots: [slot 0, slot 1, slot 2, slot 3]
  interface DigitSlot {
    char: string;
    hasDot: boolean;
    isDim: boolean;
  }

  const slots: DigitSlot[] = [];
  const parts = displayStr.split('.');
  const intPart = parts[0];
  const decPart = parts[1] || '';

  // Combine into a list of characters with dot flags
  const fullChars: { char: string; hasDot: boolean }[] = [];
  for (let i = 0; i < intPart.length; i++) {
    fullChars.push({
      char: intPart[i],
      hasDot: i === intPart.length - 1 && parts.length > 1,
    });
  }
  for (let j = 0; j < decPart.length; j++) {
    fullChars.push({
      char: decPart[j],
      hasDot: false,
    });
  }

  // Pad to 4 slots with leading dim/ghost 8's (like image.png where 57.8 had leading two 8's dim)
  const totalSlots = 4;
  const paddingNeeded = Math.max(0, totalSlots - fullChars.length);
  for (let p = 0; p < paddingNeeded; p++) {
    slots.push({
      char: '8',
      hasDot: false,
      isDim: true,
    });
  }
  for (const fc of fullChars.slice(0, totalSlots - paddingNeeded)) {
    slots.push({
      char: fc.char,
      hasDot: fc.hasDot,
      isDim: false,
    });
  }

  // Numeric value for metrics
  const numericInd = indValue !== null ? Number(indValue) : 0;
  const percentage = Math.max(0, Math.min(100, (numericInd / maxSpan) * 100));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
      {/* Radial green glow */}
      <div className="absolute inset-0 bg-radial from-emerald-950/20 via-transparent to-transparent pointer-events-none"></div>

      {/* Left Column: Metadata & Status */}
      <div className="space-y-3 z-10 flex-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              ดิจิตอลอินดิเคเตอร์หน้างาน (Digital Indicator Panel Meter)
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>PRIMUS TIM-94N • ถัง {tankName || 'L106B'}</span>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ONLINE
              </span>
            </h3>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          ดึงค่าจาก <strong className="text-emerald-300">Indicator หลังโหลด (ช่องรวม)</strong> ของตารางสอบเทียบมาแสดงผลบนจอ LED 7-Segment ดิจิทัลความแม่นยำสูง (โมเดล <strong className="text-white">PRIMUS TIM-94N</strong> ตามรูปอุปกรณ์จริงหน้างาน)
        </p>

        {/* Quick status metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-[10px] text-slate-400">Indicator หลังโหลด (ช่องรวม)</div>
            <div className="text-base font-mono font-bold text-emerald-300 mt-0.5">
              {indValue !== null ? Number(indValue).toFixed(2) : '0.00'}{' '}
              <span className="text-xs font-normal text-slate-400">ค่ารวม</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
            <div className="text-[10px] text-slate-400">PT หลังโหลด (ช่องรวม)</div>
            <div className="text-base font-mono font-bold text-sky-300 mt-0.5">
              {ptValue !== null && ptValue !== undefined ? Number(ptValue).toFixed(2) : '-'}{' '}
              <span className="text-xs font-normal text-slate-400">Kg</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400">ระดับสเกล (Span)</div>
            <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">
              {percentage.toFixed(1)}% <span className="text-[10px] font-normal text-slate-500">of {maxSpan}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Universal Input (4-20mA / 0-10V) • 3 Alarm Relays • RS-485 Modbus RTU</span>
        </div>
      </div>

      {/* Right Column: Physical PRIMUS TIM-94N Panel Meter Graphic matching image 1 */}
      <div className="z-10 shrink-0">
        <div
          className="relative bg-[#1e232a] border-4 border-[#121519] rounded-xl p-3 sm:p-4 shadow-2xl select-none"
          style={{
            boxShadow:
              'inset 0 2px 4px rgba(255,255,255,0.1), 0 20px 30px -10px rgba(0,0,0,0.8), 0 0 15px rgba(16,185,129,0.15)',
            width: '320px',
            maxWidth: '100%',
          }}
        >
          {/* Bezel Screws / Texture */}
          <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-slate-700/80 border border-slate-600"></div>
          <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-700/80 border border-slate-600"></div>
          <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-slate-700/80 border border-slate-600"></div>
          <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-700/80 border border-slate-600"></div>

          {/* Green accent curved borders matching Primus signature casing in image 1 */}
          <div className="absolute left-1 top-4 bottom-4 w-1.5 rounded-full bg-gradient-to-b from-transparent via-[#22c55e] to-transparent shadow-[0_0_8px_#22c55e]"></div>
          <div className="absolute right-1 top-4 bottom-4 w-1.5 rounded-full bg-gradient-to-b from-transparent via-[#22c55e] to-transparent shadow-[0_0_8px_#22c55e]"></div>

          {/* Top Header Row of Meter */}
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            {/* PRIMUS Logo matching image 1 */}
            <div className="flex flex-col items-start leading-none">
              <div className="text-white font-serif font-black italic text-sm tracking-tighter flex items-center gap-0.5">
                <span className="text-base">P</span>
                <span className="text-xs border-b border-white pb-0.5">m</span>
              </div>
              <div className="text-[7.5px] font-sans font-bold text-white tracking-widest mt-0.5">
                PRIMUS
              </div>
            </div>

            {/* Model Name */}
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-white tracking-wider">
                TIM-94N
              </span>
            </div>
          </div>

          {/* Smoked Acrylic Display Bezel */}
          <div className="relative bg-[#0a0d10] border border-slate-800 rounded-lg p-2.5 shadow-inner">
            {/* Subtle glass reflection highlight */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/8 to-transparent pointer-events-none rounded-t-lg"></div>

            <div className="flex items-center justify-between">
              {/* 4 Seven-Segment LED Digits */}
              <div className="flex items-center justify-center gap-1 flex-1 py-1">
                {slots.map((s, idx) => (
                  <SevenSegmentDigit
                    key={idx}
                    char={s.char}
                    hasDot={s.hasDot}
                    isLit={!s.isDim}
                  />
                ))}
              </div>

              {/* Status Units on the right: °C, °F, Pk from image 1 */}
              <div className="flex flex-col items-center justify-around h-16 text-[9.5px] font-sans font-semibold text-slate-500 pl-2 border-l border-slate-800/80">
                <span
                  className={`transition ${
                    selectedUnit === 'C' ? 'text-white font-bold drop-shadow-[0_0_4px_white]' : 'text-slate-600'
                  }`}
                >
                  °C
                </span>
                <span
                  className={`transition ${
                    selectedUnit === 'F' ? 'text-white font-bold drop-shadow-[0_0_4px_white]' : 'text-slate-600'
                  }`}
                >
                  °F
                </span>
                <span
                  className={`transition ${
                    selectedUnit === 'Pk' ? 'text-amber-400 font-bold drop-shadow-[0_0_4px_orange]' : 'text-slate-600'
                  }`}
                >
                  Pk
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Control & Status Panel matching image 1 */}
          <div className="mt-3 px-1.5 flex items-center justify-between text-[8px] font-mono font-bold text-slate-400">
            {/* Alarm Status LEDs */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]"></span>
                <span className="text-[7.5px] text-slate-400">COM.</span>
              </div>
              <div className="flex items-center gap-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    percentage > 85
                      ? 'bg-rose-500 shadow-[0_0_4px_#ef4444]'
                      : 'bg-slate-700'
                  }`}
                ></span>
                <span className="text-[7.5px] text-slate-400">AL1</span>
              </div>
              <div className="flex items-center gap-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    percentage > 95
                      ? 'bg-amber-500 shadow-[0_0_4px_#f59e0b]'
                      : 'bg-slate-700'
                  }`}
                ></span>
                <span className="text-[7.5px] text-slate-400">AL2</span>
              </div>
              <div className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                <span className="text-[7.5px] text-slate-400">AL3</span>
              </div>
            </div>

            {/* Tactile Push Buttons: F, C, V, ^ from image 1 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedUnit(selectedUnit === 'C' ? 'F' : 'C')}
                className="w-5 h-5 rounded-full bg-[#15191f] border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center active:scale-90 transition shadow"
                title="Function (F)"
              >
                F
              </button>
              <button
                type="button"
                onClick={() => setSelectedUnit('Pk')}
                className="w-5 h-5 rounded-full bg-[#15191f] border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center active:scale-90 transition shadow"
                title="Clear / Calibrate (C)"
              >
                C
              </button>
              <button
                type="button"
                className="w-5 h-5 rounded-full bg-[#15191f] border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center active:scale-90 transition shadow text-[9px]"
                title="Down"
              >
                ▼
              </button>
              <button
                type="button"
                className="w-5 h-5 rounded-full bg-[#15191f] border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center active:scale-90 transition shadow text-[9px]"
                title="Up"
              >
                ▲
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
