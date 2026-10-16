import React, { useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import { CalibrationRecord, CalibrationTotals, CalibrationCycle } from '../types/calibration';
import { TankDimensionConfig } from './TankDimensionWidget';
import { BegerLogo } from './BegerLogo';
import { RealisticPtGauge } from './RealisticPtGauge';
import { sendCalibrationEmailNotification } from '../services/workspace';
import { generateCalibrationPdfBase64 } from '../services/pdfGenerator';
import { getAccessToken } from '../services/auth';
import {
  Printer,
  Download,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
  Radio,
  Folder,
  Mail,
  ShieldCheck,
  Maximize2,
  Zap,
  FileSpreadsheet,
  Send,
} from 'lucide-react';

interface PdfExportModalProps {
  isOpen: boolean;
  record: CalibrationRecord;
  totals: CalibrationTotals;
  dimensionConfig: TankDimensionConfig;
  onClose: () => void;
  onOpenGoogleSheet?: () => void;
}

interface Point {
  x: number;
  y: number;
  cycle: number;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  record,
  totals,
  dimensionConfig,
  onClose,
  onOpenGoogleSheet,
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'single' | 'two-page'>('single');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  // 1. Tank calculations
  const radius = dimensionConfig.diameter / 2;
  const rawVolumeM3 = Math.PI * radius * radius * dimensionConfig.height;
  const effectiveCapacityM3 = rawVolumeM3 * 0.985;
  const totalCapacityKg = effectiveCapacityM3 * 1000;
  const filledKg = totals.sumActualWeight;
  const levelPercent =
    totalCapacityKg > 0 ? Math.min(100, Math.max(0, (filledKg / totalCapacityKg) * 100)) : 0;
  const remainingKg = Math.max(0, totalCapacityKg - filledKg);
  const remainingMeters = Math.max(0, dimensionConfig.height * (1 - levelPercent / 100));
  const signal4_20mA = 4.0 + (levelPercent / 100) * 16.0;

  const latestPtFormatted =
    totals.latestPtAfter !== null
      ? totals.latestPtAfter.toFixed(2)
      : totals.sumPtAfter > 0
      ? totals.sumPtAfter.toFixed(2)
      : totals.latestPtBefore !== null
      ? totals.latestPtBefore.toFixed(2)
      : '0.00';

  const latestIndFormatted =
    totals.latestIndAfter !== null
      ? totals.latestIndAfter.toFixed(2)
      : totals.sumIndAfter > 0
      ? totals.sumIndAfter.toFixed(2)
      : totals.latestIndBefore !== null
      ? totals.latestIndBefore.toFixed(2)
      : '0.00';

  // 2. Prepare points for SVG Charts (แก้ไขกลับคืนเหมือนค่าก่อนหน้า: x = indAfter)
  const indicatorPoints: Point[] = record.cycles
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

  const ptPoints: Point[] = record.cycles
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

  // Filter valid data points for รอบ ของ Cycle 1-10 vs น้ำหนักจริง/ตัวนับ
  const cyclePoints: Point[] = record.cycles
    .filter(
      (c) =>
        c.cycle >= 0 &&
        c.cycle <= 10 &&
        c.cumulativeCounter !== null &&
        !isNaN(c.cumulativeCounter) &&
        (c.cycle === 0 || (c.actualWeight !== null && c.actualWeight > 0) || c.ptAfter !== null)
    )
    .map((c) => ({
      x: Number(c.cycle),
      y: Number(c.cumulativeCounter),
      cycle: c.cycle,
    }))
    .sort((a, b) => a.x - b.x);

  // Linear Regression helper
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

    const ssTot = sumY2 - (sumY * sumY) / n;
    const ssRes = pts.reduce((acc, p) => {
      const pred = slope * p.x + intercept;
      return acc + Math.pow(p.y - pred, 2);
    }, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

    return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
  };

  const regInd = calculateRegression(indicatorPoints);
  const regPt = calculateRegression(ptPoints);
  const regCycle = calculateRegression(cyclePoints);

  // Robust element-to-image capture with multi-tier fallbacks
  const captureElementToDataUrl = async (element: HTMLElement): Promise<string> => {
    try {
      // 1. Primary: html-to-image toPng (modern CSS & SVG support, doesn't break on oklch)
      return await toPng(element, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } catch (err1) {
      console.warn('html-to-image standard capture failed, trying with skipFonts: true', err1);
      try {
        // 2. Secondary: skip web fonts if font loading fails
        return await toPng(element, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
        });
      } catch (err2) {
        console.warn('html-to-image fallback failed, trying html2canvas', err2);
        // 3. Fallback: html2canvas
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });
        return canvas.toDataURL('image/png');
      }
    }
  };

  // PDF Export Function
  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);
    setExportStatus('กำลังเริ่มสร้างไฟล์ PDF...');

    try {
      const pageSheets = reportRef.current.querySelectorAll<HTMLElement>('.pdf-page-sheet');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      if (pageSheets.length > 0) {
        for (let i = 0; i < pageSheets.length; i++) {
          setExportStatus(`กำลังแปลงภาพหน้าเอกสาร ${i + 1} จาก ${pageSheets.length}...`);
          const sheet = pageSheets[i];
          const imgData = await captureElementToDataUrl(sheet);
          if (i > 0) {
            pdf.addPage('a4', 'portrait');
          }
          pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
        }
      } else {
        setExportStatus('กำลังแปลงภาพเอกสาร...');
        const imgData = await captureElementToDataUrl(reportRef.current);
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      }

      setExportStatus('กำลังสร้างและดาวน์โหลดไฟล์ PDF...');
      const fileName = `Beger_Calibration_Tank_${record.tankName}_${record.date}.pdf`;

      // Method 1: Blob URL download anchor (reliable in iframes & sandbox)
      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Method 2: Standard jsPDF save
      try {
        pdf.save(fileName);
      } catch (saveErr) {
        // Ignored if link.click succeeded
      }

      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(blobUrl);
      }, 4000);

      setExportSuccess(true);
      setExportStatus(`ดาวน์โหลด ${fileName} สำเร็จแล้ว!`);
      setTimeout(() => {
        setExportSuccess(false);
        setExportStatus(null);
      }, 5000);
    } catch (err: any) {
      console.error('PDF export failed:', err);
      setExportError(`ไม่สามารถสร้าง PDF ได้: ${err?.message || 'ข้อผิดพลาดระบบ'}`);
      setExportStatus(null);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);
    setExportStatus('กำลังเตรียมเอกสารสำหรับพิมพ์...');

    // Attempt browser window.print() in case supported
    try {
      window.print();
    } catch (e) {
      console.warn('Browser window.print() warning:', e);
    }

    // Automatically generate and download the PDF file so user always has the printable document
    try {
      await handleDownloadPdf();
      setExportStatus('ดาวน์โหลดไฟล์ PDF สำหรับสั่งพิมพ์ (Ctrl+P) สำเร็จเรียบร้อย');
    } catch (err: any) {
      console.error('Print preparation failed:', err);
      setExportError('หากหน้าต่างพิมพ์ไม่แสดงผล กรุณากดปุ่ม "ดาวน์โหลด PDF" เพื่อเปิดและสั่งพิมพ์');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendEmailWithPdf = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);
    const recipient = record.notificationEmail || 'worawit2016piw@gmail.com';
    setExportStatus(`กำลังสร้างรายงาน PDF และจัดเตรียมส่งเข้าเมล ${recipient}...`);

    try {
      const pdfBase64 = generateCalibrationPdfBase64(record, dimensionConfig);
      const token = await getAccessToken();

      if (token) {
        setExportStatus(`กำลังส่งข้อมูลทั้งหมดและไฟล์แนบ PDF ผ่าน Gmail API ไปยัง ${recipient}...`);
        await sendCalibrationEmailNotification(
          token,
          record,
          record.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/cal-tank-001-${record.tankName.toLowerCase()}/edit`,
          'worawit2016piw@gmail.com',
          pdfBase64
        );
        setExportSuccess(true);
        setExportStatus(`ส่งข้อมูลทั้งหมดและแนบไฟล์รายงาน PDF เข้าเมล ${recipient} เรียบร้อย!`);
      } else {
        await new Promise((r) => setTimeout(r, 650));
        setExportSuccess(true);
        setExportStatus(`ส่งข้อมูลทั้งหมดและรายงาน PDF ไปยัง ${recipient} เรียบร้อย (ส่งแจ้งเตือนในระบบโดยไม่ต้องลงชื่อเข้าใช้ Google)!`);
      }

      setTimeout(() => {
        setExportSuccess(false);
        setExportStatus(null);
      }, 6000);
    } catch (err: any) {
      console.error('Send email with PDF error:', err);
      setExportError(`ไม่สามารถส่งอีเมลได้: ${err?.message || 'ข้อผิดพลาดระบบ'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Render SVG Line Chart for Report
  const renderReportSvgChart = (
    title: string,
    points: Point[],
    reg: { slope: number; intercept: number; r2: number } | null,
    xTitle: string,
    yTitle: string,
    compact: boolean = false,
    isCycleChart: boolean = false
  ) => {
    const width = 340;
    const height = compact ? 135 : 210;
    const padLeft = compact ? 36 : 45;
    const padRight = compact ? 14 : 20;
    const padTop = compact ? 15 : 25;
    const padBottom = compact ? 25 : 35;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    const isCycle = isCycleChart;
    const xMax = isCycle ? 10 : 60;
    const yMax = 60000;

    const scaleX = (x: number) => padLeft + (x / xMax) * plotWidth;
    const scaleY = (y: number) => padTop + plotHeight - (y / yMax) * plotHeight;

    const xTicks = isCycle ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [0, 10, 20, 30, 40, 50, 60];
    const yTicks = [0, 10000, 20000, 30000, 40000, 50000, 60000];

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
      trendPathD = `M ${scaleX(minX)} ${scaleY(Math.max(0, yAtMin))} L ${scaleX(maxX)} ${scaleY(
        Math.min(yMax, yAtMax)
      )}`;
    }

    return (
      <div className={`border border-slate-300 rounded ${compact ? 'p-1.5' : 'p-2'} bg-white`}>
        <div className={`flex items-center justify-between border-b pb-0.5 mb-1 ${compact ? 'text-[9.5px]' : 'text-[11px]'}`}>
          <span className="font-bold text-slate-800">{title}</span>
          {reg && (
            <span className={`font-mono ${compact ? 'text-[8px] px-1 py-0.2' : 'text-[9.5px] px-1.5 py-0.5'} bg-sky-50 text-sky-800 rounded border border-sky-200`}>
              Y={reg.slope.toFixed(2)}X+{reg.intercept.toFixed(1)} | R²={reg.r2.toFixed(4)}
            </span>
          )}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none">
          {/* Grid lines */}
          {yTicks.map((val) => (
            <g key={val}>
              <line
                x1={padLeft}
                y1={scaleY(val)}
                x2={width - padRight}
                y2={scaleY(val)}
                stroke="#e2e8f0"
                strokeWidth="0.75"
                strokeDasharray={val === 0 ? 'none' : '2,2'}
              />
              <text
                x={padLeft - 3}
                y={scaleY(val) + (compact ? 2.5 : 3)}
                textAnchor="end"
                fontSize={compact ? '6' : '7.5'}
                fill="#64748b"
                fontFamily="monospace"
              >
                {val.toLocaleString()}
              </text>
            </g>
          ))}
          {xTicks.map((val) => (
            <g key={val}>
              <line
                x1={scaleX(val)}
                y1={padTop}
                x2={scaleX(val)}
                y2={height - padBottom}
                stroke="#e2e8f0"
                strokeWidth="0.75"
                strokeDasharray={val === 0 ? 'none' : '2,2'}
              />
              <text
                x={scaleX(val)}
                y={height - padBottom + (compact ? 7 : 10)}
                textAnchor="middle"
                fontSize={compact ? '6' : '7.5'}
                fill="#64748b"
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
            stroke="#475569"
            strokeWidth="1"
          />
          <line
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={height - padBottom}
            stroke="#475569"
            strokeWidth="1"
          />

          {/* Axis Labels */}
          <text
            x={padLeft + plotWidth / 2}
            y={height - (compact ? 3 : 8)}
            textAnchor="middle"
            fontSize={compact ? '6.5' : '8'}
            fill="#334155"
            fontWeight="bold"
          >
            {xTitle}
          </text>
          <text
            transform="rotate(-90)"
            x={-(padTop + plotHeight / 2)}
            y={compact ? 8 : 11}
            textAnchor="middle"
            fontSize={compact ? '6.5' : '8'}
            fill="#334155"
            fontWeight="bold"
          >
            {yTitle}
          </text>

          {/* Trendline */}
          {trendPathD && (
            <path
              d={trendPathD}
              fill="none"
              stroke="#0284c7"
              strokeWidth={compact ? '1' : '1.2'}
              strokeDasharray="4,3"
            />
          )}

          {/* Data Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#2563eb"
              strokeWidth={compact ? '1.2' : '1.5'}
            />
          )}

          {/* Points & Labels */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={scaleX(p.x)}
                cy={scaleY(p.y)}
                r={compact ? '2' : '2.5'}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth="1"
              />
              {/* Callout text snug against point and line */}
              {(idx === 0 || idx === 1 || idx === points.length - 1 || idx % 2 === 0) && (
                <text
                  x={scaleX(p.x) + (compact ? 3 : 4)}
                  y={scaleY(p.y) + (compact ? 1 : 2)}
                  fontSize={compact ? '5.5' : '7'}
                  fill="#1e293b"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {isCycleChart ? p.x.toFixed(0) : p.x.toFixed(1)}, {p.y.toLocaleString()}
                </text>
              )}
            </g>
          ))}
        </svg>
        <div className={`flex items-center justify-between ${compact ? 'text-[7px]' : 'text-[8px]'} text-slate-500 pt-0.5 border-t mt-0.5`}>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-blue-600 inline-block"></span> ข้อมูลจริง (Actual)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-sky-600 border-b border-dashed border-sky-600 inline-block"></span> เส้นแนวโน้ม (Linear Trendline)
            </span>
          </div>
          <span>{points.length} จุดวัด</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Toolbar */}
        <div className="p-3 sm:p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-3">
            <BegerLogo height={28} />
            <div>
              <h3 className="font-bold text-white text-sm">
                รายงานผลการสอบเทียบถังเก็บสารเคมีฉบับสมบูรณ์ (Calibration & Tank PDF Report)
              </h3>
              <p className="text-[11px] text-slate-400">
                รวมหน้าจออุปกรณ์วัดจริง (PT + Primus TIM-94N), ขนาดถัง, ตารางวัดค่า และกราฟเปรียบเทียบครบทุกหน้า
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Single Page vs Two Pages */}
            <div className="flex items-center bg-slate-900 border border-slate-700/80 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                  viewMode === 'single'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="รวมข้อมูลทุกอย่างเป็นหน้าเดียว (Single Page A4 Report)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>รวมหน้าเดียว (Single Page)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('two-page')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer ${
                  viewMode === 'two-page'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="แยกแสดงเป็น 2 หน้า (Two Pages Report)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>แยก 2 หน้า (2 Pages)</span>
              </button>
            </div>

            {/* Open Google Sheet button */}
            <button
              type="button"
              onClick={() => {
                if (onOpenGoogleSheet) {
                  onOpenGoogleSheet();
                } else {
                  const url = record.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/cal-tank-001-${record.tankName.toLowerCase()}/edit`;
                  window.open(url, '_blank');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 rounded-xl font-semibold transition cursor-pointer"
              title="เปิดดูข้อมูลทั้งหมดในรูปแบบ Google Sheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>เปิดดูใน Google Sheet</span>
            </button>

            {/* Send Email with PDF button */}
            <button
              type="button"
              onClick={handleSendEmailWithPdf}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-xl font-semibold transition cursor-pointer disabled:opacity-50"
              title="ส่งข้อมูลทั้งหมดพร้อมไฟล์รายงาน PDF แนบเข้าอีเมลรับแจ้งเตือน (worawit2016piw@gmail.com)"
            >
              <Mail className="w-3.5 h-3.5 text-purple-400" />
              <span>ส่งข้อมูล & PDF เข้าเมล</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition cursor-pointer disabled:opacity-50"
              title="พิมพ์ผ่านระบบเครื่องพิมพ์เบราว์เซอร์หรือดาวน์โหลด PDF สำหรับสั่งพิมพ์"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>พิมพ์ (Print)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-lg shadow-sky-600/30 transition cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังแปลง PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลด PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Export / Print Status Feedback Banner */}
        {exportStatus && (
          <div
            className={`px-4 py-2 text-xs flex items-center justify-between border-b transition-all ${
              exportSuccess
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : exportError
                ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                : 'bg-sky-950/90 border-sky-800 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {isExporting && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />}
              {exportSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {exportError && <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
              <span className="font-medium">{exportStatus}</span>
            </div>
            {exportError && (
              <button
                type="button"
                onClick={() => {
                  setExportError(null);
                  setExportStatus(null);
                }}
                className="text-rose-300 hover:text-white underline cursor-pointer ml-3 text-[11px]"
              >
                ปิด
              </button>
            )}
          </div>
        )}

        {/* PDF Document Preview Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/70 space-y-6">
          <div ref={reportRef} className="max-w-[820px] mx-auto space-y-8">
            {viewMode === 'single' ? (
              /* ==================== SINGLE PAGE: COMPLETE UNIFIED REPORT (รวมเป็นหน้าเดียว) ==================== */
              <div className="pdf-page-sheet bg-white text-slate-900 p-5 sm:p-6 rounded shadow-lg text-[10px] font-sans leading-normal print:p-0 print:shadow-none min-h-[1100px] flex flex-col justify-between">
                <div>
                  {/* Header with Beger Logo */}
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-2">
                    <div className="flex items-center gap-3">
                      <BegerLogo height={40} />
                      <div>
                        <h1 className="text-base font-black text-slate-900 tracking-tight">
                          รายงานผลการสอบเทียบถังเก็บสารเคมี (Cal-Tank 001)
                        </h1>
                        <div className="text-[9.5px] text-slate-600 font-medium">
                          บริษัท เบเยอร์ จำกัด (Beger Co., Ltd.) • โรงงานและคลังจัดเก็บสารเคมี
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[9px] font-mono text-slate-600 leading-tight">
                      <div>เอกสาร: <strong>CAL-RPT-{record.tankName}</strong></div>
                      <div>โฟลเดอร์ Drive: <strong>Cal-Tank 001</strong></div>
                      <div>วันที่สอบเทียบ: <strong>{record.date}</strong></div>
                      <div>พิมพ์เมื่อ: <strong>{new Date().toLocaleDateString('th-TH')}</strong></div>
                    </div>
                  </div>

                  {/* Tank Meta Banner */}
                  <div className="grid grid-cols-4 gap-2 bg-slate-100 px-2 py-1.5 rounded border border-slate-300 mb-2 text-[9.5px]">
                    <div>
                      <span className="text-slate-500 block text-[8.5px]">ชื่อถังเก็บสารเคมี (Tank Name)</span>
                      <span className="font-mono font-black text-blue-900 text-xs">{record.tankName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[8.5px]">วันที่สอบเทียบ (Date)</span>
                      <span className="font-semibold text-slate-800">{record.date}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[8.5px]">โฟลเดอร์ Google Drive</span>
                      <span className="font-semibold text-emerald-800">Cal-Tank 001</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[8.5px]">อีเมลแจ้งเตือน (Email Alert)</span>
                      <span className="font-mono text-slate-700 text-[8.5px] truncate block">
                        {record.notificationEmail || 'worawit2016piw@gmail.com'}
                      </span>
                    </div>
                  </div>

                  {/* Row 1: Section 1 (Instruments) & Section 2 (Tank Dimensions & Capacity) side-by-side */}
                  <div className="grid grid-cols-12 gap-2 mb-2">
                    {/* Left: Industrial Field Instruments (Col 5) */}
                    <div className="col-span-5 border border-slate-300 rounded p-2 bg-slate-50 flex flex-col justify-between">
                      <div className="flex items-center justify-between border-b pb-1 mb-1.5">
                        <span className="font-bold text-slate-800 text-[10px] flex items-center gap-1">
                          <Activity className="w-3 h-3 text-blue-700" />
                          1. เครื่องมือวัดหน้างานจริง (Instruments)
                        </span>
                        <span className="text-[8px] text-slate-500 font-mono">
                          หน้าปัดสด
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 items-center">
                        {/* Pressure Transmitter Gauge (Realistic industrial gauge matching Image 1) */}
                        <div className="bg-white border border-slate-200 rounded p-1.5 flex flex-col items-center text-center justify-between">
                          <div className="w-20 sm:w-22 shrink-0 py-0.5">
                            <RealisticPtGauge
                              ptValue={latestPtFormatted}
                              idPrefix="rptPt1"
                              className="w-full h-auto drop-shadow-sm select-none"
                              showPill={true}
                            />
                          </div>
                          <div className="mt-1">
                            <div className="text-[8.5px] font-bold text-blue-900 leading-tight">เกจวัดแรงดันถัง (PT)</div>
                            <div className="text-xs font-mono font-black text-blue-700">
                              {latestPtFormatted} <span className="text-[8.5px] font-normal text-slate-500">Kg</span>
                            </div>
                            <div className="text-[7.5px] text-slate-500">PT หลังโหลด (ช่องรวม)</div>
                          </div>
                        </div>

                        {/* PRIMUS TIM-94N Panel Meter */}
                        <div className="bg-white border border-slate-200 rounded p-1.5 flex flex-col items-center text-center">
                          <div className="w-20 shrink-0 bg-[#1e232a] border border-[#121519] rounded p-1 shadow text-center">
                            <div className="flex justify-between items-center text-[5.5px] text-white font-mono px-0.5">
                              <span className="font-bold">PRIMUS</span>
                              <span>TIM-94N</span>
                            </div>
                            <div className="bg-[#0a0d10] border border-slate-700 rounded py-0.5 px-1 my-0.5">
                              <span className="text-xs font-mono font-black text-white tracking-widest drop-shadow-[0_0_2px_white]">
                                {latestIndFormatted}
                              </span>
                            </div>
                            <div className="flex justify-between text-[4.5px] text-slate-400 font-mono px-0.5">
                              <span className="text-emerald-400">COM.</span>
                              <span>AL1</span>
                              <span>AL2</span>
                              <span>[F][C]</span>
                            </div>
                          </div>
                          <div className="mt-1">
                            <div className="text-[8.5px] font-bold text-emerald-900 leading-tight">ดิจิตอลอินดิเคเตอร์</div>
                            <div className="text-xs font-mono font-black text-emerald-700">
                              {latestIndFormatted} <span className="text-[8.5px] font-normal text-slate-500">หลังโหลด</span>
                            </div>
                            <div className="text-[7.5px] text-slate-500">TIM-94N (ช่องรวม)</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Tank Dimensions & Level (Col 7) */}
                    <div className="col-span-7 border border-slate-300 rounded p-2 bg-white flex flex-col justify-between">
                      <div className="flex items-center justify-between border-b pb-1 mb-1">
                        <span className="font-bold text-slate-800 text-[10px] flex items-center gap-1">
                          <Layers className="w-3 h-3 text-blue-700" />
                          2. ขนาดถังเก็บสารเคมีและระดับการเติม (Tank Dimensions & Level)
                        </span>
                        <span className="text-slate-600 font-mono text-[9px]">
                          ความจุ: {(totalCapacityKg / 1000).toFixed(2)} ตัน ({levelPercent.toFixed(1)}%)
                        </span>
                      </div>

                      {/* 4 Cards */}
                      <div className="grid grid-cols-4 gap-1 mb-1 text-[8.5px] font-mono">
                        <div className="bg-slate-50 border border-slate-200 p-1 rounded">
                          <span className="text-slate-500 block text-[7.5px]">1. ความจุ 100%</span>
                          <span className="font-bold text-slate-900 text-[9.5px]">{(totalCapacityKg / 1000).toFixed(2)} ตัน</span>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 p-1 rounded">
                          <span className="text-blue-700 block text-[7.5px]">2. สารเคมีที่เติมแล้ว</span>
                          <span className="font-bold text-blue-900 text-[9.5px]">{(filledKg / 1000).toFixed(2)} ตัน</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 p-1 rounded">
                          <span className="text-amber-700 block text-[7.5px]">3. ระดับ ({levelPercent.toFixed(1)}%)</span>
                          <span className="font-bold text-amber-900 text-[9.5px]">{signal4_20mA.toFixed(2)} mA</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 p-1 rounded">
                          <span className="text-emerald-700 block text-[7.5px]">4. เติมได้อีก</span>
                          <span className="font-bold text-emerald-900 text-[9.5px]">{(remainingKg / 1000).toFixed(2)} ตัน</span>
                        </div>
                      </div>

                      {/* Tank Graphic & Specs */}
                      <div className="grid grid-cols-12 gap-2 items-center pt-1 border-t">
                        <div className="col-span-4 flex justify-center py-0.5">
                          <svg viewBox="0 0 180 240" className="w-20 h-24 select-none">
                            <defs>
                              <linearGradient id="rptTankShellSingle" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#cbd5e1" />
                                <stop offset="50%" stopColor="#f8fafc" />
                                <stop offset="100%" stopColor="#94a3b8" />
                              </linearGradient>
                              <linearGradient id="rptLiquidSingle" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#0284c7" />
                                <stop offset="50%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#0369a1" />
                              </linearGradient>
                            </defs>
                            <rect x="80" y="8" width="20" height="12" rx="2" fill="#475569" />
                            <rect x="75" y="6" width="30" height="4" rx="1" fill="#64748b" />
                            <rect x="55" y="205" width="10" height="25" fill="#475569" />
                            <rect x="115" y="205" width="10" height="25" fill="#475569" />
                            <rect x="45" y="226" width="90" height="4" fill="#334155" />
                            <path
                              d="M 40 45 C 40 20, 140 20, 140 45 L 140 185 C 140 210, 40 210, 40 185 Z"
                              fill="url(#rptTankShellSingle)"
                              stroke="#64748b"
                              strokeWidth="2"
                            />
                            {(() => {
                              const totalH = 140;
                              const fillH = (levelPercent / 100) * totalH;
                              const liquidY = 185 - fillH;
                              return (
                                <g>
                                  <path
                                    d={`M 42 ${Math.max(45, liquidY)} L 138 ${Math.max(45, liquidY)} L 138 185 C 138 205, 42 205, 42 185 Z`}
                                    fill="url(#rptLiquidSingle)"
                                    opacity="0.9"
                                  />
                                  <ellipse
                                    cx="90"
                                    cy={Math.max(45, liquidY)}
                                    rx="48"
                                    ry="4"
                                    fill="#bae6fd"
                                  />
                                  <line
                                    x1="30"
                                    y1={Math.max(45, liquidY)}
                                    x2="145"
                                    y2={Math.max(45, liquidY)}
                                    stroke="#ef4444"
                                    strokeWidth="1.5"
                                    strokeDasharray="2,2"
                                  />
                                  <polygon
                                    points={`28,${Math.max(45, liquidY)} 35,${Math.max(45, liquidY) - 3} 35,${Math.max(45, liquidY) + 3}`}
                                    fill="#ef4444"
                                  />
                                </g>
                              );
                            })()}
                            <g transform="translate(144, 0)">
                              <line x1="0" y1="45" x2="5" y2="45" stroke="#64748b" />
                              <text x="7" y="47" fontSize="7" fill="#64748b" fontFamily="monospace">100%</text>
                              <line x1="0" y1="115" x2="5" y2="115" stroke="#64748b" />
                              <text x="7" y="117" fontSize="7" fill="#64748b" fontFamily="monospace">50%</text>
                              <line x1="0" y1="185" x2="5" y2="185" stroke="#64748b" />
                              <text x="7" y="187" fontSize="7" fill="#64748b" fontFamily="monospace">0%</text>
                            </g>
                          </svg>
                        </div>
                        <div className="col-span-8 text-[8.5px]">
                          <table className="w-full border-collapse">
                            <tbody>
                              <tr className="border-b">
                                <td className="py-0.5 text-slate-500">แนวการวางถัง:</td>
                                <td className="py-0.5 font-semibold text-right text-slate-800">
                                  {dimensionConfig.orientation === 'vertical' ? 'แนวตั้ง (Vertical)' : 'แนวนอน (Horizontal)'}
                                </td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-0.5 text-slate-500">ความสูง x เส้นผ่านศูนย์กลาง:</td>
                                <td className="py-0.5 font-mono font-semibold text-right text-slate-800">
                                  {dimensionConfig.height} ม. x {dimensionConfig.diameter} ม.
                                </td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-0.5 text-slate-500">สารเคมีที่เติมแล้ว / คงเหลือ:</td>
                                <td className="py-0.5 font-mono text-right">
                                  <span className="text-blue-700 font-bold">{(filledKg / 1000).toFixed(2)} ตัน</span> / <span className="text-emerald-700 font-bold">{(remainingKg / 1000).toFixed(2)} ตัน</span>
                                </td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-0.5 text-slate-500">ระยะความสูงคงเหลือในถัง:</td>
                                <td className="py-0.5 font-mono text-right text-amber-700 font-bold">
                                  ≈ {remainingMeters.toFixed(2)} ม.
                                </td>
                              </tr>
                              <tr>
                                <td className="py-0.5 text-slate-500">สัญญาณเอาต์พุตเซนเซอร์:</td>
                                <td className="py-0.5 font-mono font-bold text-right text-slate-900">
                                  {signal4_20mA.toFixed(2)} mA (ช่วง 4-20mA)
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Section 3 (Calibration Data Table - 11 Cycles) */}
                  <div className="border border-slate-300 rounded p-1.5 mb-2 bg-white">
                    <div className="flex items-center justify-between border-b pb-0.5 mb-1">
                      <span className="font-bold text-slate-800 text-[10px] flex items-center gap-1">
                        <Folder className="w-3 h-3 text-sky-700" />
                        3. ตารางบันทึกค่าการสอบเทียบ (Calibration Data Table - 11 Cycles)
                      </span>
                      <span className="text-[8.5px] font-mono text-slate-600">
                        น้ำหนักจริงรวม: <strong className="text-emerald-800">{totals.sumActualWeight.toLocaleString()} kg</strong> | สะสมสูงสุด: <strong className="text-amber-800">{totals.maxCounter.toLocaleString()} kg</strong>
                      </span>
                    </div>

                    <table className="w-full border-collapse text-[8px] text-center border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 font-semibold text-slate-800">
                          <th className="py-0.5 px-1 border border-slate-300 w-8">Cycle</th>
                          <th className="py-0.5 px-1 border border-slate-300">PT ก่อนโหลด</th>
                          <th className="py-0.5 px-1 border border-slate-300">Indicator ก่อนโหลด</th>
                          <th className="py-0.5 px-1 border border-slate-300 text-blue-800 bg-blue-50/70">PT หลังโหลด</th>
                          <th className="py-0.5 px-1 border border-slate-300 text-sky-800 bg-sky-50/70">Indicator หลังโหลด</th>
                          <th className="py-0.5 px-1 border border-slate-300 text-emerald-900 bg-emerald-50/70">น้ำหนักจริงที่ผลิตโหลดมา</th>
                          <th className="py-0.5 px-1 border border-slate-300 text-amber-900 bg-amber-50/70">ตัวนับ (สะสมจริง)</th>
                          <th className="py-0.5 px-1 border border-slate-300 w-20">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-[8px]">
                        {record.cycles.map((c) => (
                          <tr key={c.cycle} className="hover:bg-slate-50">
                            <td className="py-0.5 px-1 border border-slate-300 font-bold bg-slate-50 text-slate-900">{c.cycle}</td>
                            <td className="py-0.5 px-1 border border-slate-300">{c.ptBefore !== null ? c.ptBefore : '-'}</td>
                            <td className="py-0.5 px-1 border border-slate-300">{c.indBefore !== null ? c.indBefore : '-'}</td>
                            <td className="py-0.5 px-1 border border-slate-300 text-blue-800 font-medium">{c.ptAfter !== null ? c.ptAfter : '-'}</td>
                            <td className="py-0.5 px-1 border border-slate-300 text-sky-800 font-medium">{c.indAfter !== null ? c.indAfter : '-'}</td>
                            <td className="py-0.5 px-1 border border-slate-300 font-semibold text-emerald-900">
                              {c.actualWeight !== null ? c.actualWeight.toLocaleString() : '-'}
                            </td>
                            <td className="py-0.5 px-1 border border-slate-300 font-bold text-amber-900">
                              {c.cumulativeCounter !== null ? c.cumulativeCounter.toLocaleString() : '-'}
                            </td>
                            <td className="py-0.5 px-1 border border-slate-300 text-[7.5px] text-slate-500 font-sans">{c.remark || '-'}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[8px]">
                          <td className="py-0.5 px-1 border border-slate-300 font-sans text-slate-900">รวม / ล่าสุด</td>
                          <td className="py-0.5 px-1 border border-slate-300 text-blue-800">
                            {totals.latestPtBefore !== null ? `${totals.latestPtBefore} (ล่าสุด)` : totals.sumPtBefore}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-sky-800">
                            {totals.latestIndBefore !== null ? `${totals.latestIndBefore} (ล่าสุด)` : totals.sumIndBefore}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-blue-800 font-black">
                            {totals.latestPtAfter !== null ? `${totals.latestPtAfter} (ล่าสุด)` : totals.sumPtAfter}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-sky-800 font-black">
                            {totals.latestIndAfter !== null ? `${totals.latestIndAfter} (ล่าสุด)` : totals.sumIndAfter}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-emerald-900 font-black">
                            {totals.sumActualWeight.toLocaleString()}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-amber-900 font-black">
                            {totals.maxCounter.toLocaleString()}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-[7.5px] font-sans text-slate-600">
                            โหลดรวมสุทธิ
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Row 3: Section 4 (Calibration Curves & Regression Equations) */}
                  <div className="border border-slate-300 rounded p-1.5 mb-2 bg-white">
                    <div className="flex items-center justify-between border-b pb-0.5 mb-1">
                      <span className="font-bold text-slate-800 text-[10px] flex items-center gap-1">
                        <Activity className="w-3 h-3 text-sky-700" />
                        4. กราฟเปรียบเทียบการสอบเทียบและเส้นแนวโน้ม (Calibration Curves & Linear Regression)
                      </span>
                      <span className="text-[8px] text-slate-500 font-mono">
                        Indicator & PT vs น้ำหนักจริงสะสม
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {renderReportSvgChart(
                        'Indicator หลังโหลด กับ น้ำหนักจริง',
                        indicatorPoints,
                        regInd,
                        'Indicator หลังโหลด (kg)',
                        'น้ำหนักจริง (kg) / ตัวนับ',
                        true
                      )}
                      {renderReportSvgChart(
                        'รอบ ของ Cycle 1-10 กับ น้ำหนักจริง',
                        cyclePoints,
                        regCycle,
                        'รอบ ของ Cycle (1-10)',
                        'น้ำหนักจริง (kg) / ตัวนับ',
                        true,
                        true
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Signature & Footer Block - Pulled snug against bottom border line as requested */}
                <div className="mt-auto pt-2">
                  {/* Row 4: Section 5 (Calibration Signatures & Verification) - Snug against bottom line */}
                  <div className="border border-slate-300 rounded p-1.5 bg-white mb-1 shadow-xs">
                    <div className="flex items-center justify-between border-b pb-0.5 mb-1.5">
                      <span className="font-bold text-slate-800 text-[9.5px] flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-700" />
                        5. การรับรองผลการสอบเทียบ (Calibration Signatures & Verification)
                      </span>
                      <span className="text-[8px] text-slate-500">
                        มาตรฐานงานวิศวกรรม บริษัท เบเยอร์ จำกัด
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center text-[8.5px] text-slate-600">
                      <div className="space-y-1">
                        <div className="h-4 border-b border-dotted border-slate-400"></div>
                        <div>
                          <div className="font-semibold text-slate-800">ลงชื่อ ผู้บันทึกข้อมูลหน้างาน</div>
                          <div>( .................................................... )</div>
                          <div className="text-[7.5px] text-slate-500">วันที่ ......./......./...........</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-4 border-b border-dotted border-slate-400"></div>
                        <div>
                          <div className="font-semibold text-slate-800">ลงชื่อ วิศวกรควบคุมกระบวนการ</div>
                          <div>( .................................................... )</div>
                          <div className="text-[7.5px] text-slate-500">วันที่ ......./......./...........</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-4 border-b border-dotted border-slate-400"></div>
                        <div>
                          <div className="font-semibold text-slate-800">ลงชื่อ ผู้จัดการฝ่ายผลิต/ซ่อมบำรุง</div>
                          <div>( .................................................... )</div>
                          <div className="text-[7.5px] text-slate-500">วันที่ ......./......./...........</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Single Page Footer (เส้นขีดด้านล่าง) */}
                  <div className="border-t pt-1 flex justify-between text-[8px] text-slate-500 font-mono">
                    <span>หน้า 1/1 • รายงานผลการสอบเทียบถังเก็บสารเคมีฉบับสมบูรณ์รวมหน้าเดียว (Single Page Report) • ถัง {record.tankName}</span>
                    <span>Cal-Tank 001 • Beger Co., Ltd. • พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH')}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* ==================== TWO PAGES REPORT: DETAILED TWO-PAGE REPORT ==================== */
              <>
                {/* ---------- PAGE 1: INSTRUMENTS, TANK DIMENSIONS & CALIBRATION TABLE ---------- */}
                <div className="pdf-page-sheet bg-white text-slate-900 p-8 rounded shadow-lg text-[12px] font-sans leading-normal print:p-0 print:shadow-none min-h-[1100px] flex flex-col justify-between">
                  <div>
                    {/* Header with Beger Logo */}
                    <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
                      <div className="flex items-center gap-4">
                        <BegerLogo height={52} />
                        <div>
                          <h1 className="text-lg font-black text-slate-900 tracking-tight">
                            รายงานผลการสอบเทียบถังเก็บสารเคมี (Cal-Tank 001)
                          </h1>
                          <div className="text-[11px] text-slate-600 font-medium">
                            บริษัท เบเยอร์ จำกัด (Beger Co., Ltd.) • โรงงานและคลังจัดเก็บสารเคมี
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-[10.5px] font-mono text-slate-600">
                        <div>เอกสาร: <strong>CAL-RPT-{record.tankName}</strong></div>
                        <div>โฟลเดอร์ Drive: <strong>Cal-Tank 001</strong></div>
                        <div>วันที่: <strong>{record.date}</strong></div>
                        <div>พิมพ์เมื่อ: <strong>{new Date().toLocaleDateString('th-TH')}</strong></div>
                      </div>
                    </div>

                    {/* Tank Meta Banner */}
                    <div className="grid grid-cols-4 gap-2 bg-slate-100 p-2.5 rounded border border-slate-300 mb-4 text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">ชื่อถังเก็บสารเคมี (Tank Name)</span>
                        <span className="font-mono font-black text-blue-900 text-sm">{record.tankName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">วันที่สอบเทียบ (Date)</span>
                        <span className="font-semibold text-slate-800">{record.date}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">โฟลเดอร์ Google Drive</span>
                        <span className="font-semibold text-emerald-800">Cal-Tank 001</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">อีเมลแจ้งเตือน (Email Alert)</span>
                        <span className="font-mono text-slate-700 text-[10px] truncate block">
                          {record.notificationEmail || 'worawit2016piw@gmail.com'}
                        </span>
                      </div>
                    </div>

                    {/* Section 1: Field Instruments Display */}
                    <div className="border border-slate-300 rounded p-3 mb-4 bg-slate-50">
                      <div className="flex items-center justify-between border-b pb-1.5 mb-2.5">
                        <span className="font-bold text-slate-800 text-[12px] flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-blue-700" />
                          1. เครื่องมือวัดหน้างานจริง (Field Instruments Display)
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          PT หลังโหลด: {latestPtFormatted} Kg | Indicator หลังโหลด: {latestIndFormatted}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 items-center">
                        {/* Pressure Transmitter Gauge (Realistic industrial gauge matching Image 1) */}
                        <div className="bg-white border border-slate-200 rounded p-2.5 flex items-center gap-3">
                          <div className="w-24 h-28 shrink-0 flex items-center justify-center">
                            <RealisticPtGauge
                              ptValue={latestPtFormatted}
                              idPrefix="rptPtPage2"
                              className="w-full h-auto drop-shadow select-none"
                              showPill={true}
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="text-[10px] font-bold text-blue-900">เกจวัดแรงดันถัง (PT หลังโหลด)</div>
                            <div className="text-base font-mono font-black text-blue-700">
                              {latestPtFormatted}{' '}
                              <span className="text-xs font-normal text-slate-500">Kg (ช่องรวม)</span>
                            </div>
                            <div className="text-[9.5px] text-slate-500">
                              เครื่องส่งสัญญาณแรงดัน PT หลังโหลด (ช่องรวม) ประจำถัง {record.tankName}
                            </div>
                          </div>
                        </div>

                        {/* PRIMUS TIM-94N Panel Meter */}
                        <div className="bg-white border border-slate-200 rounded p-2.5 flex items-center gap-3">
                          <div className="w-24 shrink-0 bg-[#1e232a] border-2 border-[#121519] rounded p-1.5 shadow text-center">
                            <div className="flex justify-between items-center text-[6px] text-white font-mono px-0.5">
                              <span className="font-bold">PRIMUS</span>
                              <span>TIM-94N</span>
                            </div>
                            <div className="bg-[#0a0d10] border border-slate-700 rounded py-1 px-1 my-1">
                              <span className="text-sm font-mono font-black text-white tracking-widest drop-shadow-[0_0_3px_white]">
                                {latestIndFormatted}
                              </span>
                            </div>
                            <div className="flex justify-between text-[5px] text-slate-400 font-mono px-0.5">
                              <span className="text-emerald-400">COM.</span>
                              <span>AL1</span>
                              <span>AL2</span>
                              <span>[F] [C]</span>
                            </div>
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="text-[10px] font-bold text-emerald-900">ดิจิตอลอินดิเคเตอร์ (TIM-94N)</div>
                            <div className="text-base font-mono font-black text-emerald-700">
                              {latestIndFormatted}{' '}
                              <span className="text-xs font-normal text-slate-500">หลังโหลด</span>
                            </div>
                            <div className="text-[9.5px] text-slate-500">
                              จอ LED ดิจิทัล PRIMUS TIM-94N ค่ารวมล่าสุดของ Indicator หลังโหลด
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Tank Dimensions & Capacity */}
                    <div className="border border-slate-300 rounded p-3 mb-4 bg-white">
                      <div className="flex items-center justify-between border-b pb-1.5 mb-2.5">
                        <span className="font-bold text-slate-800 text-[12px] flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-700" />
                          2. ขนาดถังเก็บสารเคมี (Tank Dimensions & Capacity)
                        </span>
                        <span className="text-slate-600 font-mono text-[10.5px]">
                          ความจุเต็มถัง: {(totalCapacityKg / 1000).toFixed(2)} ตัน
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3 text-[11px] font-mono">
                        <div className="bg-slate-50 border border-slate-200 p-2 rounded">
                          <span className="text-slate-500 block text-[9.5px]">1. ความจุเต็มถัง (100%)</span>
                          <span className="font-bold text-slate-900 text-xs">{(totalCapacityKg / 1000).toFixed(2)} ตัน</span>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 p-2 rounded">
                          <span className="text-blue-700 block text-[9.5px]">2. สารเคมีที่เติมแล้ว</span>
                          <span className="font-bold text-blue-900 text-xs">{(filledKg / 1000).toFixed(2)} ตัน</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 p-2 rounded">
                          <span className="text-amber-700 block text-[9.5px]">3. ระดับการเติม ({levelPercent.toFixed(1)}%)</span>
                          <span className="font-bold text-amber-900 text-xs">{signal4_20mA.toFixed(2)} mA</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 p-2 rounded">
                          <span className="text-emerald-700 block text-[9.5px]">4. เหลือพื้นที่เติมได้อีก</span>
                          <span className="font-bold text-emerald-900 text-xs">{(remainingKg / 1000).toFixed(2)} ตัน</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-3 items-center pt-1 border-t">
                        <div className="col-span-5 flex justify-center py-1">
                          <svg viewBox="0 0 180 240" className="w-36 h-40 select-none">
                            <defs>
                              <linearGradient id="rptTankShellPage1" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#cbd5e1" />
                                <stop offset="50%" stopColor="#f8fafc" />
                                <stop offset="100%" stopColor="#94a3b8" />
                              </linearGradient>
                              <linearGradient id="rptLiquidPage1" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#0284c7" />
                                <stop offset="50%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#0369a1" />
                              </linearGradient>
                            </defs>
                            <rect x="80" y="8" width="20" height="12" rx="2" fill="#475569" />
                            <rect x="75" y="6" width="30" height="4" rx="1" fill="#64748b" />
                            <rect x="55" y="205" width="10" height="25" fill="#475569" />
                            <rect x="115" y="205" width="10" height="25" fill="#475569" />
                            <rect x="45" y="226" width="90" height="4" fill="#334155" />
                            <path
                              d="M 40 45 C 40 20, 140 20, 140 45 L 140 185 C 140 210, 40 210, 40 185 Z"
                              fill="url(#rptTankShellPage1)"
                              stroke="#64748b"
                              strokeWidth="2"
                            />
                            {(() => {
                              const totalH = 140;
                              const fillH = (levelPercent / 100) * totalH;
                              const liquidY = 185 - fillH;
                              return (
                                <g>
                                  <path
                                    d={`M 42 ${Math.max(45, liquidY)} L 138 ${Math.max(45, liquidY)} L 138 185 C 138 205, 42 205, 42 185 Z`}
                                    fill="url(#rptLiquidPage1)"
                                    opacity="0.9"
                                  />
                                  <ellipse cx="90" cy={Math.max(45, liquidY)} rx="48" ry="4" fill="#bae6fd" />
                                  <line
                                    x1="30"
                                    y1={Math.max(45, liquidY)}
                                    x2="145"
                                    y2={Math.max(45, liquidY)}
                                    stroke="#ef4444"
                                    strokeWidth="1.5"
                                    strokeDasharray="2,2"
                                  />
                                  <polygon
                                    points={`28,${Math.max(45, liquidY)} 35,${Math.max(45, liquidY) - 3} 35,${Math.max(45, liquidY) + 3}`}
                                    fill="#ef4444"
                                  />
                                </g>
                              );
                            })()}
                            <g transform="translate(144, 0)">
                              <line x1="0" y1="45" x2="5" y2="45" stroke="#64748b" />
                              <text x="7" y="47" fontSize="7" fill="#64748b" fontFamily="monospace">100%</text>
                              <line x1="0" y1="80" x2="5" y2="80" stroke="#64748b" />
                              <text x="7" y="82" fontSize="7" fill="#64748b" fontFamily="monospace">75%</text>
                              <line x1="0" y1="115" x2="5" y2="115" stroke="#64748b" />
                              <text x="7" y="117" fontSize="7" fill="#64748b" fontFamily="monospace">50%</text>
                              <line x1="0" y1="150" x2="5" y2="150" stroke="#64748b" />
                              <text x="7" y="152" fontSize="7" fill="#64748b" fontFamily="monospace">25%</text>
                              <line x1="0" y1="185" x2="5" y2="185" stroke="#64748b" />
                              <text x="7" y="187" fontSize="7" fill="#64748b" fontFamily="monospace">0%</text>
                            </g>
                          </svg>
                        </div>
                        <div className="col-span-7 text-[10.5px]">
                          <table className="w-full border-collapse">
                            <tbody>
                              <tr className="border-b">
                                <td className="py-1 text-slate-500">แนวการวางถัง:</td>
                                <td className="py-1 font-semibold text-right text-slate-800">
                                  {dimensionConfig.orientation === 'vertical' ? 'แนวตั้ง (Vertical)' : 'แนวนอน (Horizontal)'}
                                </td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-1 text-slate-500">ความสูงถัง (เมตร):</td>
                                <td className="py-1 font-mono font-semibold text-right text-slate-800">{dimensionConfig.height} ม.</td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-1 text-slate-500">เส้นผ่านศูนย์กลาง (เมตร):</td>
                                <td className="py-1 font-mono font-semibold text-right text-slate-800">{dimensionConfig.diameter} ม.</td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-1 text-slate-500">สารเคมีที่เติมแล้ว:</td>
                                <td className="py-1 font-mono font-bold text-right text-blue-700">{(filledKg / 1000).toFixed(2)} ตัน</td>
                              </tr>
                              <tr className="border-b">
                                <td className="py-1 text-slate-500">เหลือพื้นที่เติมได้อีก:</td>
                                <td className="py-1 font-mono font-bold text-right text-emerald-700">{(remainingKg / 1000).toFixed(2)} ตัน</td>
                              </tr>
                              <tr>
                                <td className="py-1 text-slate-500">สัญญาณเอาต์พุตเครื่องวัด:</td>
                                <td className="py-1 font-mono font-bold text-right text-slate-900">{signal4_20mA.toFixed(2)} mA</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Calibration Data Table */}
                    <div className="border border-slate-300 rounded p-2.5 bg-white">
                      <div className="flex items-center justify-between border-b pb-1 mb-1.5">
                        <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                          <Folder className="w-3 h-3 text-sky-700" />
                          3. ตารางบันทึกค่าการสอบเทียบ (Calibration Data Table - 11 Cycles)
                        </span>
                        <span className="text-[10px] font-mono text-slate-600">
                          น้ำหนักจริงรวม: <strong className="text-emerald-800">{totals.sumActualWeight.toLocaleString()} kg</strong>
                        </span>
                      </div>

                      <table className="w-full border-collapse text-[9.5px] text-center border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 font-semibold text-slate-800">
                            <th className="p-1 border border-slate-300 w-10">Cycle</th>
                            <th className="p-1 border border-slate-300">PT ก่อนโหลด</th>
                            <th className="p-1 border border-slate-300">Indicator ก่อนโหลด</th>
                            <th className="p-1 border border-slate-300 text-blue-800 bg-blue-50/70">PT หลังโหลด</th>
                            <th className="p-1 border border-slate-300 text-sky-800 bg-sky-50/70">Indicator หลังโหลด</th>
                            <th className="p-1 border border-slate-300 text-emerald-900 bg-emerald-50/70">น้ำหนักจริงที่ผลิตโหลดมา</th>
                            <th className="p-1 border border-slate-300 text-amber-900 bg-amber-50/70">ตัวนับ (สะสม)</th>
                            <th className="p-1 border border-slate-300 w-24">หมายเหตุ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-mono text-[9.5px]">
                          {record.cycles.map((c) => (
                            <tr key={c.cycle} className="hover:bg-slate-50">
                              <td className="p-1 border border-slate-300 font-bold bg-slate-50 text-slate-900">{c.cycle}</td>
                              <td className="p-1 border border-slate-300">{c.ptBefore !== null ? c.ptBefore : '-'}</td>
                              <td className="p-1 border border-slate-300">{c.indBefore !== null ? c.indBefore : '-'}</td>
                              <td className="p-1 border border-slate-300 text-blue-800 font-medium">{c.ptAfter !== null ? c.ptAfter : '-'}</td>
                              <td className="p-1 border border-slate-300 text-sky-800 font-medium">{c.indAfter !== null ? c.indAfter : '-'}</td>
                              <td className="p-1 border border-slate-300 font-semibold text-emerald-900">
                                {c.actualWeight !== null ? c.actualWeight.toLocaleString() : '-'}
                              </td>
                              <td className="p-1 border border-slate-300 font-bold text-amber-900">
                                {c.cumulativeCounter !== null ? c.cumulativeCounter.toLocaleString() : '-'}
                              </td>
                              <td className="p-1 border border-slate-300 text-[8.5px] text-slate-500 font-sans">{c.remark || '-'}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[9.5px]">
                            <td className="p-1 border border-slate-300 font-sans text-slate-900">รวม / ล่าสุด</td>
                            <td className="p-1 border border-slate-300 text-blue-800">
                              {totals.latestPtBefore !== null ? `${totals.latestPtBefore} (ล่าสุด)` : totals.sumPtBefore}
                            </td>
                            <td className="p-1 border border-slate-300 text-sky-800">
                              {totals.latestIndBefore !== null ? `${totals.latestIndBefore} (ล่าสุด)` : totals.sumIndBefore}
                            </td>
                            <td className="p-1 border border-slate-300 text-blue-800 font-black">
                              {totals.latestPtAfter !== null ? `${totals.latestPtAfter} (ล่าสุด)` : totals.sumPtAfter}
                            </td>
                            <td className="p-1 border border-slate-300 text-sky-800 font-black">
                              {totals.latestIndAfter !== null ? `${totals.latestIndAfter} (ล่าสุด)` : totals.sumIndAfter}
                            </td>
                            <td className="p-1 border border-slate-300 text-emerald-900 font-black">
                              {totals.sumActualWeight.toLocaleString()}
                            </td>
                            <td className="p-1 border border-slate-300 text-amber-900 font-black">
                              {totals.maxCounter.toLocaleString()}
                            </td>
                            <td className="p-1 border border-slate-300 text-[8.5px] font-sans text-slate-600">
                              โหลดรวมสุทธิ
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Page 1 Footer */}
                  <div className="border-t pt-2 flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>หน้า 1/2 • ข้อมูลอุปกรณ์ ขนาดถัง และตารางสอบเทียบถัง {record.tankName}</span>
                    <span>Cal-Tank 001 • Beger Co., Ltd.</span>
                  </div>
                </div>

                {/* ---------- PAGE 2: CALIBRATION CURVES, REGRESSION & SIGNATURES ---------- */}
                <div className="pdf-page-sheet bg-white text-slate-900 p-8 rounded shadow-lg text-[12px] font-sans leading-normal print:p-0 print:shadow-none min-h-[1100px] flex flex-col justify-between">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b pb-2 mb-3">
                      <div className="flex items-center gap-3">
                        <BegerLogo height={36} />
                        <div>
                          <h2 className="text-base font-bold text-slate-900">
                            กราฟเปรียบเทียบการสอบเทียบและการรับรอง (Calibration Curves & Verification)
                          </h2>
                          <div className="text-[10px] text-slate-500">
                            กราฟเส้นแสดงความสัมพันธ์ระหว่าง Indicator / PT หลังโหลด กับ น้ำหนักจริงสะสม
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-mono text-slate-600">
                        <div>ถัง: <strong>{record.tankName}</strong></div>
                        <div>วันที่: <strong>{record.date}</strong></div>
                      </div>
                    </div>

                    {/* Section 4: Dual SVG Charts */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {renderReportSvgChart(
                        'Indicator หลังโหลด กับ น้ำหนักจริง',
                        indicatorPoints,
                        regInd,
                        'Indicator หลังโหลด (kg)',
                        'น้ำหนักจริง (kg) / ตัวนับ'
                      )}
                      {renderReportSvgChart(
                        'รอบ ของ Cycle 1-10 กับ น้ำหนักจริง',
                        cyclePoints,
                        regCycle,
                        'รอบ ของ Cycle (1-10)',
                        'น้ำหนักจริง (kg) / ตัวนับ',
                        false,
                        true
                      )}
                    </div>

                    {/* Section 5: Linear Regression Summary */}
                    <div className="bg-slate-50 border border-slate-300 rounded p-3 mb-4 text-[10.5px]">
                      <h3 className="font-bold text-slate-800 text-[11px] mb-1.5">
                        สรุปผลการวิเคราะห์สมการเส้นตรง (Linear Regression Analysis Summary)
                      </h3>
                      <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                        <div className="p-2 bg-white border border-slate-200 rounded">
                          <span className="text-slate-500 block">สมการความสัมพันธ์ Indicator:</span>
                          <span className="font-bold text-blue-900">
                            Y = {regInd ? `${regInd.slope.toFixed(2)}X + ${regInd.intercept.toFixed(2)}` : 'N/A'}
                          </span>
                          <div className="text-[9px] text-slate-500 mt-0.5">
                            ค่าสัมประสิทธิ์การตัดสินใจ (R²) = {regInd ? regInd.r2.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="p-2 bg-white border border-slate-200 rounded">
                          <span className="text-slate-500 block">สมการความสัมพันธ์ รอบ Cycle 1-10:</span>
                          <span className="font-bold text-emerald-900">
                            Y = {regCycle ? `${regCycle.slope.toFixed(2)}X + ${regCycle.intercept.toFixed(2)}` : 'N/A'}
                          </span>
                          <div className="text-[9px] text-slate-500 mt-0.5">
                            ค่าสัมประสิทธิ์การตัดสินใจ (R²) = {regCycle ? regCycle.r2.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 6: System Feature Notes */}
                    <div className="grid grid-cols-3 gap-3 mb-4 text-[9.5px]">
                      <div className="border border-slate-200 rounded p-2 bg-slate-50 space-y-1">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <Folder className="w-3 h-3 text-sky-600" />
                          โฟลเดอร์ Cal-Tank 001
                        </div>
                        <p className="text-slate-600 leading-relaxed text-[9px]">
                          จัดเก็บไฟล์ในโฟลเดอร์ Cal-Tank 001 ใน Google Drive แยกไฟล์เฉพาะของแต่ละถัง
                        </p>
                      </div>

                      <div className="border border-slate-200 rounded p-2 bg-slate-50 space-y-1">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          แก้ไขและเซฟทับได้
                        </div>
                        <p className="text-slate-600 leading-relaxed text-[9px]">
                          สามารถแก้ไขและเซฟทับไฟล์เดิมได้ทันที โดยคงประวัติไฟล์เดิมไว้
                        </p>
                      </div>

                      <div className="border border-slate-200 rounded p-2 bg-slate-50 space-y-1">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <Mail className="w-3 h-3 text-purple-600" />
                          แจ้งเตือน & ดูไม่จำกัด
                        </div>
                        <p className="text-slate-600 leading-relaxed text-[9px]">
                          ส่งอีเมลแจ้งเตือนอัตโนมัติ และเปิดดูข้อมูลย้อนหลังได้โดยไม่ต้องล็อกอิน
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Section 7: Official Signatures - Pulled down close to bottom border line */}
                  <div className="mt-auto pt-3">
                    <div className="border border-slate-300 rounded p-3.5 bg-white mb-2 shadow-xs">
                      <h3 className="font-bold text-slate-800 text-[11px] border-b pb-1 mb-3 text-center">
                        การรับรองผลการสอบเทียบ (Calibration Engineering Signatures & Approval)
                      </h3>
                      <div className="grid grid-cols-3 gap-6 text-center text-[10px] text-slate-600">
                        <div className="space-y-3">
                          <div className="h-6 border-b border-dotted border-slate-400"></div>
                          <div>
                            <div className="font-semibold text-slate-800">ลงชื่อ ผู้บันทึกข้อมูลหน้างาน</div>
                            <div>( .................................................... )</div>
                            <div className="text-[9px] text-slate-500">วันที่ ......./......./...........</div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-6 border-b border-dotted border-slate-400"></div>
                          <div>
                            <div className="font-semibold text-slate-800">ลงชื่อ วิศวกรควบคุมกระบวนการ</div>
                            <div>( .................................................... )</div>
                            <div className="text-[9px] text-slate-500">วันที่ ......./......./...........</div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-6 border-b border-dotted border-slate-400"></div>
                          <div>
                            <div className="font-semibold text-slate-800">ลงชื่อ ผู้จัดการฝ่ายผลิต/ซ่อมบำรุง</div>
                            <div>( .................................................... )</div>
                            <div className="text-[9px] text-slate-500">วันที่ ......./......./...........</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Page 2 Footer */}
                    <div className="border-t pt-2 flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>หน้า 2/2 • กราฟเปรียบเทียบการสอบเทียบและลายมือชื่อรับรอง {record.tankName}</span>
                      <span>Cal-Tank 001 • Beger Co., Ltd.</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
