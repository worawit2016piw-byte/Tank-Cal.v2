import React from 'react';
import { CalibrationRecord } from '../types/calibration';
import { calculateTotals } from '../services/storage';
import { isRealGoogleSpreadsheet } from '../services/workspace';
import { Mail, X, ExternalLink, Send } from 'lucide-react';

interface EmailPreviewModalProps {
  isOpen: boolean;
  record: CalibrationRecord;
  currentUserEmail?: string;
  onClose: () => void;
  onSendTest?: () => void;
  isSendingTest?: boolean;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({
  isOpen,
  record,
  currentUserEmail,
  onClose,
  onSendTest,
  isSendingTest = false,
}) => {
  if (!isOpen) return null;

  const totals = calculateTotals(record.cycles);
  const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ตัวอย่างอีเมลแจ้งเตือน (Email Notification Preview)
              </h3>
              <p className="text-xs text-slate-400">
                ส่งไปยัง: <span className="text-purple-300 font-mono">{record.notificationEmail || 'worawit2016piw@gmail.com'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mock Email View */}
        <div className="my-4 overflow-y-auto pr-1 rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs font-sans space-y-4">
          {/* Email Subject Bar */}
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400">Subject: </span>
            <span className="font-bold text-sky-300">
              [แจ้งเตือนการอัปเดต] ข้อมูลการสอบเทียบถัง {record.tankName} (Cal-Tank 001)
            </span>
          </div>

          {/* Email HTML Body Container Preview */}
          <div className="bg-white text-slate-900 p-5 rounded-xl shadow-inner space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <div className="inline-block bg-sky-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider">
                CALIBRATION TANK SYSTEM
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-2">
                แจ้งเตือน: อัปเดตข้อมูลถัง {record.tankName}
              </h2>
              <div className="text-[11px] text-slate-500">
                Google Drive: Cal-Tank 001 • {nowStr}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">ถังสารเคมี:</span>{' '}
                <strong className="text-slate-800">{record.tankName}</strong>
              </div>
              <div>
                <span className="text-slate-500">วันที่:</span>{' '}
                <strong className="text-slate-800">{record.date}</strong>
              </div>
              <div>
                <span className="text-slate-500">น้ำหนักจริงรวม:</span>{' '}
                <strong className="text-sky-600 font-mono">
                  {totals.sumActualWeight.toLocaleString()} kg
                </strong>
              </div>
              <div>
                <span className="text-slate-500">ผู้แก้ไข:</span>{' '}
                <span className="text-slate-700 font-mono text-[11px]">
                  {currentUserEmail || 'worawit2016piw@gmail.com'}
                </span>
              </div>
            </div>

            {/* Attachment Banner */}
            <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-900 font-medium">
                <span className="p-1.5 bg-emerald-600 text-white rounded-md font-bold text-[10px]">PDF</span>
                <div>
                  <div className="font-bold text-slate-900">
                    Beger_Calibration_Report_{record.tankName}_{record.date}.pdf
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    รายงานผลการสอบเทียบฉบับสมบูรณ์ (พร้อมลายมือชื่อรับรอง & ข้อมูล 10 รอบ) แนบส่งพร้อมอีเมล
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-mono font-bold px-2 py-0.5 rounded">
                แนบแล้ว
              </span>
            </div>

            <div className="text-center py-1">
              <a
                href={
                  isRealGoogleSpreadsheet(record.spreadsheetId, record.spreadsheetUrl)
                    ? record.spreadsheetUrl!
                    : 'https://sheets.new'
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-xs shadow-sm transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>เปิดดูไฟล์ Google Sheet ใน Google Drive (Cal-Tank 001)</span>
              </a>
            </div>

            <div className="overflow-x-auto">
              <div className="font-bold text-slate-800 text-xs mb-1.5 text-left">
                ตารางบันทึกผลการสอบเทียบทุก Cycle (รอบ 0-10):
              </div>
              <table className="w-full border-collapse text-[11px] text-center border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 font-semibold text-slate-700">
                    <th className="p-1 border border-slate-300">Cycle</th>
                    <th className="p-1 border border-slate-300">PT ก่อน</th>
                    <th className="p-1 border border-slate-300">Ind ก่อน</th>
                    <th className="p-1 border border-slate-300 text-blue-600">PT หลัง</th>
                    <th className="p-1 border border-slate-300 text-sky-600">Ind หลัง</th>
                    <th className="p-1 border border-slate-300">น้ำหนักจริง</th>
                    <th className="p-1 border border-slate-300">ตัวนับ</th>
                    <th className="p-1 border border-slate-300">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {record.cycles
                    .filter((c) => c.cycle >= 0 && c.cycle <= 10)
                    .map((c) => (
                      <tr key={c.cycle}>
                        <td className="p-1 border border-slate-300 font-bold bg-slate-50">{c.cycle}</td>
                        <td className="p-1 border border-slate-300">{c.ptBefore ?? '-'}</td>
                        <td className="p-1 border border-slate-300">{c.indBefore ?? '-'}</td>
                        <td className="p-1 border border-slate-300 text-blue-600 font-semibold">{c.ptAfter ?? '-'}</td>
                        <td className="p-1 border border-slate-300 text-sky-600 font-semibold">{c.indAfter ?? '-'}</td>
                        <td className="p-1 border border-slate-300 font-bold text-emerald-900">
                          {c.actualWeight !== null ? c.actualWeight.toLocaleString() : '-'}
                        </td>
                        <td className="p-1 border border-slate-300 font-bold text-amber-900">
                          {c.cumulativeCounter !== null ? c.cumulativeCounter.toLocaleString() : '-'}
                        </td>
                        <td className="p-1 border border-slate-300 text-[10px] text-slate-500 font-sans">{c.remark || '-'}</td>
                      </tr>
                    ))}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                    <td className="p-1 border border-slate-300 font-sans">รวม</td>
                    <td className="p-1 border border-slate-300 text-blue-700">{totals.latestPtBefore ?? totals.sumPtBefore}</td>
                    <td className="p-1 border border-slate-300 text-sky-700">{totals.latestIndBefore ?? totals.sumIndBefore}</td>
                    <td className="p-1 border border-slate-300 text-blue-800">{totals.latestPtAfter ?? totals.sumPtAfter}</td>
                    <td className="p-1 border border-slate-300 text-sky-800">{totals.latestIndAfter ?? totals.sumIndAfter}</td>
                    <td className="p-1 border border-slate-300 text-emerald-900">{totals.sumActualWeight.toLocaleString()}</td>
                    <td className="p-1 border border-slate-300 text-amber-900">{totals.maxCounter.toLocaleString()}</td>
                    <td className="p-1 border border-slate-300 text-[10px] text-slate-500 font-sans">สุทธิ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-400">
            ระบบจะส่งอีเมลนี้โดยอัตโนมัติเมื่อท่านคลิก "บันทึก / เซฟทับ"
          </div>
          <div className="flex items-center gap-2">
            {onSendTest && (
              <button
                type="button"
                onClick={onSendTest}
                disabled={isSendingTest}
                className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingTest ? 'กำลังส่ง...' : 'ส่งอีเมลทดสอบทันที'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
