/**
 * Ánh xạ từng biểu: tên sheet trong B30K và cột NHẬP → tên trường dữ liệu.
 * Cột tự động (công thức) không có trong ánh xạ; `assertFormsMatchProfile` đối chiếu với profile sinh từ tệp mẫu.
 * Tên trường lõi tính toán (so_sp, phut_do, nguoi_can_bo_tri...) trùng với tên trong src/domain/rules.
 */

const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };

export const FORMS = deepFreeze({
  a1: { sheet: '1. A1_NhiemVu', cols: { A: 'ma_nhiem_vu', B: 'ten_nhiem_vu', C: 'co_quan', D: 'can_cu', E: 'ky', F: 'trang_thai', G: 'nguon' } },
  a2: { sheet: '2. A2_CongViec', cols: { A: 'ma_cong_viec', B: 'ma_nhiem_vu', C: 'ma_vtvl', D: 'ten_cong_viec', E: 'san_pham', F: 'don_vi_tinh', G: 'chat_luong', H: 'can_cu' } },
  dm_sp: { sheet: '11. DM_SAN_PHAM', cols: { A: 'ma_sp', B: 'ten_sp', C: 'khoi_nganh', D: 'nhom', E: 'phut_chuan', F: 'nguon_xac_nhan', G: 'trang_thai', H: 'co_quan_xac_nhan', I: 'ngay_hieu_luc', J: 'pham_vi' } },
  b1: { sheet: '3. B1_KhoiLuong', cols: { A: 'ma_cong_viec', C: 'so_sp', D: 'phut_do', E: 'gio_bo_sung', H: 'nguon_sl', I: 'nguon_tg', J: 'tt_can_cu_tg', K: 'ky', L: 'ma_sp', S: 'giai_trinh' } },
  b2_ct: { sheet: '4. B2_CT_TacDong', cols: { A: 'ma_cong_viec', C: 'loai', D: 'cong_doan', E: 'sp_ap_dung', F: 'phut_truoc', G: 'phut_sau', I: 'gio_moi', J: 'nguon', K: 'ky', L: 'co_so_b1', M: 'trang_thai', Q: 'kinh_phi_truoc', R: 'kinh_phi_sau', S: 'doi_chieu' } },
  c1: { sheet: '6. C1_VTVL', cols: { A: 'ma_vtvl', B: 'ten_vtvl', C: 'loai_nhan_luc', D: 'quyet_dinh', F: 'can_cu_gio', G: 'trang_thai', H: 'gio_rieng', I: 'xac_nhan_gio', J: 'che_do' } },
  c2: { sheet: '7. C2_NangLuc', cols: { A: 'ma_vtvl', B: 'trach_nhiem', C: 'nang_luc_chung', D: 'chuyen_mon', E: 'lanh_dao', F: 'can_cu', G: 'nguon_ban_mo_ta' } },
  c3: { sheet: '8. C3_NhuCau', cols: { A: 'ma_vtvl', B: 'phuong_phap', H: 'nguoi_pp1', I: 'nguoi_pp3', J: 'nguoi_can_bo_tri', K: 'nguon_giai_trinh', L: 'trang_thai' } },
  d1: { sheet: '9. D1_NhanLuc', cols: { A: 'ma_nguon_luc', B: 'ma_vtvl', C: 'loai_nhan_luc', E: 'gio_vtvl', F: 'gio_khac', G: 'noi_tinh_bc', H: 'nguon', I: 'trang_thai', K: 'gio_rieng_che_do' } },
  dubao: { sheet: 'DU_BAO_5_NAM', cols: { A: 'ma_vtvl', B: 'nam', C: 'bien_dong', D: 'noi_dung', E: 'can_cu', F: 'trang_thai', J: 'ghi_chu_dau_moi' } },
  d2: { sheet: '10. D2_PhuongAn', cols: { A: 'ma_vtvl', B: 'nam', D: 'nguoi_co_the_bo_tri', E: 'bien_che_giao', F: 'dieu_chuyen', G: 'de_nghi_dieu_chinh', H: 'giai_trinh', I: 'trang_thai', N: 'van_ban' } },
});

export const FORM_KEYS = Object.freeze(Object.keys(FORMS));

export const fieldOf = (form, column) => FORMS[form].cols[column];

/** Danh sách tên trường hợp lệ của một biểu. */
export const fieldsOf = (form) => Object.values(FORMS[form].cols);

/** Báo lỗi nếu ánh xạ không khớp cột NHẬP của profile (thiếu cột nhập, hoặc ánh xạ vào cột tự động). */
export function assertFormsMatchProfile(profile) {
  for (const [key, form] of Object.entries(FORMS)) {
    const sheet = profile.sheets.find((s) => s.ten === form.sheet);
    if (!sheet?.cot) throw new Error(`Biểu ${key}: profile ${profile.id} không có sheet "${form.sheet}"`);
    const input = new Set(sheet.cot.filter((c) => c.loai === 'nhap').map((c) => c.cot));
    const mapped = new Set(Object.keys(form.cols));
    const notInput = [...mapped].filter((c) => !input.has(c));
    const unmapped = [...input].filter((c) => !mapped.has(c));
    if (notInput.length) throw new Error(`Biểu ${key}: cột ${notInput.join(', ')} không phải cột nhập trong ${profile.id}`);
    if (unmapped.length) throw new Error(`Biểu ${key}: cột nhập ${unmapped.join(', ')} chưa có trường dữ liệu`);
  }
}
