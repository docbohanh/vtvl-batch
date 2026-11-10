/**
 * Kỳ báo cáo: chuẩn hóa và so khớp. Hàm thuần.
 * Hệ thống chính thức yêu cầu ô "Kỳ" của A1/B1/B2 khớp kỳ của hồ sơ; chấp nhận các cách viết khác nhau của cùng một khoảng ngày
 * (dấu gạch, khoảng trắng, ngày/tháng có hoặc không có số 0 đứng đầu) nhưng không chấp nhận giá trị như "2026".
 */

/** Biểu có cột Kỳ phải khớp kỳ hồ sơ (KY-01). */
export const PERIOD_FORMS = Object.freeze(['a1', 'b1', 'b2_ct']);

const DATE = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})/g;

/** Hai ngày chỉ cách nhau bằng dấu gạch (-, –, —); chữ như "đến", "tới" không được (cổng chính thức báo "Kỳ không khớp kỳ hồ sơ"). */
const DASH_RANGE = /^\s*\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{4}\s*[-–—]\s*\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{4}\s*$/;

/**
 * Tách khoảng ngày "dd/mm/yyyy – dd/mm/yyyy" thành hai ngày chuẩn hóa; không đúng dạng khoảng ngày thì trả null.
 * @param {unknown} value
 * @returns {{tu: string, den: string}|null}
 */
export function parsePeriod(value) {
  if (typeof value !== 'string') return null;
  const dates = [...value.matchAll(DATE)].map((m) => `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`);
  return dates.length === 2 ? Object.freeze({ tu: dates[0], den: dates[1] }) : null;
}

/** Dạng chuẩn để ghi vào ô: "01/10/2025 – 30/09/2026". Không phải khoảng ngày thì trả null. */
export function canonicalPeriod(value) {
  const p = parsePeriod(value);
  return p ? `${p.tu} – ${p.den}` : null;
}

/**
 * Ô Kỳ có khớp kỳ hồ sơ không.
 * - Kỳ hồ sơ không phải khoảng ngày (kỳ tự do): không so được, coi là khớp.
 * - Ô trống: coi là khớp (thiếu kỳ do quy tắc khác báo).
 * @param {unknown} cell giá trị ô Kỳ @param {string|undefined} hoSoKy kỳ của hồ sơ
 */
export function periodMatches(cell, hoSoKy) {
  const want = parsePeriod(hoSoKy);
  if (!want) return true;
  if (cell === null || cell === undefined || String(cell).trim() === '') return true;
  const text = String(cell);
  if (!DASH_RANGE.test(text)) return false;
  const got = parsePeriod(text);
  return got !== null && got.tu === want.tu && got.den === want.den;
}
