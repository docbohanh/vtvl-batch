import { OK, isBlank, isNum, num0, freeze } from './common.js';

/** B1 – Khối lượng: dịch nguyên văn các cột P (phút dùng tính), R (cảnh báo), F (giờ SP), G (giờ tổng) của B30K. */

const chuanDung = (r) => isNum(r.chuan_phut) && r.chuan_phut > 0 && r.chuan_xac_nhan === 'Đã xác nhận' && isBlank(r.giai_trinh);

/** @returns {{phut_dung_tinh: number|null, canh_bao: string, gio_sp: number|null, gio_tong: number|null}} */
export function computeB1(r) {
  if (isBlank(r.ma_cong_viec)) return freeze({ phut_dung_tinh: null, canh_bao: '', gio_sp: null, gio_tong: null });

  let p = null;
  if (chuanDung(r)) p = r.chuan_phut;
  else if (isNum(r.phut_do) && r.phut_do > 0
    && (r.tt_can_cu_tg === 'Kiểm đếm, ước lượng thực tế' || (r.tt_can_cu_tg === 'Có định mức' && !isBlank(r.nguon_tg)))) p = r.phut_do;

  const chiGioBoSung = isBlank(r.so_sp) && isNum(r.gio_bo_sung) && r.gio_bo_sung > 0;
  const chuanKhac = isNum(r.chuan_phut) && r.chuan_phut > 0 && r.chuan_xac_nhan === 'Đã xác nhận'
    && !isBlank(r.giai_trinh) && !String(r.giai_trinh).trim().startsWith('Đã xác nhận:');

  // Thứ tự của các nhánh là thứ tự IF lồng nhau trong công thức Excel: trả về lỗi đầu tiên gặp.
  let canhBao;
  if (isBlank(r.ma_vtvl)) canhBao = 'THIẾU MÃ VTVL';
  else if (isBlank(r.nguon_sl)) canhBao = 'THIẾU NGUỒN SẢN LƯỢNG/CÔNG VIỆC';
  else if (isBlank(r.ky)) canhBao = 'THIẾU KỲ';
  else if (chiGioBoSung && !isBlank(r.nguon_tg)) canhBao = OK;
  else if (isBlank(r.so_sp)) canhBao = 'THIẾU SẢN LƯỢNG';
  else if (isBlank(r.tt_can_cu_tg)) canhBao = 'CHƯA CHỌN TRẠNG THÁI';
  else if (chuanKhac) canhBao = 'CHỜ XÁC NHẬN KHÁC CHUẨN';
  else if (isBlank(r.nguon_tg) && !chuanDung(r)) canhBao = 'THIẾU NGUỒN THỜI GIAN';
  else if (p === null) canhBao = 'THIẾU THỜI GIAN';
  else canhBao = OK;

  if (canhBao !== OK) return freeze({ phut_dung_tinh: p, canh_bao: canhBao, gio_sp: null, gio_tong: null });
  const gioSp = chiGioBoSung ? 0 : (r.so_sp * p) / 60;
  return freeze({ phut_dung_tinh: p, canh_bao: canhBao, gio_sp: gioSp, gio_tong: gioSp + num0(r.gio_bo_sung) });
}
