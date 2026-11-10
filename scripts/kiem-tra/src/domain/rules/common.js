/**
 * Hằng số và hàm dùng chung của lõi nghiệp vụ (bản chuyển từ scripts/python/vtvl_core.py, chuẩn tham chiếu).
 * Quy ước: tên trường dữ liệu giữ nguyên theo cột nghiệp vụ (snake_case) để khớp tệp JSON lưu trữ và dữ liệu đối chiếu.
 */

export const OK = 'ĐẠT';
export const QUY_GIO_PP2 = 1904; // DM_THAM_SO / tên vùng QUY_GIO_PP2
export const PP_HOP_LE_19_10 = Object.freeze(['PP1', 'PP2', 'PP3', 'PP1+PP2', 'PP1+PP3', 'PP2+PP3']);
export const LOAI_TD = Object.freeze(['Số hóa', 'Cải tiến quy trình', 'Thuê dịch vụ/đặt hàng', 'Tự chủ', 'Xã hội hóa', 'Công việc mới phát sinh']);
export const LOAI_GIAM_SO_HOA = Object.freeze(['Số hóa', 'Cải tiến quy trình']);
export const NAM_HOP_LE = Object.freeze({ tu: 2027, den: 2031 });
export const CHE_DO_PHO_BIEN = 'Phổ biến (40 giờ/tuần)';
export const CHE_DO_DAC_THU = 'Đặc thù';
export const TT_D2 = Object.freeze(['Đang xây dựng', 'Đã hoàn thành ở đơn vị', 'Đã thẩm định', 'Đã được quyết định']);
export const DA_KIEM_CHUNG = 'Đã kiểm chứng';

/** Ô trống của Excel: null, undefined hoặc chuỗi rỗng. */
export const isBlank = (v) => v === null || v === undefined || v === '';
/** "Số" như ISNUMBER của Excel: kiểu số, không phải NaN. */
export const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);
/** Như Excel: ô không phải số thì coi là 0 khi cộng. */
export const num0 = (v) => (isNum(v) ? v : 0);

/**
 * Cộng tuần tự từ trái sang phải như Excel (SUM/SUMIFS), cùng thứ tự với bản Python.
 * @param {Iterable<number>} values
 */
export function sum(values) {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Đóng băng kết quả: lõi trả đối tượng mới, không sửa đầu vào. */
export const freeze = (value) => Object.freeze(value);

/** Khóa ghép nhiều giá trị (dùng cho Map), không nhầm lẫn giữa null và chuỗi rỗng. */
export const keyOf = (...parts) => JSON.stringify(parts);
