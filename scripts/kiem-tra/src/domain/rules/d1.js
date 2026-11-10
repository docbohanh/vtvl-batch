import { QUY_GIO_PP2, isBlank, isNum, freeze } from './common.js';
import { c1QuyGio } from './c1.js';

/** D1 – Nhân lực: cột D (quỹ giờ quy đổi) và J (cảnh báo). */
export function evaluateD1(rows, c1Rows, quyGio = QUY_GIO_PP2) {
  const c1TheoMa = new Map();
  for (const c of c1Rows) if (!c1TheoMa.has(c.ma_vtvl)) c1TheoMa.set(c.ma_vtvl, c); // giữ dòng đầu khi trùng
  const dem = new Map();
  for (const r of rows) dem.set(r.ma_nguon_luc, (dem.get(r.ma_nguon_luc) ?? 0) + 1);

  return freeze(rows.map((r) => {
    let d;
    if (isBlank(r.ma_vtvl)) d = null;
    else if (isNum(r.gio_rieng_che_do)) d = r.gio_rieng_che_do;
    else d = c1TheoMa.has(r.ma_vtvl) ? c1QuyGio(c1TheoMa.get(r.ma_vtvl), quyGio) : null;

    const thieu = [];
    if (d === null) thieu.push(isBlank(r.ma_vtvl) ? 'chưa chọn Mã VTVL' : `Mã VTVL "${r.ma_vtvl}" chưa có ở C1 (không tính được quỹ giờ)`);
    if (isBlank(r.gio_vtvl)) thieu.push('thiếu Giờ dành cho VTVL');
    // Giờ việc khác để trống tính là 0 (không báo thiếu); khi xuất, ô được ghi 0 để công thức của mẫu B30K cũng không báo thiếu.
    if (isBlank(r.nguon)) thieu.push('thiếu Nguồn (mẫu B30K bắt buộc)');
    if (r.trang_thai !== 'Đã kiểm chứng') thieu.push('Trạng thái chưa là "Đã kiểm chứng"');

    let j;
    if (isBlank(r.ma_nguon_luc)) j = '';
    else if (dem.get(r.ma_nguon_luc) > 1) j = 'TRÙNG MÃ NGUỒN LỰC';
    else if (isBlank(r.noi_tinh_bc)) j = 'THIẾU NƠI TÍNH BIÊN CHẾ';
    else if (thieu.length) j = 'Chưa đủ căn cứ';
    else if (r.gio_vtvl + (r.gio_khac ?? 0) > d) j = 'Vượt quỹ giờ';
    else j = 'Đạt';
    const chiTiet = j === 'Chưa đủ căn cứ' ? thieu.join('; ')
      : j === 'TRÙNG MÃ NGUỒN LỰC' ? `mã "${r.ma_nguon_luc}" xuất hiện ở ${dem.get(r.ma_nguon_luc)} dòng D1; mỗi dòng phải có mã nguồn lực riêng (người kiêm nhiệm cũng vậy)` : '';
    return freeze({ gio_quy_doi: d, canh_bao: j, chi_tiet: chiTiet });
  }));
}
