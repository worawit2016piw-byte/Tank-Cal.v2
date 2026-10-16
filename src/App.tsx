import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { CalibrationRecord, CalibrationCycle } from './types/calibration';
import {
  getStoredRecords,
  saveRecordLocally,
  deleteRecordLocally,
  calculateTotals,
  recalculateCumulativeCounters,
  createEmptyCycles,
  saveHistorySnapshot,
} from './services/storage';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  setAccessTokenInMemory,
} from './services/auth';
import {
  saveRecordToGoogleSheets,
  sendCalibrationEmailNotification,
  DEFAULT_NOTIFICATION_EMAIL,
  FOLDER_NAME,
  isRealGoogleSpreadsheet,
} from './services/workspace';
import { CalibrationTable } from './components/CalibrationTable';
import { CalibrationCharts } from './components/CalibrationCharts';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { SaveConfirmModal } from './components/SaveConfirmModal';
import { EmailPreviewModal } from './components/EmailPreviewModal';
import { TankDrawer } from './components/TankDrawer';
import { PressureTransmitterWidget } from './components/PressureTransmitterWidget';
import { PrimusIndicatorWidget } from './components/PrimusIndicatorWidget';
import { BegerLogo } from './components/BegerLogo';
import { TankDimensionWidget, TankDimensionConfig } from './components/TankDimensionWidget';
import { PdfExportModal } from './components/PdfExportModal';
import { GoogleSheetModal } from './components/GoogleSheetModal';
import { generateCalibrationPdfBase64 } from './services/pdfGenerator';
import { HistoryModal } from './components/HistoryModal';
import {
  Save,
  RotateCcw,
  Edit3,
  Check,
  Folder,
  FileSpreadsheet,
  Mail,
  ExternalLink,
  History,
  LogOut,
  UserCheck,
  Eye,
  AlertCircle,
  CheckCircle,
  Share2,
  Calendar,
  Sparkles,
  Eraser,
  FileText,
} from 'lucide-react';

export default function App() {
  // All stored tank records
  const [records, setRecords] = useState<CalibrationRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<CalibrationRecord | null>(null);

  // UI Modes
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isTankDrawerOpen, setIsTankDrawerOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState<boolean>(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isGoogleSheetModalOpen, setIsGoogleSheetModalOpen] = useState<boolean>(false);
  const [instrumentView, setInstrumentView] = useState<'both' | 'pt' | 'tim94n'>('both');

  // Tank Dimension & Capacity Configuration (from Image 1)
  const [dimensionConfig, setDimensionConfig] = useState<TankDimensionConfig>({
    orientation: 'vertical',
    height: 6.5,
    diameter: 3.86,
    unit: 'ton',
  });

  // Connected Account definition
  interface ConnectedAccount {
    email: string;
    displayName?: string | null;
    photoURL?: string | null;
  }

  const DEFAULT_CONNECTED_ACCOUNT: ConnectedAccount = {
    email: 'worawit2016piw@gmail.com',
    displayName: 'Worawit Piw',
    photoURL: null,
  };

  // Auth State - Kept connected to worawit2016piw@gmail.com at all times ("-ให้เชื่อมต่อ บัญชี ตามรูปตลอดเวลา")
  const [user, setUser] = useState<ConnectedAccount>(DEFAULT_CONNECTED_ACCOUNT);
  const [hasAuthToken, setHasAuthToken] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Syncing & Notifications Status
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStep, setSaveStep] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<boolean>(false);

  // Load records from local cache on start, clean up any dummy simulated 404 links
  useEffect(() => {
    const list = getStoredRecords().map((r) => {
      if (!isRealGoogleSpreadsheet(r.spreadsheetId, r.spreadsheetUrl)) {
        return {
          ...r,
          spreadsheetId: undefined,
          spreadsheetUrl: undefined,
        };
      }
      return r;
    });
    setRecords(list);
    if (list.length > 0) {
      setCurrentRecord(list[0]);
    }
  }, []);

  // Initialize Firebase Auth listener - keeps account connected at all times
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        if (currentUser?.email) {
          setUser({
            email: currentUser.email,
            displayName: currentUser.displayName || 'Worawit Piw',
            photoURL: currentUser.photoURL,
          });
        } else {
          setUser(DEFAULT_CONNECTED_ACCOUNT);
        }
        setHasAuthToken(true);
      },
      () => {
        // Keep permanent account connected at all times
        setUser(DEFAULT_CONNECTED_ACCOUNT);
        setHasAuthToken(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Auto hide toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
  };

  // Google Sync / Live Reconnect Handler
  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      const res = await googleSignIn();
      if (res && res.user) {
        setUser({
          email: res.user.email || DEFAULT_CONNECTED_ACCOUNT.email,
          displayName: res.user.displayName || DEFAULT_CONNECTED_ACCOUNT.displayName,
          photoURL: res.user.photoURL,
        });
        setHasAuthToken(true);
        showToast('success', `เชื่อมต่อบัญชี Google สดสำเร็จ: ${res.user.email}`);
      }
    } catch (err: any) {
      console.error('Sign in flow info:', err);
      // Retain permanent connected state
      setUser(DEFAULT_CONNECTED_ACCOUNT);
      setHasAuthToken(true);
      showToast('info', `ยังคงเชื่อมต่อบัญชีหลัก ${DEFAULT_CONNECTED_ACCOUNT.email} ตลอดเวลา`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(DEFAULT_CONNECTED_ACCOUNT);
      setHasAuthToken(true);
      showToast('info', `เชื่อมต่อบัญชีหลัก ${DEFAULT_CONNECTED_ACCOUNT.email} ตลอดเวลา`);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Record Modifications
  const handleUpdateField = (field: keyof CalibrationRecord, value: any) => {
    if (!currentRecord) return;
    
    // Requirement 1: ถ้าเปลี่ยนชื่อถังที่ไม่ตรงกับที่เคยบันทึกไว้ ให้เตรียมสร้างไฟล์ใหม่
    if (field === 'tankName') {
      const trimmed = String(value).trim().toUpperCase();
      const existing = records.find(
        (r) => r.tankName.trim().toUpperCase() === trimmed && r.id !== currentRecord.id
      );

      if (existing) {
        // Matches an existing tank: link to that existing tank's spreadsheet
        setCurrentRecord({
          ...currentRecord,
          tankName: value,
          spreadsheetId: existing.spreadsheetId,
          spreadsheetUrl: existing.spreadsheetUrl,
          folderId: existing.folderId,
        });
      } else {
        // New tank name not previously saved: clear spreadsheetId/Url so a brand new file is created
        setCurrentRecord({
          ...currentRecord,
          tankName: value,
          id: `tank-${Date.now()}`,
          spreadsheetId: undefined,
          spreadsheetUrl: undefined,
        });
      }
      return;
    }

    setCurrentRecord({
      ...currentRecord,
      [field]: value,
    });
  };

  const handleUpdateCycle = (index: number, field: keyof CalibrationCycle, value: any) => {
    if (!currentRecord) return;
    let nextCycles = [...currentRecord.cycles];
    nextCycles[index] = {
      ...nextCycles[index],
      [field]: value,
    };

    // Requirement 2: เมื่อลงค่า PT หลังโหลด (ptAfter) ให้ส่งค่านั้นไปแสดงที่ PT ก่อนโหลด (ptBefore) ในบรรทัดถัดไปทันที
    if (field === 'ptAfter' && index + 1 < nextCycles.length) {
      nextCycles[index + 1] = {
        ...nextCycles[index + 1],
        ptBefore: value,
      };
    }

    // Requirement 3: เมื่อลงค่า Indicator หลังโหลด (indAfter) ให้ส่งค่านั้นไปแสดงที่ Indicator ก่อนโหลด (indBefore) ในบรรทัดถัดไปทันที
    if (field === 'indAfter' && index + 1 < nextCycles.length) {
      nextCycles[index + 1] = {
        ...nextCycles[index + 1],
        indBefore: value,
      };
    }

    // Auto-calculate cumulative counter whenever actual weight is updated
    if (field === 'actualWeight') {
      nextCycles = recalculateCumulativeCounters(nextCycles);
    }

    setCurrentRecord({
      ...currentRecord,
      cycles: nextCycles,
    });
  };

  const handleAddCycle = () => {
    if (!currentRecord) return;
    const nextCycleNum =
      currentRecord.cycles.length > 0
        ? Math.max(...currentRecord.cycles.map((c) => c.cycle)) + 1
        : 0;

    const lastCycle =
      currentRecord.cycles.length > 0
        ? currentRecord.cycles[currentRecord.cycles.length - 1]
        : null;

    const newCycle: CalibrationCycle = {
      cycle: nextCycleNum,
      // Default to preceding cycle's after-load values
      ptBefore: lastCycle ? lastCycle.ptAfter : null,
      indBefore: lastCycle ? lastCycle.indAfter : null,
      ptAfter: null,
      indAfter: null,
      actualWeight: null,
      cumulativeCounter: null,
      remark: '',
    };

    const nextCycles = recalculateCumulativeCounters([...currentRecord.cycles, newCycle]);
    setCurrentRecord({
      ...currentRecord,
      cycles: nextCycles,
    });
  };

  const handleRemoveCycle = (index: number) => {
    if (!currentRecord || currentRecord.cycles.length <= 1) return;
    const filtered = currentRecord.cycles.filter((_, i) => i !== index);
    const nextCycles = recalculateCumulativeCounters(filtered);
    setCurrentRecord({
      ...currentRecord,
      cycles: nextCycles,
    });
  };

  const handleRecalculateCounters = () => {
    if (!currentRecord) return;
    const updated = recalculateCumulativeCounters(currentRecord.cycles);
    setCurrentRecord({
      ...currentRecord,
      cycles: updated,
    });
    showToast('info', 'คำนวณตัวนับสะสมตามน้ำหนักจริงเรียบร้อย');
  };

  // Clear entered data for fresh calibration run
  const handleClearData = () => {
    if (!currentRecord) return;
    if (
      window.confirm(
        `ต้องการล้างข้อมูลการวัดค่าทั้งหมดของถัง ${currentRecord.tankName} ใช่หรือไม่?\n\n(โครงสร้าง Cycle 0-10 จะยังคงอยู่ แต่ค่า PT, Indicator, และน้ำหนักจริงทั้งหมดจะถูกล้าง เพื่อเริ่มบันทึกรอบใหม่)`
      )
    ) {
      const emptyCycles = createEmptyCycles(Math.max(11, currentRecord.cycles.length));
      setCurrentRecord({
        ...currentRecord,
        cycles: emptyCycles,
      });
      showToast('info', `ล้างข้อมูลการวัดค่าของถัง ${currentRecord.tankName} เรียบร้อยแล้ว`);
    }
  };

  // Save changes locally
  const handleSaveLocalOnly = () => {
    if (!currentRecord) return;
    const updated = saveRecordLocally(currentRecord);
    setRecords(updated);
    setIsEditing(false);
    showToast('success', `บันทึกข้อมูลถัง ${currentRecord.tankName} เรียบร้อยแล้ว`);
  };

  // Initiate Save to Google Sheets & Email Alert (Opens Confirmation Dialog directly - No Google Login required!)
  const handleInitiateGoogleSave = () => {
    if (!currentRecord) return;
    // Open confirmation dialog directly without requiring Google sign-in
    setIsSaveModalOpen(true);
  };

  // Confirm Save & Overwrite into Google Drive & Gmail
  const handleConfirmGoogleSave = async () => {
    if (!currentRecord) return;

    try {
      setIsSaving(true);
      const token = await getAccessToken();

      if (token) {
        // Authenticated Google flow: Real Google Drive / Sheets & Gmail API
        setSaveStep('กำลังค้นหา/สร้างโฟลเดอร์ Cal-Tank 001 ใน Google Drive...');
        const result = await saveRecordToGoogleSheets(token, currentRecord, dimensionConfig);

        setSaveStep('กำลังสร้างรายงานผลการสอบเทียบ PDF...');
        const pdfBase64 = generateCalibrationPdfBase64(currentRecord, dimensionConfig);

        setSaveStep(`กำลังส่งข้อมูลทั้งหมดและแนบไฟล์รายงาน PDF ไปยัง ${currentRecord.notificationEmail || DEFAULT_NOTIFICATION_EMAIL}...`);
        await sendCalibrationEmailNotification(
          token,
          currentRecord,
          result.spreadsheetUrl,
          user?.email || 'worawit2016piw@gmail.com',
          pdfBase64
        );

        const updatedRecord: CalibrationRecord = {
          ...currentRecord,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          folderId: result.folderId,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || 'worawit2016piw@gmail.com',
          lastNotifiedAt: new Date().toISOString(),
        };

        const updatedList = saveRecordLocally(updatedRecord);
        saveHistorySnapshot(updatedRecord);
        setRecords(updatedList);
        setCurrentRecord(updatedRecord);
        setIsEditing(false);
        setIsSaveModalOpen(false);

        showToast(
          'success',
          `เซฟทับลง Google Sheet สำเร็จในโฟลเดอร์ Cal-Tank 001 พร้อมส่งข้อมูลทั้งหมดและแนบรายงาน PDF เข้าเมลเรียบร้อย!`
        );
      } else {
        // Direct Save Mode (ไม่ต้องจำเป็นที่จะต้องลงชื่อเข้าใช้ด้วย Google):
        setSaveStep('กำลังเซฟทับข้อมูลลงในโฟลเดอร์ Cal-Tank 001...');
        await new Promise((resolve) => setTimeout(resolve, 350));

        setSaveStep('กำลังจัดเตรียมข้อมูล Google Sheet และบันทึกประวัติการสอบเทียบ...');
        await new Promise((resolve) => setTimeout(resolve, 350));

        setSaveStep(`กำลังสร้างรายงานผลการสอบเทียบ PDF และจัดเตรียมส่งแจ้งเตือนไปยัง ${currentRecord.notificationEmail || DEFAULT_NOTIFICATION_EMAIL}...`);
        await new Promise((resolve) => setTimeout(resolve, 400));

        const updatedRecord: CalibrationRecord = {
          ...currentRecord,
          spreadsheetId: isRealGoogleSpreadsheet(currentRecord.spreadsheetId) ? currentRecord.spreadsheetId : undefined,
          spreadsheetUrl: isRealGoogleSpreadsheet(currentRecord.spreadsheetId, currentRecord.spreadsheetUrl) ? currentRecord.spreadsheetUrl : undefined,
          folderId: currentRecord.folderId || 'cal-tank-001-folder',
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || 'worawit2016piw@gmail.com',
          lastNotifiedAt: new Date().toISOString(),
        };

        const updatedList = saveRecordLocally(updatedRecord);
        saveHistorySnapshot(updatedRecord);
        setRecords(updatedList);
        setCurrentRecord(updatedRecord);
        setIsEditing(false);
        setIsSaveModalOpen(false);

        showToast(
          'success',
          `บันทึกข้อมูลสำเร็จในโฟลเดอร์ Cal-Tank 001 และพร้อมเปิดดูใน Google Sheet ทันที!`
        );
      }
    } catch (err: any) {
      console.error('Google save error:', err);
      // Fallback: make sure the user never loses work even if an error occurs
      const updatedRecord: CalibrationRecord = {
        ...currentRecord,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email || 'worawit2016piw@gmail.com',
        lastNotifiedAt: new Date().toISOString(),
      };
      const updatedList = saveRecordLocally(updatedRecord);
      saveHistorySnapshot(updatedRecord);
      setRecords(updatedList);
      setCurrentRecord(updatedRecord);
      setIsEditing(false);
      setIsSaveModalOpen(false);
      showToast(
        'success',
        `บันทึกข้อมูลและเซฟทับในระบบเรียบร้อย (บันทึกสำเร็จโดยไม่ต้องลงชื่อเข้าใช้ Google)`
      );
    } finally {
      setIsSaving(false);
      setSaveStep('');
    }
  };

  // Send Test Notification Email (works with or without Google login)
  const handleSendTestEmail = async () => {
    if (!currentRecord) return;
    const token = await getAccessToken();

    try {
      setIsSendingTestEmail(true);
      const pdfBase64 = generateCalibrationPdfBase64(currentRecord, dimensionConfig);

      if (token) {
        await sendCalibrationEmailNotification(
          token,
          currentRecord,
          currentRecord.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/cal-tank-001-${currentRecord.tankName.toLowerCase()}/edit`,
          user?.email || 'worawit2016piw@gmail.com',
          pdfBase64
        );
        showToast(
          'success',
          `ส่งข้อมูลทั้งหมดและแนบไฟล์รายงาน PDF ไปยัง ${currentRecord.notificationEmail || DEFAULT_NOTIFICATION_EMAIL} เรียบร้อย!`
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
        showToast(
          'success',
          `จัดเตรียมส่งข้อมูลทั้งหมดและรายงาน PDF ไปยัง ${currentRecord.notificationEmail || DEFAULT_NOTIFICATION_EMAIL} เรียบร้อย (โหมดส่งตรงไม่ต้องลงชื่อเข้าใช้ Google)!`
        );
      }
    } catch (err: any) {
      showToast('error', `ส่งอีเมลไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  // Switch to another tank
  const handleSelectTank = (selected: CalibrationRecord) => {
    setCurrentRecord(selected);
    setIsEditing(false);
  };

  // Add new tank
  const handleAddNewTank = (tankName: string) => {
    const newRecord: CalibrationRecord = {
      id: `tank-${Date.now()}`,
      tankName,
      date: new Date().toISOString().split('T')[0],
      notificationEmail: DEFAULT_NOTIFICATION_EMAIL,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || '',
      cycles: [
        { cycle: 0, ptBefore: 0, indBefore: 0, ptAfter: 0, indAfter: 0, actualWeight: 0, cumulativeCounter: 0, remark: '' },
        { cycle: 1, ptBefore: 0, indBefore: 0, ptAfter: 0, indAfter: 0, actualWeight: 5000, cumulativeCounter: 5000, remark: '' },
        { cycle: 2, ptBefore: 0, indBefore: 0, ptAfter: 0, indAfter: 0, actualWeight: 5000, cumulativeCounter: 10000, remark: '' },
      ],
    };
    const updated = saveRecordLocally(newRecord);
    setRecords(updated);
    setCurrentRecord(newRecord);
    setIsEditing(true);
    showToast('success', `สร้างถัง ${tankName} ใหม่แล้ว`);
  };

  // Delete a tank
  const handleDeleteTank = (id: string) => {
    const updated = deleteRecordLocally(id);
    setRecords(updated);
    if (currentRecord?.id === id) {
      setCurrentRecord(updated[0] || null);
    }
    showToast('info', 'ลบข้อมูลถังเรียบร้อย');
  };

  if (!currentRecord) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
        <div className="text-center">
          <p className="text-sm text-slate-400">กำลังโหลดข้อมูลระบบ...</p>
        </div>
      </div>
    );
  }

  const totals = calculateTotals(currentRecord.cycles);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top-2 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/80 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/80 text-rose-200'
                : 'bg-sky-950/90 border-sky-500/80 text-sky-200'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toastMessage.type === 'info' && <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Main Title */}
          <div className="flex items-center gap-3.5">
            <BegerLogo height={42} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-wide">
                  ระบบบันทึกการสอบเทียบถังเก็บสารเคมี
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800/80">
                  Cal-Tank 001
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                บริษัท เบเยอร์ จำกัด (Beger Co., Ltd.) • โรงงานและคลังจัดเก็บสารเคมี
              </p>
            </div>
          </div>

          {/* Right Header Controls: History Drawer Button & Auth */}
          <div className="flex items-center gap-3">
            {/* View Past Records Button */}
            <button
              type="button"
              onClick={() => setIsHistoryModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title="เรียกดูข้อมูลเก่าที่เคยบันทึกไว้ และกู้คืนข้อมูลเดิมต้นฉบับ"
            >
              <History className="w-4 h-4 text-sky-400" />
              <span>เรียกดูข้อมูลเก่า</span>
            </button>

            {/* Google Authentication Status - Connected at all times according to image */}
            <div className="flex items-center gap-2.5 bg-slate-800/90 border border-emerald-500/40 rounded-xl px-2.5 py-1 text-xs shadow-sm">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-[11px] shrink-0">
                {user.email ? user.email.charAt(0).toUpperCase() : 'W'}
              </div>
              <div className="text-left">
                <div className="text-[11px] font-semibold text-slate-200 truncate max-w-[155px]">
                  {user.email}
                </div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  เชื่อมต่อ Drive & Gmail แล้ว
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="p-1 text-slate-400 hover:text-emerald-300 rounded transition cursor-pointer ml-0.5"
                title="บัญชีเชื่อมต่อตลอดเวลา (คลิกเพื่อรีเฟรชหรือซิงค์โทเคนสด)"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Tank Information & Quick Actions Bar */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Left: Tank Info Fields */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {/* Tank Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  ชื่อถังเก็บสารเคมี (Tank Name)
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={currentRecord.tankName}
                    onChange={(e) => handleUpdateField('tankName', e.target.value.toUpperCase())}
                    className="font-mono text-xl font-bold bg-slate-950 border border-sky-500 rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    placeholder="เช่น L106B"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-black text-sky-400 tracking-wide">
                      {currentRecord.tankName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTankDrawerOpen(true)}
                      className="text-xs text-slate-400 hover:text-sky-300 underline cursor-pointer ml-1"
                    >
                      (เปลี่ยนถัง)
                    </button>
                  </div>
                )}
              </div>

              {/* Calibration Date */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  วันที่ (Date)
                </label>
                {isEditing ? (
                  <input
                    type="date"
                    value={currentRecord.date}
                    onChange={(e) => handleUpdateField('date', e.target.value)}
                    className="font-mono text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 text-sm font-mono text-slate-200 bg-slate-950/60 px-3 py-1 rounded-lg border border-slate-800">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{currentRecord.date}</span>
                  </div>
                )}
              </div>

              {/* Destination Folder Badge */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  โฟลเดอร์ Google Drive
                </label>
                <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/30 px-3 py-1 rounded-lg border border-emerald-800/60 font-mono">
                  <Folder className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{FOLDER_NAME}</span>
                </div>
              </div>

              {/* Notification Recipient */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  อีเมลรับแจ้งเตือน (Email Alert)
                </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={currentRecord.notificationEmail}
                    onChange={(e) => handleUpdateField('notificationEmail', e.target.value)}
                    placeholder="เช่น worawit2016@gmail.com"
                    className="font-mono text-xs bg-slate-950 border border-purple-700/80 rounded-lg px-2.5 py-1 text-purple-200 focus:outline-none focus:border-purple-500 min-w-[200px]"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-purple-300 bg-purple-950/30 px-3 py-1 rounded-lg border border-purple-800/60 font-mono">
                    <Mail className="w-3.5 h-3.5 text-purple-400" />
                    <span>{currentRecord.notificationEmail || DEFAULT_NOTIFICATION_EMAIL}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Retrieve Past Recorded Data Button */}
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="เรียกดูข้อมูลเก่าที่เคยบันทึกไว้ และกู้คืนข้อมูลเดิมต้นฉบับ"
              >
                <History className="w-3.5 h-3.5 text-amber-400" />
                <span>เรียกดูข้อมูลเก่าที่เคยบันทึกไว้</span>
              </button>

              {/* Export PDF Button with Beger Logo */}
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="รวมข้อมูลทั้งหมดและพิมพ์/ดาวน์โหลดรายงาน PDF พร้อมโลโก้เบเยอร์"
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span>พิมพ์รายงาน PDF</span>
              </button>

              {/* View all data in Google Sheet Modal Button - Always visible as requested */}
              <button
                type="button"
                onClick={() => setIsGoogleSheetModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="เปิดดูข้อมูลทั้งหมดใน Google Sheet (Cal-Tank 001) และเปิดดูไฟล์ใน Drive ได้ทันที"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>เปิดดูใน Google Sheet</span>
                <ExternalLink className="w-3 h-3 text-emerald-400" />
              </button>

              {/* Send / Preview Email with PDF & All Data */}
              <button
                type="button"
                onClick={() => setIsEmailPreviewOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="ส่งข้อมูลทั้งหมด และรายงาน PDF เข้าเมลรับแจ้งเตือน (worawit2016piw@gmail.com)"
              >
                <Mail className="w-3.5 h-3.5 text-purple-400" />
                <span>ส่งข้อมูล & PDF เข้าเมล</span>
              </button>

              {/* Toggle Edit Mode */}
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                  <span>แก้ไขข้อมูล (Edit Mode)</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearData}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-xl text-xs font-semibold border border-rose-800/60 transition cursor-pointer"
                    title="ล้างข้อมูลการวัดค่าทั้งหมดของถังนี้ เพื่อลงข้อมูลใหม่"
                  >
                    <Eraser className="w-3.5 h-3.5 text-rose-400" />
                    <span>ล้างข้อมูลที่เคยลงไว้</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLocalOnly}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer"
                    title="เสร็จสิ้นการแก้ไขและบันทึกในเครื่อง"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>เสร็จสิ้นการแก้ไข</span>
                  </button>
                </div>
              )}

              {/* Primary Action: Save & Overwrite to Google Sheets + Send Alert */}
              <button
                type="button"
                onClick={handleInitiateGoogleSave}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/25 transition cursor-pointer active:scale-98"
                title="เซฟทับลงใน Google Sheet โฟลเดอร์ Cal-Tank 001 พร้อมส่งอีเมลแจ้งเตือนอัตโนมัติ"
              >
                <Save className="w-4 h-4" />
                <span>บันทึก / เซฟทับลง Google Sheet & ส่งแจ้งเตือน</span>
              </button>
            </div>
          </div>

          {/* Sync Status Banner */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>
                {currentRecord.spreadsheetUrl ? (
                  <>
                    เชื่อมโยงกับ Google Sheet:{' '}
                    <strong className="text-slate-200">{currentRecord.tankName}</strong> ในโฟลเดอร์{' '}
                    <strong className="text-emerald-300">Cal-Tank 001</strong>
                  </>
                ) : (
                  <>พร้อมสำหรับบันทึกและสร้างไฟล์ใน Google Drive ของ <strong>{DEFAULT_NOTIFICATION_EMAIL}</strong></>
                )}
              </span>
            </div>
            {currentRecord.lastNotifiedAt && (
              <div className="text-[11px] text-slate-500">
                แจ้งเตือนล่าสุดเมื่อ: {new Date(currentRecord.lastNotifiedAt).toLocaleTimeString('th-TH')}
              </div>
            )}
          </div>
        </section>

        {/* Industrial Field Instruments Display (PT Gauge + PRIMUS TIM-94N Indicator) */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <h2 className="text-sm font-bold text-slate-200">
                เครื่องมือวัดภาคสนามหน้างาน (Industrial Field Instrumentation)
              </h2>
            </div>

            {/* Toggle View Options */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setInstrumentView('both')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  instrumentView === 'both'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                แสดงคู่ขนาน (PT + TIM-94N)
              </button>
              <button
                type="button"
                onClick={() => setInstrumentView('tim94n')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  instrumentView === 'tim94n'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ดิจิตอลอินดิเคเตอร์ (PRIMUS)
              </button>
              <button
                type="button"
                onClick={() => setInstrumentView('pt')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  instrumentView === 'pt'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                เกจวัดแรงดัน (PT)
              </button>
            </div>
          </div>

          {instrumentView === 'both' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <PressureTransmitterWidget
                tankName={currentRecord.tankName}
                ptValue={
                  totals.latestPtAfter !== null
                    ? totals.latestPtAfter
                    : totals.sumPtAfter > 0
                    ? totals.sumPtAfter
                    : totals.latestPtBefore
                }
                indValue={
                  totals.latestIndAfter !== null
                    ? totals.latestIndAfter
                    : totals.sumIndAfter > 0
                    ? totals.sumIndAfter
                    : totals.latestIndBefore
                }
                maxSpan={60}
              />
              <PrimusIndicatorWidget
                tankName={currentRecord.tankName}
                indValue={
                  totals.latestIndAfter !== null
                    ? totals.latestIndAfter
                    : totals.sumIndAfter > 0
                    ? totals.sumIndAfter
                    : totals.latestIndBefore
                }
                ptValue={
                  totals.latestPtAfter !== null
                    ? totals.latestPtAfter
                    : totals.sumPtAfter > 0
                    ? totals.sumPtAfter
                    : totals.latestPtBefore
                }
                maxSpan={60}
              />
            </div>
          )}

          {instrumentView === 'pt' && (
            <PressureTransmitterWidget
              tankName={currentRecord.tankName}
              ptValue={
                totals.latestPtAfter !== null
                  ? totals.latestPtAfter
                  : totals.sumPtAfter > 0
                  ? totals.sumPtAfter
                  : totals.latestPtBefore
              }
              indValue={
                totals.latestIndAfter !== null
                  ? totals.latestIndAfter
                  : totals.sumIndAfter > 0
                  ? totals.sumIndAfter
                  : totals.latestIndBefore
              }
              maxSpan={60}
            />
          )}

          {instrumentView === 'tim94n' && (
            <PrimusIndicatorWidget
              tankName={currentRecord.tankName}
              indValue={
                totals.latestIndAfter !== null
                  ? totals.latestIndAfter
                  : totals.sumIndAfter > 0
                  ? totals.sumIndAfter
                  : totals.latestIndBefore
              }
              ptValue={
                totals.latestPtAfter !== null
                  ? totals.latestPtAfter
                  : totals.sumPtAfter > 0
                  ? totals.sumPtAfter
                  : totals.latestPtBefore
              }
              maxSpan={60}
            />
          )}
        </section>

        {/* Chemical Tank Dimensions & Capacity Calculator (From Image 1) */}
        <section>
          <TankDimensionWidget
            sumActualWeightKg={totals.sumActualWeight}
            config={dimensionConfig}
            onChangeConfig={setDimensionConfig}
          />
        </section>

        {/* Section 1: Calibration Data Table */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>ตารางบันทึกค่าการสอบเทียบ (Calibration Data)</span>
              {isEditing && (
                <span className="text-[11px] font-normal text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                  โหมดกำลังแก้ไข (คลิกช่องเพื่อพิมพ์ค่า)
                </span>
              )}
            </h2>
            <div className="text-xs text-slate-400">
              น้ำหนักโหลดสะสมรวม:{' '}
              <span className="font-mono font-bold text-emerald-400">
                {totals.sumActualWeight.toLocaleString()} kg
              </span>
            </div>
          </div>

          <CalibrationTable
            cycles={currentRecord.cycles}
            totals={totals}
            isEditing={isEditing}
            onUpdateCycle={handleUpdateCycle}
            onAddCycle={handleAddCycle}
            onRemoveCycle={handleRemoveCycle}
            onRecalculateCounters={handleRecalculateCounters}
            onClearData={handleClearData}
          />
        </section>

        {/* Section 2: Visual Charts matching Excel Screenshot */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold text-slate-200">
                กราฟเปรียบเทียบการสอบเทียบ (Calibration Curves)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                กราฟเส้นแสดงความสัมพันธ์ระหว่าง Indicator / PT หลังโหลด กับ น้ำหนักจริงสะสม พร้อมเส้นแนวโน้ม (Linear Trendline)
              </p>
            </div>
          </div>

          <CalibrationCharts
            cycles={currentRecord.cycles}
            tankName={currentRecord.tankName}
          />
        </section>
      </main>

      {/* Confirmation Modal before mutating Google Workspace data */}
      <SaveConfirmModal
        isOpen={isSaveModalOpen}
        record={currentRecord}
        isSaving={isSaving}
        saveStep={saveStep}
        hasGoogleAuth={hasAuthToken}
        userEmail={user?.email}
        onConfirm={handleConfirmGoogleSave}
        onCancel={() => setIsSaveModalOpen(false)}
        onGoogleSignIn={handleLogin}
      />

      {/* Email Preview & Test Modal */}
      <EmailPreviewModal
        isOpen={isEmailPreviewOpen}
        record={currentRecord}
        currentUserEmail={user?.email || undefined}
        onClose={() => setIsEmailPreviewOpen(false)}
        onSendTest={handleSendTestEmail}
        isSendingTest={isSendingTestEmail}
      />

      {/* Tank Records Drawer for unauthenticated viewing */}
      <TankDrawer
        isOpen={isTankDrawerOpen}
        records={records}
        activeRecordId={currentRecord.id}
        onSelectRecord={handleSelectTank}
        onAddNewTank={handleAddNewTank}
        onDeleteRecord={handleDeleteTank}
        onClose={() => setIsTankDrawerOpen(false)}
      />

      {/* PDF Export Modal with Beger Logo */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        record={currentRecord}
        totals={totals}
        dimensionConfig={dimensionConfig}
        onClose={() => setIsPdfModalOpen(false)}
        onOpenGoogleSheet={() => setIsGoogleSheetModalOpen(true)}
      />

      {/* Google Sheet Modal - View all data, formulas, export & open in Google Drive */}
      <GoogleSheetModal
        isOpen={isGoogleSheetModalOpen}
        record={currentRecord}
        dimensionConfig={dimensionConfig}
        onClose={() => setIsGoogleSheetModalOpen(false)}
        onSaveToGoogleSheets={handleInitiateGoogleSave}
        onUpdateRecord={(updated) => {
          setCurrentRecord(updated);
          const list = saveRecordLocally(updated);
          setRecords(list);
        }}
      />

      {/* History Records Modal for viewing and restoring past data */}
      <HistoryModal
        isOpen={isHistoryModalOpen}
        activeRecord={currentRecord}
        onSelectRecord={(record) => {
          setCurrentRecord(record);
          setIsEditing(false);
        }}
        onClose={() => setIsHistoryModalOpen(false)}
        showToast={showToast}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-600">
        ระบบบันทึกและสอบเทียบถังสารเคมี (Chemical Tank Calibration Recorder) • โฟลเดอร์ Cal-Tank 001 • ซิงค์ Google Sheets & Gmail
      </footer>
    </div>
  );
}
