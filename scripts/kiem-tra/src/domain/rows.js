/** Dòng dữ liệu của từng biểu: giá trị mặc định = ô trống; từ chối tên trường lạ để bắt lỗi gõ nhầm. */

const make = (name, defaults) => (fields = {}) => {
  for (const k of Object.keys(fields)) {
    if (!(k in defaults)) throw Object.assign(new Error(`Trường "${k}" không có trong dòng ${name}`), { code: 'BAD_FIELD' });
  }
  return Object.freeze({ ...defaults, ...fields });
};

export const b1Row = make('B1', {
  ma_cong_viec: '', ma_vtvl: '', so_sp: null, phut_do: null, gio_bo_sung: null, nguon_sl: '', nguon_tg: '',
  tt_can_cu_tg: '', ky: '', chuan_phut: null, chuan_xac_nhan: '', giai_trinh: '',
});
export const b2Row = make('B2', {
  ma_cong_viec: '', ma_vtvl: '', loai: '', cong_doan: '', sp_ap_dung: null, phut_truoc: null, phut_sau: null, gio_moi: null,
  nguon: '', ky: '', co_so_b1: '', trang_thai: '', doi_chieu: '',
});
export const c1Row = make('C1', { ma_vtvl: '', che_do: '', gio_rieng: null, can_cu_gio: '', xac_nhan_gio: '' });
export const c3Row = make('C3', {
  ma_vtvl: '', phuong_phap: '', nguoi_pp1: null, nguoi_pp3: null, nguoi_can_bo_tri: null, nguon_giai_trinh: '', trang_thai: '',
});
export const d1Row = make('D1', {
  ma_nguon_luc: '', ma_vtvl: '', gio_vtvl: null, gio_khac: null, noi_tinh_bc: '', nguon: '', trang_thai: '', gio_rieng_che_do: null,
});
export const forecastRow = make('dự báo', { ma_vtvl: '', nam: null, bien_dong: null, noi_dung: '', can_cu: '', trang_thai: '' });
export const d2Row = make('D2', {
  ma_vtvl: '', nam: null, nguoi_co_the_bo_tri: null, bien_che_giao: null, de_nghi_dieu_chinh: null, giai_trinh: '', trang_thai: '', van_ban: '',
});
