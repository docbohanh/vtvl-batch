import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, loiThanhChuoi } from '../api';
import type { KetQuaCapNhat } from '../types';
import { IcLamMoi, IcTaiXuong } from './Icons';

type Tt =
  | { loai: 'chua' }
  | { loai: 'dang' }
  | { loai: 'loi'; thongBao: string }
  | { loai: 'xong'; kq: KetQuaCapNhat }
  | { loai: 'tai'; kq: KetQuaCapNhat; phanTram: number | null }
  | { loai: 'san_sang'; kq: KetQuaCapNhat; duong: string }
  | { loai: 'cai'; kq: KetQuaCapNhat }
  | { loai: 'loi_tai'; kq: KetQuaCapNhat; thongBao: string };

interface TienDo { da: number; tong: number }

/**
 * Số phiên bản đang chạy và cập nhật: tự kiểm tra một lần khi mở; thấy bản mới thì tự tải nền (có thanh phần trăm),
 * tải xong người dùng bấm "Cài đặt" để cài đè và mở lại (không tự thoát giữa chừng để khỏi cắt ngang việc đang làm).
 * Bản phát hành không có tệp cài đặt hợp với máy thì chỉ mở trang tải.
 */
export function CapNhatPhienBan() {
  const [tt, setTt] = useState<Tt>({ loai: 'chua' });
  const daTuTai = useRef<string | null>(null); // phiên bản đã tự tải, tránh tải lặp

  const tai = useCallback(async (kq: KetQuaCapNhat) => {
    setTt({ loai: 'tai', kq, phanTram: null });
    try {
      const r = await api.taiBanCapNhat();
      setTt({ loai: 'san_sang', kq, duong: r.duong });
    } catch (e) {
      setTt({ loai: 'loi_tai', kq, thongBao: loiThanhChuoi(e) });
    }
  }, []);

  const kiemTra = useCallback(async (imLang: boolean) => {
    setTt({ loai: 'dang' });
    try {
      const kq = await api.kiemTraCapNhat();
      if (kq.coBanMoi && kq.coTepCaiDat && daTuTai.current !== kq.moi) {
        daTuTai.current = kq.moi;
        void tai(kq);
      } else {
        setTt({ loai: 'xong', kq });
      }
    } catch (e) {
      setTt(imLang ? { loai: 'chua' } : { loai: 'loi', thongBao: loiThanhChuoi(e) });
    }
  }, [tai]);

  useEffect(() => { void kiemTra(true); }, [kiemTra]);

  // tiến độ tải từ phía Rust
  useEffect(() => {
    let huy = false;
    let bo: (() => void) | undefined;
    void listen<TienDo>('cap-nhat-tien-do', (e) => {
      const { da, tong } = e.payload;
      setTt((c) => (c.loai === 'tai' ? { ...c, phanTram: tong > 0 ? Math.min(100, Math.round((da / tong) * 100)) : null } : c));
    }).then((u) => { if (huy) u(); else bo = u; }).catch(() => undefined);
    return () => { huy = true; bo?.(); };
  }, []);

  async function cai(kq: KetQuaCapNhat, duong: string) {
    setTt({ loai: 'cai', kq });
    try {
      await api.caiBanCapNhat(duong); // thành công thì ứng dụng tự thoát để cài đè
    } catch (e) {
      setTt({ loai: 'loi_tai', kq, thongBao: loiThanhChuoi(e) });
    }
  }

  const boc = (nut: JSX.Element) => (
    <div className="tk-qt">
      <span className="nhan-truong"><IcLamMoi /> Quản lý phiên bản</span>
      {nut}
    </div>
  );
  const moTrang = (kq: KetQuaCapNhat) => { void api.moTrangTai(kq.url).catch(() => undefined); };

  switch (tt.loai) {
    case 'tai':
      return boc(
        <button type="button" className="nut cap-nhat tk-qt__nut" disabled aria-live="polite" title={`Đang tải bản ${tt.kq.moi} ở nền, tải xong sẽ hỏi cài đặt`}>
          <span className="quay" aria-hidden="true" /> Đang tải {tt.kq.moi}{tt.phanTram !== null ? ` · ${tt.phanTram}%` : '…'}
        </button>,
      );
    case 'san_sang':
      return boc(
        <button type="button" className="nut nut--chinh cap-nhat tk-qt__nut" onClick={() => void cai(tt.kq, tt.duong)}
          title={`Đã tải xong bản ${tt.kq.moi} (đang dùng ${tt.kq.hienTai}). Bấm để cài đè và mở lại ứng dụng; việc đang làm nên lưu trước.${tt.kq.ghiChu ? `\n\n${tt.kq.ghiChu}` : ''}`}>
          <IcTaiXuong /> Cài {tt.kq.moi} và khởi động lại
        </button>,
      );
    case 'cai':
      return boc(
        <button type="button" className="nut cap-nhat tk-qt__nut" disabled aria-live="polite">
          <span className="quay" aria-hidden="true" /> Đang cài đặt…
        </button>,
      );
    case 'loi_tai':
      return boc(
        <button type="button" className="nut cap-nhat tk-qt__nut" onClick={() => void tai(tt.kq)}
          title={`${tt.thongBao}\n\nBấm để tải lại; chuột phải để mở trang phát hành và tải thủ công.`}
          onContextMenu={(e) => { e.preventDefault(); moTrang(tt.kq); }}>
          <IcLamMoi /> Lỗi cập nhật · thử lại
        </button>,
      );
    case 'xong':
      if (tt.kq.coBanMoi) { // bản mới nhưng không có tệp cài đặt cho máy này
        return boc(
          <button type="button" className="nut nut--chinh cap-nhat tk-qt__nut" onClick={() => moTrang(tt.kq)}
            title={`Đang dùng ${tt.kq.hienTai}. Bản ${tt.kq.moi} chưa có tệp cài đặt cho máy này; bấm để mở trang tải.${tt.kq.ghiChu ? `\n\n${tt.kq.ghiChu}` : ''}`}>
            Bản mới {tt.kq.moi}
          </button>,
        );
      }
      break;
    default:
      break;
  }

  const hienTai = tt.loai === 'xong' ? tt.kq.hienTai : null;
  const nhan = tt.loai === 'dang' ? 'Đang kiểm tra…' : tt.loai === 'xong' ? `v${hienTai ?? ''} ✓` : tt.loai === 'loi' ? 'Lỗi · thử lại' : 'Cập nhật?';
  return boc(
    <button type="button" className="nut cap-nhat tk-qt__nut" onClick={() => void kiemTra(false)} disabled={tt.loai === 'dang'}
      title={tt.loai === 'loi' ? tt.thongBao : tt.loai === 'xong' ? 'Đang dùng bản mới nhất. Bấm để kiểm tra lại' : 'Hỏi GitHub xem có phiên bản mới của VTVL Batch không'}>
      <IcLamMoi /> {nhan}
    </button>,
  );
}
