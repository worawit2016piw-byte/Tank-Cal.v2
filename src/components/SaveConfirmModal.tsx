import React from 'react';
import { CalibrationRecord } from '../types/calibration';
import { calculateTotals } from '../services/storage';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Mail, FolderCheck, Loader2 } from 'lucide-react';

interface SaveConfirmModalProps {
  isOpen: boolean;
  record: CalibrationRecord;
  isSaving: boolean;
  saveStep: string;
  hasGoogleAuth?: boolean;
  userEmail?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onGoogleSignIn?: () => void;
}

export const SaveConfirmModal: React.FC<SaveConfirmModalProps> = ({
  isOpen,
  record,
  isSaving,
  saveStep,
  hasGoogleAuth = false,
  userEmail,
  onConfirm,
  onCancel,
  onGoogleSignIn,
}) => {
  if (!isOpen) return null;

  const totals = calculateTotals(record.cycles);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white">
              ยืนยันการบันทึกและเซฟทับข้อมูล (Save & Overwrite)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              บันทึก / เซฟทับลง Google Sheet (โฟลเดอร์ Cal-Tank 001) และส่งแจ้งเตือน <span className="text-emerald-400 font-semibold">• ไม่ต้องลงชื่อเข้าใช้ Google</span>
            </p>
          </div>
        </div>

        {/* Google Status Banner - Permanent Connected Account as requested */}
        <div className="p-3 rounded-xl border border-emerald-800/60 bg-emerald-950/40 text-emerald-300 text-xs flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <span className="font-semibold text-emerald-200">เชื่อมต่อบัญชี Google ตลอดเวลา: </span>
              <span className="font-mono text-[11px] text-emerald-300 font-bold">{userEmail || 'worawit2016piw@gmail.com'}</span>
              <div className="text-[10px] text-emerald-400/80">ระบบเชื่อมต่อบัญชีตามรูปตลอดเวลา • เซฟทับ Google Sheet (Cal-Tank 001) และส่งแจ้งเตือนได้ทันทีโดยไม่ต้องล็อกอินซ้ำ</div>
            </div>
          </div>
        </div>

        {/* Action Details Card */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs space-y-3 font-sans">
          <div className="flex items-center gap-2.5 text-slate-300">
            <FolderCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-400">โฟลเดอร์เป้าหมาย: </span>
              <span className="font-semibold text-emerald-300 font-mono">Cal-Tank 001</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-slate-300">
            <FileSpreadsheet className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <span className="text-slate-400">ชื่อไฟล์ Google Sheet: </span>
              <span className="font-semibold text-sky-300 font-mono">{record.tankName}</span>
              {record.spreadsheetUrl ? (
                <span className="text-amber-400 text-[11px] ml-1.5 font-medium bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                  (พบไฟล์เดิม - จะเซฟทับข้อมูลเดิม)
                </span>
              ) : (
                <span className="text-emerald-400 text-[11px] ml-1.5 font-medium bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                  (ชื่อถังใหม่ - จะสร้างไฟล์ Google Sheet ใหม่)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-slate-300">
            <Mail className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <span className="text-slate-400">ส่งอีเมลแจ้งเตือนไปยัง: </span>
              <span className="font-semibold text-purple-300 font-mono">
                {record.notificationEmail || 'worawit2016piw@gmail.com'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-400">เอกสารแนบในอีเมล: </span>
              <span className="font-semibold text-emerald-300">
                ข้อมูลการสอบเทียบทั้งหมด + รายงาน PDF ฉบับสมบูรณ์ (พร้อมลายมือชื่อรับรอง)
              </span>
            </div>
          </div>

          {/* Quick Metrics Summary */}
          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400">จำนวน Cycle</div>
              <div className="font-mono font-bold text-slate-200 mt-0.5">
                {record.cycles.length}
              </div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400">น้ำหนักจริงรวม</div>
              <div className="font-mono font-bold text-emerald-400 mt-0.5">
                {totals.sumActualWeight.toLocaleString()} kg
              </div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400">วันที่สอบเทียบ</div>
              <div className="font-mono font-bold text-sky-300 mt-0.5">
                {record.date}
              </div>
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {isSaving && (
          <div className="bg-sky-950/40 border border-sky-800/60 p-3 rounded-xl flex items-center gap-3 text-sky-200 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
            <div>
              <div className="font-semibold">กำลังดำเนินการ...</div>
              <div className="text-sky-300/80 text-[11px]">{saveStep}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
          >
            ยกเลิก (Cancel)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="px-5 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-sky-600/30 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-98"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังเซฟข้อมูล...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                ยืนยันการเซฟทับและส่งแจ้งเตือน
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
