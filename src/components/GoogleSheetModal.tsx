import React, { useState } from 'react';
import { CalibrationRecord, TankDimensionConfig } from '../types/calibration';
import { calculateTotals, recalculateCumulativeCounters } from '../services/storage';
import {
  generateGoogleSheetCsv,
  generateGoogleSheetTsv,
  generateGoogleSheetHtml,
  isRealGoogleSpreadsheet,
  saveRecordToGoogleSheets,
  FOLDER_NAME,
} from '../services/workspace';
import { getAccessToken, googleSignIn } from '../services/auth';
import { BegerLogo } from './BegerLogo';
import { RealisticPtGauge } from './RealisticPtGauge';
import { PrimusIndicatorWidget } from './PrimusIndicatorWidget';
import {
  FileSpreadsheet,
  X,
  ExternalLink,
  Download,
  Copy,
  Check,
  Folder,
  Save,
  Maximize2,
  Minimize2,
  Printer,
  Undo2,
  Redo2,
  Share2,
  Search,
  HelpCircle,
  Clock,
  Video,
  ChevronDown,
  Layers,
  Activity,
  Zap,
} from 'lucide-react';

interface GoogleSheetModalProps {
  isOpen: boolean;
  record: CalibrationRecord;
  dimensionConfig?: TankDimensionConfig;
  onClose: () => void;
  onSaveToGoogleSheets?: () => void;
  onUpdateRecord?: (record: CalibrationRecord) => void;
}

interface Point {
  x: number;
  y: number;
  cycle: number;
}

export const GoogleSheetModal: React.FC<GoogleSheetModalProps> = ({
  isOpen,
  record,
  dimensionConfig,
  onClose,
  onSaveToGoogleSheets,
  onUpdateRecord,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeCellCoord, setActiveCellCoord] = useState<string>('T19');
  const [activeCellValue, setActiveCellValue] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(true);
  const [isOpeningSheet, setIsOpeningSheet] = useState<boolean>(false);
  const [openStatusText, setOpenStatusText] = useState<string | null>(null);
  const [showPasteGuideModal, setShowPasteGuideModal] = useState<boolean>(false);

  if (!isOpen) return null;

  const synchronizedCycles = recalculateCumulativeCounters(record.cycles);
  const totals = calculateTotals(synchronizedCycles);

  // Tank Dimension & Capacity calculations matching exact layout in photo
  const heightM = dimensionConfig?.height ?? 6.5;
  const diameterM = dimensionConfig?.diameter ?? 3.86;
  const radiusM = diameterM / 2;
  const densityVal = dimensionConfig?.density ?? 1.05;

  const rawVolumeM3 = Math.PI * radiusM * radiusM * heightM;
  const totalCapacityTon = rawVolumeM3 * 0.985 * densityVal; // ~74.92 tons
  const totalCapacityKg = totalCapacityTon * 1000;

  // Purely dynamic calculations reflecting entered cycles
  const loadedKg = totals.sumActualWeight;
  const loadedTon = loadedKg / 1000;

  const prevAccumulatedTon = 0.0;
  const totalInTankTon = prevAccumulatedTon + loadedTon;
  const fillPercent = totalCapacityTon > 0 ? Math.min(100, Math.max(0, (totalInTankTon / totalCapacityTon) * 100)) : 0;
  const remainingTon = Math.max(0, totalCapacityTon - totalInTankTon);
  const remainingHeightM = totalCapacityTon > 0 ? Math.max(0, (remainingTon / totalCapacityTon) * heightM) : 0;
  const signalMa = 4 + (fillPercent / 100) * 16;

  // Instrument values
  const latestPtVal = totals.latestPtAfter !== null ? totals.latestPtAfter : (totals.latestPtBefore ?? 0);
  const latestIndVal = totals.latestIndAfter !== null ? totals.latestIndAfter : (totals.latestIndBefore ?? 0);
  const ptPercentSpan = Math.min(100, Math.max(0, (Number(latestPtVal) / 60) * 100));

  // Points for Dual SVG Charts
  const indicatorPoints: Point[] = synchronizedCycles
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
    }))
    .sort((a, b) => a.x - b.x);

  const ptPoints: Point[] = synchronizedCycles
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
    }))
    .sort((a, b) => a.x - b.x);

  // Linear Regression
  const calculateRegression = (pts: Point[]) => {
    if (pts.length < 2) return null;
    const n = pts.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const ssTot = sumY2 - (sumY * sumY) / n;
    const ssRes = pts.reduce((acc, p) => acc + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
  };

  const regInd = calculateRegression(indicatorPoints);
  const regPt = calculateRegression(ptPoints);

  const driveFolderUrl = 'https://drive.google.com/drive/search?q=Cal-Tank%20001';

  const handleCopyClipboard = async () => {
    try {
      const tsv = generateGoogleSheetTsv(record, dimensionConfig);
      const html = generateGoogleSheetHtml(record, dimensionConfig);

      if (navigator.clipboard && window.ClipboardItem) {
        const textBlob = new Blob([tsv], { type: 'text/plain' });
        const htmlBlob = new Blob([html], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(tsv);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.warn('Clipboard write fallback:', e);
      try {
        const tsv = generateGoogleSheetTsv(record, dimensionConfig);
        await navigator.clipboard.writeText(tsv);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch (err) {
        console.warn('Clipboard write failed:', err);
      }
    }
  };

  const handleDownloadCsv = () => {
    const csv = generateGoogleSheetCsv(record);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GoogleSheet_CalTank001_${record.tankName}_${record.date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenGoogleSheet = async () => {
    // 1. If this record already has a genuine Google Spreadsheet on Google Drive:
    if (isRealGoogleSpreadsheet(record.spreadsheetId, record.spreadsheetUrl)) {
      const targetUrl =
        record.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${record.spreadsheetId}/edit`;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // 2. Need to create or open real Google Sheet:
    setIsOpeningSheet(true);
    setOpenStatusText('กำลังเตรียมเปิด Google Sheet...');

    try {
      let token = await getAccessToken();

      // If token not yet present in memory, try interactive sign-in
      if (!token) {
        setOpenStatusText('กำลังเชื่อมต่อบัญชี Google เพื่อสร้างสเปรดชีตจริงใน Drive...');
        try {
          const authRes = await googleSignIn();
          if (authRes?.accessToken) {
            token = authRes.accessToken;
          }
        } catch (authErr) {
          console.warn('Interactive sign-in not completed, falling back to sheets.new:', authErr);
        }
      }

      // If we have token (or user just signed in):
      if (token) {
        setOpenStatusText('กำลังสร้างและจัดรูปแบบ Google Sheet ในโฟลเดอร์ Cal-Tank 001...');
        const result = await saveRecordToGoogleSheets(token, record, dimensionConfig);

        const updated: CalibrationRecord = {
          ...record,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          folderId: result.folderId,
          updatedAt: new Date().toISOString(),
        };

        if (onUpdateRecord) {
          onUpdateRecord(updated);
        }

        window.open(result.spreadsheetUrl, '_blank', 'noopener,noreferrer');
        setIsOpeningSheet(false);
        setOpenStatusText(null);
        return;
      }
    } catch (createErr) {
      console.warn('Google Sheet creation notice:', createErr);
    }

    // 3. Fallback when user skipped Google Login:
    // CRITICAL: NEVER open a fake 'cal-tank-001' link which causes Google 404 (รูปที่ 1)!
    // Instead, open sheets.new (real, working new Google Sheet) + copy complete 11-cycle data to clipboard!
    try {
      await handleCopyClipboard();
      window.open('https://sheets.new', '_blank', 'noopener,noreferrer');
      setShowPasteGuideModal(true);
    } catch (e) {
      console.warn('Fallback open sheets.new error:', e);
    } finally {
      setIsOpeningSheet(false);
      setOpenStatusText(null);
    }
  };

  const handleOpenDriveFolder = () => {
    window.open(driveFolderUrl, '_blank', 'noopener,noreferrer');
  };

  // SVG Chart component inside Google Sheet
  const renderSheetSvgChart = (
    title: string,
    points: Point[],
    reg: { slope: number; intercept: number; r2: number } | null,
    xTitle: string,
    yTitle: string
  ) => {
    const width = 390;
    const height = 270;
    const padLeft = 45;
    const padRight = 18;
    const padTop = 32;
    const padBottom = 38;

    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    const xMax = 60;
    const yMax = 54000;
    const xTicks = [0, 10, 20, 30, 40, 50, 60];
    const yTicks = [0, 6000, 12000, 18000, 24000, 30000, 36000, 42000, 48000, 54000];

    const scaleX = (x: number) => padLeft + (x / xMax) * plotWidth;
    const scaleY = (y: number) => padTop + plotHeight - (y / yMax) * plotHeight;

    const pathD =
      points.length > 0
        ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`).join(' ')
        : '';

    let trendPathD = '';
    if (reg && points.length > 1) {
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const yAtMin = reg.slope * minX + reg.intercept;
      const yAtMax = reg.slope * maxX + reg.intercept;
      trendPathD = `M ${scaleX(minX)} ${scaleY(yAtMin)} L ${scaleX(maxX)} ${scaleY(yAtMax)}`;
    }

    return (
      <div className="bg-[#1a202c] border border-slate-700 rounded-lg p-2.5 flex flex-col h-full shadow">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>{title}</span>
          </div>
          {reg && (
            <div className="text-[10px] font-mono text-sky-300 bg-sky-950/70 border border-sky-800/80 px-1.5 py-0.2 rounded">
              R² = {reg.r2.toFixed(4)} | m = {reg.slope.toFixed(2)}
            </div>
          )}
        </div>

        <div className="relative w-full aspect-[14/10] bg-[#10141d] rounded border border-slate-800 overflow-hidden">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none">
            {/* Horizontal Grid */}
            {yTicks.map((val) => (
              <g key={`y-${val}`}>
                <line
                  x1={padLeft}
                  y1={scaleY(val)}
                  x2={width - padRight}
                  y2={scaleY(val)}
                  stroke="#2d3748"
                  strokeWidth="0.75"
                  strokeDasharray={val === 0 ? 'none' : '2,2'}
                />
                <text
                  x={padLeft - 5}
                  y={scaleY(val) + 3}
                  textAnchor="end"
                  fill="#718096"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {val.toLocaleString()}
                </text>
              </g>
            ))}

            {/* Vertical Grid */}
            {xTicks.map((val) => (
              <g key={`x-${val}`}>
                <line
                  x1={scaleX(val)}
                  y1={padTop}
                  x2={scaleX(val)}
                  y2={height - padBottom}
                  stroke="#2d3748"
                  strokeWidth="0.75"
                  strokeDasharray={val === 0 ? 'none' : '2,2'}
                />
                <text
                  x={scaleX(val)}
                  y={height - padBottom + 12}
                  textAnchor="middle"
                  fill="#718096"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            ))}

            {/* Axes */}
            <line
              x1={padLeft}
              y1={height - padBottom}
              x2={width - padRight}
              y2={height - padBottom}
              stroke="#4a5568"
              strokeWidth="1.25"
            />
            <line
              x1={padLeft}
              y1={padTop}
              x2={padLeft}
              y2={height - padBottom}
              stroke="#4a5568"
              strokeWidth="1.25"
            />

            {/* Axis Titles */}
            <text
              x={padLeft + plotWidth / 2}
              y={height - 6}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="9"
              fontWeight="600"
            >
              {xTitle}
            </text>
            <text
              transform="rotate(-90)"
              x={-(padTop + plotHeight / 2)}
              y={12}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="8.5"
              fontWeight="600"
            >
              {yTitle}
            </text>

            {/* Trendline */}
            {trendPathD && (
              <path
                d={trendPathD}
                stroke="#60a5fa"
                strokeWidth="1.5"
                strokeDasharray="4,3"
                opacity="0.8"
                fill="none"
              />
            )}

            {/* Actual data line */}
            {pathD && (
              <path
                d={pathD}
                stroke="#38bdf8"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points & Snug Callout Labels */}
            {points.map((p, idx) => {
              const cx = scaleX(p.x);
              const cy = scaleY(p.y);
              const labelText = `${p.x.toFixed(p.x % 1 === 0 ? 0 : 2)}, ${p.y.toLocaleString()}`;
              const isRightSide = cx > width - 90;
              const labelX = isRightSide ? cx - 8 : cx + 6;
              const labelY = cy - 2;
              const anchor = isRightSide ? 'end' : 'start';

              return (
                <g key={`pt-${idx}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                  <g>
                    <rect
                      x={anchor === 'end' ? labelX - 60 : labelX - 2}
                      y={labelY - 8}
                      width={62}
                      height={11}
                      rx="2"
                      fill="#1a202c"
                      fillOpacity="0.9"
                      stroke="#4a5568"
                      strokeWidth="0.5"
                    />
                    <text
                      x={anchor === 'end' ? labelX - 2 : labelX}
                      y={labelY}
                      textAnchor={anchor}
                      fill="#f7fafc"
                      fontSize="7.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {labelText}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex items-center justify-between text-[9.5px] text-slate-400 mt-1 px-1">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-sky-400 rounded"></span>
            เส้นข้อมูลจริง (Actual)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 border-t border-dashed border-sky-300"></span>
            เส้นแนวโน้ม (Linear Trendline)
          </span>
          <span className="font-mono text-[9px]">{points.length} จุดวัด (Cycle 1-10)</span>
        </div>
      </div>
    );
  };

  const gridColumns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];
  const gridRows = Array.from({ length: 38 }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div
        className={`bg-[#f8f9fa] border border-slate-400 flex flex-col shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullScreen
            ? 'w-[99vw] h-[98vh] rounded-lg'
            : 'max-w-7xl w-full h-[90vh] rounded-2xl'
        }`}
      >
        {/* 1. Google Sheets App Chrome (Top Bar) */}
        <div className="bg-white border-b border-[#dadce0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Logo & Document Title */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 bg-emerald-600 rounded text-white shadow-sm shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-medium text-[#202124] hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">
                  สเปรดชีต (Cal-Tank 001 - {record.tankName}) • วันที่ {record.date}
                </span>
                <span className="text-[11px] text-amber-500">★</span>
                <span className="text-[11px] text-slate-400">📁</span>
                {isRealGoogleSpreadsheet(record.spreadsheetId, record.spreadsheetUrl) ? (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    บันทึกลงในไดรฟ์แล้ว
                  </span>
                ) : (
                  <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded flex items-center gap-1">
                    <span>📊</span>
                    พร้อมเปิดและซิงค์ข้อมูล
                  </span>
                )}
              </div>
              {/* Menu list matching Google Sheets */}
              <div className="flex items-center gap-3 text-[11.5px] text-[#202124] mt-0.5">
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">ไฟล์</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">แก้ไข</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">ดู</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">แทรก</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">รูปแบบ</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">ข้อมูล</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">เครื่องมือ</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">ส่วนขยาย</span>
                <span className="hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer">ความช่วยเหลือ</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Right */}
          <div className="flex items-center gap-2">
            {isOpeningSheet && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 text-amber-800 rounded text-[11px] font-medium shadow-sm animate-pulse">
                <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                <span>{openStatusText || 'กำลังเตรียมเปิด Google Sheet...'}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleOpenGoogleSheet}
              disabled={isOpeningSheet}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded font-medium shadow-sm transition cursor-pointer disabled:opacity-60"
              title="เปิดดูไฟล์ Google Sheet บน Google Drive ในแท็บใหม่ หรือเปิด sheets.new"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>เปิดดูใน Google Sheet ทันที</span>
            </button>

            {onSaveToGoogleSheets && (
              <button
                type="button"
                onClick={onSaveToGoogleSheets}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium shadow-sm transition cursor-pointer"
                title="เซฟทับและบันทึกลงใน Google Drive โฟลเดอร์ Cal-Tank 001"
              >
                <Save className="w-3.5 h-3.5" />
                <span>บันทึกลง Google Drive</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyClipboard}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#dadce0] hover:bg-slate-50 text-[#3c4043] rounded font-medium transition cursor-pointer"
              title="คัดลอกข้อมูลทั้งหมดไปวางใน Google Sheet (A1:Q33)"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกทั้งหมด'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#dadce0] hover:bg-slate-50 text-[#3c4043] rounded font-medium transition cursor-pointer"
              title="ดาวน์โหลด .CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>ส่งออก .CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
              title={isFullScreen ? 'ย่อหน้าต่าง' : 'ขยายเต็มจอ'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* 2. Google Sheets Quick Formatting Toolbar */}
        <div className="bg-[#edf2fa] border-b border-[#dadce0] px-3 py-1 flex items-center justify-between gap-2 overflow-x-auto text-[11px] text-[#444746]">
          <div className="flex items-center gap-1 shrink-0">
            <span className="p-1 hover:bg-slate-200 rounded cursor-pointer">↶</span>
            <span className="p-1 hover:bg-slate-200 rounded cursor-pointer">↷</span>
            <span className="p-1 hover:bg-slate-200 rounded cursor-pointer">🖨️</span>
            <span className="p-1 hover:bg-slate-200 rounded cursor-pointer">🖌️</span>
            <span className="h-4 w-px bg-[#dadce0] mx-0.5"></span>
            <span className="px-1.5 py-0.5 bg-white border border-[#dadce0] rounded text-[11px]">100% ▾</span>
            <span className="h-4 w-px bg-[#dadce0] mx-0.5"></span>
            <span className="px-1 hover:bg-slate-200 rounded cursor-pointer font-bold">฿</span>
            <span className="px-1 hover:bg-slate-200 rounded cursor-pointer">%</span>
            <span className="px-1 hover:bg-slate-200 rounded cursor-pointer">.0</span>
            <span className="px-1 hover:bg-slate-200 rounded cursor-pointer">.00</span>
            <span className="px-1.5 py-0.5 bg-white border border-[#dadce0] rounded">123 ▾</span>
            <span className="h-4 w-px bg-[#dadce0] mx-0.5"></span>
            <span className="px-2 py-0.5 bg-white border border-[#dadce0] rounded">ค่าเริ่มต้น ▾</span>
            <span className="px-1.5 py-0.5 bg-white border border-[#dadce0] rounded">10 ▾</span>
            <span className="h-4 w-px bg-[#dadce0] mx-0.5"></span>
            <span className="px-1.5 py-0.5 font-bold hover:bg-slate-200 rounded cursor-pointer">B</span>
            <span className="px-1.5 py-0.5 italic hover:bg-slate-200 rounded cursor-pointer">I</span>
            <span className="px-1.5 py-0.5 line-through hover:bg-slate-200 rounded cursor-pointer">S</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">A ▾</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">🎨 ▾</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">田 ▾</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">⤢ ▾</span>
            <span className="h-4 w-px bg-[#dadce0] mx-0.5"></span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">≡ ▾</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">⇕ ▾</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">↵ ▾</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">∠ ▾</span>
            <span className="h-4 w-px bg-[#dadce0] mx-0.5"></span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">🔗</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">💬</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">📊</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer">▽</span>
            <span className="px-1.5 py-0.5 hover:bg-slate-200 rounded cursor-pointer font-bold">Σ ▾</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[#1a73e8] bg-sky-100 hover:bg-sky-200 px-3 py-1 rounded-full font-medium flex items-center gap-1 cursor-pointer">
              <span>🔒 แชร์</span>
            </span>
            <span className="w-7 h-7 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center text-xs">
              W
            </span>
          </div>
        </div>

        {/* 3. Formula Bar */}
        <div className="bg-white border-b border-[#dadce0] px-3 py-1 flex items-center gap-2 text-xs font-mono">
          <div className="w-14 px-2 py-0.5 bg-white border border-[#dadce0] rounded text-center text-[#3c4043] font-semibold text-[11px]">
            {activeCellCoord}
          </div>
          <span className="text-[#70757a] font-serif font-bold text-sm select-none">fx</span>
          <div className="flex-1 px-2 py-0.5 bg-white border border-transparent hover:border-[#dadce0] rounded text-[#202124] text-[12px] truncate">
            {activeCellValue || `='Cal-Tank 001'!${activeCellCoord}`}
          </div>
        </div>

        {/* 4. Spreadsheet Grid Container */}
        <div className="flex-1 overflow-auto bg-[#e8eaed] relative p-1">
          <div className="min-w-[1340px] bg-white border border-[#c0c0c0] shadow-sm select-text">
            {/* Column Header Row (A to Q) */}
            <div className="flex border-b border-[#c0c0c0] bg-[#f8f9fa] text-[11px] font-semibold text-[#5f6368] text-center sticky top-0 z-30">
              <div className="w-10 border-r border-[#c0c0c0] py-1 bg-[#f1f3f4] shrink-0"></div>
              {gridColumns.map((col) => (
                <div
                  key={col}
                  className={`border-r border-[#c0c0c0] py-1 shrink-0 ${
                    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(col)
                      ? 'w-[75px]'
                      : ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'].includes(col)
                      ? 'w-[78px]'
                      : 'w-14'
                  }`}
                >
                  {col}
                </div>
              ))}
            </div>

            {/* Embedded Sheet Content: EXACT LAYOUT MATCHING USER PHOTO */}
            <div className="flex flex-col bg-[#141b24] text-slate-100 p-2 sm:p-3 space-y-3">
              {/* Top Banner (Row 1 to 4) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Header Beger Branding (Col A to H) */}
                <div
                  className="lg:col-span-5 bg-[#1a2332] border border-slate-700 rounded-xl p-3 shadow flex items-center gap-3 cursor-pointer"
                  onClick={() => {
                    setActiveCellCoord('A1');
                    setActiveCellValue('="BEGER CO., LTD. CHEMICAL CALIBRATION - Cal-Tank 001"');
                  }}
                >
                  <BegerLogo className="h-10 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white tracking-wide truncate">
                        ระบบบันทึกการสอบเทียบถังเก็บสารเคมี
                      </h2>
                      <span className="text-[10px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800 px-1.5 py-0.2 rounded shrink-0">
                        Cal-Tank 001
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate">
                      บริษัท เบเยอร์ จำกัด (Beger Co., Ltd.) • โรงงานและคลังจัดเก็บสารเคมี
                    </p>
                  </div>
                </div>

                {/* 4 KPI Cards: Remaining calculation (Col I to Q) */}
                <div className="lg:col-span-7 bg-[#1a2332] border border-slate-700 rounded-xl p-2.5 shadow">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <span className="text-sky-400">✦</span> การคำนวณพื้นที่คงเหลือใน Tank (สะสมจากรอบก่อนหน้า)
                    </span>
                    <span className="text-[10px] text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-900">
                      สารเคมีอ่างเดิมในถัง
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {/* Card 1 */}
                    <div
                      className="bg-[#121924] border border-slate-800 p-2 rounded-lg cursor-pointer hover:border-slate-600 transition"
                      onClick={() => {
                        setActiveCellCoord('I2');
                        setActiveCellValue('=PREV_ACCUMULATED_TON(0.00)');
                      }}
                    >
                      <div className="text-[10px] text-slate-400">1. สะสมจากรอบก่อน (0 รอบ)</div>
                      <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
                        {prevAccumulatedTon.toFixed(2)} ตัน
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div
                      className="bg-[#121924] border border-slate-800 p-2 rounded-lg cursor-pointer hover:border-slate-600 transition"
                      onClick={() => {
                        setActiveCellCoord('K2');
                        setActiveCellValue(`=LOADED_TON(${loadedTon.toFixed(2)})`);
                      }}
                    >
                      <div className="text-[10px] text-slate-400">2. เติมรอบนี้ (โหลดมา)</div>
                      <div className="text-sm font-bold text-sky-300 font-mono mt-0.5">
                        + {loadedTon.toFixed(2)} ตัน
                      </div>
                    </div>

                    {/* Card 3 */}
                    <div
                      className="bg-[#121924] border border-slate-800 p-2 rounded-lg cursor-pointer hover:border-slate-600 transition"
                      onClick={() => {
                        setActiveCellCoord('M2');
                        setActiveCellValue(`=TOTAL_IN_TANK(${totalInTankTon.toFixed(2)}, "${fillPercent.toFixed(1)}%")`);
                      }}
                    >
                      <div className="text-[10px] text-slate-400">3. รวมในถังทั้งหมด</div>
                      <div className="text-sm font-bold text-amber-300 font-mono mt-0.5 flex items-baseline justify-between">
                        <span>= {totalInTankTon.toFixed(2)} ตัน</span>
                        <span className="text-[10.5px] font-sans text-slate-400">({fillPercent.toFixed(1)}%)</span>
                      </div>
                      <div className="text-[9.5px] text-amber-400 font-mono flex items-center gap-1 mt-0.5">
                        <Zap className="w-2.5 h-2.5" />
                        <span>{signalMa.toFixed(2)} mA</span>
                      </div>
                    </div>

                    {/* Card 4 */}
                    <div
                      className="bg-[#121924] border border-slate-800 p-2 rounded-lg cursor-pointer hover:border-slate-600 transition"
                      onClick={() => {
                        setActiveCellCoord('P2');
                        setActiveCellValue(`=REMAINING_CAPACITY(${remainingTon.toFixed(2)}, "${remainingHeightM.toFixed(2)} m")`);
                      }}
                    >
                      <div className="text-[10px] text-slate-400">4. เหลือพื้นที่เติมได้อีก</div>
                      <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                        {remainingTon.toFixed(2)} ตัน
                      </div>
                      <div className="text-[9.5px] text-emerald-300 font-mono mt-0.5">
                        ระยะเหลือ = {remainingHeightM.toFixed(2)} ม.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Section (Row 5 to 19): Instruments & Tank Graphic */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Left: Industrial Field Instruments (Col A to H) */}
                <div className="lg:col-span-5 bg-[#1a2332] border border-slate-700 rounded-xl p-3 shadow flex flex-col">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                    <span className="text-xs font-semibold text-slate-200">
                      เครื่องมือวัดภาคสนามหน้างาน (Industrial Field Instrumentation)
                    </span>
                    <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded font-mono">
                      แสดงคู่ขนาน (PT + TIM-94N)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 items-center">
                    {/* PT Circular Gauge */}
                    <div
                      className="bg-[#111722] border border-slate-800 rounded-lg p-2.5 flex flex-col items-center justify-center cursor-pointer hover:border-slate-600 transition text-center"
                      onClick={() => {
                        setActiveCellCoord('B6');
                        setActiveCellValue(`=PT_PRESSURE_TRANSMITTER(${latestPtVal})`);
                      }}
                    >
                      <div className="text-[11px] font-bold text-slate-200">
                        เกจวัดแรงดันถัง L712
                      </div>
                      <span className="text-[9.5px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded mt-0.5">
                        • ACTIVE
                      </span>
                      <div className="w-32 h-32 my-1 flex items-center justify-center">
                        <RealisticPtGauge ptValue={latestPtVal} maxSpan={60} showPill={false} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full text-[10px] border-t border-slate-800 pt-1.5 mt-1">
                        <div>
                          <span className="text-slate-400">PT หลังโหลด:</span>
                          <strong className="block text-sky-300 font-mono text-xs">{latestPtVal} Kg</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Indicator หลัง:</span>
                          <strong className="block text-sky-300 font-mono text-xs">{latestIndVal} Kg</strong>
                        </div>
                      </div>
                    </div>

                    {/* Primus TIM-94N 7-Segment Panel */}
                    <div
                      className="bg-[#111722] border border-slate-800 rounded-lg p-2.5 flex flex-col items-center justify-center cursor-pointer hover:border-slate-600 transition text-center"
                      onClick={() => {
                        setActiveCellCoord('E6');
                        setActiveCellValue(`=PRIMUS_TIM94N_INDICATOR(${latestIndVal})`);
                      }}
                    >
                      <div className="text-[11px] font-bold text-slate-200">
                        PRIMUS TIM-94N • ถัง L712
                      </div>
                      <span className="text-[9.5px] text-sky-400 bg-sky-950/60 px-1.5 py-0.2 rounded mt-0.5">
                        • ONLINE
                      </span>
                      <div className="my-2 p-2 bg-black/90 border border-slate-800 rounded shadow-inner">
                        <div className="text-2xl font-mono font-bold tracking-widest text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
                          {Number(latestIndVal).toFixed(2)}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full text-[10px] border-t border-slate-800 pt-1.5 mt-1">
                        <div>
                          <span className="text-slate-400">Indicator หลัง:</span>
                          <strong className="block text-emerald-300 font-mono text-xs">{latestIndVal} Kg</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">สเกลวัด:</span>
                          <strong className="block text-sky-300 font-mono text-xs">{ptPercentSpan.toFixed(1)}% of 60</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Tank Graphic and Geometry Details (Col I to Q) */}
                <div className="lg:col-span-7 bg-[#1a2332] border border-slate-700 rounded-xl p-3 shadow flex flex-col sm:flex-row items-center gap-4">
                  {/* Tank Visualization Canvas */}
                  <div
                    className="w-40 sm:w-44 h-56 bg-[#101620] border border-slate-800 rounded-xl p-2 flex flex-col items-center justify-center relative cursor-pointer"
                    onClick={() => {
                      setActiveCellCoord('I6');
                      setActiveCellValue(`=CYLINDER_TANK_GRAPHIC("${fillPercent.toFixed(1)}%")`);
                    }}
                  >
                    <span className="absolute top-2 right-2 text-[10px] font-mono text-sky-400 font-bold bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800">
                      {fillPercent.toFixed(1)}%
                    </span>

                    {/* Tank Outline */}
                    <div className="w-24 h-44 rounded-t-full rounded-b-full border-2 border-slate-400 bg-slate-900/80 relative overflow-hidden flex flex-col justify-end shadow-lg">
                      {/* Graduated Tick lines */}
                      <div className="absolute inset-y-0 right-0 w-full flex flex-col justify-between py-3 pointer-events-none z-10 text-[8px] font-mono text-slate-400 pr-1">
                        <span className="border-b border-slate-600 text-right pr-1">100%</span>
                        <span className="border-b border-slate-700 text-right pr-1">75%</span>
                        <span className="border-b border-slate-700 text-right pr-1">50%</span>
                        <span className="border-b border-slate-700 text-right pr-1">25%</span>
                        <span className="border-b border-slate-600 text-right pr-1">0%</span>
                      </div>

                      {/* Liquid Level */}
                      <div
                        className="w-full bg-gradient-to-t from-sky-600 via-sky-500 to-cyan-400 relative transition-all duration-500"
                        style={{ height: `${fillPercent}%` }}
                      >
                        {/* Surface ripple */}
                        <div className="absolute -top-1 inset-x-0 h-2 bg-cyan-200/80 rounded-full blur-[1px]"></div>
                      </div>
                    </div>
                  </div>

                  {/* Tank Statistical Specifications Table */}
                  <div className="flex-1 w-full space-y-1.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-sans">ความจุถังเต็ม:</span>
                      <strong className="text-slate-100 font-mono">{totalCapacityTon.toFixed(2)} ตัน</strong>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-sans">สารเคมีที่เติมแล้ว:</span>
                      <strong className="text-sky-300 font-mono text-sm">{totalInTankTon.toFixed(2)} ตัน</strong>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-sans">เหลือพื้นที่เติมได้อีก:</span>
                      <strong className="text-emerald-400 font-mono text-sm">{remainingTon.toFixed(2)} ตัน</strong>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-sans">ระยะเติมได้:</span>
                      <strong className="text-amber-300 font-mono">{remainingHeightM.toFixed(2)} เมตร</strong>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-sans">ระดับเต็ม:</span>
                      <strong className="text-sky-400 font-mono">{fillPercent.toFixed(1)}%</strong>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="text-slate-400 font-sans">⚡ สัญญาณ 4-20 mA:</span>
                      <strong className="text-amber-400 font-mono">{signalMa.toFixed(2)} mA</strong>
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans pt-1">
                      สูง: {heightM} ม. • ศก.: {diameterM} ม. (แนวตั้ง)
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section (Row 20 to 38): Calibration Table & Dual Curves */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Calibration Table (Col A to H) */}
                <div className="lg:col-span-6 bg-[#1a2332] border border-slate-700 rounded-xl p-3 shadow overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                    <span className="text-xs font-semibold text-slate-200">
                      ตารางข้อมูลการสอบเทียบ (Calibration Table) • 11 Cycles
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ข้อมูลซิงค์ตรง Google Sheet
                    </span>
                  </div>

                  <div className="overflow-x-auto w-full flex-1">
                    <table className="w-full border-collapse text-left text-[11px] font-mono">
                      <thead>
                        <tr className="bg-[#121924] text-slate-300 border-b border-slate-700 text-center select-none font-sans font-bold">
                          <th className="py-2 px-1.5 border border-slate-800 w-10">Cycle</th>
                          <th className="py-2 px-1 border border-slate-800">PT ก่อน</th>
                          <th className="py-2 px-1 border border-slate-800">Ind ก่อน</th>
                          <th className="py-2 px-1 border border-slate-800 text-sky-300">PT หลัง</th>
                          <th className="py-2 px-1 border border-slate-800 text-sky-300">Ind หลัง</th>
                          <th className="py-2 px-1.5 border border-slate-800 text-emerald-300">น้ำหนักจริง</th>
                          <th className="py-2 px-1.5 border border-slate-800 text-amber-300">ตัวนับ</th>
                          <th className="py-2 px-1 border border-slate-800 text-slate-400">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-center">
                        {synchronizedCycles.map((row, idx) => (
                          <tr
                            key={row.cycle}
                            className="hover:bg-slate-800/60 transition cursor-pointer"
                            onClick={() => {
                              setActiveCellCoord(`A${21 + idx}`);
                              setActiveCellValue(`=ROW(${row.cycle}, PT_AFTER=${row.ptAfter ?? '-'}, IND_AFTER=${row.indAfter ?? '-'}, ACTUAL=${row.actualWeight ?? '-'})`);
                            }}
                          >
                            <td className="py-1.5 px-1 font-bold text-slate-300 bg-slate-900/60 border border-slate-800">
                              {row.cycle}
                            </td>
                            <td className="py-1 px-1 border border-slate-800 text-slate-300">
                              {row.ptBefore !== null ? row.ptBefore : '-'}
                            </td>
                            <td className="py-1 px-1 border border-slate-800 text-slate-300">
                              {row.indBefore !== null ? row.indBefore : '-'}
                            </td>
                            <td className="py-1 px-1 border border-slate-800 text-sky-300 font-semibold bg-sky-950/20">
                              {row.ptAfter !== null ? row.ptAfter : '-'}
                            </td>
                            <td className="py-1 px-1 border border-slate-800 text-sky-300 font-semibold bg-sky-950/20">
                              {row.indAfter !== null ? row.indAfter : '-'}
                            </td>
                            <td className="py-1 px-1.5 border border-slate-800 text-emerald-300 font-semibold bg-emerald-950/20">
                              {row.actualWeight !== null ? row.actualWeight.toLocaleString() : '-'}
                            </td>
                            <td className="py-1 px-1.5 border border-slate-800 text-amber-300 font-bold bg-amber-950/20">
                              {row.cumulativeCounter !== null ? row.cumulativeCounter.toLocaleString() : '-'}
                            </td>
                            <td className="py-1 px-1 border border-slate-800 text-slate-400 text-[10px]">
                              {row.remark || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr
                          className="bg-[#121924] font-bold border-t-2 border-slate-700 text-center cursor-pointer"
                          onClick={() => {
                            setActiveCellCoord('G38');
                            setActiveCellValue(`=SUM_ACTUAL_WEIGHT(${totals.sumActualWeight.toLocaleString()} kg)`);
                          }}
                        >
                          <td className="py-2 px-1 text-sky-400 font-sans border border-slate-800">รวม</td>
                          <td className="py-2 px-1 border border-slate-800 text-slate-300">
                            {totals.latestPtBefore !== null ? `${totals.latestPtBefore} (ล่าสุด)` : '-'}
                          </td>
                          <td className="py-2 px-1 border border-slate-800 text-slate-300">
                            {totals.latestIndBefore !== null ? `${totals.latestIndBefore} (ล่าสุด)` : '-'}
                          </td>
                          <td className="py-2 px-1 border border-slate-800 text-sky-300 font-bold bg-sky-950/30">
                            {totals.latestPtAfter !== null ? `${totals.latestPtAfter} (ล่าสุด)` : '-'}
                          </td>
                          <td className="py-2 px-1 border border-slate-800 text-sky-300 font-bold bg-sky-950/30">
                            {totals.latestIndAfter !== null ? `${totals.latestIndAfter} (ล่าสุด)` : '-'}
                          </td>
                          <td className="py-2 px-1 border border-slate-800 text-emerald-300 font-bold bg-emerald-950/30">
                            {totals.sumActualWeight.toLocaleString()} (โหลดรวม)
                          </td>
                          <td className="py-2 px-1 border border-slate-800 text-amber-300 font-bold bg-amber-950/30">
                            {totals.maxCounter.toLocaleString()} (ยอดสะสม)
                          </td>
                          <td className="py-2 px-1 border border-slate-800 text-slate-400 text-[10px] font-sans">
                            โหลดรวม {totals.sumActualWeight} kg
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Right: Dual SVG Curves (Col I to Q) */}
                <div className="lg:col-span-6 bg-[#1a2332] border border-slate-700 rounded-xl p-3 shadow flex flex-col">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        กราฟวิเคราะห์ผลการสอบเทียบ (Calibration Curves)
                      </span>
                      <span className="text-[10px] text-slate-400 block font-sans">
                        กราฟเส้นแสดงความสัมพันธ์ระหว่าง Indicator / PT หลังโหลด กับ น้ำหนักจริงสะสม พร้อมเส้นแนวโน้ม (Linear Trendline)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                    {renderSheetSvgChart(
                      'Indicator หลังโหลด กับ น้ำหนักจริง',
                      indicatorPoints,
                      regInd,
                      'Indicator หลังโหลด (kg)',
                      'น้ำหนักจริง (kg) / ตัวนับ'
                    )}
                    {renderSheetSvgChart(
                      'PT หลังโหลด กับ น้ำหนักจริง',
                      ptPoints,
                      regPt,
                      'PT หลังโหลด (mA / kg)',
                      'น้ำหนักจริง (kg) / ตัวนับ'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Google Sheets Bottom Sheet Tabs Bar */}
        <div className="bg-[#f8f9fa] border-t border-[#dadce0] px-3 py-1 flex items-center justify-between text-xs text-[#444746] shrink-0">
          <div className="flex items-center gap-1">
            <span className="p-1 hover:bg-slate-200 rounded cursor-pointer font-bold text-slate-600">+</span>
            <span className="p-1 hover:bg-slate-200 rounded cursor-pointer text-slate-600">≡</span>
            <span className="h-4 w-px bg-[#dadce0] mx-1"></span>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#dadce0] rounded-t text-emerald-800 font-semibold shadow-sm cursor-pointer border-b-2 border-b-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
              <span>ชีต 1 (Cal-Tank 001)</span>
              <span className="text-[10px]">▾</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>จำนวนแถว: 38 แถว • คอลัมน์: A - Q</span>
            <span>พร้อมใช้งาน</span>
          </div>
        </div>
      </div>

      {/* Guide Modal when sheets.new opens with copied data */}
      {showPasteGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#1e293b] text-slate-100 rounded-2xl max-w-lg w-full border border-slate-700 p-5 shadow-2xl relative">
            <button
              onClick={() => setShowPasteGuideModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-lg">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  เปิด Google Sheet พร้อมคัดลอกข้อมูลแล้ว!
                </h3>
                <p className="text-xs text-emerald-400 font-medium">
                  ข้อมูลการสอบเทียบ 11 รอบและสูตรคำนวณถูกคัดลอกลงในคลิปบอร์ดแล้ว
                </p>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 my-3 text-xs space-y-2.5">
              <div className="font-medium text-slate-200 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  1
                </span>
                <span>
                  สลับไปที่แท็บหน้าต่าง <strong>Google Sheet</strong> ที่เพิ่งเปิดขึ้นมาใหม่
                </span>
              </div>
              <div className="font-medium text-slate-200 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  2
                </span>
                <span>
                  คลิกเลือกที่เซลล์ <strong>A1</strong> (ช่องแรกมุมซ้ายบนของตาราง)
                </span>
              </div>
              <div className="font-medium text-slate-200 flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  3
                </span>
                <span>
                  กดแป้นพิมพ์{' '}
                  <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-amber-300 font-mono font-bold">
                    Ctrl + V
                  </kbd>{' '}
                  (หรือคลิกขวา &gt; วาง)
                </span>
              </div>
            </div>

            <p className="text-[11.5px] text-slate-300 leading-relaxed mb-4">
              ข้อมูลทั้ง 17 คอลัมน์ (A - Q) รวมถึงรายการสอบเทียบทุกรอบ (Cycle 0-10), ค่าคำนวณพื้นที่คงเหลือใน Tank, ค่าเกจ PT / TIM-94N และจุดพิกัดกราฟ จะปรากฏและจัดเรียงอย่างถูกต้องตามรูปแบบภาพที่สองทันที
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  handleCopyClipboard();
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกข้อมูลอีกครั้ง'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPasteGuideModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
              >
                เข้าใจแล้ว / เริ่มใช้งาน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
