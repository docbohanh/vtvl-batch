/** Lịch sử các tệp JSON lô đã nạp. Hàm thuần (không đụng bộ nhớ) để dễ kiểm thử; phần đọc/ghi localStorage ở cuối tệp. */

export interface MucLichSu {
  /** Đường dẫn tuyệt đối của tệp JSON. */
  duongDan: string;
  /** Lần nạp gần nhất (ISO 8601). */
  luc: string;
  /** Số đơn vị trong lô lúc nạp. */
  soDonVi: number;
}

export const TOI_DA_LICH_SU = 12;
const KHOA_LICH_SU = 'vtvl-batch.lich-su-lo';

/** Đưa một lần nạp lên đầu danh sách; cùng đường dẫn thì thay mục cũ. Giữ tối đa `toiDa` mục mới nhất. */
export function themLichSu(ds: readonly MucLichSu[], muc: MucLichSu, toiDa: number = TOI_DA_LICH_SU): MucLichSu[] {
  return [muc, ...ds.filter((m) => m.duongDan !== muc.duongDan)].slice(0, toiDa);
}

export function xoaMucLichSu(ds: readonly MucLichSu[], duongDan: string): MucLichSu[] {
  return ds.filter((m) => m.duongDan !== duongDan);
}

/** Lọc dữ liệu đọc từ bộ nhớ: bỏ mục sai kiểu để một bản ghi hỏng không làm hỏng cả danh sách. */
export function lamSachLichSu(thô: unknown): MucLichSu[] {
  if (!Array.isArray(thô)) return [];
  return thô
    .filter((m): m is MucLichSu => !!m && typeof m.duongDan === 'string' && m.duongDan !== '' && typeof m.luc === 'string' && Number.isFinite(m.soDonVi))
    .slice(0, TOI_DA_LICH_SU);
}

export function docLichSu(): MucLichSu[] {
  try { return lamSachLichSu(JSON.parse(localStorage.getItem(KHOA_LICH_SU) ?? '[]')); } catch { return []; }
}

export function ghiLichSu(ds: readonly MucLichSu[]): void {
  try { localStorage.setItem(KHOA_LICH_SU, JSON.stringify(ds)); } catch { /* bộ nhớ trình duyệt có thể không dùng được */ }
}
