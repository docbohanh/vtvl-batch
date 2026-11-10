import { COLS, isCodeColumn } from './cot.js';

/**
 * Chuẩn hóa giá trị ô thành chuỗi hoặc null, giống `cn`/`Ht`/`ln`/`dn` của cổng (bản 1.2.8). Hàm thuần.
 */

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
const PLAIN_NUMBER = /^(?:0|-?[1-9]\d*)(?:\.\d*[1-9])?$/;

/** Đọc số từ ô: chấp nhận "1.234,5", "1,5", "1.234"; không phải số thì ok=false. */
export function parseNumber(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === 'number') return Number.isFinite(v) ? { ok: true, value: String(v) } : { ok: false };
  const t = String(v).replace(/\s+/g, '');
  if (t === '') return { ok: true, value: null };
  const dot = t.includes('.');
  const comma = t.includes(',');
  let n = t;
  if (dot && comma) n = t.replaceAll('.', '').replaceAll(',', '.');
  else if (comma) n = t.replaceAll(',', '.');
  else if (dot && THOUSANDS.test(t)) n = t.replaceAll('.', '');
  if (PLAIN_NUMBER.test(n)) return { ok: true, value: n };
  const f = Number(n);
  return n !== '' && Number.isFinite(f) ? { ok: true, value: String(f) } : { ok: false };
}

/** "1/10/2025 - 30/9/2026" → "01/10/2025–30/09/2026"; không khớp thì giữ nguyên. */
export function normalizePeriod(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return s;
  const p = (x) => x.padStart(2, '0');
  return `${p(m[1])}/${p(m[2])}/${m[3]}–${p(m[4])}/${p(m[5])}/${m[6]}`;
}

const sameText = (s) => s.normalize('NFC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
/** Giá trị chọn gõ khác hoa/thường hoặc gạch ngang thì đưa về đúng nguyên văn trong danh sách. */
export const canonicalEnum = (s, list) => list.find((x) => sameText(x) === sameText(s)) ?? s;

/** Dạng so khớp mã: bỏ khoảng trắng thừa, thống nhất gạch ngang, không phân biệt hoa thường (`en` của cổng). */
export const codeKey = (s) => (s ?? '').trim().replace(/\s+/g, ' ').replace(/\s*[-–—]\s*/g, '-').toLowerCase();

/** `cell`: {value, formula}. @returns {string|null} */
export function normalizeCell(form, letter, cell) {
  const col = COLS[form].find((x) => x.letter === letter);
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (col?.type === 'number') {
    const r = parseNumber(typeof v === 'boolean' ? String(v) : v);
    return r.ok ? r.value : (String(v).trim() || null);
  }
  if (col?.type === 'year') {
    const m = /^\s*(\d{4})(?:[.,]0+)?\s*$/.exec(String(v));
    return m ? m[1] : (String(v).trim() || null);
  }
  if (typeof v === 'number') { const r = parseNumber(v); return r.ok ? r.value : String(v); }
  let text = String(v).normalize('NFC').replace(/_x000D_/gi, '\r').replace(/\r\n?/g, '\n');
  if (isCodeColumn(form, letter)) text = text.replace(/\s*\n\s*/g, ' ');
  text = text.trim();
  if (text === '') return null;
  if (col?.type === 'period') return normalizePeriod(text);
  return col?.enum ? canonicalEnum(text, col.enum) : text;
}

