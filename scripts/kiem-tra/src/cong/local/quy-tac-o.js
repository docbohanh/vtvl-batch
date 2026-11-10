import { COLS } from './cot.js';
import { parseNumber } from './chuan-hoa.js';
import { issue } from './loi.js';

/**
 * Quy tắc mức ô (L1) của cổng, bản 1.2.8: bắt buộc (VAL-001), số/độ dài (VAL-002), giá trị chọn (VAL-003/VAL-008), kỳ (VAL-004),
 * và giá trị chỉ cấp có thẩm quyền được ghi (VAL-003). Hàm thuần, thứ tự cột theo mẫu, mỗi ô tối đa một lỗi.
 */

const squash = (s) => s.replace(/\s+/g, '').replace(/[-–—]/g, '-');

/** Dòng B1 cột S "Đã xác nhận: …" và D2 cột I "Đã thẩm định/Đã được quyết định" chỉ người có thẩm quyền ghi; người nhập đơn vị không có quyền này. */
const AUTHORITY = Object.freeze([
  { form: 'b1', col: 'S', matches: (v) => v.replace(/\s+/g, '').toLowerCase().startsWith('đãxácnhận:'), message: 'Chỉ người kiểm chứng được xác nhận giải trình khác chuẩn.' },
  { form: 'd2', col: 'I', matches: (v) => ['đã thẩm định', 'đã được quyết định'].includes(v.trim().toLowerCase()), message: 'Trạng thái Đã thẩm định / Đã được quyết định do cấp có thẩm quyền ghi nhận.' },
]);

function checkCell(form, col, row, period) {
  const v = row.data[col.letter];
  const has = v !== null && v !== undefined && v !== '';
  const base = { form, row: row.rowNo, col: col.letter, value: v ?? '' };
  const cell = `${col.letter}${row.rowNo}`;
  if (col.kind === 'COMPUTED') return null;
  if (col.required && !col.enumCode && !has) return issue({ ...base, code: 'VAL-001', severity: 'BLOCK', message: 'THIẾU MÃ', suggestion: 'Nhập mã theo danh mục có thẩm quyền.' });
  if (col.type === 'number' && has) {
    const n = parseNumber(v);
    if (!n.ok || (col.nonNegative && n.value?.startsWith('-'))) return issue({ ...base, code: 'VAL-002', severity: 'BLOCK', message: 'Số không hợp lệ', suggestion: `Ô ${cell} phải là số không âm hoặc để trống nếu chưa có dữ liệu; không nhập N/A.` });
  }
  if (col.maxLength !== undefined && has && v.length > col.maxLength) return issue({ ...base, code: 'VAL-002', severity: 'BLOCK', message: 'Nội dung quá dài', suggestion: `Nội dung ${cell} dài quá ${col.maxLength} ký tự; rút gọn nội dung.` });
  if (col.enum) {
    const code = col.enumCode ?? 'VAL-003';
    if (!has) return col.required && col.enumCode ? issue({ ...base, code, severity: 'BLOCK', message: 'Chưa chọn trạng thái', suggestion: `Chọn ${col.enum.join(' / ')}.` }) : null;
    if (col.enum.includes(v)) return null;
    const hint = col.enumCode ? `Chọn ${col.enum.join(' / ')}.` : `Giá trị tại ${cell} không có trong danh mục của biểu.`;
    return issue({ ...base, code, severity: 'BLOCK', message: 'Giá trị ngoài danh mục', suggestion: hint });
  }
  if (col.type === 'period' && period) {
    if (has && squash(v) === squash(period)) return null;
    return issue({ ...base, code: 'VAL-004', severity: 'BLOCK', message: has ? 'Kỳ không khớp kỳ hồ sơ' : 'Thiếu kỳ', suggestion: `Ghi kỳ ${period}.` });
  }
  return null;
}

/** @param {string|null} period nhãn kỳ hồ sơ (ví dụ "01/10/2025 – 30/09/2026"); null thì không kiểm tra kỳ. */
export function kiemTraO(form, rows, period = null) {
  const out = [];
  for (const row of rows) {
    for (const col of COLS[form]) { const i = checkCell(form, col, row, period); if (i) out.push(i); }
    for (const rule of AUTHORITY) {
      const v = row.data[rule.col];
      if (rule.form === form && v && rule.matches(v)) out.push(issue({ form, row: row.rowNo, col: rule.col, value: v, code: 'VAL-003', severity: 'BLOCK', message: rule.message, suggestion: rule.message }));
    }
  }
  return out;
}
