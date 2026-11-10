import { OK, NAM_HOP_LE, isBlank, isNum, freeze, keyOf } from './common.js';

/** Dự báo 5 năm (DU_BAO_5_NAM của B30K): cột G, H, I. */

export const namHopLe = (nam) => isNum(nam) && nam === Math.trunc(nam) && nam >= NAM_HOP_LE.tu && nam <= NAM_HOP_LE.den;

export function evaluateForecast(rows, c3Rows, c3Results) {
  const dem = new Map();
  for (const r of rows) dem.set(keyOf(r.ma_vtvl, r.nam), (dem.get(keyOf(r.ma_vtvl, r.nam)) ?? 0) + 1);

  return freeze(rows.map((r) => {
    if (isBlank(r.ma_vtvl)) return freeze({ nguoi_c3_co_so: null, nguoi_can_bo_tri_nam: null, kiem_tra: '' });
    const c3Dat = c3Rows.filter((cr, i) => cr.ma_vtvl === r.ma_vtvl && cr.trang_thai === 'Đã kiểm chứng' && c3Results[i].canh_bao === OK);
    let g = c3Dat.length === 1 ? c3Dat[0].nguoi_can_bo_tri : null;
    g = isBlank(g) ? null : g;
    let i;
    if (!namHopLe(r.nam)) i = 'NĂM KHÔNG HỢP LỆ';
    else if (dem.get(keyOf(r.ma_vtvl, r.nam)) > 1) i = 'TRÙNG MÃ VTVL – NĂM';
    else if (g === null) i = 'C3 CHƯA ĐƯỢC XÁC NHẬN';
    else if (!isNum(r.bien_dong)) i = 'THIẾU BIẾN ĐỘNG (NHẬP 0 NẾU KHÔNG ĐỔI)';
    else if (g + r.bien_dong < 0) i = 'NHU CẦU ÂM';
    else if (isBlank(r.noi_dung) || isBlank(r.can_cu)) i = 'THIẾU GIẢI TRÌNH/NGUỒN';
    else if (r.trang_thai !== 'Đã kiểm chứng') i = 'CHƯA KIỂM CHỨNG DỰ BÁO';
    else i = OK;
    return freeze({ nguoi_c3_co_so: g, nguoi_can_bo_tri_nam: i === OK ? g + r.bien_dong : null, kiem_tra: i });
  }));
}
