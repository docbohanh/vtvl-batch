/**
 * Định nghĩa cột của từng biểu theo cổng chính thức (bản web 1.2.8, tệp `src-*.js`: `Xt`, `Gt`, `Wt`, `Tn`).
 * Chỉ dữ liệu thuần, không I/O. Nguồn đối chiếu: TapHuan_HDSD/1.2.8/assets.
 */

export const FORM_KEYS = Object.freeze(['a1', 'a2', 'b1', 'b2_ct', 'c1', 'c2', 'c3', 'd1', 'du_bao_5_nam', 'd2']);

/** Tên sheet → khóa biểu (chỉ 10 biểu cổng đọc; DM_SAN_PHAM và các sheet tự tổng hợp bị bỏ qua). */
export const SHEET_NAME = Object.freeze({
  a1: '1. A1_NhiemVu', a2: '2. A2_CongViec', b1: '3. B1_KhoiLuong', b2_ct: '4. B2_CT_TacDong', c1: '6. C1_VTVL', c2: '7. C2_NangLuc',
  c3: '8. C3_NhuCau', d1: '9. D1_NhanLuc', du_bao_5_nam: 'DU_BAO_5_NAM', d2: '10. D2_PhuongAn',
});

/** Cột cuối cần đọc (đọc từ cột A). */
export const LAST_COL = Object.freeze({ a1: 'G', a2: 'H', b1: 'S', b2_ct: 'S', c1: 'K', c2: 'G', c3: 'N', d1: 'K', du_bao_5_nam: 'J', d2: 'N' });

/** Sheet tự tổng hợp: cổng bỏ qua, ghi lý do. */
export const SKIP_SHEETS = Object.freeze(['5. B2_ThayDoi', '13. K_KiemTra', '14. T_TienDo', '15. S_NhatKy']);

/** Cột công thức (hệ thống tự tính): giá trị gõ tay bị bỏ qua và báo VAL-005. */
export const COMPUTED = Object.freeze({
  a1: [], a2: [], b1: ['B', 'F', 'G', 'M', 'N', 'O', 'P', 'Q', 'R'], b2_ct: ['B', 'H', 'N', 'O', 'P'], c1: ['E', 'K'], c2: [],
  c3: ['C', 'D', 'E', 'F', 'G', 'M', 'N'], d1: ['D', 'J'], du_bao_5_nam: ['G', 'H', 'I'], d2: ['C', 'J', 'K', 'L', 'M'],
});

export const DS = Object.freeze({
  TT_A1: ['Tiếp tục thực hiện', 'Mới tiếp nhận', 'Đã chuyển giao', 'Không còn thực hiện'],
  TT_B1: ['Có định mức', 'Kiểm đếm, ước lượng thực tế'],
  LOAI_TD: ['Số hóa', 'Cải tiến quy trình', 'Thuê dịch vụ/đặt hàng', 'Tự chủ', 'Xã hội hóa', 'Công việc mới phát sinh'],
  TT_B2CT: ['Đã kiểm chứng', 'Chưa kiểm chứng', 'Ước lượng tham khảo'],
  CO_SO_B1: ['Trước thay đổi, có điều chỉnh', 'Đã đo sau thay đổi (không trừ)'],
  DOI_CHIEU: ['Chờ đối chiếu', 'Đã đối chiếu'],
  LOAI_NL: ['Cán bộ', 'Công chức', 'Viên chức', 'Hợp đồng lao động', 'Khác'],
  TT_C1: ['Tiếp tục sử dụng', 'Cần cập nhật', 'Đề nghị bổ sung', 'Đề nghị sửa đổi', 'Đề nghị bãi bỏ'],
  KIEM_CHUNG: ['Đã kiểm chứng', 'Chưa kiểm chứng'],
  CHE_DO: ['Phổ biến (40 giờ/tuần)', 'Đặc thù'],
  PP: ['PP1', 'PP2', 'PP3', 'PP1+PP2', 'PP1+PP3', 'PP2+PP3', 'PP1+PP2+PP3'],
  TT_C3: ['Tính thử', 'Chưa đủ dữ liệu', 'Đã kiểm chứng', 'Không áp dụng'],
  NAM: ['2027', '2028', '2029', '2030', '2031'],
  TT_D2: ['Đang xây dựng', 'Đã hoàn thành ở đơn vị', 'Đã thẩm định', 'Đã được quyết định'],
});

const IN = 'INPUT';
const CAT = 'CATALOG';
const CALC = 'COMPUTED';
const c = (letter, title, kind, type = 'text', extra = {}) => Object.freeze({ letter, title, kind, type, ...extra });
const num = (letter, title) => c(letter, title, IN, 'number', { nonNegative: true });

/** Cột từng biểu theo thứ tự trên mẫu. `enum`: giá trị chọn trong danh sách; `enumCode`: mã lỗi riêng của cột trạng thái bắt buộc. */
export const COLS = Object.freeze({
  a1: [c('A', 'Mã nhiệm vụ', IN, 'text', { required: true }), c('B', 'Tên nhiệm vụ', IN), c('C', 'Cơ quan', IN), c('D', 'Căn cứ', IN), c('E', 'Kỳ', IN, 'period'),
    c('F', 'Trạng thái', CAT, 'text', { enum: DS.TT_A1, enumCode: 'VAL-008', required: true }), c('G', 'Nguồn', IN)],
  a2: [c('A', 'Mã công việc', IN, 'text', { required: true }), c('B', 'Mã nhiệm vụ', CAT), c('C', 'Mã VTVL', CAT), c('D', 'Tên công việc', IN), c('E', 'Sản phẩm', IN),
    c('F', 'Đơn vị tính', IN), c('G', 'Chất lượng', IN), c('H', 'Căn cứ (nguồn)', IN)],
  b1: [c('A', 'Mã công việc', CAT, 'text', { required: true }), c('B', 'Mã VTVL', CALC), num('C', 'Số SP/năm'), num('D', 'Phút/SP đo thực tế'), num('E', 'Giờ bổ sung'),
    c('F', 'Giờ SP', CALC), c('G', 'Giờ tổng', CALC), c('H', 'Nguồn sản lượng', IN), c('I', 'Nguồn thời gian', IN),
    c('J', 'Trạng thái căn cứ thời gian', CAT, 'text', { enum: DS.TT_B1 }), c('K', 'Kỳ', IN, 'period'), c('L', 'Mã SP trong danh mục', CAT), c('M', 'Nhóm', CALC),
    c('N', 'Phút/SP chuẩn', CALC), c('O', 'Xác nhận chuẩn', CALC), c('P', 'Phút/SP dùng để tính', CALC), c('Q', 'Nguồn thời gian dùng tính', CALC),
    c('R', 'Cảnh báo dữ liệu', CALC), c('S', 'Giải trình khác chuẩn', IN)],
  b2_ct: [c('A', 'Mã công việc', CAT, 'text', { required: true }), c('B', 'Mã VTVL', CALC), c('C', 'Loại tác động', CAT, 'text', { enum: DS.LOAI_TD }), c('D', 'Công đoạn', IN),
    num('E', 'SP áp dụng'), num('F', 'Phút trước'), num('G', 'Phút sau'), c('H', 'Giờ giảm trực tiếp', CALC), num('I', 'Giờ việc mới phát sinh trong kỳ'),
    c('J', 'Nguồn/bằng chứng', IN), c('K', 'Kỳ', IN, 'period'), c('L', 'Cơ sở B1', CAT, 'text', { enum: DS.CO_SO_B1 }), c('M', 'Trạng thái', CAT, 'text', { enum: DS.TT_B2CT }),
    c('N', 'Giờ giảm hợp lệ', CALC), c('O', 'Giờ tăng hợp lệ', CALC), c('P', 'Kiểm tra', CALC), c('Q', 'Kinh phí trước', IN, 'number'), c('R', 'Kinh phí sau', IN, 'number'),
    c('S', 'Đối chiếu trùng/phạm vi', CAT, 'text', { enum: DS.DOI_CHIEU })],
  c1: [c('A', 'Mã VTVL', IN, 'text', { required: true }), c('B', 'Tên VTVL', IN), c('C', 'Loại nhân lực', CAT, 'text', { enum: DS.LOAI_NL }), c('D', 'Quyết định', IN),
    c('E', 'Giờ chuẩn PP2', CALC), c('F', 'Căn cứ xác định quỹ giờ', IN), c('G', 'Trạng thái', CAT, 'text', { enum: DS.TT_C1 }), num('H', 'Giờ riêng được xác nhận'),
    c('I', 'Xác nhận giờ riêng', CAT, 'text', { enum: DS.KIEM_CHUNG }), c('J', 'Chế độ làm việc', CAT, 'text', { enum: DS.CHE_DO }), c('K', 'Kiểm tra quỹ giờ PP2', CALC)],
  c2: [c('A', 'Mã VTVL', CAT, 'text', { required: true }), c('B', 'Trách nhiệm', IN), c('C', 'Năng lực chung', IN), c('D', 'Chuyên môn', IN), c('E', 'Lãnh đạo', IN),
    c('F', 'Căn cứ', IN), c('G', 'Nguồn bản mô tả', IN)],
  c3: [c('A', 'Mã VTVL', CAT, 'text', { required: true }), c('B', 'Phương pháp', CAT, 'text', { enum: DS.PP }), c('C', 'Giờ B1', CALC), c('D', 'Giờ tác động B2', CALC),
    c('E', 'Giờ ròng', CALC), c('F', 'Giờ PP2', CALC), c('G', 'Người quy đổi PP2', CALC), num('H', 'Người PP1'), num('I', 'Người PP3'), num('J', 'Người cần bố trí'),
    c('K', 'Nguồn/giải trình', IN), c('L', 'Trạng thái', CAT, 'text', { enum: DS.TT_C3 }), c('M', 'Cảnh báo', CALC), c('N', 'Số dòng B1 chưa đạt', CALC)],
  d1: [c('A', 'Mã nguồn lực', IN, 'text', { required: true }), c('B', 'Mã VTVL', CAT), c('C', 'Loại nhân lực', CAT, 'text', { enum: DS.LOAI_NL }), c('D', 'Giờ quy đổi/năm', CALC),
    num('E', 'Giờ dành cho VTVL'), num('F', 'Giờ việc khác'), c('G', 'Nơi tính biên chế', IN), c('H', 'Nguồn', IN),
    c('I', 'Trạng thái', CAT, 'text', { enum: DS.KIEM_CHUNG }), c('J', 'Cảnh báo', CALC), num('K', 'Giờ riêng theo chế độ')],
  du_bao_5_nam: [c('A', 'Mã VTVL', CAT, 'text', { required: true }), c('B', 'Năm', CAT, 'year', { required: true, enum: DS.NAM }), c('C', 'Biến động so C3 (± người)', IN, 'number'),
    c('D', 'Nội dung thay đổi / xác nhận không đổi', IN), c('E', 'Căn cứ nguồn và thời điểm', IN), c('F', 'Trạng thái xác nhận', CAT, 'text', { enum: DS.KIEM_CHUNG }),
    c('G', 'Người C3 năm cơ sở', CALC), c('H', 'Người cần bố trí trong năm', CALC), c('I', 'Kiểm tra', CALC), c('J', 'Ghi chú đầu mối', IN)],
  d2: [c('A', 'Mã VTVL', CAT, 'text', { required: true }), c('B', 'Năm', CAT, 'year', { required: true, enum: DS.NAM }), c('C', 'Người cần bố trí trong năm', CALC),
    num('D', 'Người có thể bố trí'), num('E', 'Biên chế được giao đúng cấp'), c('F', 'Điều chuyển/bố trí lại', IN, 'text', { maxLength: 1000 }),
    c('G', 'Đề nghị điều chỉnh', IN, 'number'), c('H', 'Nguồn/giải trình', IN), c('I', 'Trạng thái', CAT, 'text', { enum: DS.TT_D2 }), c('J', 'Cảnh báo', CALC),
    c('K', 'FTE PP2 (tham khảo)', CALC), c('L', 'Người cần bố trí C3 năm cơ sở (tham khảo)', CALC), c('M', 'Kiểm soát cơ sở đối chiếu', CALC),
    c('N', 'Văn bản thẩm định/quyết định', IN)],
});

/** Cột khóa nghiệp vụ (`$t` của cổng): cột mã, chuẩn hóa xuống một dòng. */
const KEY_COLS = Object.freeze({ a1: ['A'], a2: ['A'], b1: ['A'], b2_ct: ['A', 'D', 'K'], c1: ['A'], c2: ['A'], c3: ['A'], d1: ['A'], du_bao_5_nam: ['A', 'B'], d2: ['A', 'B'] });
const EXTRA_CODE_COLS = Object.freeze({ a1: ['C'], c1: ['G'] });

/** Cột "mã/chọn": xuống dòng trong ô được gộp thành khoảng trắng khi đọc. */
export function isCodeColumn(form, letter) {
  if (KEY_COLS[form].includes(letter) || EXTRA_CODE_COLS[form]?.includes(letter)) return true;
  const col = COLS[form].find((x) => x.letter === letter);
  return !!col && (col.kind === CAT || !!col.enum || /^Mã\s/.test(col.title));
}

/** Cột chữ → số thứ tự (A=1). */
export const colToNum = (col) => [...col].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
export const numToCol = (n) => { let s = ''; let v = n; while (v > 0) { s = String.fromCharCode(65 + ((v - 1) % 26)) + s; v = Math.floor((v - 1) / 26); } return s; };
