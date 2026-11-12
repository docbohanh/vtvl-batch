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
