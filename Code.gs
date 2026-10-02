/**
 * RFID Discrepancy Audit Generator — Google Sheets tool
 *
 * Takes a raw RFID stock-count export (pasted into the active sheet) and
 * produces a filtered, formatted adjustments report on a new tab, following
 * a retail inventory team's discrepancy-audit process.
 *
 * Expects these columns somewhere in row 1 (order doesn't matter):
 *   Sku, Description, Style, Color, Size, Category, Scanned Count, System Expected
 *
 * Install: Extensions > Apps Script, paste this as Code.gs, add Dialog.html,
 * save, reload the spreadsheet. A "RFID Discrepancy Audit" menu will appear.
 */

// Example keyword list for identifying "multibrand" (non-house-brand) items
// to exclude on normal audit days. Matched case-insensitively against
// Description + Style. In a real deployment this list would reflect the
// specific third-party brands a store carries — these are stand-ins.
const MULTIBRAND_KEYWORDS = [
  'sunglasses', 'fashion tape', 'lighter', 'lip balm brand', 'watch',
  'skincare brand', 'clock', 'earring', 'necklace', 'bracelet', 'hair clip',
  'barrette', 'dental floss brand', 'digital watch brand', 'sunscreen brand',
  'choker', 'loafer', 'earmuff', 'calculator', 'factory-exclusive tag',
  'nail polish', 'hair jaw clip', 'card case', 'wallet', 'key ring',
  'keychain', 'rosebud salve brand', 'hoop',
];
// "ring" is matched as a whole word only (via RING_REGEX below), since a
// plain substring match would also catch "Ringer Tee", "String Bikini", etc.
const RING_REGEX = /\bring(s)?\b/i;
// Example: a specific product line excluded most days but allowed on a
// recurring schedule (e.g. once a month) — swap in whatever that is for you.
const SEASONAL_BRAND_REGEX = /seasonalbrand/i;

// Category types treated as "accessories" on Accessory scan day.
const ACCESSORY_TYPES = new Set([
  'accessories', 'jewelry', 'watch', 'sunglasses', 'hair accessories', 'health & beauty',
]);

const REQUIRED_COLUMNS = ['Sku', 'Description', 'Style', 'Color', 'Size', 'Category', 'Scanned Count', 'System Expected'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RFID Discrepancy Audit')
    .addItem('Generate Adjustment Report', 'showAuditDialog')
    .addToUi();
}

function showAuditDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Dialog')
    .setWidth(420)
    .setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, 'RFID Discrepancy Audit');
}

function findColumn_(headerRow, name) {
  const idx = headerRow.findIndex(h => String(h).trim() === name);
  if (idx === -1) {
    throw new Error(`Could not find a "${name}" column. Check the sheet's headers.`);
  }
  return idx;
}

/** Splits "ALL_A_Shorts" into { prefix: "A", type: "Shorts" }. */
function parseCategory_(category) {
  const parts = String(category).split('_');
  if (parts.length >= 3) {
    return { prefix: parts[1], type: parts.slice(2).join('_') };
  }
  if (parts.length === 2) {
    return { prefix: parts[1], type: '' };
  }
  return { prefix: '', type: '' };
}

function isMultibrand_(description, style) {
  const text = `${description} ${style}`.toLowerCase();
  if (RING_REGEX.test(text)) return true;
  return MULTIBRAND_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Main entry point called from the dialog.
 * options: { categoryScope: 'ALL'|'A'|'B'|'C', accessoryDay: bool,
 *            includeSeasonalBrand: bool, minDisc: number }
 */
function generateAdjustmentReport(options) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getActiveSheet();
  const data = sourceSheet.getDataRange().getValues();
  if (data.length < 2) {
    throw new Error('The active sheet has no data rows. Paste the raw export first.');
  }

  const header = data[0];
  const cols = {};
  REQUIRED_COLUMNS.forEach(name => { cols[name] = findColumn_(header, name); });

  const minDisc = Number(options.minDisc) || 0;
  const categoryScope = options.categoryScope || 'ALL';
  const accessoryDay = !!options.accessoryDay;
  const includeSeasonalBrand = !!options.includeSeasonalBrand;

  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sku = String(row[cols['Sku']]).trim();
    const category = String(row[cols['Category']]).trim();
    if (!sku || !category || category === 'NaN') continue;

    const scannedCount = Number(row[cols['Scanned Count']]);
    const systemExpected = Number(row[cols['System Expected']]);
    if (isNaN(scannedCount) || isNaN(systemExpected)) continue;

    const disc = scannedCount - systemExpected;
    if (disc === 0 || Math.abs(disc) < minDisc) continue;

    const description = String(row[cols['Description']]);
    const style = String(row[cols['Style']]);

    if (!includeSeasonalBrand && SEASONAL_BRAND_REGEX.test(`${description} ${style}`)) continue;

    const { prefix, type } = parseCategory_(category);

    if (accessoryDay) {
      if (!ACCESSORY_TYPES.has(type.toLowerCase())) continue;
    } else {
      if (categoryScope !== 'ALL' && prefix !== categoryScope) continue;
      if (isMultibrand_(description, style)) continue;
    }

    results.push({
      sku,
      description,
      color: row[cols['Color']],
      style,
      size: row[cols['Size']],
      category,
      scannedCount,
      systemExpected,
      disc,
    });
  }

  results.sort((a, b) => {
    const na = Number(a.sku), nb = Number(b.sku);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.sku.localeCompare(b.sku);
  });

  writeReportSheet_(ss, results);
  return { rowCount: results.length };
}

function writeReportSheet_(ss, results) {
  const name = `Adjustments ${Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm')}`;
  const sheet = ss.insertSheet(name);

  const headerRow = ['Sku', 'Description', 'Color', 'Style', 'Size', 'Category',
    'Scanned Count', 'System Expected', 'Disc', 'ABS', 'Location A\nCount', 'Location B\nCount', 'Actual', 'Adj'];
  sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  sheet.getRange(1, 1, 1, headerRow.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (results.length === 0) {
    sheet.getRange(2, 1).setValue('No rows matched the selected filters.');
    return;
  }

  const rows = results.map((r, i) => {
    const sheetRow = i + 2;
    // Location A/B counts (cols K, L) are left blank for manual entry.
    // Actual = sum of those two; Adj = Actual - System Expected. Both are
    // live formulas so they recalculate automatically once a team member
    // fills in the hand counts.
    return [
      r.sku, r.description, r.color, r.style, r.size, r.category,
      r.scannedCount, r.systemExpected, r.disc, Math.abs(r.disc),
      '', '',
      `=IF(AND(K${sheetRow}="",L${sheetRow}=""),"",SUM(K${sheetRow}:L${sheetRow}))`,
      `=IF(M${sheetRow}="","",M${sheetRow}-H${sheetRow})`,
    ];
  });

  sheet.getRange(2, 1, rows.length, headerRow.length).setValues(rows);
  sheet.autoResizeColumns(1, headerRow.length);
}
