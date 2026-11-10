import { codeKey, normalizeCode } from '../domain/codes/normalize.js';
import { evaluateAll } from '../domain/rules/index.js';

/**
 * Chuẩn bị đầu vào cho lõi từ mô hình các biểu: thực hiện các phép tra cứu mà Excel làm bằng cột tự động
 * (mã VTVL của B1 và B2 lấy từ A2; phút chuẩn và trạng thái sản phẩm của B1 lấy từ danh mục sản phẩm).
 * Mã được chuẩn hóa (bỏ khoảng trắng, một cách viết cho mỗi mã) vì Excel so khớp mã không phân biệt hoa/thường.
 */

const pick = (row, keys) => Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
const firstBy = (rows, field) => {
  const map = new Map();
  for (const r of rows) if (!map.has(codeKey(r[field]))) map.set(codeKey(r[field]), r); // MATCH của Excel lấy dòng đầu
  return map;
};
const canonical = (rows, field) => {
  const map = new Map();
  for (const r of rows) if (!map.has(codeKey(r[field]))) map.set(codeKey(r[field]), normalizeCode(r[field]));
  return (raw) => map.get(codeKey(raw)) ?? normalizeCode(raw);
};

const B1_FIELDS = ['so_sp', 'phut_do', 'gio_bo_sung', 'nguon_sl', 'nguon_tg', 'tt_can_cu_tg', 'ky', 'giai_trinh'];
const B2_FIELDS = ['loai', 'cong_doan', 'sp_ap_dung', 'phut_truoc', 'phut_sau', 'gio_moi', 'nguon', 'ky', 'co_so_b1', 'trang_thai', 'doi_chieu'];
const C1_FIELDS = ['che_do', 'gio_rieng', 'can_cu_gio', 'xac_nhan_gio'];
const C3_FIELDS = ['phuong_phap', 'nguoi_pp1', 'nguoi_pp3', 'nguoi_can_bo_tri', 'nguon_giai_trinh', 'trang_thai'];
const D1_FIELDS = ['ma_nguon_luc', 'gio_vtvl', 'gio_khac', 'noi_tinh_bc', 'nguon', 'trang_thai', 'gio_rieng_che_do'];
const FORECAST_FIELDS = ['nam', 'bien_dong', 'noi_dung', 'can_cu', 'trang_thai'];
const D2_FIELDS = ['nam', 'nguoi_co_the_bo_tri', 'bien_che_giao', 'de_nghi_dieu_chinh', 'giai_trinh', 'trang_thai', 'van_ban'];

/** @returns đầu vào của `evaluateAll`: {b1, b2, c1, c3, d1, forecast, d2} */
export function resolveModel(model) {
  const [a2, dm, c1] = [model.a2 ?? [], model.dm_sp ?? [], model.c1 ?? []];
  const a2By = firstBy(a2, 'ma_cong_viec');
  const dmBy = firstBy(dm, 'ma_sp');
  const job = canonical(a2, 'ma_cong_viec');
  const vtvl = canonical(c1, 'ma_vtvl');
  const vtvlOfJob = (code) => { const a = a2By.get(codeKey(code)); return a && normalizeCode(a.ma_vtvl) !== '' ? vtvl(a.ma_vtvl) : ''; };
  const withVtvl = (rows, fields) => rows.map((r) => ({ ma_vtvl: vtvl(r.ma_vtvl), ...pick(r, fields) }));

  return {
    b1: (model.b1 ?? []).map((r) => {
      const d = normalizeCode(r.ma_sp) === '' ? undefined : dmBy.get(codeKey(r.ma_sp));
      return {
        ma_cong_viec: job(r.ma_cong_viec), ma_vtvl: vtvlOfJob(r.ma_cong_viec), ...pick(r, B1_FIELDS),
        chuan_phut: d && d.phut_chuan !== '' ? (d.phut_chuan ?? null) : null, chuan_xac_nhan: d?.trang_thai ?? '',
      };
    }),
    b2: (model.b2_ct ?? []).map((r) => ({ ma_cong_viec: job(r.ma_cong_viec), ma_vtvl: vtvlOfJob(r.ma_cong_viec), ...pick(r, B2_FIELDS) })),
    c1: c1.map((r) => ({ ma_vtvl: vtvl(r.ma_vtvl), ...pick(r, C1_FIELDS) })),
    c3: withVtvl(model.c3 ?? [], C3_FIELDS),
    d1: withVtvl(model.d1 ?? [], D1_FIELDS),
    forecast: withVtvl(model.dubao ?? [], FORECAST_FIELDS),
    d2: withVtvl(model.d2 ?? [], D2_FIELDS),
  };
}

/** Tra cứu rồi tính toàn bộ chuỗi B1 → B2 → C3 → D1 → dự báo → D2. */
export const evaluateModel = (model, options) => evaluateAll(resolveModel(model), options);
