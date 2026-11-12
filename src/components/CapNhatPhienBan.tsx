import { useCallback, useEffect, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { KetQuaCapNhat } from '../types';
import { IcLamMoi } from './Icons';

type Tt = { loai: 'chua' } | { loai: 'dang' } | { loai: 'loi'; thongBao: string } | { loai: 'xong'; kq: KetQuaCapNhat };

/** Số phiên bản đang chạy và kiểm tra bản mới trên GitHub (tự kiểm tra một lần khi mở, im lặng nếu lỗi). */
export function CapNhatPhienBan() {
  const [tt, setTt] = useState<Tt>({ loai: 'chua' });

  const kiemTra = useCallback(async (imLang: boolean) => {
    setTt({ loai: 'dang' });
    try {
      setTt({ loai: 'xong', kq: await api.kiemTraCapNhat() });
    } catch (e) {
      setTt(imLang ? { loai: 'chua' } : { loai: 'loi', thongBao: loiThanhChuoi(e) });
    }
  }, []);

  useEffect(() => { void kiemTra(true); }, [kiemTra]);

  const boc = (nut: JSX.Element) => (
    <div className="tk-qt">
      <span className="nhan-truong"><IcLamMoi /> Quản lý phiên bản</span>
      {nut}
    </div>
  );

  if (tt.loai === 'xong' && tt.kq.coBanMoi) {
    const { kq } = tt;
    return boc(
      <button type="button" className="nut nut--chinh cap-nhat tk-qt__nut" onClick={() => { void api.moTrangTai(kq.url).catch(() => undefined); }}
        title={`Đang dùng ${kq.hienTai}. Bấm để mở trang tải bản ${kq.moi}.${kq.ghiChu ? `\n\n${kq.ghiChu}` : ''}`}>
        Có bản mới {kq.moi}
      </button>,
    );
  }
  const hienTai = tt.loai === 'xong' ? tt.kq.hienTai : null;
  const nhan = tt.loai === 'dang' ? 'Đang kiểm tra…' : tt.loai === 'xong' ? `Đã là bản mới nhất${hienTai ? ` (${hienTai})` : ''}` : tt.loai === 'loi' ? 'Lỗi kiểm tra' : 'Kiểm tra cập nhật';
  return boc(
    <button type="button" className="nut cap-nhat tk-qt__nut" onClick={() => void kiemTra(false)} disabled={tt.loai === 'dang'}
      title={tt.loai === 'loi' ? tt.thongBao : 'Hỏi GitHub xem có phiên bản mới của VTVL Batch không'}>
      <IcLamMoi /> {nhan}
    </button>,
  );
}
