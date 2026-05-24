/**
 * Generates downloadable templates for cost per accepted change.
 *
 * Output: public/templates/cpac-tracker.xlsx
 *
 * Run with: node scripts/generate-templates.mjs
 *
 * Re-run any time the schema or example data changes; commit the resulting
 * .xlsx file (the binary lives in the repo so the site can serve it without
 * a build-time generation step).
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'templates', 'cpac-tracker.xlsx');

const COLORS = {
  ink: 'FF1A1A1A',
  paper: 'FFFBFAF6',
  paperTint: 'FFF3EFE5',
  accent: 'FF7A1D1D',
  rule: 'FFD8D4CC',
  muted: 'FF5A5A5A',
  white: 'FFFFFFFF',
};

const FONT_HEADING = { name: 'Helvetica', size: 11, bold: true, color: { argb: COLORS.white } };
const FONT_LABEL = { name: 'Helvetica', size: 10, bold: true, color: { argb: COLORS.ink } };
const FONT_BODY = { name: 'Helvetica', size: 10, color: { argb: COLORS.ink } };
const FONT_MUTED = { name: 'Helvetica', size: 9, italic: true, color: { argb: COLORS.muted } };
const FONT_FORMULA = { name: 'Helvetica', size: 10, bold: true, color: { argb: COLORS.accent } };

async function build() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'costperacceptedchange.org';
  wb.lastModifiedBy = 'costperacceptedchange.org';
  wb.created = new Date();
  wb.modified = new Date();

  buildTrackerSheet(wb);
  buildInstructionsSheet(wb);

  await wb.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

function buildTrackerSheet(wb) {
  const ws = wb.addWorksheet('Tracker', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 2, activeCell: 'D3' }],
  });

  // Column setup
  const columns = [
    { header: 'Window label', key: 'label', width: 14 },
    { header: 'Start', key: 'start', width: 12 },
    { header: 'End', key: 'end', width: 12 },
    { header: 'Model cost', key: 'modelCost', width: 13 },
    { header: 'Infra cost', key: 'infraCost', width: 13 },
    { header: 'Eng time', key: 'engTime', width: 13 },
    { header: 'Review cost', key: 'reviewCost', width: 13 },
    { header: 'Rework cost', key: 'reworkCost', width: 13 },
    { header: 'Total cost', key: 'totalCost', width: 14 },
    { header: 'Accepted change units', key: 'units', width: 22 },
    { header: 'Cost per accepted change', key: 'cpac', width: 26 },
    { header: 'Δ vs prior', key: 'delta', width: 12 },
  ];
  ws.columns = columns;

  // Row 1: title / link
  ws.mergeCells('A1:L1');
  const titleCell = ws.getCell('A1');
  titleCell.value = {
    richText: [
      { text: 'Cost per accepted change — quarterly tracker.   ', font: { name: 'Helvetica', size: 11, bold: true, color: { argb: COLORS.ink } } },
      { text: 'Canonical definition at costperacceptedchange.org', font: { name: 'Helvetica', size: 10, italic: true, color: { argb: COLORS.muted } } },
    ],
  };
  titleCell.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 22;

  // Row 2: column headers
  const headerRow = ws.getRow(2);
  headerRow.values = columns.map((c) => c.header);
  headerRow.eachCell((cell) => {
    cell.font = FONT_HEADING;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ink } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.ink } },
      bottom: { style: 'thin', color: { argb: COLORS.ink } },
    };
  });
  headerRow.height = 20;

  // Example data rows. These illustrate the formulas and a realistic trajectory:
  // an investment in AI tooling drives CPAC down over four quarters as
  // verification infrastructure catches up to generation.
  const example = [
    { label: 'Q2 2025', start: '2025-04-01', end: '2025-06-30', modelCost: 800,  infraCost: 350, engTime: 22000, reviewCost: 7500, reworkCost: 4200, units: 38 },
    { label: 'Q3 2025', start: '2025-07-01', end: '2025-09-30', modelCost: 1450, infraCost: 380, engTime: 22500, reviewCost: 8200, reworkCost: 5100, units: 44 },
    { label: 'Q4 2025', start: '2025-10-01', end: '2025-12-31', modelCost: 1620, infraCost: 410, engTime: 21800, reviewCost: 7800, reworkCost: 4100, units: 51 },
    { label: 'Q1 2026', start: '2026-01-01', end: '2026-03-31', modelCost: 1700, infraCost: 420, engTime: 21000, reviewCost: 7100, reworkCost: 2800, units: 58 },
  ];

  const firstDataRow = 3;

  // Apply the same conditional formulas to every row (example + empty).
  // I (total cost), K (CPAC), and L (Δ vs prior) all return "" when their
  // inputs are missing or zero, so the sheet stays readable as users delete
  // example rows or insert blank ones below.
  const writeFormulas = (r, isFirstRow) => {
    ws.getCell(`I${r}`).value = {
      formula: `IF(SUM(D${r}:H${r})=0,"",D${r}+E${r}+F${r}+G${r}+H${r})`,
    };
    ws.getCell(`K${r}`).value = {
      formula: `IF(OR(I${r}="",J${r}="",J${r}=0),"",I${r}/J${r})`,
    };
    ws.getCell(`L${r}`).value = isFirstRow
      ? { formula: `""` }
      : { formula: `IF(OR(K${r}="",K${r - 1}=""),"",(K${r}-K${r - 1})/K${r - 1})` };
  };

  example.forEach((row, i) => {
    const r = firstDataRow + i;
    ws.getCell(`A${r}`).value = row.label;
    // Date columns: pass JavaScript Date objects so Excel/Sheets recognize
    // them for date-format styling and chart axis detection.
    ws.getCell(`B${r}`).value = new Date(row.start);
    ws.getCell(`C${r}`).value = new Date(row.end);
    ws.getCell(`D${r}`).value = row.modelCost;
    ws.getCell(`E${r}`).value = row.infraCost;
    ws.getCell(`F${r}`).value = row.engTime;
    ws.getCell(`G${r}`).value = row.reviewCost;
    ws.getCell(`H${r}`).value = row.reworkCost;
    ws.getCell(`J${r}`).value = row.units;
    writeFormulas(r, i === 0);
  });

  // Add 12 empty rows ready for the team to fill in
  for (let i = example.length; i < example.length + 12; i++) {
    const r = firstDataRow + i;
    writeFormulas(r, false);
  }

  // Style all body rows
  const lastRow = firstDataRow + example.length + 12 - 1;
  for (let r = firstDataRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = FONT_BODY;
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        bottom: { style: 'hair', color: { argb: COLORS.rule } },
      };
      // Date columns (B, C)
      if (colNum === 2 || colNum === 3) {
        cell.numFmt = 'yyyy-mm-dd';
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      // Currency columns: D-H (inputs), I (total), K (CPAC)
      if ([4, 5, 6, 7, 8, 9, 11].includes(colNum)) {
        cell.numFmt = '"$"#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      // Integer column: J (accepted change units)
      if (colNum === 10) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      // Percent-with-sign column: L (Δ vs prior)
      if (colNum === 12) {
        cell.numFmt = '+0.0%;-0.0%;0.0%';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });
    // Highlight computed columns
    ['I', 'K', 'L'].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { ...FONT_BODY, color: { argb: COLORS.accent }, bold: r >= firstDataRow && r <= firstDataRow + example.length - 1 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paperTint } };
    });
  }

  // Conditional formatting: 3-color scale on CPAC column over the active rows
  ws.addConditionalFormatting({
    ref: `K${firstDataRow}:K${lastRow}`,
    rules: [
      {
        type: 'colorScale',
        cfvo: [
          { type: 'min' },
          { type: 'percentile', value: 50 },
          { type: 'max' },
        ],
        color: [
          { argb: 'FFB7D8B7' },
          { argb: 'FFFFE9B0' },
          { argb: 'FFE8A8A8' },
        ],
      },
    ],
  });

  // Conditional formatting: Δ column — green for negative (CPAC down = good), red for positive
  ws.addConditionalFormatting({
    ref: `L${firstDataRow + 1}:L${lastRow}`,
    rules: [
      { type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { font: { color: { argb: 'FF1E6B1E' }, bold: true } } },
      { type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { font: { color: { argb: COLORS.accent }, bold: true } } },
    ],
  });

  // Add a small footnote row below the table
  const footnoteRow = lastRow + 2;
  ws.mergeCells(`A${footnoteRow}:L${footnoteRow}`);
  const footnote = ws.getCell(`A${footnoteRow}`);
  footnote.value =
    'Formulas: Total cost = sum of the five components. CPAC = Total cost ÷ Accepted change units. Δ = (CPAC_n − CPAC_{n-1}) ÷ CPAC_{n-1}. See the Instructions tab.';
  footnote.font = FONT_MUTED;
  footnote.alignment = { wrapText: true, vertical: 'middle' };
}

function buildInstructionsSheet(wb) {
  const ws = wb.addWorksheet('Instructions');
  ws.columns = [{ width: 110 }];

  let r = 1;
  const heading = (text) => {
    const cell = ws.getCell(`A${r}`);
    cell.value = text;
    cell.font = { name: 'Helvetica', size: 13, bold: true, color: { argb: COLORS.ink } };
    ws.getRow(r).height = 22;
    r++;
  };
  const subheading = (text) => {
    const cell = ws.getCell(`A${r}`);
    cell.value = text;
    cell.font = { name: 'Helvetica', size: 11, bold: true, color: { argb: COLORS.accent } };
    ws.getRow(r).height = 18;
    r++;
  };
  const body = (text) => {
    const cell = ws.getCell(`A${r}`);
    cell.value = text;
    cell.font = FONT_BODY;
    cell.alignment = { wrapText: true, vertical: 'top' };
    // Generous heuristic: ~80 chars per visible line at this column width,
    // 22pt per wrapped line. Overshoots slightly rather than clipping text.
    const visibleLines = Math.max(1, Math.ceil(text.length / 80));
    ws.getRow(r).height = Math.max(20, visibleLines * 22);
    r++;
  };
  const spacer = () => {
    r++;
  };

  heading('Cost per accepted change — tracker instructions');
  body('Canonical definition: https://costperacceptedchange.org');
  body('Defined in The Delivery Gap (Brenn Hill, 2026) as the cost vertex of the Verification Triangle.');
  spacer();

  subheading('How to use this sheet');
  body('1. Open the Tracker tab. The first four rows are example data — overwrite or delete them.');
  body('2. Add one row per measurement window. Use the same window length (monthly or quarterly) consistently.');
  body('3. Fill columns D–H (the five cost components) and column J (accepted change units).');
  body('4. Columns I, K, and L compute automatically. Do not edit them.');
  body('5. Add new rows below; copy the formulas from the row above for I, K, and L.');
  spacer();

  subheading('Column definitions');
  body('A — Window label. Free-text. Example: "Q1 2026" or "Mar 2026".');
  body('B / C — Window start and end dates. Use the same window length each row.');
  body('D — Model cost. LLM / API spend attributable to the changes produced in the window.');
  body('E — Infrastructure cost. Compute, storage, observability, tooling overhead attributable to producing changes.');
  body('F — Engineering time. Time spent specifying, prompting, integrating, steering, converted to currency at a loaded hourly rate.');
  body('G — Review cost. Time spent reviewing and gating AI-generated work, converted to currency.');
  body('H — Rework cost. Cost of fixing or reverting changes that did not stay in production during the window.');
  body('I — Total cost (computed). Sum of D through H.');
  body('J — Accepted change units. Merged PRs that reached production and stayed there, size-normalized via the 500-LOC rule: a PR of 1–500 lines = 1 unit; a larger PR of N lines = ceil(N / 500) units.');
  body('K — Cost per accepted change (computed). Total cost ÷ accepted change units.');
  body('L — Δ vs prior (computed). Percent change in CPAC from the previous row. Negative is improvement.');
  spacer();

  subheading('Discipline that makes this tracker work');
  body('Consistency over precision. Use the same accounting every window — same hourly rates, same exclusions (vendored, generated, lockfiles), same definition of "change". Switching mid-stream invalidates the trend.');
  body('Aggregate, not per-change. The metric is defined over a population. Do not compute CPAC for individual changes or individual engineers.');
  body('Two windows before you draw conclusions. One window is noise. Two windows is a direction. Three windows is a trend.');
  body('Pair with a leading indicator. Always report alongside change failure rate, acceptance rate, or DevEx score so you can explain why the bottom line moved.');
  spacer();

  subheading('Where to find help');
  body('— Definition and worked example: https://costperacceptedchange.org/');
  body('— How to use the metric correctly: https://costperacceptedchange.org/use');
  body('— FAQ, including the git command recipe for counting line changes: https://costperacceptedchange.org/faq');
  body('— Calculator (single-window): https://costperacceptedchange.org/calculator');
  body('— Quarterly review template: https://costperacceptedchange.org/templates/quarterly-review');
  body('— Source: https://github.com/brennhill/cost-per-accepted-change');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
