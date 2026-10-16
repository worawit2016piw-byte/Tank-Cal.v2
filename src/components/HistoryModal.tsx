import React, { useState, useEffect } from 'react';
import { CalibrationRecord } from '../types/calibration';
import {
  HistorySnapshot,
  getHistorySnapshots,
  deleteHistorySnapshot,
  restoreOriginalRecord,
  saveHistorySnapshot,
} from '../services/storage';
import {
  History,
  X,
  Search,
  CheckCircle2,
  Calendar,
  Clock,
  RotateCcw,
  Eye,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ArrowRight,
  Database,
} from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  activeRecord: CalibrationRecord;
  onSelectRecord: (record: CalibrationRecord) => void;
  onClose: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  activeRecord,
  onSelectRecord,
  onClose,
  showToast,
}) => {
  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewSnapshot, setPreviewSnapshot] = useState<HistorySnapshot | null>(null);

  useEffect(() => {
    if (isOpen) {
      const list = getHistorySnapshots();
      setSnapshots(list);
      setPreviewSnapshot(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSnapshots = snapshots.filter(
    (s) =>
      s.tankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.date.includes(searchTerm) ||
      (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.updatedBy.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLoadSnapshot = (snapshot: HistorySnapshot) => {
    onSelectRecord(snapshot.record);
    showToast('success', `โหลดข้อมูลบันทึกเก่าของถัง ${snapshot.tankName} (${snapshot.date}) สำเร็จ`);
    onClose();
  };

  const handleRestoreBaseline = () => {
    if (confirm('ต้องการกู้คืนข้อมูลเดิมต้นฉบับของถัง L106B ใช่หรือไม่?')) {
      const restored = restoreOriginalRecord();
      onSelectRecord(restored);
      const list = getHistorySnapshots();
      setSnapshots(list);
      showToast('success', 'กู้คืนข้อมูลเดิมต้นฉบับ L106B เรียบร้อยแล้ว');
      onClose();
    }
  };

  const handleDeleteSnapshot = (id: string, tankName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`ต้องการลบรายการประวัติของถัง ${tankName} ใช่หรือไม่?`)) {
      const updated = deleteHistorySnapshot(id);
      setSnapshots(updated);
      if (previewSnapshot?.id === id) setPreviewSnapshot(null);
      showToast('info', 'ลบรายการประวัติเรียบร้อย');
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snapshots, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `calibration_records_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('success', 'ดาวน์โหลดไฟล์สำรองข้อมูล (JSON) เรียบร้อย');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].record) {
          localStorage.setItem('chemical_tank_history_snapshots_v1', JSON.stringify(parsed));
          setSnapshots(parsed);
          showToast('success', `นำเข้าข้อมูลประวัติเก่า ${parsed.length} รายการสำเร็จ!`);
        } else {
          showToast('error', 'รูปแบบไฟล์ไม่ถูกต้อง');
        }
      } catch (err) {
        showToast('error', 'ไม่สามารถอ่านไฟล์ JSON ได้');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  เรียกดูข้อมูลเก่าที่เคยบันทึกไว้ (Calibration History)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                  {snapshots.length} รายการ
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                สามารถเปิดดูข้อมูลเก่าย้อนหลัง กู้คืนชุดข้อมูลเดิม หรือสลับไปดูประวัติการสอบเทียบของถังอื่นได้ทันที
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreBaseline}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
              title="กู้คืนข้อมูลเดิมต้นฉบับ L106B จากโรงงาน"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>กู้คืนข้อมูลเดิมต้นฉบับ</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาชื่อถัง (เช่น L106B), วันที่ (เช่น 2026-10-09), ผู้บันทึก..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition cursor-pointer"
              title="ส่งออกไฟล์สำรอง JSON"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>สำรองข้อมูล (JSON)</span>
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>นำเข้า JSON</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
          </div>
        </div>

        {/* Content: List + Preview */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {/* Left Column: Snapshots List */}
          <div className="md:col-span-7 overflow-y-auto p-4 space-y-3 max-h-[55vh]">
            {filteredSnapshots.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                ไม่พบข้อมูลประวัติที่ค้นหา
              </div>
            ) : (
              filteredSnapshots.map((item) => {
                const isSelectedForPreview = previewSnapshot?.id === item.id;
                const isCurrentlyActive = item.record.id === activeRecord.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => setPreviewSnapshot(item)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col gap-2 relative ${
                      isSelectedForPreview
                        ? 'bg-sky-950/60 border-sky-500 shadow-md ring-1 ring-sky-500/50'
                        : isCurrentlyActive
                        ? 'bg-slate-900 border-sky-800/80'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white tracking-wide">
                          {item.tankName}
                        </span>
                        {isCurrentlyActive && (
                          <span className="bg-sky-500/20 text-sky-300 text-[10px] font-semibold px-2 py-0.5 rounded border border-sky-500/30">
                            ข้อมูลที่เปิดอยู่ปัจจุบัน
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadSnapshot(item)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                          title="โหลดข้อมูลชุดนี้มาใส่ในตารางและแสดงผลหน้าจอ"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>โหลดข้อมูลนี้</span>
                        </button>
                        {filteredSnapshots.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSnapshot(item.id, item.tankName, e)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
                            title="ลบรายการประวัตินี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1 border-t border-slate-800/60 text-[11px]">
                      <div className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>วันที่: {item.date}</span>
                      </div>
                      <div className="text-right">
                        <span>น้ำหนักรวม: </span>
                        <strong className="font-mono text-emerald-400">
                          {item.sumActualWeight.toLocaleString()} kg
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>บันทึกเมื่อ: {new Date(item.timestamp).toLocaleString('th-TH')}</span>
                      </div>
                      <span className="truncate max-w-[140px] text-slate-400">
                        {item.updatedBy}
                      </span>
                    </div>

                    {item.notes && (
                      <div className="text-[10px] text-slate-400 italic bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800">
                        {item.notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Preview Selected Snapshot */}
          <div className="md:col-span-5 p-4 flex flex-col justify-between bg-slate-950/40 text-xs overflow-y-auto max-h-[55vh]">
            {previewSnapshot ? (
              <div className="space-y-3">
                <div className="border-b border-slate-800 pb-2">
                  <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                    ตัวอย่างข้อมูลที่เลือก
                  </div>
                  <h3 className="font-mono text-lg font-bold text-white mt-0.5">
                    {previewSnapshot.tankName} ({previewSnapshot.date})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    โหลดสะสมรวม: <strong className="text-emerald-400">{previewSnapshot.sumActualWeight.toLocaleString()} kg</strong> ({previewSnapshot.cyclesCount} Cycles)
                  </p>
                </div>

                {/* Table Preview (First 5 rows) */}
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-[10px] font-mono text-center border-collapse">
                    <thead className="bg-slate-800/80 text-slate-300">
                      <tr>
                        <th className="p-1">C</th>
                        <th className="p-1 text-sky-300">PT หลัง</th>
                        <th className="p-1 text-sky-300">Ind หลัง</th>
                        <th className="p-1 text-emerald-300">น้ำหนัก</th>
                        <th className="p-1 text-amber-300">ตัวนับ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {previewSnapshot.record.cycles.slice(0, 6).map((c) => (
                        <tr key={c.cycle} className="hover:bg-slate-900">
                          <td className="p-1 font-bold text-slate-400">{c.cycle}</td>
                          <td className="p-1">{c.ptAfter !== null ? c.ptAfter : '-'}</td>
                          <td className="p-1">{c.indAfter !== null ? c.indAfter : '-'}</td>
                          <td className="p-1 text-emerald-400">
                            {c.actualWeight !== null ? c.actualWeight.toLocaleString() : '-'}
                          </td>
                          <td className="p-1 text-amber-400">
                            {c.cumulativeCounter !== null ? c.cumulativeCounter.toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewSnapshot.record.cycles.length > 6 && (
                    <div className="text-[10px] text-center text-slate-500 py-1 bg-slate-900 border-t border-slate-800">
                      + อีก {previewSnapshot.record.cycles.length - 6} แถว
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleLoadSnapshot(previewSnapshot)}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>นำข้อมูลชุดนี้ไปแสดงในหน้าจอหลัก</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <Database className="w-8 h-8 text-slate-600 mb-2" />
                <p>คลิกเลือกรายการทางซ้ายมือ เพื่อดูตัวอย่างข้อมูลและกดโหลด</p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 px-5 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>
            ระบบจะบันทึก Snapshot ประวัติอัตโนมัติทุกครั้งเมื่อมีการแก้ไขและกดบันทึก
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
