/** Kiểu dữ liệu khớp các struct serde của `src-tauri` (tên trường theo `#[serde(rename)]`). */

export type Buoc =
  | 'chua_chay' | 'kiem_tra_ket_noi' | 'dang_kiem_tra_file' | 'can_xem_xet' | 'da_khop' | 'san_sang_gui'
  | 'dang_gui' | 'cho_bien_nhan' | 'dong_bo_xong' | 'loi' | 'chan' | 'da_huy';

export interface BuocKiem { ten: string; ok: boolean; chiTiet: string }
export interface Chan { ma: string; thongBao: string }
export interface KetNoi { luc: string; ketQua: 'ok' | 'canh_bao' | 'chan'; cacBuoc: BuocKiem[]; chan: Chan | null }

export interface TaiKhoan {
  username: string;
  hoTen: string;
  donVi: string;
  ky: string;
  hoSo: { id: string; trangThai: string; phienBan: number; khoa: boolean; hanNop: string | null };
  quyen: { vaiTro: string[]; actions: string[]; duong: 'A' | 'B'; lyDo: string };
  bieuDuocSua: string[];
  hoSoCoThe: HoSoTomTat[];
}

export interface HoSoTomTat { id: string; ten: string; trangThai: string; phienBan: number; soBieuSua: number | null }

export interface TrangThai {
  buoc: Buoc;
  tienDo: number;
  ketNoi: string;
  kiemTra: { tongDong: number; dongLoi: number; canhBao: number; ketQuaFile: string } | null;
  thayDoi: { tong: number; tao: number; sua: number; bo: number; file: string } | null;
  goiHienTai: { changesetId: string; trangThai: string; soLanThu: number } | null;
  soDong: { cong: Record<string, number>; excel: Record<string, number>; tongCong?: Tong; tongExcel?: Tong } | null;
  loi: string | null;
  ghiChu: string | null;
  capNhat: string;
}

export interface DonVi {
  username: string;
  label: string;
  enabled: boolean;
  excelFile: string;
  coCookie: boolean;
  coMatKhau: boolean;
  excelPath: string;
  /** Giá trị gốc trong tệp JSON của lô (để sửa). */
  cauHinh: { excelFile: string; duong: string };
  excelCo: boolean;
  trangThai: TrangThai;
  ketNoi: KetNoi | null;
  taiKhoan: TaiKhoan | null;
}

export interface KetQuaGui { username: string; ok: boolean; loi: string | null }

/** Biểu → ("" hoặc năm → tổng số người): C3 và D2. */
export type Tong = Record<string, Record<string, number>>;

export interface DongDem { khoa: string; ten: string; soDong: number | null; loi: string | null }
export interface KetQuaXoa { khoa: string; ten: string; daXoa: number; conLai: number | null; loi: string | null }

/** Đơn vị thêm tay: ghi vào tệp JSON của lô. */
export interface ThemDonVi { username: string; label: string; password: string; excelFile: string; duong: string }

/** Sửa một đơn vị trong tệp JSON của lô. `password` trống = giữ nguyên. */
export interface SuaDonVi { username: string; label: string; password: string; xoaMatKhau: boolean; excelFile: string; duong: string; enabled: boolean }

/** Cổng mật khẩu khởi động. */
export interface TinhTrangKhoa { daMo: boolean; tuBanSao: boolean; loiMang: string | null; soLanToiDa: number }
export interface KetQuaMa { ok: boolean; conLai: number }

/** Một mục lỗi/xem lại của kiểm tra tệp Excel (`kiem-tra/<runId>.json` → `ketQua.loi`). */
export interface LoiKiemTra {
  sheet: string; bieu?: string | null; dong?: number | null; o: string; cot?: string | null; ma: string;
  muc: 'loi' | 'xem_lai' | string; noi_dung: string; huong_xu_ly?: string | null; gia_tri?: string | null;
}
export interface SheetKiemTra { ten: string; dat: boolean; so_dong: number; so_dong_loi: number; so_loi: number; so_xem_lai: number }
export interface KetQuaKiemTraTep {
  runId: string;
  tep: { ten: string | null; kichThuoc?: number };
  quyTac: { phienBan?: string };
  ketQua: { tong_dong: number; dong_loi: number; dong_hop_le: number; loi: LoiKiemTra[]; sheets: SheetKiemTra[] };
}

/** Nút của cây đơn vị trên cổng (chọn đơn vị cha khi tạo tài khoản). */
export interface NutCay { id: string; ma: string; ten: string; chaId: string | null }
export interface CayDonVi { nut: NutCay[]; tenDangNhap: string[] }
export interface YeuCauTao { chaId: string; ten: string; ma: string; tenDangNhap: string }
export interface KetQuaTao { orgId: string; ma: string; donViMoi: boolean; tenDangNhap: string; matKhau: string; donVi: DonVi[] | null }
export interface DongBaoCao { ten: string; taiKhoan: string; matKhau: string }

/** Màn hình "Tổng quan" của một đơn vị (số liệu như trang làm việc của ứng dụng Desktop). */
export interface KpiTongQuan { khoa: string; nhan: string; giaTri: number | string | null; donVi: string; chuaKiemChung: number | string | null }
export interface BuocTongQuan { buoc: number; tieuDe: string; xong: number; dangLam: number; chuaBatDau: number }
export interface TongQuan { chao: string; donVi: string; ky: string; kpis: KpiTongQuan[]; buoc: BuocTongQuan[]; capNhat: string }

/** Quản trị: tài khoản và hồ sơ của kỳ hiện tại quét từ cổng (lưu cache cục bộ). */
export interface KyQt { id: string; ma: string; ten: string; tuNgay: string; denNgay: string; trangThai: string }
export interface TaiKhoanQt { tenDangNhap: string; hoTen: string; orgId: string; trangThai: string; dangNhapCuoi: string }
export interface HoSoQt {
  id: string; orgId: string; ma: string; ten: string; cap: string; trangThai: string; tienDo: number; capNhat: string;
  dongDat: number; dongChuaDat: number; canhBao: number; taiKhoan: string[];
}
export interface CotQt { chu: string; tieuDe: string; loai: string; kieu: string }
export interface BieuQt { khoa: string; ma: string; tieuDe: string; buoc: number; cot: CotQt[] }
export interface NutQt { id: string; ma: string; ten: string; chaId: string | null }
export interface DanhSachQt { quetLuc: string; ky: KyQt; taiKhoan: TaiKhoanQt[]; hoSo: HoSoQt[]; bieu: BieuQt[]; /** Cây đơn vị; cache cũ chưa có thì rỗng. */ donVi?: NutQt[] }
export interface TomTatBieuQt { khoa: string; ma: string; tieuDe: string; buoc: number; soDong: number; trangThai: string; dongChuaDat: number }
export interface DongQt { so: number; duLieu: Record<string, unknown>; trangThai: string; loi: string[]; capNhat: string }
export interface DuLieuBieuQt { bieu: BieuQt; trangThai: string; tong: number; dongDat: number; dongChuaDat: number; canhBao: number; dong: DongQt[]; biCat: boolean }

/** Tài khoản quản trị đang dùng (không bao giờ kèm mật khẩu). `nguon`: thiết lập trong ứng dụng, hoặc lấy từ tệp JSON của lô; null = chưa có. */
export interface TinhTrangTaiKhoanQt { tenDangNhap: string; nguon: 'ung_dung' | 'lo' | null }

/** Kết quả kiểm tra bản mới (`kiem_tra_cap_nhat`). */
export interface KetQuaCapNhat {
  hienTai: string;
  moi: string;
  coBanMoi: boolean;
  url: string;
  ghiChu: string;
}

/** Kết quả `tham_dinh_excel`: mọi biểu có trong tệp, cùng dạng với biểu đọc từ cổng. */
export interface KetQuaThamDinh { tenTep: string; kichThuoc: number; tongDong: number; dongLoi: number; canhBao: string[]; bieu: DuLieuBieuQt[] }
