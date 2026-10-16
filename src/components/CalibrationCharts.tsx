import React, { useState } from 'react';
import { CalibrationCycle } from '../types/calibration';
import { TrendingUp, Maximize2, Activity } from 'lucide-react';

interface CalibrationChartsProps {
  cycles: CalibrationCycle[];
  tankName: string;
}

interface Point {
  x: number;
  y: number;
  cycle: number;
  indAfter?: number | null;
  ptAfter?: number | null;
}

export const CalibrationCharts: React.FC<CalibrationChartsProps> = ({ cycles, tankName }) => {
  const [secondChartMode, setSecondChartMode] = useState<'cycle' | 'pt'>('pt');
  const [hoveredPoint, setHoveredPoint] = useState<{
    chartType: 'indicator' | 'pt' | 'cycle';
    point: Point;
  } | null>(null);

  // Filter valid data points for Indicator หลังโหลด vs น้ำหนักจริง/ตัวนับ (แก้ไขกลับคืนเหมือนค่าก่อนหน้า: x = indAfter)
  const indicatorPoints: Point[] = cycles
    .filter(
      (c) =>
        c.indAfter !== null &&
        !isNaN(c.indAfter) &&
        c.cumulativeCounter !== null &&
        !isNaN(c.cumulativeCounter)
    )
    .map((c) => ({
      x: Number(c.indAfter),
      y: Number(c.cumulativeCounter),
      cycle: c.cycle,
      indAfter: c.indAfter,
      ptAfter: c.ptAfter,
    }))
    .sort((a, b) => a.x - b.x);

  // Filter valid data points for รอบ ของ Cycle 1-10 vs น้ำหนักจริง/ตัวนับ
  const cyclePoints: Point[] = cycles
    .filter(
      (c) =>
        c.cycle >= 0 &&
        c.cycle <= 10 &&
        c.cumulativeCounter !== null &&
        !isNaN(c.cumulativeCounter) &&
        (c.cycle === 0 || (c.actualWeight !== null && c.actualWeight > 0) || c.ptAfter !== null || c.indAfter !== null)
    )
    .map((c) => ({
      x: Number(c.cycle),
      y: Number(c.cumulativeCounter),
      cycle: c.cycle,
      indAfter: c.indAfter,
      ptAfter: c.ptAfter,
    }))
    .sort((a, b) => a.x - b.x);

  // Filter valid data points for PT หลังโหลด vs น้ำหนักจริง/ตัวนับ (แก้ไขกลับคืนเหมือนค่าก่อนหน้า: x = ptAfter)
  const ptPoints: Point[] = cycles
    .filter(
      (c) =>
        c.ptAfter !== null &&
        !isNaN(c.ptAfter) &&
        c.cumulativeCounter !== null &&
        !isNaN(c.cumulativeCounter)
    )
    .map((c) => ({
      x: Number(c.ptAfter),
      y: Number(c.cumulativeCounter),
      cycle: c.cycle,
      indAfter: c.indAfter,
      ptAfter: c.ptAfter,
    }))
    .sort((a, b) => a.x - b.x);

  // Calculate Linear Regression Trendline (y = m * x + c)
  const calculateRegression = (pts: Point[]) => {
    if (pts.length < 2) return null;
    const n = pts.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R² (coefficient of determination)
    const ssTot = sumY2 - (sumY * sumY) / n;
    const ssRes = pts.reduce((acc, p) => {
      const pred = slope * p.x + intercept;
      return acc + Math.pow(p.y - pred, 2);
    }, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

    return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
  };

  const renderSingleChart = (
    title: string,
    points: Point[],
    chartType: 'indicator' | 'pt' | 'cycle',
    xTitle: string,
    yTitle: string,
    yStep: number = 6000,
    yMaxDefault: number = 54000
  ) => {
    // Chart Canvas dimensions
    const width = 560;
    const height = 400;
    const padLeft = 65;
    const padRight = 35;
    const padTop = 50;
    const padBottom = 55;

    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    // Determine domain:
    let xMax: number;
    let xTicks: number[];

    if (chartType === 'cycle') {
      xMax = 10;
      xTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    } else {
      // แก้ไขกลับคืนเหมือนค่าก่อนหน้า: สเกล 0 10 20 30 40 50 60 ตามค่าเซนเซอร์
      const maxXVal = Math.max(60, ...(points.map((p) => p.x).filter(Number.isFinite) || [60]));
      xMax = Math.ceil(maxXVal / 10) * 10 || 60;
      xTicks = [];
      for (let v = 0; v <= xMax; v += 10) {
        xTicks.push(v);
      }
    }

    const maxYVal = Math.max(yMaxDefault, ...(points.map((p) => p.y).filter(Number.isFinite) || [yMaxDefault]));
    const yMax = Math.ceil(maxYVal / yStep) * yStep || yMaxDefault;

    // Coordinate conversions
    const scaleX = (x: number) => padLeft + (x / xMax) * plotWidth;
    const scaleY = (y: number) => padTop + plotHeight - (y / yMax) * plotHeight;

    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yStep) {
      yTicks.push(v);
    }

    // Path string for data line
    const pathD =
      points.length > 0
        ? points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`)
            .join(' ')
        : '';

    // Linear Trendline
    const reg = calculateRegression(points);
    let trendPathD = '';
    if (reg && points.length > 1) {
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const yAtMin = reg.slope * minX + reg.intercept;
      const yAtMax = reg.slope * maxX + reg.intercept;
      trendPathD = `M ${scaleX(minX)} ${scaleY(yAtMin)} L ${scaleX(maxX)} ${scaleY(yAtMax)}`;
    }

    return (
      <div className="bg-[#242b35] border border-slate-700/80 rounded-xl p-4 shadow-xl flex flex-col relative overflow-hidden">
        {/* Chart Header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-100 tracking-wide">
              {title}
            </h3>
          </div>
          {reg && (
            <div className="text-[11px] font-mono text-sky-300/90 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded">
              R² = {reg.r2.toFixed(4)} | m = {reg.slope.toFixed(2)}
            </div>
          )}
        </div>

        {/* SVG Visualization */}
        <div className="relative w-full aspect-[14/10] bg-[#1a202c] rounded-lg border border-slate-800 overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full select-none"
          >
            {/* Background Grid Lines */}
            {/* Horizontal Grid */}
            {yTicks.map((val) => (
              <g key={`y-grid-${val}`}>
                <line
                  x1={padLeft}
                  y1={scaleY(val)}
                  x2={width - padRight}
                  y2={scaleY(val)}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray={val === 0 ? 'none' : '2,2'}
                  opacity={val === 0 ? 0.9 : 0.45}
                />
                <text
                  x={padLeft - 8}
                  y={scaleY(val) + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {val.toLocaleString()}
                </text>
              </g>
            ))}

            {/* Vertical Grid */}
            {xTicks.map((val) => (
              <g key={`x-grid-${val}`}>
                <line
                  x1={scaleX(val)}
                  y1={padTop}
                  x2={scaleX(val)}
                  y2={height - padBottom}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray={val === 0 ? 'none' : '2,2'}
                  opacity={val === 0 ? 0.9 : 0.45}
                />
                <text
                  x={scaleX(val)}
                  y={height - padBottom + 18}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            ))}

            {/* Axes Lines */}
            <line
              x1={padLeft}
              y1={height - padBottom}
              x2={width - padRight}
              y2={height - padBottom}
              stroke="#64748b"
              strokeWidth="1.5"
            />
            <line
              x1={padLeft}
              y1={padTop}
              x2={padLeft}
              y2={height - padBottom}
              stroke="#64748b"
              strokeWidth="1.5"
            />

            {/* Axis Titles */}
            <text
              x={padLeft + plotWidth / 2}
              y={height - 12}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="12"
              fontWeight="600"
              letterSpacing="0.5"
            >
              {xTitle}
            </text>
            <text
              transform={`rotate(-90)`}
              x={-(padTop + plotHeight / 2)}
              y={16}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="12"
              fontWeight="600"
              letterSpacing="0.5"
            >
              {yTitle}
            </text>

            {/* Linear Trendline (Dashed) */}
            {trendPathD && (
              <path
                d={trendPathD}
                stroke="#60a5fa"
                strokeWidth="1.75"
                strokeDasharray="6,4"
                opacity="0.8"
                fill="none"
              />
            )}

            {/* Data Line (Solid Light Blue) */}
            {pathD && (
              <path
                d={pathD}
                stroke="#38bdf8"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points and Callout Labels */}
            {points.map((p, idx) => {
              const cx = scaleX(p.x);
              const cy = scaleY(p.y);
              const isHovered =
                hoveredPoint?.chartType === chartType &&
                hoveredPoint?.point.cycle === p.cycle;

              // Position label snug against point/line (ย้ายลงมาให้ชิดกับเส้น)
              const labelText = `${p.x.toFixed(p.x % 1 === 0 ? 0 : 2)}, ${p.y.toLocaleString()}`;
              const isRightSide = cx > width - 130;
              const isTopSide = cy < padTop + 25;
              const labelX = isRightSide ? cx - 10 : cx + 8;
              const labelY = isTopSide ? cy + 12 : cy - 2;
              const anchor = isRightSide ? 'end' : 'start';

              return (
                <g
                  key={`pt-${p.cycle}-${idx}`}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredPoint({ chartType, point: p })}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  {/* Point Marker */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : 4}
                    fill={isHovered ? '#38bdf8' : '#ffffff'}
                    stroke="#0284c7"
                    strokeWidth={isHovered ? 2.5 : 2}
                    className="transition-all duration-150"
                  />

                  {/* Data Box Label snug against line */}
                  <g>
                    {/* Background tag right against the line */}
                    <rect
                      x={anchor === 'end' ? labelX - 78 : labelX - 4}
                      y={labelY - 10}
                      width={82}
                      height={14}
                      rx="3"
                      fill="#1e293b"
                      fillOpacity="0.9"
                      stroke="#475569"
                      strokeWidth="0.75"
                    />
                    <text
                      x={anchor === 'end' ? labelX - 3 : labelX}
                      y={labelY}
                      textAnchor={anchor}
                      fill="#f1f5f9"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {labelText}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {/* Interactive Hover Tooltip */}
          {hoveredPoint && hoveredPoint.chartType === chartType && (
            <div className="absolute top-2 right-2 bg-slate-900/95 border border-sky-500/70 text-slate-100 text-xs px-3 py-2 rounded-lg shadow-xl backdrop-blur-sm pointer-events-none z-20">
              <div className="font-semibold text-sky-400">
                รอบที่ (Cycle) {hoveredPoint.point.cycle}
              </div>
              {hoveredPoint.point.indAfter !== undefined && hoveredPoint.point.indAfter !== null && (
                <div className="text-slate-300 text-[11px] mt-0.5">
                  Indicator หลังโหลด:{' '}
                  <span className="font-mono text-emerald-300 font-bold">
                    {hoveredPoint.point.indAfter} kg
                  </span>
                </div>
              )}
              {hoveredPoint.point.ptAfter !== undefined && hoveredPoint.point.ptAfter !== null && (
                <div className="text-slate-300 text-[11px] mt-0.5">
                  PT หลังโหลด:{' '}
                  <span className="font-mono text-blue-300 font-bold">
                    {hoveredPoint.point.ptAfter} kg
                  </span>
                </div>
              )}
              <div className="text-slate-300 text-[11px]">
                {yTitle}:{' '}
                <span className="font-mono text-white font-bold">
                  {hoveredPoint.point.y.toLocaleString()} kg
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Chart Footer Info */}
        <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-sky-400 rounded"></span>
            เส้นข้อมูลจริง (Actual)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 border-t border-dashed border-sky-300"></span>
            เส้นแนวโน้ม (Linear Trendline)
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {points.length} จุดวัด (Cycle 1-10)
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 w-full">
      {/* Chart 2 Switcher Toolbar */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-slate-400">กราฟที่สอง:</span>
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setSecondChartMode('pt')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              secondChartMode === 'pt'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            PT หลังโหลด (สเกล 0-60)
          </button>
          <button
            type="button"
            onClick={() => setSecondChartMode('cycle')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              secondChartMode === 'cycle'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            รอบ ของ Cycle (สเกล 1-10)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
        {renderSingleChart(
          'Indicator หลังโหลด กับ น้ำหนักจริง',
          indicatorPoints,
          'indicator',
          'Indicator หลังโหลด (kg)',
          'น้ำหนักจริง (kg) / ตัวนับ',
          6000,
          54000
        )}
        {secondChartMode === 'cycle'
          ? renderSingleChart(
              'รอบ ของ Cycle 1-10 กับ น้ำหนักจริง',
              cyclePoints,
              'cycle',
              'รอบ ของ Cycle (1-10)',
              'น้ำหนักจริงสะสม (kg) / ตัวนับ',
              6000,
              54000
            )
          : renderSingleChart(
              'PT หลังโหลด กับ น้ำหนักจริง',
              ptPoints,
              'pt',
              'PT หลังโหลด (mA / kg)',
              'น้ำหนักจริง (kg) / ตัวนับ',
              6000,
              54000
            )}
      </div>
    </div>
  );
};
