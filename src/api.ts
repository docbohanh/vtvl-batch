import { invoke } from '@tauri-apps/api/core';
import type { KetQuaKiemTraTep, KetQuaMa, SuaDonVi, TinhTrangKhoa, ThemDonVi, DonVi, DongDem, KetQuaGui, KetQuaXoa, CayDonVi, YeuCauTao, KetQuaTao, DongBaoCao, TongQuan } from './types';

/** Lời gọi tới các lệnh Tauri (`src-tauri/src/main.rs`). Lỗi trả về là chuỗi tiếng Việt từ phía Rust. */
export const api = {
  khoiDongKhoa: () => invoke<TinhTrangKhoa>('khoi_dong_khoa'),
  khoiTaoLoTrong: () => invoke<string>('khoi_tao_lo_trong'),
  kiemTraMa: (ma: string) => invoke<KetQuaMa>('kiem_tra_ma', { ma }),
  kiemTraTep: (username: string) => invoke<void>('kiem_tra_tep', { username }),
  layKetQuaKiemTra: (username: string) => invoke<KetQuaKiemTraTep | null>('lay_ket_qua_kiem_tra', { username }),
  nap: (path: string) => invoke<DonVi[]>('lo_nap', { path }),
  themDonVi: (don: ThemDonVi) => invoke<DonVi[]>('them_don_vi', { don }),
  suaDonVi: (don: SuaDonVi) => invoke<DonVi[]>('sua_don_vi', { don }),
  xoaDonVi: (username: string) => invoke<DonVi[]>('xoa_don_vi', { username }),
  layBearer: (username: string) => invoke<string>('lay_bearer', { username }),
  layNguoi: () => invoke<string>('lay_nguoi'),
  trangThai: () => invoke<DonVi[]>('lay_trang_thai'),
  dangNhap: (username: string) => invoke<void>('dang_nhap', { username }),
  chonHoSo: (username: string, hoSoId: string) => invoke<void>('chon_ho_so', { username, hoSoId }),
  chonExcel: (username: string, duongDan: string) => invoke<void>('chon_excel', { username, duongDan }),
  tongQuan: (username: string) => invoke<TongQuan>('tong_quan', { username }),
  xoaDem: (username: string) => invoke<DongDem[]>('xoa_dem', { username }),
  xoaDuLieu: (username: string) => invoke<KetQuaXoa[]>('xoa_du_lieu', { username }),
  datCookie: (username: string, cookie: string) => invoke<void>('dat_cookie', { username, cookie }),
  datNguoi: (ten: string) => invoke<void>('dat_nguoi', { ten }),
  kiemTraKetNoiTatCa: () => invoke<DonVi[]>('kiem_tra_ket_noi_tat_ca'),
  tqLayCay: () => invoke<CayDonVi>('tq_lay_cay'),
  tqTao: (yeuCau: YeuCauTao, themVaoLo: boolean) => invoke<KetQuaTao>('tq_tao', { yeuCau, themVaoLo }),
  tqXuatExcel: (hang: DongBaoCao[], tenTep: string) => invoke<string>('tq_xuat_excel', { hang, tenTep }),
  chuanBiTatCa: () => invoke<DonVi[]>('chuan_bi_tat_ca'),
  chuanBi: (username: string) => invoke<void>('chuan_bi', { username }),
  gui: (username: string, soThayDoi: number) => invoke<void>('gui', { username, soThayDoi }),
  guiLai: (username: string) => invoke<void>('gui_lai', { username }),
  guiBuoc8: (username: string) => invoke<void>('gui_buoc_8', { username }),
  guiTatCa: (danhSach: { username: string; soThayDoi: number }[]) => invoke<KetQuaGui[]>('gui_tat_ca', { danhSach }),
};

export const loiThanhChuoi = (e: unknown): string => (typeof e === 'string' ? e : e instanceof Error ? e.message : 'Lỗi không xác định');
