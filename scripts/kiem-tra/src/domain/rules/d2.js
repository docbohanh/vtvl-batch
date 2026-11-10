import { OK, TT_D2, isBlank, isNum, freeze, keyOf } from './common.js';
import { namHopLe } from './forecast.js';

/** D2 – Phương án: cột C (người cần bố trí từ dự báo), L (C3 năm cơ sở), M (kiểm soát), J (cảnh báo). */
export function evaluateD2(rows, forecastRows, forecastResults, c3Rows, c3Results) {
  const dem = new Map();
  for (const r of rows) dem.set(keyOf(r.ma_vtvl, r.nam), (dem.get(keyOf(r.ma_vtvl, r.nam)) ?? 0) + 1);

  return freeze(rows.map((r) => {
    if (isBlank(r.ma_vtvl)) return freeze({ nguoi_can_bo_tri_nam: null, c3_co_so: null, kiem_soat: '', canh_bao: '' });
    const fcIdx = forecastRows.flatMap((fr, i) => (fr.ma_vtvl === r.ma_vtvl && fr.nam === r.nam && forecastResults[i].kiem_tra === OK ? [i] : []));
    const c = fcIdx.length === 1 ? forecastResults[fcIdx[0]].nguoi_can_bo_tri_nam : null;
    const c3Match = c3Rows.filter((cr) => cr.ma_vtvl === r.ma_vtvl);
    const l = c3Match.length === 0 || isBlank(c3Match[0].nguoi_can_bo_tri) ? null : c3Match[0].nguoi_can_bo_tri;
    const c3Ok = c3Rows.filter((cr, i) => cr.ma_vtvl === r.ma_vtvl && cr.trang_thai === 'Đã kiểm chứng' && c3Results[i].canh_bao === OK).length;
    const d = r.nguoi_co_the_bo_tri;

    let m;
    if (isBlank(r.giai_trinh)) m = 'THIẾU GIẢI TRÌNH';
    else if (c === null) m = 'CHƯA CÓ DỰ BÁO NĂM';
    else if (isBlank(d)) m = 'THIẾU NGƯỜI CÙNG ĐƠN VỊ TÍNH';
    else if (!isNum(c) || !isNum(d)) m = 'C/D PHẢI TÍNH THEO NGƯỜI';
    else if (c < 0 || d < 0) m = 'SỐ NGƯỜI ÂM';
    else if (l !== null && c !== l) m = 'THAY ĐỔI SO VỚI NĂM CƠ SỞ – CÓ DỰ BÁO';
    else m = 'ĐỐI CHIẾU XONG';

    let j;
    if (!namHopLe(r.nam)) j = 'NĂM KHÔNG HỢP LỆ';
    else if (dem.get(keyOf(r.ma_vtvl, r.nam)) > 1) j = 'TRÙNG MÃ VTVL – NĂM';
    else if (isBlank(r.trang_thai)) j = 'CHƯA CHỌN TRẠNG THÁI';
    else if (!TT_D2.includes(r.trang_thai)) j = 'TRẠNG THÁI KHÔNG HỢP LỆ';
    else if (c3Ok !== 1) j = 'C3 CHƯA ĐƯỢC XÁC NHẬN';
    else if (fcIdx.length !== 1) j = 'CHƯA CÓ DỰ BÁO NĂM ĐÃ KIỂM CHỨNG';
    else if (c === null || isBlank(d) || isBlank(r.de_nghi_dieu_chinh) || isBlank(r.giai_trinh)) j = 'THIẾU PHƯƠNG ÁN';
    else if (['THIẾU GIẢI TRÌNH', 'THIẾU NGƯỜI CÙNG ĐƠN VỊ TÍNH', 'C/D PHẢI TÍNH THEO NGƯỜI', 'SỐ NGƯỜI ÂM'].includes(m)) j = 'CHƯA ĐỦ CĂN CỨ';
    else if (r.trang_thai === 'Đang xây dựng') j = 'ĐANG XÂY DỰNG';
    else if (r.trang_thai === 'Đã hoàn thành ở đơn vị') j = 'SẴN SÀNG THẨM ĐỊNH';
    else if (isBlank(r.van_ban)) j = 'THIẾU VĂN BẢN THẨM ĐỊNH/QUYẾT ĐỊNH';
    else if (r.trang_thai === 'Đã thẩm định') j = 'ĐÃ THẨM ĐỊNH';
    else j = 'ĐÃ QUYẾT ĐỊNH';
    return freeze({ nguoi_can_bo_tri_nam: c, c3_co_so: l, kiem_soat: m, canh_bao: j });
  }));
}
