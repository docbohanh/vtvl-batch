import ExcelJS from 'exceljs';
import { COLS, COMPUTED, FORM_KEYS, LAST_COL, SHEET_NAME, SKIP_SHEETS, colToNum, numToCol } from './cot.js';
import { normalizeCell } from './chuan-hoa.js';
import { issue } from './loi.js';
import { TIEU_DE_MAU, TIEU_DE_PHU } from './tieu-de.js';
import { kiemGioiHanZip } from './zip-gioi-han.js';

/**
 * Đọc tệp .xlsx theo cách của cổng (bản 1.2.8, tệp `excel-*.js`): nhận sheet theo tên, đọc từ dòng 3, bỏ dòng không có mã và
 * không có ô nhập tay (chỉ có công thức), bỏ dòng mẫu chỉ có số, bỏ qua giá trị gõ vào ô tự tính (VAL-005).
 * Lỗi cả tệp (không phải .xlsx, có macro, hỏng) ném Error có `status`.
 */

export const MAX_BYTES = 50 * 1024 * 1024;

/** Dạng so khớp tiêu đề (`B` của cổng): bỏ tiền tố "A •", hậu tố "(A)", dấu ngoặc kép, khoảng trắng thừa. */
const headerKey = (s) => s.normalize('NFC').toLowerCase().replace(/^\s*[a-z]{1,2}\s*[•.:)-]\s*/u, '').replace(/\(\s*[a-z]{1,2}\s*\)\s*$/u, '').replace(/[“”"*]/g, '').replace(/\s+/g, ' ').trim();

/** Cột đầu tiên (không phải cột tính) có tiêu đề dòng 2 không khớp mẫu v2; null nếu khớp hết. */
export function kiemTieuDe(ws, form) {
  for (const col of COLS[form]) {
    if (col.kind === 'COMPUTED') continue;
    const raw = readCell(ws.getCell(`${col.letter}2`)).value;
    const got = raw === null ? '' : headerKey(String(raw));
    const title = TIEU_DE_MAU[form]?.[col.letter] ?? col.title;
    const alt = TIEU_DE_PHU[form]?.[col.letter];
    const same = (t) => got.includes(headerKey(t)) || headerKey(t).includes(got);
    if (!got || !(same(title) || (alt !== undefined && same(alt)))) return { letter: col.letter, title };
  }
  return null;
}
const fail = (status, message) => Object.assign(new Error(message), { status });
const nameKey = (name) => String(name).trim().toLowerCase().replace(/\.\s+/g, '.');
const SHEET_BY_NAME = new Map(FORM_KEYS.map((k) => [nameKey(SHEET_NAME[k]), k]));
const SKIP_BY_NAME = new Set(SKIP_SHEETS.map(nameKey));
const pad2 = (n) => String(n).padStart(2, '0');
const MACRO_ENTRY = 'xl/vbaProject.bin';
const LINK_ENTRY = 'xl/externalLinks/';

const fmtDate = (d) => `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
function resultValue(r) {
  if (r === null || r === undefined) return null;
  if (r instanceof Date) return fmtDate(r);
  if (['number', 'string', 'boolean'].includes(typeof r)) return r;
  return typeof r === 'object' && 'error' in r ? String(r.error) : null;
}

/** Giá trị và công thức của một ô (`N` của cổng). Ô công thức lấy kết quả đã lưu; lỗi #N/A… giữ nguyên chữ lỗi. */
export function readCell(cell) {
  const v = cell.value;
  let value = null;
  let formula = null;
  if (v instanceof Date) value = fmtDate(v);
  else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') value = v;
  else if (v && typeof v === 'object') {
    if ('richText' in v) value = v.richText.map((t) => t.text ?? '').join('');
    else if ('hyperlink' in v) value = v.text ?? null;
    else if ('error' in v) value = v.error;
    else if ('formula' in v || 'sharedFormula' in v) { formula = v.formula ?? v.sharedFormula ?? null; value = resultValue(v.result); }
  }
  return { address: cell.address, value, formula };
}
const isBlank = (c) => !c || c.value === null || (typeof c.value === 'string' && c.value.trim() === '');
/** Ô mã có nghĩa: gõ tay, hoặc công thức cho ra chữ/số (không phải lỗi `#…`, không phải đúng/sai). */
const meaningful = (c) => {
  if (isBlank(c)) return false;
  if (c.formula === null) return true;
  if (typeof c.value === 'boolean') return false;
  return typeof c.value !== 'string' || (!c.value.trim().startsWith('#') && /[\p{L}\p{N}]/u.test(c.value));
};

/** Đọc một sheet thành các dòng đã chuẩn hóa. @returns {{rows: object[], issues: object[]}} */
export function readSheet(ws, form) {
  const last = colToNum(LAST_COL[form]);
  const computed = new Set(COMPUTED[form]);
  const rows = [];
  const issues = [];
  const typedInComputed = new Map();
  let skipped = 0;
  let firstSkip = null;
  let lastSkip = null;
  ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
    if (rowNo < 3) return;
    const cells = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, colNo) => {
      if (colNo > last) return;
      const c = readCell(cell);
      if (!isBlank(c)) any = true;
      cells[numToCol(colNo)] = c;
    });
    if (!any) return;
    const typed = Object.entries(cells).filter(([l, c]) => !computed.has(l) && c.formula === null && !isBlank(c));
    if (!typed.length && !meaningful(cells.A)) { skipped += 1; firstSkip ??= rowNo; lastSkip = rowNo; return; }
    if (isBlank(cells.A) && typed.length && typed.every(([, c]) => typeof c.value === 'number')) {
      issues.push(issue({ code: 'IMP-SAMPLE-ROW', severity: 'INFO', form, row: rowNo, col: 'A', message: `Dòng ${rowNo} không có mã, chỉ có số (${typed.map(([l]) => `${l}${rowNo}`).join(', ')}) nên không được nhập.`, suggestion: 'Xóa dòng mẫu hoặc điền mã.' }));
      return;
    }
    const data = {};
    for (const { letter } of COLS[form]) {
      if (computed.has(letter)) {
        const c = cells[letter];
        if (c && c.formula === null && !isBlank(c)) { const t = typedInComputed.get(letter); if (t) t.n += 1; else typedInComputed.set(letter, { n: 1, address: c.address, value: String(c.value), rowNo }); }
        data[letter] = null;
      } else data[letter] = cells[letter] ? normalizeCell(form, letter, cells[letter]) : null;
    }
    rows.push({ rowNo, data });
  });
  if (skipped) issues.push(issue({ code: 'IMP-BO-DONG', severity: 'WARNING', form, row: firstSkip, col: 'A', message: `Đã bỏ qua ${skipped.toLocaleString('vi-VN')} dòng không có mã và không có dữ liệu nhập, chỉ có công thức (từ dòng ${firstSkip} đến dòng ${lastSkip}).`, suggestion: 'Kiểm tra lại nếu các dòng này cần nhập.' }));
  for (const [letter, t] of typedInComputed) {
    const title = COLS[form].find((c) => c.letter === letter)?.title ?? '';
    issues.push(issue({ code: 'VAL-005', severity: 'WARNING', form, row: t.rowNo, col: letter, value: t.value, message: `Cột tự tính không cần nhập: đã bỏ qua giá trị ở cột ${letter} (${title}), ${t.n.toLocaleString('vi-VN')} ô, từ ô ${t.address}.`, suggestion: 'Không cần sửa tệp. Hệ thống tự tính cột này sau khi kết chuyển.' }));
  }
  return { rows, issues };
}

const hasEntry = (buffer, name) => buffer.includes(Buffer.from(name, 'latin1'));

/**
 * @param {Buffer} buffer
 * @param {{kieu?: 'full'|'single', formKey?: string}} opts
 * @returns {Promise<{sheets: {form: string, ten: string, rows: object[], issues: object[]}[], nhanDuoc: boolean, ignored: object[], issues: object[]}>} `nhanDuoc`: có ít nhất một sheet đúng tên biểu
 */
export async function docTep(buffer, { kieu = 'full', formKey, kiemTieuDeCot = true } = {}) {
  if (buffer.length > MAX_BYTES) throw fail(413, 'Tệp vượt dung lượng cho phép (50 MB). Tách tệp theo biểu.');
  const zip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 3 && buffer[3] === 4;
  if (!zip) throw fail(400, 'Không đọc được tệp: không phải tệp .xlsx hợp lệ hoặc bị hỏng');
  if (hasEntry(buffer, MACRO_ENTRY)) throw fail(422, 'Tệp có macro nên không được nhận. Lưu lại thành tệp .xlsx không có macro rồi nạp lại.');
  const vuot = kiemGioiHanZip(buffer);
  if (vuot) throw fail(422, 'Tệp có quá nhiều mục hoặc dung lượng giải nén quá lớn nên hệ thống không đọc được. Tách tệp theo biểu rồi nạp lần lượt.');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw fail(400, 'Không đọc được tệp: không phải tệp .xlsx hợp lệ hoặc bị hỏng'); }

  const issues = [];
  if (hasEntry(buffer, LINK_ENTRY)) issues.push(issue({ code: 'IMP-LINK', severity: 'WARNING', message: 'Tệp có liên kết tới tệp khác. Hệ thống không mở các liên kết này, chỉ đọc giá trị đang có trong ô.', suggestion: 'Kiểm tra lại số liệu.' }));
  const found = new Map();
  const ignored = [];
  for (const ws of wb.worksheets) {
    const key = nameKey(ws.name);
    const form = SHEET_BY_NAME.get(key);
    if (!form) ignored.push({ ten: ws.name, ly_do: SKIP_BY_NAME.has(key) ? 'Tự tổng hợp, không cần kê khai' : 'Sheet hướng dẫn hoặc danh mục' });
    else if (kieu === 'single' && form !== formKey) ignored.push({ ten: ws.name, ly_do: 'Không thuộc biểu đã chọn', form, ws });
    else if (!found.has(form)) found.set(form, ws);
  }
  const wanted = kieu === 'single' ? [formKey] : FORM_KEYS;
  const sheets = [];
  for (const form of wanted) {
    const ws = found.get(form);
    if (!ws) { issues.push(issue({ code: 'IMP-SHEET', severity: 'BLOCK', message: `Tệp không đúng mẫu Bộ biểu VTVL v2 (thiếu sheet ${SHEET_NAME[form]}).`, suggestion: 'Dùng đúng tệp mẫu Bộ biểu VTVL v2.', sheet: SHEET_NAME[form] })); continue; }
    const sai = kiemTieuDeCot ? kiemTieuDe(ws, form) : null;
    if (sai) { issues.push(issue({ code: 'IMP-HEADER', severity: 'BLOCK', form, sheet: ws.name, row: 2, col: sai.letter, message: `Sheet ${ws.name}: tiêu đề cột ${sai.letter} không đúng mẫu (cần "${sai.title}").`, suggestion: 'Dùng đúng tệp mẫu Bộ biểu VTVL v2, không sửa dòng tiêu đề.' })); continue; }
    sheets.push({ form, ten: ws.name, ...readSheet(ws, form) });
  }
  if (kieu === 'single' && (!found.has(formKey) || sheets[0]?.rows.length === 0)) {
    const other = ignored.filter((x) => x.form && readSheet(x.ws, x.form).rows.length > 0).map((x) => SHEET_NAME[x.form]);
    if (other.length) issues.splice(0, issues.length, ...issues.filter((x) => x.code !== 'IMP-SHEET'), issue({ code: 'IMP-SHEET', severity: 'BLOCK', message: `Biểu ${SHEET_NAME[formKey]} không có dòng; tệp có dòng ở: ${other.join(', ')}.`, suggestion: 'Chọn lại đúng biểu hoặc chọn tệp khác.', sheet: SHEET_NAME[formKey] }));
  }
  const nhanDuoc = found.size > 0 || ignored.some((x) => x.form);
  return { sheets, nhanDuoc, ignored: ignored.map(({ ten, ly_do: lyDo }) => ({ ten, ly_do: lyDo })), issues };
}
