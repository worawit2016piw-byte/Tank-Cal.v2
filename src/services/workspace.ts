import { CalibrationRecord, TankDimensionConfig } from '../types/calibration';
import { calculateTotals, recalculateCumulativeCounters } from './storage';

export const FOLDER_NAME = 'Cal-Tank 001';
export const DEFAULT_NOTIFICATION_EMAIL = 'worawit2016piw@gmail.com';

interface SaveResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  folderId: string;
  isNew: boolean;
}

/**
 * Find or create the target folder "Cal-Tank 001" in Google Drive.
 */
export async function getOrCreateCalTankFolder(accessToken: string): Promise<string> {
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    const errorBody = await searchRes.text();
    throw new Error(`Google Drive search folder failed: ${searchRes.status} ${errorBody}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    const errorBody = await createRes.text();
    throw new Error(`Failed to create Google Drive folder "${FOLDER_NAME}": ${createRes.status} ${errorBody}`);
  }

  const createdData = await createRes.json();
  return createdData.id;
}

/**
 * Build 2D array of values for Google Sheets matching the complete rich dashboard layout (Image 2).
 * Spans Columns A to Q and Rows 1 to 33.
 */
export function buildRichSheetValues(
  record: CalibrationRecord,
  dimensionConfig?: TankDimensionConfig
): (string | number)[][] {
  const synchronizedCycles = recalculateCumulativeCounters(record.cycles);
  const totals = calculateTotals(synchronizedCycles);

  const heightM = dimensionConfig?.height ?? 6.5;
  const diameterM = dimensionConfig?.diameter ?? 3.86;
  const radiusM = diameterM / 2;
  const densityVal = dimensionConfig?.density ?? 1.05;

  const rawVolumeM3 = Math.PI * radiusM * radiusM * heightM;
  const totalCapacityTon = rawVolumeM3 * 0.985 * densityVal; // ~74.92 tons
  const loadedKg = totals.sumActualWeight;
  const loadedTon = loadedKg / 1000;

  const prevAccumulatedTon = 0.0;
  const totalInTankTon = prevAccumulatedTon + loadedTon;
  const fillPercent = totalCapacityTon > 0 ? Math.min(100, Math.max(0, (totalInTankTon / totalCapacityTon) * 100)) : 0;
  const remainingTon = Math.max(0, totalCapacityTon - totalInTankTon);
  const remainingHeightM = totalCapacityTon > 0 ? Math.max(0, (remainingTon / totalCapacityTon) * heightM) : 0;
  const signalMa = 4 + (fillPercent / 100) * 16;

  const latestPtVal = totals.latestPtAfter !== null ? totals.latestPtAfter : (totals.latestPtBefore ?? 0);
  const latestIndVal = totals.latestIndAfter !== null ? totals.latestIndAfter : (totals.latestIndBefore ?? 0);
  const ptPercentSpan = Math.min(100, Math.max(0, (Number(latestPtVal) / 60) * 100));

  // Regression for Indicator Curve
  const validInd = synchronizedCycles.filter(c => c.indAfter !== null && c.cumulativeCounter !== null);
  let slopeInd = 991.94, interceptInd = 0, r2Ind = 0.9994;
  if (validInd.length >= 2) {
    const n = validInd.length;
    let sX = 0, sY = 0, sXY = 0, sX2 = 0, sY2 = 0;
    for (const p of validInd) {
      sX += p.indAfter!; sY += p.cumulativeCounter!; sXY += p.indAfter! * p.cumulativeCounter!; sX2 += p.indAfter! * p.indAfter!; sY2 += p.cumulativeCounter! * p.cumulativeCounter!;
    }
    const den = n * sX2 - sX * sX;
    if (den !== 0) {
      slopeInd = (n * sXY - sX * sY) / den;
      interceptInd = (sY - slopeInd * sX) / n;
      const ssTot = sY2 - (sY * sY) / n;
      const ssRes = validInd.reduce((acc, p) => acc + Math.pow(p.cumulativeCounter! - (slopeInd * p.indAfter! + interceptInd), 2), 0);
      r2Ind = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
    }
  }

  // Regression for PT Curve
  const validPt = synchronizedCycles.filter(c => c.ptAfter !== null && c.cumulativeCounter !== null);
  let slopePt = 991.44, interceptPt = 0, r2Pt = 0.9994;
  if (validPt.length >= 2) {
    const n = validPt.length;
    let sX = 0, sY = 0, sXY = 0, sX2 = 0, sY2 = 0;
    for (const p of validPt) {
      sX += p.ptAfter!; sY += p.cumulativeCounter!; sXY += p.ptAfter! * p.cumulativeCounter!; sX2 += p.ptAfter! * p.ptAfter!; sY2 += p.cumulativeCounter! * p.cumulativeCounter!;
    }
    const den = n * sX2 - sX * sX;
    if (den !== 0) {
      slopePt = (n * sXY - sX * sY) / den;
      interceptPt = (sY - slopePt * sX) / n;
      const ssTot = sY2 - (sY * sY) / n;
      const ssRes = validPt.reduce((acc, p) => acc + Math.pow(p.cumulativeCounter! - (slopePt * p.ptAfter! + interceptPt), 2), 0);
      r2Pt = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
    }
  }

  const rows: (string | number)[][] = [];
  const emptyRow = () => Array(17).fill('');

  // Row 1 (Index 0): Brand Title Banner + KPI Header
  const r1 = emptyRow();
  r1[0] = `สีเบเยอร์ Beger • ระบบบันทึกการสอบเทียบถังเก็บสารเคมี Cal-Tank 001`;
  r1[8] = `✦ การคำนวณพื้นที่คงเหลือใน Tank (สะสมจากรอบก่อนหน้า)`;
  rows.push(r1);

  // Row 2 (Index 1): Subtitle + KPI Titles
  const r2 = emptyRow();
  r2[0] = `บริษัท เบเยอร์ จำกัด (Beger Co., Ltd.) • โรงงานและคลังจัดเก็บสารเคมี | ถัง: ${record.tankName} | วันที่: ${record.date}`;
  r2[8] = `1. สะสมจากรอบก่อน (0 รอบ)`;
  r2[10] = `2. เติมรอบนี้ (โหลดมา)`;
  r2[12] = `3. รวมในถังทั้งหมด`;
  r2[15] = `4. เหลือพื้นที่เติมได้อีก`;
  rows.push(r2);

  // Row 3 (Index 2): Field Instrumentation Title + KPI Values
  const r3 = emptyRow();
  r3[0] = `เครื่องมือวัดภาคสนามหน้างาน (Industrial Field Instrumentation)`;
  r3[8] = `${prevAccumulatedTon.toFixed(2)} ตัน`;
  r3[10] = `+ ${loadedTon.toFixed(2)} ตัน`;
  r3[12] = `= ${totalInTankTon.toFixed(2)} ตัน (${fillPercent.toFixed(1)}%)`;
  r3[15] = `${remainingTon.toFixed(2)} ตัน`;
  rows.push(r3);

  // Row 4 (Index 3): Sub-KPIs (mA & remaining height)
  const r4 = emptyRow();
  r4[12] = `⚡ สัญญาณ ${signalMa.toFixed(2)} mA`;
  r4[15] = `ระยะเหลือ = ${remainingHeightM.toFixed(2)} ม.`;
  rows.push(r4);

  // Row 5 (Index 4): Instruments & Tank Specs Titles
  const r5 = emptyRow();
  r5[0] = `เกจวัดแรงดันถัง (PRESSURE TRANSMITTER - PT L712) • ACTIVE`;
  r5[4] = `ดิจิตอลอินดิเคเตอร์ (PRIMUS TIM-94N • ถัง L712) • ONLINE`;
  r5[8] = `ข้อมูลจำเพาะถังและระดับสารเคมี (Tank Specifications & Level)`;
  rows.push(r5);

  // Row 6 (Index 5): Instrument Values & Tank Specs
  const r6 = emptyRow();
  r6[0] = `PT หลังโหลด ปัจจุบัน:`;
  r6[1] = `${latestPtVal} Kg`;
  r6[2] = `Indicator ปัจจุบัน:`;
  r6[3] = `${latestIndVal} Kg`;
  r6[4] = `จอ 7-Segment ค่าจริง:`;
  r6[5] = Number(latestIndVal);
  r6[6] = `สเกลหน้าจอ:`;
  r6[7] = `${ptPercentSpan.toFixed(1)}% of 60`;
  r6[8] = `ความจุถังเต็ม:`;
  r6[9] = `${totalCapacityTon.toFixed(2)} ตัน`;
  r6[10] = `สารเคมีที่เติมแล้ว:`;
  r6[11] = `${totalInTankTon.toFixed(2)} ตัน`;
  r6[12] = `เหลือพื้นที่เติมได้อีก:`;
  r6[13] = `${remainingTon.toFixed(2)} ตัน`;
  r6[14] = `ระดับเต็ม (%):`;
  r6[15] = `${fillPercent.toFixed(1)}%`;
  r6[16] = `4-20 mA: ${signalMa.toFixed(2)} mA`;
  rows.push(r6);

  // Row 7 (Index 6): Hardware Details & Geometry
  const r7 = emptyRow();
  r7[0] = `ประเภทอุปกรณ์:`;
  r7[1] = `Diaphragm Seal PT`;
  r7[2] = `ขนาดสเกล:`;
  r7[3] = `0 - 60 Kg`;
  r7[4] = `ขนาดแผงหน้าปัด:`;
  r7[5] = `96 x 48 mm (DIN)`;
  r7[6] = `ไฟ LED:`;
  r7[7] = `7-Segment High Glow`;
  r7[8] = `มิติขนาดถัง:`;
  r7[9] = `สูง ${heightM} ม. • ศก. ${diameterM} ม.`;
  r7[10] = `ระยะเติมได้:`;
  r7[11] = `${remainingHeightM.toFixed(2)} เมตร`;
  r7[12] = `ชนิดสารเคมี:`;
  r7[13] = `เคมีอุตสาหกรรม Beger`;
  r7[14] = `ความหนาแน่น:`;
  r7[15] = `${densityVal} kg/L`;
  rows.push(r7);

  // Rows 8-19 (Indices 7-18): Spacing Rows
  for (let i = 8; i <= 19; i++) {
    rows.push(emptyRow());
  }

  // Row 20 (Index 19): Titles for Calibration Table & Calibration Curves
  const r20 = emptyRow();
  r20[0] = `ตารางข้อมูลการสอบเทียบ (Calibration Table) • 11 Cycles`;
  r20[8] = `กราฟวิเคราะห์ผลการสอบเทียบ (Calibration Curves & Linear Regression)`;
  rows.push(r20);

  // Row 21 (Index 20): Columns Headers for Table & Curves Data
  const r21 = emptyRow();
  r21[0] = 'Cycle';
  r21[1] = 'PT ก่อนโหลด';
  r21[2] = 'Indicator ก่อนโหลด';
  r21[3] = 'PT หลังโหลด';
  r21[4] = 'Indicator หลังโหลด';
  r21[5] = 'น้ำหนักจริงที่ผลิตโหลดมา';
  r21[6] = 'ตัวนับ';
  r21[7] = 'หมายเหตุ';
  r21[8] = `Indicator หลังโหลด (X)`;
  r21[9] = `น้ำหนักจริง (Y)`;
  r21[10] = `เส้นแนวโน้ม Ind (Y=mX+c)`;
  r21[11] = `R² = ${r2Ind.toFixed(4)}`;
  r21[12] = `m = ${slopeInd.toFixed(2)}`;
  r21[13] = `PT หลังโหลด (X)`;
  r21[14] = `น้ำหนักจริง (Y)`;
  r21[15] = `เส้นแนวโน้ม PT (Y=mX+c)`;
  r21[16] = `R² = ${r2Pt.toFixed(4)}`;
  rows.push(r21);

  // Rows 22 to 32+ (The Cycles): dynamically map all cycles (at least 11 cycles 0 to 10)
  const maxCycles = Math.max(11, synchronizedCycles.length);
  for (let idx = 0; idx < maxCycles; idx++) {
    const c = synchronizedCycles.find(item => item.cycle === idx) || synchronizedCycles[idx] || {
      cycle: idx,
      ptBefore: null,
      indBefore: null,
      ptAfter: null,
      indAfter: null,
      actualWeight: null,
      cumulativeCounter: null,
      remark: '',
    };
    const row = emptyRow();
    row[0] = c.cycle;
    row[1] = c.ptBefore !== null ? c.ptBefore : '';
    row[2] = c.indBefore !== null ? c.indBefore : '';
    row[3] = c.ptAfter !== null ? c.ptAfter : '';
    row[4] = c.indAfter !== null ? c.indAfter : '';
    row[5] = c.actualWeight !== null ? c.actualWeight : '';
    row[6] = c.cumulativeCounter !== null ? c.cumulativeCounter : '';
    row[7] = c.remark || '';

    // Curve 1 (Ind vs Weight)
    if (c.indAfter !== null && c.cumulativeCounter !== null) {
      row[8] = c.indAfter;
      row[9] = c.cumulativeCounter;
      row[10] = Number((slopeInd * c.indAfter + interceptInd).toFixed(2));
    }
    // Curve 2 (PT vs Weight)
    if (c.ptAfter !== null && c.cumulativeCounter !== null) {
      row[13] = c.ptAfter;
      row[14] = c.cumulativeCounter;
      row[15] = Number((slopePt * c.ptAfter + interceptPt).toFixed(2));
    }
    rows.push(row);
  }

  // Row 33 (Index 32): Summary Row "รวม"
  const r33 = emptyRow();
  r33[0] = 'รวม';
  r33[1] = totals.latestPtBefore !== null ? `${totals.latestPtBefore} (ล่าสุด)` : totals.sumPtBefore;
  r33[2] = totals.latestIndBefore !== null ? `${totals.latestIndBefore} (ล่าสุด)` : totals.sumIndBefore;
  r33[3] = totals.latestPtAfter !== null ? `${totals.latestPtAfter} (ล่าสุด)` : totals.sumPtAfter;
  r33[4] = totals.latestIndAfter !== null ? `${totals.latestIndAfter} (ล่าสุด)` : totals.sumIndAfter;
  r33[5] = totals.sumActualWeight;
  r33[6] = totals.maxCounter;
  r33[7] = `โหลดรวม ${totals.sumActualWeight} kg`;
  r33[8] = `R² = ${r2Ind.toFixed(4)}`;
  r33[9] = `ความชัน m = ${slopeInd.toFixed(2)}`;
  r33[10] = `จุดตัด c = ${interceptInd.toFixed(2)}`;
  r33[13] = `R² = ${r2Pt.toFixed(4)}`;
  r33[14] = `ความชัน m = ${slopePt.toFixed(2)}`;
  r33[15] = `จุดตัด c = ${interceptPt.toFixed(2)}`;
  rows.push(r33);

  return rows;
}

export function buildSheetValues(
  record: CalibrationRecord,
  dimensionConfig?: TankDimensionConfig
): (string | number)[][] {
  return buildRichSheetValues(record, dimensionConfig);
}

/**
 * Checks if a spreadsheet ID / URL points to a real, valid Google Drive spreadsheet
 * (not a simulated dummy id like 'cal-tank-001-...')
 */
export function isRealGoogleSpreadsheet(
  spreadsheetId?: string | null,
  spreadsheetUrl?: string | null
): boolean {
  if (!spreadsheetId && !spreadsheetUrl) return false;
  if (spreadsheetId && spreadsheetId.startsWith('cal-tank-001')) return false;
  if (spreadsheetUrl && spreadsheetUrl.includes('cal-tank-001-')) return false;
  if (spreadsheetId && spreadsheetId.length >= 25) return true;
  if (spreadsheetUrl && spreadsheetUrl.includes('docs.google.com/spreadsheets/d/')) {
    const parts = spreadsheetUrl.split('/d/');
    if (parts[1] && parts[1].split('/')[0].length >= 25) return true;
  }
  return false;
}

/**
 * Format the Google Sheet with dark dashboard styling, merged header cards,
 * column dimensions, and native embedded line charts.
 */
async function formatSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  numRows: number
) {
  try {
    const requests: any[] = [
      // 1. Expand sheet dimensions if needed
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              rowCount: Math.max(45, numRows + 10),
              columnCount: 22,
            },
          },
          fields: 'gridProperties(rowCount,columnCount)',
        },
      },

      // 2. Set Column Widths (A to Q)
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 1, // Col A (Cycle)
          },
          properties: { pixelSize: 55 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 8, // Cols B to H
          },
          properties: { pixelSize: 85 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: 8,
            endIndex: 17, // Cols I to Q
          },
          properties: { pixelSize: 88 },
          fields: 'pixelSize',
        },
      },

      // 3. Merges for Headers & Cards
      { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8, endColumnIndex: 17 }, mergeType: 'MERGE_ALL' } },
      // KPI 4 Cards Merges
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 10, endColumnIndex: 12 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 12, endColumnIndex: 15 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 15, endColumnIndex: 17 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 8, endColumnIndex: 10 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 10, endColumnIndex: 12 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 12, endColumnIndex: 15 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 12, endColumnIndex: 15 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 15, endColumnIndex: 17 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 15, endColumnIndex: 17 }, mergeType: 'MERGE_ALL' } },
      // Section 2: Instruments & Tank Specs
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 4, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 8, endColumnIndex: 17 }, mergeType: 'MERGE_ALL' } },
      // Section 3: Table and Curves Titles
      { mergeCells: { range: { sheetId, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } },
      { mergeCells: { range: { sheetId, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 8, endColumnIndex: 17 }, mergeType: 'MERGE_ALL' } },

      // 4. Styling: Dark Theme Brand Header (A1:H2)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.10, green: 0.14, blue: 0.20 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
        },
      },
      // Styling: KPI Header (I1:Q1)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8, endColumnIndex: 17 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.10, green: 0.14, blue: 0.20 },
              textFormat: { foregroundColor: { red: 0.22, green: 0.74, blue: 0.97 }, bold: true, fontSize: 11 },
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
        },
      },
      // Styling: KPI Cards (I2:Q4)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 8, endColumnIndex: 17 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.07, green: 0.10, blue: 0.15 },
              textFormat: { foregroundColor: { red: 0.90, green: 0.93, blue: 0.96 }, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      // Styling: Section 2 Titles (Row 4)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 17 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.08, green: 0.11, blue: 0.16 },
              textFormat: { foregroundColor: { red: 0.22, green: 0.74, blue: 0.97 }, bold: true, fontSize: 10 },
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
        },
      },
      // Styling: Table & Curves Titles (Row 19)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: 17 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.10, green: 0.14, blue: 0.20 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
        },
      },
      // Styling: Table Column Headers (Row 20)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 20, endRowIndex: 21, startColumnIndex: 0, endColumnIndex: 17 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.07, green: 0.10, blue: 0.15 },
              textFormat: { foregroundColor: { red: 0.90, green: 0.95, blue: 1.0 }, bold: true, fontSize: 9.5 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      // Styling: Table Data Cells (Row 21 to 32)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 21, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              textFormat: { fontSize: 9 },
            },
          },
          fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat.fontSize)',
        },
      },
      // Styling: Summary Row (Row 32)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 32, endRowIndex: 33, startColumnIndex: 0, endColumnIndex: 17 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.08, green: 0.11, blue: 0.16 },
              textFormat: { foregroundColor: { red: 0.22, green: 0.74, blue: 0.97 }, bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },

      // 5. Grid Borders around Table (A21:H33)
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 20, endRowIndex: 33, startColumnIndex: 0, endColumnIndex: 8 },
          top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.4, blue: 0.5 } },
          bottom: { style: 'SOLID', width: 2, color: { red: 0.3, green: 0.4, blue: 0.5 } },
          left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.4, blue: 0.5 } },
          right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.4, blue: 0.5 } },
          innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.9 } },
          innerVertical: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.85, blue: 0.9 } },
        },
      },
    ];

    // Execute formatting batch update
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    // 6. Try adding Native Google Sheets Embedded Line Charts
    try {
      const chartRequests = [
        {
          addChart: {
            chart: {
              spec: {
                title: 'Indicator หลังโหลด กับ น้ำหนักจริง',
                basicChart: {
                  chartType: 'LINE',
                  legendPosition: 'BOTTOM_LEGEND',
                  axis: [
                    { position: 'BOTTOM_AXIS', title: 'Indicator หลังโหลด (kg)' },
                    { position: 'LEFT_AXIS', title: 'น้ำหนักจริง (kg) / ตัวนับ' },
                  ],
                  domains: [
                    {
                      domain: {
                        sourceRange: {
                          sources: [
                            { sheetId, startRowIndex: 20, endRowIndex: 32, startColumnIndex: 8, endColumnIndex: 9 },
                          ],
                        },
                      },
                    },
                  ],
                  series: [
                    {
                      series: {
                        sourceRange: {
                          sources: [
                            { sheetId, startRowIndex: 20, endRowIndex: 32, startColumnIndex: 9, endColumnIndex: 10 },
                          ],
                        },
                      },
                      targetAxis: 'LEFT_AXIS',
                    },
                  ],
                },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId, rowIndex: 22, columnIndex: 8 },
                  widthPixels: 370,
                  heightPixels: 260,
                },
              },
            },
          },
        },
        {
          addChart: {
            chart: {
              spec: {
                title: 'PT หลังโหลด กับ น้ำหนักจริง',
                basicChart: {
                  chartType: 'LINE',
                  legendPosition: 'BOTTOM_LEGEND',
                  axis: [
                    { position: 'BOTTOM_AXIS', title: 'PT หลังโหลด (mA / kg)' },
                    { position: 'LEFT_AXIS', title: 'น้ำหนักจริง (kg) / ตัวนับ' },
                  ],
                  domains: [
                    {
                      domain: {
                        sourceRange: {
                          sources: [
                            { sheetId, startRowIndex: 20, endRowIndex: 32, startColumnIndex: 13, endColumnIndex: 14 },
                          ],
                        },
                      },
                    },
                  ],
                  series: [
                    {
                      series: {
                        sourceRange: {
                          sources: [
                            { sheetId, startRowIndex: 20, endRowIndex: 32, startColumnIndex: 14, endColumnIndex: 15 },
                          ],
                        },
                      },
                      targetAxis: 'LEFT_AXIS',
                    },
                  ],
                },
              },
              position: {
                overlayPosition: {
                  anchorCell: { sheetId, rowIndex: 22, columnIndex: 13 },
                  widthPixels: 370,
                  heightPixels: 260,
                },
              },
            },
          },
        },
      ];

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: chartRequests }),
      });
    } catch (chartErr) {
      console.warn('Native chart attachment optional notice:', chartErr);
    }
  } catch (err) {
    console.warn('Spreadsheet formatting notice:', err);
  }
}

/**
 * Save or overwrite calibration record as a Google Spreadsheet inside "Cal-Tank 001" folder.
 */
export async function saveRecordToGoogleSheets(
  accessToken: string,
  record: CalibrationRecord,
  dimensionConfig?: TankDimensionConfig
): Promise<SaveResult> {
  const folderId = await getOrCreateCalTankFolder(accessToken);
  const tankName = record.tankName.trim() || 'Untitled_Tank';

  // Search if spreadsheet already exists in Cal-Tank 001
  const searchFileQuery = `name = '${tankName.replace(/'/g, "\\'")}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const searchFileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    searchFileQuery
  )}&fields=files(id,name,webViewLink)`;

  const searchFileRes = await fetch(searchFileUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let spreadsheetId = '';
  let spreadsheetUrl = '';
  let isNew = false;
  let targetSheetTitle = 'Calibration Data';
  let targetSheetId = 0;

  if (searchFileRes.ok) {
    const searchFileData = await searchFileRes.json();
    if (searchFileData.files && searchFileData.files.length > 0) {
      spreadsheetId = searchFileData.files[0].id;
      spreadsheetUrl =
        searchFileData.files[0].webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    }
  }

  // Only reuse record.spreadsheetId if its file name on Drive matches this tankName exactly
  if (!spreadsheetId && record.spreadsheetId && isRealGoogleSpreadsheet(record.spreadsheetId)) {
    try {
      const checkRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${record.spreadsheetId}?fields=name,trashed`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (checkRes.ok) {
        const fileInfo = await checkRes.json();
        if (fileInfo.name?.trim().toUpperCase() === tankName.toUpperCase() && !fileInfo.trashed) {
          spreadsheetId = record.spreadsheetId;
          spreadsheetUrl =
            record.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        }
      }
    } catch (e) {
      console.warn('Could not verify existing spreadsheet name, will create new if needed', e);
    }
  }

  if (spreadsheetId) {
    // Overwrite existing file: get sheet name and sheet ID
    try {
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta.sheets && meta.sheets.length > 0) {
          targetSheetTitle = meta.sheets[0].properties.title;
          targetSheetId = meta.sheets[0].properties.sheetId || 0;
        }
      }
    } catch (e) {
      console.warn('Could not read existing sheet metadata, using default', e);
    }
  } else {
    // Create new spreadsheet
    isNew = true;
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title: tankName },
        sheets: [
          {
            properties: {
              title: 'Calibration Data',
              gridProperties: { rowCount: 45, columnCount: 22 },
            },
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Google Sheet: ${createRes.status} ${errText}`);
    }

    const createdSheet = await createRes.json();
    spreadsheetId = createdSheet.spreadsheetId;
    spreadsheetUrl =
      createdSheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    targetSheetTitle = 'Calibration Data';
    targetSheetId = createdSheet.sheets?.[0]?.properties?.sheetId || 0;

    // Move file into "Cal-Tank 001" folder in Drive
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id,parents,webViewLink`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  }

  // Populate values
  const values = buildSheetValues(record, dimensionConfig);
  const range = `'${targetSheetTitle}'!A1:Q${values.length}`;
  const updateValuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;

  // First clear old extra rows to ensure clean overwrite
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${targetSheetTitle}'!A1:Z50:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (err) {
    console.warn('Clear prior values note:', err);
  }

  const updateRes = await fetch(updateValuesUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values,
    }),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Failed to write values to Google Sheet: ${updateRes.status} ${errText}`);
  }

  // Apply styling
  await formatSpreadsheet(accessToken, spreadsheetId, targetSheetId, values.length);

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    folderId,
    isNew,
  };
}

/**
 * Send email notification to worawit2016piw@gmail.com via Gmail API.
 */
export async function sendCalibrationEmailNotification(
  accessToken: string,
  record: CalibrationRecord,
  spreadsheetUrl: string,
  userEmail: string,
  pdfBase64?: string
): Promise<void> {
  const recipient = record.notificationEmail?.trim() || DEFAULT_NOTIFICATION_EMAIL;
  const totals = calculateTotals(record.cycles);
  const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  const subject = `[แจ้งเตือนการอัปเดต] ข้อมูลการสอบเทียบถัง ${record.tankName} (Cal-Tank 001)`;

  const tableRowsHtml = record.cycles
    .map(
      (c) => `
    <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;">
      <td style="padding: 8px 10px; font-weight: bold; background: #f8fafc;">${c.cycle}</td>
      <td style="padding: 8px 10px;">${c.ptBefore !== null ? c.ptBefore : '-'}</td>
      <td style="padding: 8px 10px;">${c.indBefore !== null ? c.indBefore : '-'}</td>
      <td style="padding: 8px 10px; font-weight: 500; color: #2563eb;">${c.ptAfter !== null ? c.ptAfter : '-'}</td>
      <td style="padding: 8px 10px; font-weight: 500; color: #0284c7;">${c.indAfter !== null ? c.indAfter : '-'}</td>
      <td style="padding: 8px 10px; font-weight: 600;">${c.actualWeight !== null ? c.actualWeight.toLocaleString() : '-'}</td>
      <td style="padding: 8px 10px; font-weight: 700; color: #0f172a;">${c.cumulativeCounter !== null ? c.cumulativeCounter.toLocaleString() : '-'}</td>
      <td style="padding: 8px 10px; color: #64748b; font-size: 13px;">${c.remark || '-'}</td>
    </tr>`
    )
    .join('');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #ffffff; padding: 24px 28px; }
    .badge { display: inline-block; background: #38bdf8; color: #0f172a; font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .title { font-size: 22px; font-weight: 700; margin: 0; color: #ffffff; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .content { padding: 28px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .info-label { font-size: 12px; color: #64748b; font-weight: 600; }
    .info-value { font-size: 15px; color: #0f172a; font-weight: 700; margin-top: 2px; }
    .btn { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; margin: 16px 0 24px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th { background: #f1f5f9; padding: 10px; font-weight: 600; color: #475569; font-size: 12px; text-align: center; border-bottom: 2px solid #cbd5e1; }
    .total-row { background: #f1f5f9; font-weight: 700; border-top: 2px solid #94a3b8; }
    .footer { padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">ระบบสอบเทียบถังเก็บสารเคมี</div>
      <h1 class="title">แจ้งเตือน: อัปเดตข้อมูลถัง ${record.tankName}</h1>
      <div class="subtitle">โฟลเดอร์ Google Drive: Cal-Tank 001 | ${nowStr}</div>
    </div>
    <div class="content">
      <div class="info-grid">
        <div>
          <div class="info-label">ชื่อถังเก็บสารเคมี</div>
          <div class="info-value">${record.tankName}</div>
        </div>
        <div>
          <div class="info-label">วันที่สอบเทียบ</div>
          <div class="info-value">${record.date}</div>
        </div>
        <div>
          <div class="info-label">น้ำหนักจริงรวมที่โหลดมา</div>
          <div class="info-value" style="color: #0284c7;">${totals.sumActualWeight.toLocaleString()} kg</div>
        </div>
        <div>
          <div class="info-label">ผู้บันทึก / อัปเดต</div>
          <div class="info-value">${userEmail || 'ผู้ใช้งานระบบ'}</div>
        </div>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 16px; text-align: left;">
        <div style="font-weight: 700; color: #166534; font-size: 14px; margin-bottom: 4px;">
          📎 แนบไฟล์รายงานผลการสอบเทียบฉบับสมบูรณ์ (PDF) และบันทึกลง Google Sheet
        </div>
        <div style="font-size: 13px; color: #15803d; line-height: 1.5;">
          ระบบได้แนบไฟล์เอกสารรายงานผลการสอบเทียบ <strong>Beger_Calibration_Report_${record.tankName}_${record.date}.pdf</strong> (รวมทั้ง 10 รอบ และการรับรองผล) มาพร้อมกับอีเมลนี้เรียบร้อยแล้ว
        </div>
      </div>

      <p style="font-size: 14px; color: #334155; margin-bottom: 8px;">
        ข้อมูลการสอบเทียบทั้งหมดได้รับการเซฟทับลงใน Google Sheet โฟลเดอร์ <strong>Cal-Tank 001</strong> เรียบร้อยแล้ว ท่านสามารถคลิกเพื่อเปิดดูไฟล์ต้นฉบับได้ทันที:
      </p>

      <div style="text-align: center;">
        <a href="${spreadsheetUrl}" target="_blank" class="btn">
          📊 เปิดดูไฟล์ Google Sheet ใน Google Drive
        </a>
      </div>

      <h3 style="font-size: 15px; color: #0f172a; margin: 20px 0 8px 0;">สรุปข้อมูลการสอบเทียบทุก Cycle (รอบ 0-10):</h3>
      <table>
        <thead>
          <tr>
            <th>Cycle</th>
            <th>PT ก่อนโหลด</th>
            <th>Indicator ก่อนโหลด</th>
            <th>PT หลังโหลด</th>
            <th>Indicator หลังโหลด</th>
            <th>น้ำหนักจริง</th>
            <th>ตัวนับ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
          <tr class="total-row" style="text-align: center;">
            <td style="padding: 10px;">รวม</td>
            <td style="padding: 10px; font-weight: bold; color: #2563eb;">
              ${totals.latestPtBefore !== null ? `${totals.latestPtBefore} (ล่าสุด)` : totals.sumPtBefore}
            </td>
            <td style="padding: 10px; font-weight: bold; color: #0284c7;">
              ${totals.latestIndBefore !== null ? `${totals.latestIndBefore} (ล่าสุด)` : totals.sumIndBefore}
            </td>
            <td style="padding: 10px; color: #2563eb; font-weight: bold;">
              ${totals.latestPtAfter !== null ? `${totals.latestPtAfter} (ล่าสุด)` : totals.sumPtAfter}
            </td>
            <td style="padding: 10px; color: #0284c7; font-weight: bold;">
              ${totals.latestIndAfter !== null ? `${totals.latestIndAfter} (ล่าสุด)` : totals.sumIndAfter}
            </td>
            <td style="padding: 10px; font-weight: bold;">${totals.sumActualWeight.toLocaleString()}</td>
            <td style="padding: 10px; font-weight: bold;">${totals.maxCounter.toLocaleString()}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      ระบบแจ้งเตือนอัตโนมัติ Calibration Chemical Tank • จัดเก็บในโฟลเดอร์ Google Drive: Cal-Tank 001<br/>
      ส่งถึง ${recipient}
    </div>
  </div>
</body>
</html>
  `;

  // Encode RFC 2822 subject
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  // If PDF attachment is provided, package as multipart/mixed email
  let fullMessage: string;
  const boundary = `====_Calibration_Tank_${Date.now()}====`;

  if (pdfBase64) {
    // Clean base64 string
    const cleanPdfBase64 = pdfBase64.replace(/\s+/g, '');
    const filename = `Beger_Calibration_Report_${record.tankName}_${record.date}.pdf`;

    const messageParts = [
      `To: ${recipient}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      htmlBody,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      cleanPdfBase64,
      '',
      `--${boundary}--`
    ];
    fullMessage = messageParts.join('\r\n');
  } else {
    const messageParts = [
      `To: ${recipient}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody,
    ];
    fullMessage = messageParts.join('\r\n');
  }

  // Safe base64url encode for Gmail API
  const base64Encoded = btoa(unescape(encodeURIComponent(fullMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64Encoded }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    throw new Error(`Gmail API failed to send notification: ${sendRes.status} ${errText}`);
  }
}

/**
 * Generate CSV formatted text ready for Google Sheets or Excel import.
 */
export function generateGoogleSheetCsv(record: CalibrationRecord): string {
  const rows = buildSheetValues(record);
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    )
    .join('\r\n');
}

/**
 * Generate TSV (Tab Separated Values) for 1-click clipboard paste directly into Google Sheets.
 */
export function generateGoogleSheetTsv(
  record: CalibrationRecord,
  dimensionConfig?: TankDimensionConfig
): string {
  const rows = buildSheetValues(record, dimensionConfig);
  return rows.map((row) => row.map((c) => String(c ?? '')).join('\t')).join('\r\n');
}

/**
 * Generate HTML table for rich clipboard pasting into Google Sheets with preserved colors and formatting.
 */
export function generateGoogleSheetHtml(
  record: CalibrationRecord,
  dimensionConfig?: TankDimensionConfig
): string {
  const rows = buildSheetValues(record, dimensionConfig);
  let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:11px;">';
  
  rows.forEach((row, rIdx) => {
    html += '<tr>';
    row.forEach((cell, cIdx) => {
      let style = 'padding:4px 8px;border:1px solid #c0c0c0;';
      if (rIdx < 2) {
        style += 'background:#1a2332;color:#ffffff;font-weight:bold;';
      } else if (rIdx === 20) {
        style += 'background:#141b24;color:#38bdf8;font-weight:bold;';
      } else if (rIdx === 32) {
        style += 'background:#141b24;color:#38bdf8;font-weight:bold;';
      } else if (cIdx === 0) {
        style += 'background:#f8f9fa;font-weight:bold;text-align:center;';
      }
      html += `<td style="${style}">${String(cell ?? '')}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</table>';
  return html;
}


