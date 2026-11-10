import { FORMS } from './forms.js';
import { PP_HOP_LE_19_10, LOAI_TD, TT_D2, CHE_DO_PHO_BIEN, CHE_DO_DAC_THU, NAM_HOP_LE } from './rules/common.js';

/**
 * 12 bước nhập của bản Đơn vị, theo thứ tự "mã trước, số sau". Mỗi cột nhập của biểu có: nhãn, kiểu, danh sách chọn cố định (nếu có)
 * và nguồn mã (`ref`): bước sau chỉ chọn được mã đã có ở bước trước. Hàm thuần; dữ liệu đóng băng.
 */

const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v)); return Object.freeze(o); };
const YEARS = Array.from({ length: NAM_HOP_LE.den - NAM_HOP_LE.tu + 1 }, (_, i) => NAM_HOP_LE.tu + i);

export const NUMBER_FIELDS = Object.freeze(new Set([
  'so_sp', 'phut_do', 'gio_bo_sung', 'phut_chuan', 'sp_ap_dung', 'phut_truoc', 'phut_sau', 'gio_moi', 'kinh_phi_truoc', 'kinh_phi_sau',
  'gio_rieng', 'nguoi_pp1', 'nguoi_pp3', 'nguoi_can_bo_tri', 'gio_vtvl', 'gio_khac', 'gio_rieng_che_do',
  'nam', 'bien_dong', 'nguoi_co_the_bo_tri', 'bien_che_giao', 'de_nghi_dieu_chinh',
]));

/** Danh sách chọn cố định (khớp các giá trị lõi nhận); `strict`: chỉ nhận giá trị trong danh sách. */
export const ENUMS = deepFreeze({
  'c1.che_do': { strict: true, values: [CHE_DO_PHO_BIEN, CHE_DO_DAC_THU] },
  'c3.phuong_phap': { strict: true, values: [...PP_HOP_LE_19_10] },
  'b2_ct.loai': { strict: true, values: [...LOAI_TD] },
  // DS_CO_SO_B1 và DS_DOI_CHIEU của mẫu B30K (DM_THAM_SO cột E, F): cổng chính thức báo "không có trong danh mục của biểu" nếu ghi giá trị khác
  'b2_ct.co_so_b1': { strict: true, values: ['Trước thay đổi, có điều chỉnh', 'Đã đo sau thay đổi (không trừ)'] },
  'b2_ct.doi_chieu': { strict: true, values: ['Chờ đối chiếu', 'Đã đối chiếu'] },
  'd2.trang_thai': { strict: true, values: [...TT_D2] },
  'd2.nam': { strict: true, values: YEARS },
  'dubao.nam': { strict: true, values: YEARS },
  'dubao.trang_thai': { strict: true, values: ['Chưa kiểm chứng', 'Đã kiểm chứng'] },
  'b1.tt_can_cu_tg': { strict: false, values: ['Có định mức', 'Kiểm đếm, ước lượng thực tế'] },
  'c1.loai_nhan_luc': { strict: false, values: ['Công chức', 'Viên chức'] },
  // Danh sách chọn theo Hướng dẫn điền biểu. `strict: true` chỉ cho biểu mà hướng dẫn nêu đúng các giá trị; còn lại là gợi ý, vẫn gõ được giá trị khác.
  'c3.trang_thai': { strict: true, values: ['Tính thử', 'Chưa đủ dữ liệu', 'Đã kiểm chứng', 'Không áp dụng'] },
  'd1.trang_thai': { strict: true, values: ['Đã kiểm chứng', 'Chưa kiểm chứng'] },
  'b2_ct.trang_thai': { strict: true, values: ['Đã kiểm chứng', 'Chưa kiểm chứng', 'Ước lượng tham khảo'] },
  'a1.trang_thai': { strict: true, values: ['Tiếp tục thực hiện', 'Mới tiếp nhận', 'Đã chuyển giao', 'Không còn thực hiện'] },
  'c1.trang_thai': { strict: false, values: ['Tiếp tục sử dụng', 'Cần cập nhật', 'Đề nghị bổ sung', 'Đề nghị sửa đổi', 'Đề nghị bãi bỏ'] },
  'dm_sp.trang_thai': { strict: false, values: ['Đã kiểm chứng', 'Đang thử', 'Chờ xác nhận', 'Không áp dụng'] },
  'a2.don_vi_tinh': { strict: false, values: ['Văn bản', 'Hồ sơ', 'Báo cáo', 'Quyết định', 'Tờ trình', 'Đề án', 'Cuộc kiểm tra', 'Phiên họp', 'Cuộc', 'Vụ việc', 'Tuần', 'Ca khám'] },
  'a2.chat_luong': { strict: false, values: ['Đúng quy trình, đúng thời hạn', 'Đúng thẩm quyền, đúng thể thức', 'Đúng thời hạn giao', 'Đạt yêu cầu nghiệm thu'] },
});

const enumKey = (v) => String(v).trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Đưa giá trị của ô có danh sách chọn về đúng chữ trong danh sách (không phân biệt hoa thường, bỏ khoảng trắng thừa),
 * giống phép so `=` của Excel. Giá trị không khớp danh sách thì giữ nguyên.
 */
export function canonEnum(form, field, value) {
  const e = ENUMS[`${form}.${field}`];
  if (!e || value === null || value === undefined || typeof value !== 'string') return value;
  const k = enumKey(value);
  return e.values.map(String).find((v) => enumKey(v) === k) ?? value;
}

/** Lỗi nghiệp vụ của B1 (thông báo của lõi) → cột gây lỗi, để lưới tô viền đỏ đúng ô. Thông báo không có ở đây thì chỉ hiện ở cột kết quả. */
export const B1_LOI_THEO_COT = deepFreeze({
  'THIẾU MÃ VTVL': 'ma_cong_viec',
  'THIẾU NGUỒN SẢN LƯỢNG/CÔNG VIỆC': 'nguon_sl',
  'THIẾU KỲ': 'ky',
  'THIẾU SẢN LƯỢNG': 'so_sp',
  'CHƯA CHỌN TRẠNG THÁI': 'tt_can_cu_tg',
  'THIẾU NGUỒN THỜI GIAN': 'nguon_tg',
  'THIẾU THỜI GIAN': 'phut_do',
});

/** Nguồn mã: trường → [biểu nguồn, trường nguồn, tên bước nguồn]. */
export const REFS = deepFreeze({
  'a2.ma_nhiem_vu': ['a1', 'ma_nhiem_vu', 'A1'],
  'a2.ma_vtvl': ['c1', 'ma_vtvl', 'C1'],
  'b1.ma_cong_viec': ['a2', 'ma_cong_viec', 'A2'],
  'b1.ma_sp': ['dm_sp', 'ma_sp', 'Danh mục sản phẩm'],
  'b2_ct.ma_cong_viec': ['a2', 'ma_cong_viec', 'A2'],
  'c2.ma_vtvl': ['c1', 'ma_vtvl', 'C1'],
  'c3.ma_vtvl': ['c1', 'ma_vtvl', 'C1'],
  'd1.ma_vtvl': ['c1', 'ma_vtvl', 'C1'],
  'dubao.ma_vtvl': ['c1', 'ma_vtvl', 'C1'],
  'd2.ma_vtvl': ['c1', 'ma_vtvl', 'C1'],
});

/** Trường bắt buộc nhập, theo biểu (dùng khi kiểm tra và để đánh dấu cột trên giao diện). */
export const REQUIRED = deepFreeze({
  c1: ['ma_vtvl', 'ten_vtvl'], a1: ['ma_nhiem_vu', 'ten_nhiem_vu', 'trang_thai'], a2: ['ma_cong_viec', 'ma_nhiem_vu', 'ten_cong_viec', 'san_pham'],
  dm_sp: ['ma_sp', 'phut_chuan'], b1: ['ma_cong_viec'], b2_ct: ['ma_cong_viec'], c2: ['ma_vtvl'], c3: ['ma_vtvl'],
  d1: ['ma_nguon_luc', 'ma_vtvl'], dubao: ['ma_vtvl'], d2: ['ma_vtvl'],
});

/** Các bước, theo thứ tự nhập. `required`: biểu phải có ít nhất một dòng mới xác nhận được. */
export const STEPS = deepFreeze([
  { id: 'c1', form: 'c1', title: 'C1 – Vị trí việc làm', required: true },
  { id: 'a1', form: 'a1', title: 'A1 – Nhiệm vụ', required: true },
  { id: 'a2', form: 'a2', title: 'A2 – Công việc', required: true },
  { id: 'dm_sp', form: 'dm_sp', title: 'Danh mục sản phẩm', required: false },
  { id: 'b1', form: 'b1', title: 'B1 – Khối lượng và thời gian', required: true },
  { id: 'b2_ct', form: 'b2_ct', title: 'B2 – Tác động thực tế', required: false },
  { id: 'c2', form: 'c2', title: 'C2 – Năng lực', required: false },
  { id: 'c3', form: 'c3', title: 'C3 – Nhu cầu nhân lực', required: true },
  { id: 'd1', form: 'd1', title: 'D1 – Nhân lực hiện có', required: true },
  { id: 'dubao', form: 'dubao', title: 'Dự báo 5 năm', required: false },
  { id: 'd2', form: 'd2', title: 'D2 – Phương án bố trí', required: false },
  { id: 'kiem_tra', form: null, title: 'Kiểm tra và xuất', required: false },
]);

export const STEP_FORMS = Object.freeze(STEPS.filter((s) => s.form).map((s) => s.form));
/** Chỉ số bước của biểu (để biết biểu nào đứng sau). */
export const stepIndex = (form) => STEP_FORMS.indexOf(form);

/**
 * Mô tả cột của một biểu cho giao diện.
 * @param {string} form khóa biểu @param {object} profile profile B30K @param {Record<string, any>} help nội dung config/help_b30k.json
 */
export function columnsOf(form, profile, help = {}) {
  const sheet = profile.sheets.find((s) => s.ten === FORMS[form].sheet);
  const titles = new Map(sheet.cot.map((c) => [c.cot, c.tieu_de]));
  return Object.entries(FORMS[form].cols).map(([col, field]) => {
    const key = `${form}.${field}`;
    const ref = REFS[key];
    const h = help[form]?.cot?.[col];
    return {
      col, field, label: titles.get(col) ?? field,
      type: NUMBER_FIELDS.has(field) ? 'number' : 'text', required: (REQUIRED[form] ?? []).includes(field),
      options: ENUMS[key]?.values ?? null, strict: ENUMS[key]?.strict ?? false,
      ref: ref ? { form: ref[0], field: ref[1], step: ref[2] } : null,
      help: h ? { noi_dung: h.noi_dung, cach_ghi: h.cach_ghi, nguon: h.nguon, luu_y: h.luu_y, loai: h.loai_thao_tac } : null,
    };
  });
}
