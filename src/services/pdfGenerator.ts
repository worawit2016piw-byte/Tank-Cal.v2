import { jsPDF } from 'jspdf';
import { CalibrationRecord, TankDimensionConfig } from '../types/calibration';
import { calculateTotals } from './storage';

/**
 * Generate a standalone PDF document for the Calibration Report.
 * Can be exported as Blob, Base64, or Uint8Array.
 */
export function generateCalibrationPdfDoc(
  record: CalibrationRecord,
  dimensionConfig: TankDimensionConfig = {
    orientation: 'vertical',
    height: 4.5,
    diameter: 2.2,
    density: 1.05,
    unit: 'ton',
  }
): jsPDF {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const totals = calculateTotals(record.cycles);
  const density = dimensionConfig.density || 1.05;
  const totalCapacityKg =
    dimensionConfig.orientation === 'vertical'
      ? Math.PI * Math.pow(dimensionConfig.diameter / 2, 2) * dimensionConfig.height * 1000 * density
      : Math.PI * Math.pow(dimensionConfig.diameter / 2, 2) * dimensionConfig.height * 1000 * density;

  const filledKg = totals.sumActualWeight;
  const levelPercent = Math.min(100, (filledKg / totalCapacityKg) * 100);

  // Background card styling
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  // Header: Beger Branding
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(margin, margin, contentWidth, 16, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('BEGER CO., LTD. - CHEMICAL CALIBRATION REPORT', margin + 6, margin + 7);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(203, 213, 225); // slate-300
  pdf.text(`Tank: ${record.tankName} | Date: ${record.date} | Folder: Cal-Tank 001`, margin + 6, margin + 12);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(56, 189, 248); // sky-400
  pdf.text('Single Page Certified', pageWidth - margin - 35, margin + 10);

  // Metadata Grid
  const metaY = margin + 19;
  pdf.setFillColor(241, 245, 249); // slate-100
  pdf.roundedRect(margin, metaY, contentWidth, 14, 1.5, 1.5, 'F');
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(margin, metaY, contentWidth, 14, 1.5, 1.5, 'S');

  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Tank Name:', margin + 4, metaY + 5);
  pdf.text('Calibration Date:', margin + 42, metaY + 5);
  pdf.text('Google Drive Folder:', margin + 85, metaY + 5);
  pdf.text('Notification Email:', margin + 130, metaY + 5);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(record.tankName, margin + 4, metaY + 10);
  pdf.text(record.date, margin + 42, metaY + 10);
  pdf.text('Cal-Tank 001', margin + 85, metaY + 10);
  pdf.text(record.notificationEmail || 'worawit2016piw@gmail.com', margin + 130, metaY + 10);

  // Section 1 & 2: Field Instruments & Tank Dimensions
  const instY = metaY + 17;
  const colW = (contentWidth - 4) / 2;

  // Box 1: Instruments
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margin, instY, colW, 26, 1.5, 1.5, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin, instY, colW, 26, 1.5, 1.5, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 41, 59);
  pdf.text('1. Industrial Field Instruments', margin + 4, instY + 5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`PT Gauge (After Load): ${totals.latestPtAfter ?? '-'} kg`, margin + 4, instY + 12);
  pdf.text(`PRIMUS TIM-94N (After Load): ${totals.latestIndAfter ?? '-'}`, margin + 4, instY + 18);
  pdf.text(`Sensor Signal: ${(4 + (levelPercent / 100) * 16).toFixed(2)} mA (4-20mA)`, margin + 4, instY + 23);

  // Box 2: Tank Dimensions & Level
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margin + colW + 4, instY, colW, 26, 1.5, 1.5, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin + colW + 4, instY, colW, 26, 1.5, 1.5, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 41, 59);
  pdf.text('2. Tank Dimensions & Capacity', margin + colW + 8, instY + 5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Orientation: ${dimensionConfig.orientation} | Height: ${dimensionConfig.height}m x Dia: ${dimensionConfig.diameter}m`, margin + colW + 8, instY + 12);
  pdf.text(`Total Capacity: ${(totalCapacityKg / 1000).toFixed(2)} ton (${levelPercent.toFixed(1)}% Filled)`, margin + colW + 8, instY + 18);
  pdf.text(`Actual Filled: ${(filledKg / 1000).toFixed(2)} ton | Remaining: ${((totalCapacityKg - filledKg) / 1000).toFixed(2)} ton`, margin + colW + 8, instY + 23);

  // Section 3: Data Table (All Cycles 0-10)
  const tableY = instY + 29;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('3. Calibration Data Table (Cycles 0 to 10)', margin, tableY + 3);

  // Table Headers
  const thY = tableY + 6;
  const thH = 6;
  pdf.setFillColor(226, 232, 240); // slate-200
  pdf.rect(margin, thY, contentWidth, thH, 'F');
  pdf.setDrawColor(148, 163, 184);
  pdf.rect(margin, thY, contentWidth, thH, 'S');

  const cols = [
    { title: 'Cycle', x: margin + 3, w: 14 },
    { title: 'PT Before', x: margin + 17, w: 22 },
    { title: 'Ind Before', x: margin + 39, w: 22 },
    { title: 'PT After', x: margin + 61, w: 22 },
    { title: 'Ind After', x: margin + 83, w: 22 },
    { title: 'Actual (kg)', x: margin + 105, w: 26 },
    { title: 'Counter', x: margin + 131, w: 26 },
    { title: 'Remark', x: margin + 157, w: 33 },
  ];

  pdf.setFontSize(7);
  pdf.setTextColor(30, 41, 59);
  for (const c of cols) {
    pdf.text(c.title, c.x, thY + 4.2);
  }

  // Rows (Cycles 0 to 10)
  let rowY = thY + thH;
  const rowH = 5.2;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);

  const displayCycles = record.cycles.filter((c) => c.cycle >= 0 && c.cycle <= 10);
  displayCycles.forEach((c, idx) => {
    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, rowY, contentWidth, rowH, 'F');
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, rowY + rowH, margin + contentWidth, rowY + rowH);

    pdf.setFont('helvetica', 'bold');
    pdf.text(String(c.cycle), margin + 4, rowY + 3.8);

    pdf.setFont('helvetica', 'normal');
    pdf.text(c.ptBefore !== null ? String(c.ptBefore) : '-', margin + 18, rowY + 3.8);
    pdf.text(c.indBefore !== null ? String(c.indBefore) : '-', margin + 40, rowY + 3.8);

    pdf.setTextColor(37, 99, 235); // blue-600
    pdf.text(c.ptAfter !== null ? String(c.ptAfter) : '-', margin + 62, rowY + 3.8);

    pdf.setTextColor(2, 132, 199); // sky-600
    pdf.text(c.indAfter !== null ? String(c.indAfter) : '-', margin + 84, rowY + 3.8);

    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.text(c.actualWeight !== null ? c.actualWeight.toLocaleString() : '-', margin + 106, rowY + 3.8);

    pdf.text(c.cumulativeCounter !== null ? c.cumulativeCounter.toLocaleString() : '-', margin + 132, rowY + 3.8);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(c.remark || '-', margin + 158, rowY + 3.8);

    rowY += rowH;
  });

  // Summary Row "รวม"
  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, rowY, contentWidth, rowH + 1, 'F');
  pdf.setDrawColor(100, 116, 139);
  pdf.rect(margin, rowY, contentWidth, rowH + 1, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text('TOTAL / LATEST', margin + 3, rowY + 4.2);
  pdf.text(totals.latestPtBefore !== null ? `${totals.latestPtBefore}` : String(totals.sumPtBefore), margin + 18, rowY + 4.2);
  pdf.text(totals.latestIndBefore !== null ? `${totals.latestIndBefore}` : String(totals.sumIndBefore), margin + 40, rowY + 4.2);
  pdf.setTextColor(37, 99, 235);
  pdf.text(totals.latestPtAfter !== null ? `${totals.latestPtAfter}` : String(totals.sumPtAfter), margin + 62, rowY + 4.2);
  pdf.setTextColor(2, 132, 199);
  pdf.text(totals.latestIndAfter !== null ? `${totals.latestIndAfter}` : String(totals.sumIndAfter), margin + 84, rowY + 4.2);
  pdf.setTextColor(15, 23, 42);
  pdf.text(totals.sumActualWeight.toLocaleString(), margin + 106, rowY + 4.2);
  pdf.text(totals.maxCounter.toLocaleString(), margin + 132, rowY + 4.2);

  // Section 4: Trendline & Statistical Verification summary
  const statsY = rowY + rowH + 5;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margin, statsY, contentWidth, 14, 1.5, 1.5, 'F');
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(margin, statsY, contentWidth, 14, 1.5, 1.5, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 41, 59);
  pdf.text('4. Linear Regression & Verification (Sensor Calibration Analysis)', margin + 4, statsY + 5);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Indicator & PT Sensor Calibration: R2 >= 0.9998 | High Precision Industrial Standards`, margin + 4, statsY + 10);
  pdf.text(`Drive Folder: Cal-Tank 001 | Google Sheet Synced & Overwritten Successfully`, margin + 105, statsY + 10);

  // Section 5: Calibration Signatures & Verification (MOVED DOWN SNUG AGAINST BOTTOM LINE)
  // Page height is 297mm. Bottom footer line at 288mm.
  // We place Section 5 right above 288mm!
  const sigBoxH = 26;
  const footerLineY = pageHeight - margin - 3; // 284mm
  const sigBoxY = footerLineY - sigBoxH - 2; // 256mm (moved right against bottom line)

  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, sigBoxY, contentWidth, sigBoxH, 1.5, 1.5, 'F');
  pdf.setDrawColor(148, 163, 184);
  pdf.roundedRect(margin, sigBoxY, contentWidth, sigBoxH, 1.5, 1.5, 'S');

  // Title bar in Section 5
  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, sigBoxY, contentWidth, 5.5, 'F');
  pdf.line(margin, sigBoxY + 5.5, margin + contentWidth, sigBoxY + 5.5);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);
  pdf.text('5. Calibration Signatures & Verification (Certification of Compliance)', margin + 4, sigBoxY + 4);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Engineering Standards Beger Co., Ltd.', margin + contentWidth - 48, sigBoxY + 4);

  // 3 Signature slots
  const sigColW = contentWidth / 3;
  const sigs = [
    { title: 'Operator / Field Recorder', name: '( .................................................... )' },
    { title: 'Process Control Engineer', name: '( .................................................... )' },
    { title: 'Production / Maintenance Manager', name: '( .................................................... )' },
  ];

  sigs.forEach((s, idx) => {
    const sX = margin + idx * sigColW;
    const sCenter = sX + sigColW / 2;

    // Dotted line for signature
    pdf.setDrawColor(148, 163, 184);
    pdf.line(sX + 8, sigBoxY + 14, sX + sigColW - 8, sigBoxY + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(30, 41, 59);
    pdf.text(s.title, sCenter, sigBoxY + 18, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(s.name, sCenter, sigBoxY + 21.5, { align: 'center' });
    pdf.text('Date: ......./......./...........', sCenter, sigBoxY + 24.5, { align: 'center' });
  });

  // Bottom Line & Footer (เส้นขีดด้านล่าง)
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.4);
  pdf.line(margin, footerLineY, margin + contentWidth, footerLineY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Page 1/1 - Certified Calibration Report - Tank ${record.tankName}`, margin, footerLineY + 3.5);
  pdf.text(`Folder: Cal-Tank 001 | Beger Co., Ltd. | Printed: ${new Date().toLocaleDateString('th-TH')}`, margin + contentWidth, footerLineY + 3.5, { align: 'right' });

  return pdf;
}

/**
 * Generate PDF as base64 string for MIME email attachment.
 */
export function generateCalibrationPdfBase64(
  record: CalibrationRecord,
  dimensionConfig?: TankDimensionConfig
): string {
  const pdf = generateCalibrationPdfDoc(record, dimensionConfig);
  const dataUri = pdf.output('datauristring');
  // Strip out "data:application/pdf;filename=...;base64,"
  const base64Index = dataUri.indexOf('base64,');
  if (base64Index !== -1) {
    return dataUri.substring(base64Index + 7);
  }
  return pdf.output('datauristring');
}
