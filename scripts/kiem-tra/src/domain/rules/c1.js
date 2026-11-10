import { OK, QUY_GIO_PP2, CHE_DO_PHO_BIEN, CHE_DO_DAC_THU, isBlank, isNum } from './common.js';

/** C1 – VTVL: cột E (quỹ giờ PP2) và K (kiểm tra). `quyGio = null` mô phỏng ô tham số QUY_GIO_PP2 để trống. */

const CHE_DO_HOP_LE = [CHE_DO_PHO_BIEN, CHE_DO_DAC_THU];

export function c1QuyGio(r, quyGio = QUY_GIO_PP2) {
  if (isBlank(r.ma_vtvl) || !CHE_DO_HOP_LE.includes(r.che_do)) return null;
  if (r.che_do === CHE_DO_DAC_THU || !isBlank(r.gio_rieng)) {
    const ok = isNum(r.gio_rieng) && r.gio_rieng > 0 && !isBlank(r.can_cu_gio) && r.xac_nhan_gio === 'Đã kiểm chứng';
    return ok ? r.gio_rieng : null;
  }
  return quyGio;
}

export function c1KiemTra(r, quyGio = QUY_GIO_PP2) {
  if (isBlank(r.ma_vtvl)) return '';
  const e = c1QuyGio(r, quyGio);
  if (isBlank(r.che_do)) return 'CHƯA CHỌN CHẾ ĐỘ LÀM VIỆC';
  if (!CHE_DO_HOP_LE.includes(r.che_do)) return 'CHẾ ĐỘ KHÔNG HỢP LỆ';
  if (r.che_do === CHE_DO_DAC_THU && e === null) return 'THIẾU GIỜ ĐẶC THÙ';
  if (!isBlank(r.gio_rieng) && e === null) return 'GIỜ CHƯA XÁC NHẬN';
  if (e === null) return 'THIẾU MẪU SỐ';
  return OK;
}
