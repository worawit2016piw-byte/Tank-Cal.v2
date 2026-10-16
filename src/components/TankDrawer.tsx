import React, { useState } from 'react';
import { CalibrationRecord } from '../types/calibration';
import { calculateTotals } from '../services/storage';
import {
  Database,
  Search,
  Plus,
  ExternalLink,
  Calendar,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  FileSpreadsheet,
} from 'lucide-react';

interface TankDrawerProps {
  isOpen: boolean;
  records: CalibrationRecord[];
  activeRecordId: string;
  onSelectRecord: (record: CalibrationRecord) => void;
  onAddNewTank: (tankName: string) => void;
  onDeleteRecord: (id: string) => void;
  onClose: () => void;
}

export const TankDrawer: React.FC<TankDrawerProps> = ({
  isOpen,
  records,
  activeRecordId,
  onSelectRecord,
  onAddNewTank,
  onDeleteRecord,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newTankName, setNewTankName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const filtered = records.filter(
    (r) =>
      r.tankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.date.includes(searchTerm) ||
      (r.notes && r.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTankName.trim()) return;
    onAddNewTank(newTankName.trim().toUpperCase());
    setNewTankName('');
    setIsAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-lg text-sky-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                ประวัติถังสารเคมีทั้งหมด ({records.length})
              </h3>
              <p className="text-[11px] text-emerald-400">
                ✓ เรียกดูข้อมูลเก่าได้ทันที โดยไม่ต้องล็อกอิน
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

        {/* Search & Actions */}
        <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาชื่อถัง (เช่น L106B), วันที่..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {!isAdding ? (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มถังเก็บสารเคมีใหม่ (New Chemical Tank)
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                placeholder="ระบุชื่อถัง เช่น L108C"
                value={newTankName}
                onChange={(e) => setNewTankName(e.target.value)}
                autoFocus
                className="flex-1 bg-slate-950 border border-sky-500/80 rounded-lg px-3 py-1.5 text-xs text-white uppercase focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                สร้าง
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
            </form>
          )}
        </div>

        {/* Record Cards List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              ไม่พบข้อมูลถังที่ค้นหา
            </div>
          ) : (
            filtered.map((record) => {
              const totals = calculateTotals(record.cycles);
              const isActive = record.id === activeRecordId;

              return (
                <div
                  key={record.id}
                  onClick={() => {
                    onSelectRecord(record);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col gap-2 relative ${
                    isActive
                      ? 'bg-sky-950/40 border-sky-500/80 shadow-md ring-1 ring-sky-500/40'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  {/* Top line: Tank Name & Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-white tracking-wide">
                        {record.tankName}
                      </span>
                      {isActive && (
                        <span className="bg-sky-500/20 text-sky-300 text-[10px] font-semibold px-2 py-0.5 rounded border border-sky-500/30">
                          กำลังเปิดอยู่
                        </span>
                      )}
                    </div>

                    {record.spreadsheetUrl ? (
                      <a
                        href={record.spreadsheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/60 hover:bg-emerald-900/40 transition"
                        title="เปิดใน Google Drive"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                        Google Sheet
                        <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        รอซิงค์ Google Drive
                      </span>
                    )}
                  </div>

                  {/* Date & Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{record.date}</span>
                    </div>
                    <div className="text-right text-[11px]">
                      <span className="text-slate-500">โหลดรวม: </span>
                      <span className="font-mono text-emerald-300 font-semibold">
                        {totals.sumActualWeight.toLocaleString()} kg
                      </span>
                    </div>
                  </div>

                  {/* Cycles Count & Actions */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>{record.cycles.length} Cycles วัดค่า</span>
                    {records.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`ต้องการลบประวัติของถัง ${record.tankName} หรือไม่?`)) {
                            onDeleteRecord(record.id);
                          }
                        }}
                        className="text-slate-600 hover:text-rose-400 p-1 transition cursor-pointer"
                        title="ลบถังนี้"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 text-[11px] text-slate-400 flex items-center justify-between">
          <span>โฟลเดอร์ปลายทาง: <strong className="text-slate-200">Cal-Tank 001</strong></span>
          <span className="text-sky-400 font-medium">Google Drive Sync</span>
        </div>
      </div>
    </div>
  );
};
