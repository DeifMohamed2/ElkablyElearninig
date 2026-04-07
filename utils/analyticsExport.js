/**
 * Shared styling and helpers for Elkably analytics Excel exports.
 */

const BRAND_FILL = { argb: 'FFB80101' };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleTableHeaderRow(row) {
  row.font = HEADER_FONT;
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: BRAND_FILL };
  row.alignment = { vertical: 'middle', wrapText: true };
}

/**
 * Insert title block at top; returns 1-based row index where data table should start.
 */
function insertSheetBanner(sheet, lines, tableColumnCount = 8) {
  let r = 1;
  for (const line of lines) {
    if (tableColumnCount > 1) {
      try {
        sheet.mergeCells(r, 1, r, tableColumnCount);
      } catch {
        sheet.getCell(r, 1).value = line;
        r += 1;
        continue;
      }
    }
    const cell = sheet.getCell(r, 1);
    cell.value = line;
    if (r === 1) {
      cell.font = { size: 14, bold: true, color: { argb: 'FFB80101' } };
    } else {
      cell.font = { size: 10, color: { argb: 'FF444444' } };
    }
    r += 1;
  }
  sheet.getRow(r).height = 6;
  return r + 1;
}

function safeFilenamePart(s) {
  return String(s || '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function workbookProvenance(wb) {
  wb.creator = 'Elkably E-Learning';
  wb.created = new Date();
  wb.company = 'Elkably';
}

module.exports = {
  styleTableHeaderRow,
  insertSheetBanner,
  safeFilenamePart,
  workbookProvenance,
  BRAND_FILL,
};
