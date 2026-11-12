import type { DongQt, HoSoQt, TomTatBieuQt } from './types';

/** Ba biểu cần soi kỹ khi thẩm định: đo khối lượng, xác định nhu cầu, lập phương án. */
export const KHOA_UU_TIEN: readonly string[] = ['b1', 'c3', 'd2'];

/** Bỏ dấu tiếng Việt, đ → d, chữ thường: dùng cho tìm kiếm. */
export const boDau = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export type CheDoLoc = 'tat_ca' | 'chua_dat' | 'chua_co_du_lieu';

export const NHAN_CHE_DO: Record<CheDoLoc, string> = {
  tat_ca: 'Tất cả',
  chua_dat: 'Có dòng chưa đạt',
  chua_co_du_lieu: 'Chưa có dữ liệu',
};

/** Lọc hồ sơ theo chuỗi tìm (tên, mã đơn vị, tên đăng nhập) và chế độ. */
export function locHoSo(ds: readonly HoSoQt[], tim: string, che: CheDoLoc): HoSoQt[] {
  const q = boDau(tim.trim());
  return ds.filter((h) => {
    if (che === 'chua_dat' && h.dongChuaDat === 0) return false;
    if (che === 'chua_co_du_lieu' && h.dongDat + h.dongChuaDat > 0) return false;
    return !q || boDau(`${h.ten} ${h.ma} ${h.taiKhoan.join(' ')}`).includes(q);
  });
}

/** Tab: B1, C3, D2 lên đầu (đúng thứ tự đó), các biểu còn lại theo bước. */
export function sapTab(bieu: readonly TomTatBieuQt[]): { uuTien: TomTatBieuQt[]; khac: TomTatBieuQt[] } {
  const uuTien = KHOA_UU_TIEN.map((k) => bieu.find((b) => b.khoa === k)).filter((b): b is TomTatBieuQt => b !== undefined);
  const khac = bieu.filter((b) => !KHOA_UU_TIEN.includes(b.khoa)).sort((a, b) => a.buoc - b.buoc);
  return { uuTien, khac };
}

/** Nhãn tab: mã biểu; hai biểu trùng mã (B2) thì kèm tên để phân biệt. */
export function nhanBieu(b: TomTatBieuQt, ds: readonly TomTatBieuQt[]): string {
  return ds.filter((x) => x.ma === b.ma).length > 1 ? `${b.ma} · ${b.tieuDe}` : b.ma;
}

export type MauO = 'tot' | 'chu-y' | 'xau';

/** Tô màu ô trạng thái (kết quả kiểm chứng, đối chiếu…); ô thường không tô. Kiểm "không/chưa" trước "đạt". */
export function mauO(giaTri: unknown): MauO | null {
  if (typeof giaTri !== 'string') return null;
  const t = boDau(giaTri.trim());
  if (!t || t.length > 40) return null;
  if (/(khong dat|loi|sai|thieu|khong tinh)/.test(t)) return 'xau';
  if (/(tham khao|chua |uoc luong|cho |canh bao)/.test(t)) return 'chu-y';
  if (/^(dat|da kiem chung|da doi chieu|doi chieu xong|san sang tham dinh|hop le|ok)$/.test(t)) return 'tot';
  return null;
}

export const hienGiaTri = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Lọc dòng: chỉ dòng có lỗi/cảnh báo (khi `chiLoi`) và chuỗi tìm trong mọi ô. */
export function locDong(dong: readonly DongQt[], tim: string, chiLoi: boolean): DongQt[] {
  const q = boDau(tim.trim());
  return dong.filter((d) => {
    if (chiLoi && d.loi.length === 0 && d.trangThai === 'OK') return false;
    return !q || boDau(Object.values(d.duLieu).map(hienGiaTri).join(' ')).includes(q);
  });
}

// ---------------------------------------------------------------------------
// Công cụ thẩm định theo từng biểu: sắp xếp/lọc số, tổng, lọc năm, ước tính số người
// ---------------------------------------------------------------------------

/** Số giờ làm việc một người trong một năm, dùng quy đổi giờ → số người (cùng định mức C3: 1.904 giờ). */
export const GIO_MOT_NGUOI_NAM = 1904;

export type HuongSapXep = 'giam' | 'tang';

/** Cách thẩm định riêng của từng biểu; chữ là chữ cột trong khung biểu (B1: D = phút/SP, G = giờ tổng; D2: B = năm). */
export interface CauHinhBieu {
  /** Cột số cho phép sắp xếp và lọc "≥". */
  sapXepLoc?: { cot: string; nhan: string };
  /** Hiện dòng tổng trên cùng; `loaiTru` là các cột số không được cộng (ví dụ năm). */
  tong?: { loaiTru: readonly string[] };
  /** Nút lọc theo năm theo giá trị của cột này. */
  locNam?: { cot: string };
  /** Ước tính số người = tổng cột giờ ÷ 1.904. */
  soNguoi?: { cotGio: string };
}

export const CAU_HINH_BIEU: Readonly<Record<string, CauHinhBieu>> = {
  b1: { sapXepLoc: { cot: 'D', nhan: 'Phút/SP (D)' }, soNguoi: { cotGio: 'G' } },
  c3: { tong: { loaiTru: [] } },
  d2: { tong: { loaiTru: ['B'] }, locNam: { cot: 'B' } },
};

/** Đọc số từ ô (số, hoặc chuỗi kiểu 1.234,5 / 1234.5); không đọc được thì null. */
export function soTuO(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.trim().replace(/\s/g, '');
  if (!t || !/^[-+]?[\d.,]+$/.test(t)) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Giữ dòng có giá trị cột `cot` ≥ `nguong`; ô trống hoặc không phải số bị loại. */
export function locTuMuc(dong: readonly DongQt[], cot: string, nguong: number): DongQt[] {
  return dong.filter((d) => { const n = soTuO(d.duLieu[cot]); return n !== null && n >= nguong; });
}

/** Sắp xếp theo cột số (ổn định); ô trống/không phải số luôn xuống cuối, dù tăng hay giảm. */
export function sapXepCot(dong: readonly DongQt[], cot: string, huong: HuongSapXep): DongQt[] {
  const k = huong === 'giam' ? -1 : 1;
  return dong
    .map((d, i) => ({ d, i, n: soTuO(d.duLieu[cot]) }))
    .sort((a, b) => (a.n === null ? (b.n === null ? a.i - b.i : 1) : b.n === null ? -1 : (a.n - b.n) * k || a.i - b.i))
    .map((x) => x.d);
}

/** Tổng một cột số (bỏ ô trống). */
export function tongCot(dong: readonly DongQt[], cot: string): number {
  return dong.reduce((t, d) => t + (soTuO(d.duLieu[cot]) ?? 0), 0);
}

/** Các năm xuất hiện trong cột năm, tăng dần. */
export function cacNam(dong: readonly DongQt[], cot: string): number[] {
  return [...new Set(dong.map((d) => soTuO(d.duLieu[cot])).filter((n): n is number => n !== null))].sort((a, b) => a - b);
}

export function locNam(dong: readonly DongQt[], cot: string, nam: number | null): DongQt[] {
  return nam === null ? [...dong] : dong.filter((d) => soTuO(d.duLieu[cot]) === nam);
}

export const gioSangNguoi = (gio: number): number => gio / GIO_MOT_NGUOI_NAM;

/** Số kiểu Việt Nam, tối đa `soLe` chữ số thập phân. */
export const dinhDangTong = (n: number, soLe = 2): string => n.toLocaleString('vi-VN', { maximumFractionDigits: soLe });
