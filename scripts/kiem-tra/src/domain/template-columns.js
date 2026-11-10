import { FORMS } from './forms.js';
import { codeKey, normalizeCode } from './codes/normalize.js';

/**
 * Cột công thức (khóa sửa) của từng sheet trong bộ biểu mẫu B30K, để lưới hiện đủ cột theo đúng thứ tự mẫu.
 * Giá trị lấy từ kết quả của lõi tính toán (cùng công thức với Excel), không lưu. `num`: cột số (có ô tổng ở cuối bảng).
 * Hàm thuần.
 */

const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const out = (v) => (v === undefined || v === null ? null : v);

export const TEMPLATE_AUTO = Object.freeze({
  b1: Object.freeze({ B: false, F: true, G: true, M: false, N: true, O: false, P: true, Q: false, R: false }),
  b2_ct: Object.freeze({ B: false, H: true, N: true, O: true, P: false }),
  c1: Object.freeze({ E: true, K: false }),
  c3: Object.freeze({ C: true, D: true, E: true, F: true, G: true, M: false, N: true }),
  d1: Object.freeze({ D: true, J: false }),
  dubao: Object.freeze({ G: true, H: true, I: false }),
  d2: Object.freeze({ C: true, J: false, K: true, L: true, M: false }),
});

/** Cột công thức của một biểu, theo thứ tự mẫu; `after` là khóa cột đứng ngay trước nó trên mẫu (trường nhập hoặc khóa cột công thức). */
export function templateAutoColumns(form, profile) {
  const auto = TEMPLATE_AUTO[form];
  const sheet = profile.sheets.find((s) => s.ten === FORMS[form].sheet);
  if (!auto || !sheet?.cot) return [];
  const list = [];
  let prev = null;
  for (const c of sheet.cot) {
    const field = FORMS[form].cols[c.cot];
    if (field) { prev = field; continue; }
    if (!(c.cot in auto)) continue;
    const key = `tm_${c.cot}`;
    list.push({
      key, col: c.cot, label: c.tieu_de, after: prev, text: !auto[c.cot], width: auto[c.cot] ? 130 : 220,
      title: `Cột ${c.cot} trên biểu mẫu B30K: ô công thức, khóa sửa. Tự cập nhật khi sửa các ô nhập liên quan.`,
    });
    prev = key;
  }
  return list;
}

const firstBy = (rows, field) => {
  const map = new Map();
  rows.forEach((r, i) => { const k = codeKey(r[field]); if (k !== '' && !map.has(k)) map.set(k, i); });
  return map;
};

/** Giá trị cột công thức: { biểu: { 'tm_X': (giá trị|null)[] } }, mỗi mảng cùng thứ tự dòng của biểu. */
export function templateAutoValues(model, results) {
  const rowsOf = (f) => model[f] ?? [];
  const a2 = rowsOf('a2');
  const a2Idx = firstBy(a2, 'ma_cong_viec');
  const dm = rowsOf('dm_sp');
  const dmIdx = firstBy(dm, 'ma_sp');
  const c3Idx = firstBy(rowsOf('c3'), 'ma_vtvl');
  const vtvlOfJob = (code) => { const i = a2Idx.get(codeKey(code)); return i === undefined || blank(a2[i].ma_vtvl) ? '' : normalizeCode(a2[i].ma_vtvl); };
  const dmOf = (code) => (blank(code) ? undefined : dm[dmIdx.get(codeKey(code))]);
  const num = (v) => typeof v === 'number' && Number.isFinite(v);

  const b1Q = (r, p) => {
    if (p === null || p === undefined) return '';
    const d = dmOf(r.ma_sp);
    if (d && num(d.phut_chuan) && d.phut_chuan > 0 && d.trang_thai === 'Đã xác nhận' && blank(r.giai_trinh)) return `Định mức danh mục: ${d.nguon_xac_nhan ?? ''}`;
    if (r.tt_can_cu_tg === 'Có định mức') return `Định mức: ${r.nguon_tg ?? ''}`;
    return `Ước lượng thực tế${blank(r.nguon_tg) ? '' : `; ${r.nguon_tg}`}`;
  };
  const per = (form, fn) => rowsOf(form).map((r, i) => out(fn(r, i)));
  const c3Of = (code) => { const i = c3Idx.get(codeKey(code)); return i === undefined ? undefined : results.c3[i]; };

  return {
    b1: {
      tm_B: per('b1', (r) => (blank(r.ma_cong_viec) ? '' : vtvlOfJob(r.ma_cong_viec))),
      tm_F: per('b1', (_r, i) => results.b1[i].gio_sp),
      tm_G: per('b1', (_r, i) => results.b1[i].gio_tong),
      tm_M: per('b1', (r) => dmOf(r.ma_sp)?.nhom ?? ''),
      tm_N: per('b1', (r) => dmOf(r.ma_sp)?.phut_chuan ?? ''),
      tm_O: per('b1', (r) => dmOf(r.ma_sp)?.trang_thai ?? ''),
      tm_P: per('b1', (_r, i) => results.b1[i].phut_dung_tinh),
      tm_Q: per('b1', (r, i) => b1Q(r, results.b1[i].phut_dung_tinh)),
      tm_R: per('b1', (_r, i) => results.b1[i].canh_bao),
    },
    b2_ct: {
      tm_B: per('b2_ct', (r) => (blank(r.ma_cong_viec) ? '' : vtvlOfJob(r.ma_cong_viec))),
      tm_H: per('b2_ct', (_r, i) => results.b2[i].gio_giam_truc_tiep),
      tm_N: per('b2_ct', (_r, i) => results.b2[i].gio_giam_hop_le),
      tm_O: per('b2_ct', (_r, i) => results.b2[i].gio_tang_hop_le),
      tm_P: per('b2_ct', (_r, i) => results.b2[i].kiem_tra),
    },
    c1: {
      tm_E: per('c1', (_r, i) => results.c1[i].quy_gio),
      tm_K: per('c1', (_r, i) => results.c1[i].kiem_tra),
    },
    c3: {
      tm_C: per('c3', (_r, i) => results.c3[i].gio_b1),
      tm_D: per('c3', (_r, i) => results.c3[i].gio_b2),
      tm_E: per('c3', (_r, i) => results.c3[i].gio_rong),
      tm_F: per('c3', (_r, i) => results.c3[i].quy_gio),
      tm_G: per('c3', (_r, i) => results.c3[i].nguoi_quy_doi_pp2),
      tm_M: per('c3', (_r, i) => results.c3[i].canh_bao),
      tm_N: per('c3', (_r, i) => results.c3[i].so_dong_b1_chua_dat),
    },
    d1: {
      tm_D: per('d1', (_r, i) => results.d1[i].gio_quy_doi),
      tm_J: per('d1', (_r, i) => results.d1[i].canh_bao),
    },
    dubao: {
      tm_G: per('dubao', (_r, i) => results.forecast[i].nguoi_c3_co_so),
      tm_H: per('dubao', (_r, i) => results.forecast[i].nguoi_can_bo_tri_nam),
      tm_I: per('dubao', (_r, i) => results.forecast[i].kiem_tra),
    },
    d2: {
      tm_C: per('d2', (_r, i) => results.d2[i].nguoi_can_bo_tri_nam),
      tm_J: per('d2', (_r, i) => results.d2[i].canh_bao),
      tm_K: per('d2', (r) => (blank(r.ma_vtvl) ? '' : c3Of(r.ma_vtvl)?.nguoi_quy_doi_pp2 ?? '')),
      tm_L: per('d2', (_r, i) => results.d2[i].c3_co_so),
      tm_M: per('d2', (_r, i) => results.d2[i].kiem_soat),
    },
  };
}
