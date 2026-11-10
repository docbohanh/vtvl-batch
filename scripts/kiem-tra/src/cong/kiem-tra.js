/**
 * Chỉ còn thứ tự xử lý sheet (SHEET_ORDER). Bản gốc ở vtvl_app/src/cong/kiem-tra.js còn nhiều thứ khác (gửi cổng, đăng nhập...)
 * không cần cho kiểm tra cục bộ nên không chép sang đây, để thư mục này tự đủ, không phụ thuộc vtvl_app.
 */

/** Thứ tự xử lý sheet theo quan hệ phụ thuộc (không theo thứ tự trong tệp). */
export const SHEET_ORDER = Object.freeze(['11. DM_SAN_PHAM', '6. C1_VTVL', '1. A1_NhiemVu', '2. A2_CongViec', '3. B1_KhoiLuong', '4. B2_CT_TacDong', '7. C2_NangLuc', '8. C3_NhuCau', '9. D1_NhanLuc', 'DU_BAO_5_NAM', '10. D2_PhuongAn']);
