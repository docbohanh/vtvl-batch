import { SHEET_NAME } from './cot.js';

/** Mức nghiêm trọng của cổng: BLOCK (lỗi phải sửa) > PENDING (chờ bổ sung) > WARNING (cần xem lại) > INFO (thông tin). */
export const SEVERITY = Object.freeze(['BLOCK', 'PENDING', 'WARNING', 'INFO']);

/**
 * Một phát hiện của bộ kiểm tra. `form` hoặc `sheet` xác định biểu; `row`/`col` xác định ô (có thể trống với lỗi cả tệp/cả biểu).
 * @returns {Readonly<{code:string,severity:string,sheet:string|null,form:string|null,row:number|null,col:string|null,message:string,suggestion:string,value:string}>}
 */
export function issue({ code, severity, form = null, sheet = null, row = null, col = null, message, suggestion = '', value = '' }) {
  return Object.freeze({ code, severity, form, sheet: sheet ?? (form ? SHEET_NAME[form] : null), row, col, message, suggestion, value: value ?? '' });
}

/** Dạng kết quả dùng chung với giao diện xem kết quả (cùng dạng kết quả của cổng): BLOCK là "lỗi phải sửa", còn lại là "cần xem lại". */
export function toKetQuaLoi(i, titleOf) {
  return {
    sheet: i.sheet ?? 'Cả tệp', dong: i.row, cot: i.col && i.form ? (titleOf(i.form, i.col) ?? i.col) : '', o: i.col && i.row ? `${i.col}${i.row}` : '',
    bieu: i.form, gia_tri: i.value, ma: i.code, muc: i.severity === 'BLOCK' ? 'loi' : 'xem_lai', noi_dung: i.message, huong_xu_ly: i.suggestion,
  };
}

const rank = (s) => SEVERITY.indexOf(s);
/** Sắp xếp ổn định: theo dòng, rồi theo mức nghiêm trọng. Lỗi không gắn dòng đứng đầu. */
export const sortIssues = (list) => list.map((x, idx) => ({ x, idx })).sort((a, b) => (a.x.row ?? 0) - (b.x.row ?? 0) || rank(a.x.severity) - rank(b.x.severity) || a.idx - b.idx).map((e) => e.x);
