import { FORMS } from '../kiem-tra/src/domain/forms.js';
import { patchWorkbook } from './xlsx-patch.js';

/** Dòng đầu và dòng cuối vùng dữ liệu của mẫu B30K (profile B30K). */
export const DONG_DAU = 3;
export const DONG_CUOI = 30002;
export const SO_DONG_DU = 50;

/** Khóa biểu trên cổng → khóa trong FORMS (chỉ khác ở dự báo). */
const KHOA_FORMS = Object.freeze({ a1: 'a1', a2: 'a2', b1: 'b1', b2_ct: 'b2_ct', c1: 'c1', c2: 'c2', c3: 'c3', d1: 'd1', d2: 'd2', du_bao_5_nam: 'dubao' });
const KIEU_SO = new Set(['DECIMAL', 'INTEGER']);
const rong = (v) => v === null || v === undefined || v === '';

/** Đổi giá trị của cổng sang giá trị ghi vào ô: cột số → số (chuỗi kiểu 1.234,5 hoặc 1234.5), còn lại giữ nguyên. */
export function giaTriO(v, kieu) {
  if (rong(v)) return undefined;
  if (!KIEU_SO.has(kieu)) return typeof v === 'object' ? JSON.stringify(v) : v;
  if (typeof v === 'number') return v;
  let t = String(v).trim().replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : v;
}

/** @returns {{ vaTheoSheet: Record<string, Record<string, unknown>>, soDong: Record<string, number> }} */
export function dungVa(bieu) {
  const vaTheoSheet = {};
  const soDong = {};
  for (const [khoa, b] of Object.entries(bieu)) {
    const kf = KHOA_FORMS[khoa];
    if (!kf) continue; // biểu chỉ tính (B2 tổng hợp tác động) không có ô nhập
    const dong = b.dong ?? [];
    if (dong.length > DONG_CUOI - DONG_DAU + 1) throw new Error(`Biểu ${khoa} có ${dong.length} dòng, vượt sức chứa ${DONG_CUOI - DONG_DAU + 1} dòng của mẫu B30K`);
    const o = {};
    dong.forEach((d, i) => {
      for (const cot of Object.keys(FORMS[kf].cols)) {
        const v = giaTriO(d[cot], b.kieu?.[cot]);
        if (v !== undefined) o[`${cot}${DONG_DAU + i}`] = v;
      }
    });
    soDong[khoa] = dong.length;
    if (Object.keys(o).length) vaTheoSheet[FORMS[kf].sheet] = o;
  }
  return { vaTheoSheet, soDong };
}

/** Ghi dữ liệu vào bản sao mẫu; trả bộ đệm .xlsx. Cắt dòng trống thừa của mẫu 30.000 dòng, chừa `SO_DONG_DU` dòng trống sau dòng cuối. */
export async function xuatB30K(mau, bieu) {
  const { vaTheoSheet, soDong } = dungVa(bieu);
  const dung = Math.max(0, ...Object.values(soDong));
  const trimAfter = Math.min(DONG_CUOI, DONG_DAU + dung - 1 + SO_DONG_DU);
  const buf = await patchWorkbook(mau, vaTheoSheet, { unprotect: false, trimAfter, trimMinRows: DONG_CUOI });
  return { buf, soDong };
}
