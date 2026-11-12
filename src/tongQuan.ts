import type { BuocTongQuan } from './types';

/** Phần thuần của màn hình "Tổng quan": định dạng và phân loại theo đúng cách trang làm việc của ứng dụng Desktop. */

export type MauKpi = 'cho' | 'tot' | 'thuong';
export type TrangThaiTienDo = 'xong' | 'dang' | 'chua';

/** Số kiểu Việt Nam (1.613). Không phải số thì giữ nguyên chuỗi; rỗng/null thì trả chuỗi rỗng. */
export function dinhDangSo(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : String(v);
}

/** Màu ô chỉ số theo khóa: chưa đạt/chưa xác nhận/trả lại → cam; đạt/sẵn sàng/đã kiểm chứng → xanh; còn lại trung tính. Kiểm "chưa đạt" trước vì chứa "đạt". */
export function mauKpi(khoa: string): MauKpi {
  if (/NOT_PASSED|UNCONFIRMED|RETURNED/.test(khoa)) return 'cho';
  if (/PASSED|READY|VERIFIED|APPROVED/.test(khoa)) return 'tot';
  return 'thuong';
}

export interface TienDoBuoc { tt: TrangThaiTienDo; nhan: string; phanTram: number }

/** Có việc và không còn dở/chưa làm → hoàn thành; có việc dở hoặc đã xong một phần → đang làm; còn lại chưa bắt đầu. */
export function tienDoBuoc(b: Pick<BuocTongQuan, 'xong' | 'dangLam' | 'chuaBatDau'>): TienDoBuoc {
  const tong = b.xong + b.dangLam + b.chuaBatDau;
  if (tong > 0 && b.dangLam === 0 && b.chuaBatDau === 0) return { tt: 'xong', nhan: '✓ Hoàn thành', phanTram: 100 };
  if (b.dangLam > 0 || b.xong > 0) return { tt: 'dang', nhan: '◔ Đang làm', phanTram: tong ? Math.round((b.xong / tong) * 100) : 0 };
  return { tt: 'chua', nhan: '○ Chưa bắt đầu', phanTram: 0 };
}

/** Vị trí bước đầu tiên chưa hoàn thành (bước hiện tại); -1 nếu xong hết. */
export function buocHienTai(cac: readonly BuocTongQuan[]): number {
  return cac.findIndex((b) => tienDoBuoc(b).tt !== 'xong');
}

/** "12:06, 11/11/2026" từ thời điểm ISO của cổng; không đọc được thì trả chuỗi gốc. */
export function dinhDangCapNhat(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
