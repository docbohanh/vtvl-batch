import type { DonVi } from './types';

/** Bộ lọc trạng thái của danh sách đơn vị (chọn từ các chip thống kê). */
export type LocTrangThai = 'ketNoi' | 'sanSang' | 'canXuLy';

/** Điều kiện của từng bộ lọc; chỉ tính đơn vị đang bật. Dùng chung cho số đếm và lọc danh sách. */
export const DIEU_KIEN: Record<LocTrangThai, (d: DonVi) => boolean> = {
  ketNoi: (d) => d.enabled && !!d.ketNoi && d.ketNoi.ketQua !== 'chan',
  sanSang: (d) => d.enabled && d.trangThai.buoc === 'san_sang_gui',
  canXuLy: (d) => d.enabled && ['loi', 'chan', 'can_xem_xet'].includes(d.trangThai.buoc),
};

export const NHAN_LOC: Record<LocTrangThai, string> = { ketNoi: 'Kết nối ổn', sanSang: 'Sẵn sàng gửi', canXuLy: 'Cần xử lý' };
