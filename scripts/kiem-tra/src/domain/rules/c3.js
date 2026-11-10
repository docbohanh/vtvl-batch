import { OK, QUY_GIO_PP2, PP_HOP_LE_19_10, isBlank, num0, sum, freeze } from './common.js';
import { c1QuyGio, c1KiemTra } from './c1.js';

/** C3 – Nhu cầu: cột C–G, M, N. Thứ tự các nhánh của M là thứ tự IF lồng nhau của B30K. */

const groupByCode = (rows) => {
  const map = new Map();
  for (const r of rows) map.set(r.ma_vtvl, [...(map.get(r.ma_vtvl) ?? []), r]);
  return map;
};

export function evaluateC3(rows, b1Rows, b1Results, b2Rows, b2Results, b2Aggs, c1Rows, { quyGio = QUY_GIO_PP2, ppHopLe = PP_HOP_LE_19_10 } = {}) {
  const c1TheoMa = groupByCode(c1Rows);
  const demC3 = new Map();
  for (const r of rows) demC3.set(r.ma_vtvl, (demC3.get(r.ma_vtvl) ?? 0) + 1);

  return freeze(rows.map((r) => {
    const a = r.ma_vtvl;
    if (isBlank(a)) return freeze({ gio_b1: null, gio_b2: 0, gio_rong: null, quy_gio: null, nguoi_quy_doi_pp2: null, canh_bao: '', so_dong_b1_chua_dat: 0 });
    const b1Dat = b1Rows.flatMap((br, i) => (br.ma_vtvl === a && b1Results[i].canh_bao === OK ? [b1Results[i].gio_tong] : []));
    const c = b1Dat.length > 0 ? sum(b1Dat.map(num0)) : null;
    const d = sum(b2Aggs.filter((g) => g.ma_vtvl === a).map((g) => g.gio_rong));
    const e = c === null ? null : c + d;
    const c1Match = c1TheoMa.get(a) ?? [];
    const f = c1Match.length > 0 ? c1QuyGio(c1Match[0], quyGio) : null;
    const pp = r.phuong_phap ?? ''; // ô trống (null) vẫn phải rơi vào "PHƯƠNG PHÁP KHÔNG HỢP LỆ", không được ném lỗi
    const pp2 = pp.includes('PP2');
    const g = (pp2 && e !== null && f !== null && e >= 0 && f > 0) ? e / f : null;
    const n = b1Rows.filter((br, i) => br.ma_vtvl === a && b1Results[i].canh_bao !== OK).length;
    const c1Ok = c1Match.length > 0 && c1KiemTra(c1Match[0], quyGio) === OK;
    const b2ChuaDu = b2Rows.filter((br, i) => br.ma_vtvl === a && br.trang_thai !== 'Ước lượng tham khảo' && b2Results[i].kiem_tra !== OK).length;

    // Ô phương pháp trống rơi vào "PHƯƠNG PHÁP KHÔNG HỢP LỆ" trước nhánh "CHƯA CHỌN PHƯƠNG PHÁP" (quirk của B30K, không bao giờ tới nhánh sau).
    let m;
    if (!ppHopLe.includes(pp)) m = 'PHƯƠNG PHÁP KHÔNG HỢP LỆ';
    else if (c1Match.length > 1) m = 'TRÙNG MÃ VTVL Ở C1';
    else if (pp2 && !c1Ok) m = 'PP2: C1 CHƯA ĐỦ CĂN CỨ';
    else if (c1Match.length === 0) m = 'MÃ VTVL CHƯA CÓ Ở C1';
    else if (demC3.get(a) > 1) m = 'TRÙNG MÃ VTVL';
    else if (pp2 && e !== null && e < 0) m = 'GIỜ RÒNG ÂM – KIỂM TRA B2';
    else if (pp2 && g === null) m = 'PP2: THIẾU GIỜ B1 HOẶC QUỸ GIỜ';
    else if (pp2 && n > 0) m = 'PP2: CÒN DÒNG B1 CHƯA ĐẠT';
    else if (pp2 && b2ChuaDu > 0) m = 'PP2: B2 CHƯA ĐỦ CĂN CỨ';
    else if (pp.includes('PP1') && isBlank(r.nguoi_pp1)) m = 'PP1: THIẾU SỐ NGƯỜI';
    else if (pp.includes('PP3') && isBlank(r.nguoi_pp3)) m = 'PP3: THIẾU SỐ NGƯỜI';
    else if (isBlank(r.nguon_giai_trinh)) m = 'THIẾU NGUỒN/GIẢI TRÌNH';
    else if (isBlank(r.nguoi_can_bo_tri)) m = 'CHƯA KẾT LUẬN NGƯỜI CẦN BỐ TRÍ';
    else if (r.trang_thai !== 'Đã kiểm chứng') m = 'CHỜ XÁC NHẬN NGHIỆP VỤ';
    else m = OK;
    return freeze({ gio_b1: c, gio_b2: d, gio_rong: e, quy_gio: f, nguoi_quy_doi_pp2: g, canh_bao: m, so_dong_b1_chua_dat: n });
  }));
}
