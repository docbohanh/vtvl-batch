/** Chuẩn hóa và nhận dạng mã. Hàm thuần, không đổi dữ liệu đầu vào. */

const WHITESPACE = /[\s ​-‍﻿]+/g;
const NAME_SPACES = /\s+/g;
// Nhóm VTVL được nhận khi mã không có tiền tố cơ quan (ví dụ "LĐQL-01"); mã có tiền tố nhận mọi nhóm chữ in hoa.
export const KNOWN_VTVL_GROUPS = Object.freeze(['LĐQL', 'CMNV', 'HTPV', 'CMDC', 'NVCN']);
const VTVL = /^(?:([^\s.\-]+)-)?([A-ZĐ]{2,6})([-.]?)(\d{1,3})$/u;

/** Chuẩn Unicode (NFC) và bỏ mọi khoảng trắng, xuống dòng. KHÔNG đổi hoa/thường, không đổi dấu chấm. */
export function normalizeCode(raw) {
  return String(raw ?? '').normalize('NFC').replace(WHITESPACE, '');
}

/** Khóa so trùng (R1): giống cách Excel so khớp mã, không phân biệt hoa/thường. */
export function codeKey(raw) {
  return normalizeCode(raw).toLowerCase();
}

/** Khóa so sánh tên (bỏ khác biệt hoa/thường và khoảng trắng thừa). */
export function nameKey(raw) {
  return String(raw ?? '').normalize('NFC').toLowerCase().replace(NAME_SPACES, ' ').trim();
}

/**
 * Nhận dạng mã VTVL dạng `<tiền tố>-<nhóm>-<số>`.
 * @returns {{prefix:string, group:string, number:number, digits:string, canonical:string, issues:string[]}|null}
 */
export function parseVtvlCode(raw) {
  const m = VTVL.exec(normalizeCode(raw));
  if (!m) return null;
  const [, prefix = '', group, sep, digits] = m;
  if (!prefix && !KNOWN_VTVL_GROUPS.includes(group)) return null;
  const issues = [];
  if (sep === '') issues.push('thieu_dau_phan_cach');
  if (sep === '.') issues.push('dau_cham');
  return {
    prefix, group, digits, number: Number(digits), issues,
    canonical: `${prefix ? `${prefix}-` : ''}${group}-${digits}`,
  };
}
