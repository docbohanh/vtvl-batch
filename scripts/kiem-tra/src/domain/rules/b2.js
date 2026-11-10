import { OK, LOAI_TD, LOAI_GIAM_SO_HOA, isBlank, isNum, num0, sum, freeze, keyOf } from './common.js';

/** B2 – Tác động chuyển đổi số: cột H, N, O, P của B2_CT_TacDong và bảng tổng hợp B2_ThayDoi. */

/** H: giờ giảm trực tiếp = SP áp dụng × (phút trước − phút sau) ÷ 60; null nếu thiếu số hoặc phút trước < phút sau. */
export function gioGiamTrucTiep(r) {
  if (!(isNum(r.sp_ap_dung) && isNum(r.phut_truoc) && isNum(r.phut_sau)) || r.phut_truoc < r.phut_sau) return null;
  return (r.sp_ap_dung * (r.phut_truoc - r.phut_sau)) / 60;
}

const add = (map, k, v) => map.set(k, (map.get(k) ?? 0) + v);

/** Cần toàn bộ dòng vì cột P dùng COUNTIFS/SUMIF trên cả cột. */
export function evaluateB2(rows, b1Rows, b1Results) {
  const spB1 = new Map();
  const gioB1 = new Map();
  b1Rows.forEach((br, i) => {
    add(spB1, br.ma_cong_viec, num0(br.so_sp));
    add(gioB1, br.ma_cong_viec, num0(b1Results[i].gio_tong));
  });
  const hList = rows.map(gioGiamTrucTiep);
  const hTheoCv = new Map();
  rows.forEach((r, i) => add(hTheoCv, r.ma_cong_viec, num0(hList[i])));
  const demCongDoan = new Map();
  for (const r of rows) add(demCongDoan, keyOf(r.ma_cong_viec, r.cong_doan, r.ky), 1);

  return freeze(rows.map((r, i) => {
    const h = hList[i];
    if (isBlank(r.ma_cong_viec)) return freeze({ gio_giam_truc_tiep: h, gio_giam_hop_le: 0, gio_tang_hop_le: 0, kiem_tra: '' });
    const hOk = h !== null;
    const iOk = !isBlank(r.gio_moi);
    let p;
    if (r.trang_thai === 'Ước lượng tham khảo') p = 'THAM KHẢO – KHÔNG TÍNH';
    else if ([r.ma_vtvl, r.cong_doan, r.nguon, r.ky, r.co_so_b1].some(isBlank) || r.trang_thai !== 'Đã kiểm chứng') p = 'CHƯA ĐỦ CĂN CỨ';
    else if (!LOAI_TD.includes(r.loai)) p = 'LOẠI TÁC ĐỘNG KHÔNG HỢP LỆ';
    else if (r.doi_chieu !== 'Đã đối chiếu') p = 'CHỜ SOÁT TRÙNG';
    else if (demCongDoan.get(keyOf(r.ma_cong_viec, r.cong_doan, r.ky)) > 1) p = 'TRÙNG CÔNG ĐOẠN';
    else if (!hOk && !iOk) p = 'THIẾU GIỜ TÁC ĐỘNG';
    else if (hOk && (!isNum(r.sp_ap_dung) || r.sp_ap_dung <= 0)) p = 'THIẾU SẢN PHẨM ÁP DỤNG';
    else if (hOk && r.sp_ap_dung > (spB1.get(r.ma_cong_viec) ?? 0)) p = 'SẢN PHẨM ÁP DỤNG VƯỢT B1';
    else if (isNum(r.phut_truoc) && isNum(r.phut_sau) && r.phut_truoc < r.phut_sau && (!isNum(r.gio_moi) || r.gio_moi <= 0)) p = 'THỜI GIAN TĂNG CHƯA GHI GIỜ MỚI';
    else if (r.co_so_b1 === 'Trước thay đổi, có điều chỉnh' && hTheoCv.get(r.ma_cong_viec) > (gioB1.get(r.ma_cong_viec) ?? 0)) p = 'GIỜ GIẢM VƯỢT GIỜ B1';
    else p = OK;
    const n = (p === OK && r.co_so_b1 === 'Trước thay đổi, có điều chỉnh' && hOk) ? h : 0;
    const o = (p === OK && iOk) ? Number(r.gio_moi) : 0;
    return freeze({ gio_giam_truc_tiep: h, gio_giam_hop_le: n, gio_tang_hop_le: o, kiem_tra: p });
  }));
}

/** B2_ThayDoi: một dòng cho mỗi mã công việc, giữ thứ tự xuất hiện đầu tiên. */
export function aggregateB2(rows, results) {
  const order = [];
  for (const r of rows) if (!isBlank(r.ma_cong_viec) && !order.includes(r.ma_cong_viec)) order.push(r.ma_cong_viec);
  return freeze(order.map((cv) => {
    const pairs = rows.map((r, i) => [r, results[i]]).filter(([r]) => r.ma_cong_viec === cv);
    const c = sum(pairs.filter(([r]) => LOAI_GIAM_SO_HOA.includes(r.loai)).map(([, x]) => x.gio_giam_hop_le));
    const tongN = sum(pairs.map(([, x]) => x.gio_giam_hop_le));
    const d = tongN - c;
    const e = sum(pairs.map(([, x]) => x.gio_tang_hop_le));
    const nDat = pairs.filter(([, x]) => x.kiem_tra === OK).length;
    const trangThai = nDat === 0 ? 'Chưa có dòng đạt' : (nDat === pairs.length ? 'Đã kiểm chứng' : 'Kiểm chứng một phần');
    return freeze({
      ma_cong_viec: cv, ma_vtvl: pairs[0][0].ma_vtvl, gio_giam_so_hoa: c, gio_giam_thue: d, gio_viec_moi: e,
      gio_rong: e - c - d, trang_thai: trangThai, so_dong: pairs.length,
    });
  }));
}
