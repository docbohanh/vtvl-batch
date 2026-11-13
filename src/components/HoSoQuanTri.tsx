import { useCallback, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { api, loiThanhChuoi } from '../api';
import { dinhDangCapNhat } from '../tongQuan';
import type { HoSoQt } from '../types';
import { BoBieuXem } from './BoBieuXem';
import { IcCanhBao, IcLamMoi, IcNguoi, IcTaiXuong } from './Icons';

const NHAN_TRANG_THAI: Record<string, string> = { DRAFT: 'Đang kê khai', SUBMITTED: 'Đã nộp', RETURNED: 'Bị trả lại', APPROVED: 'Đã duyệt' };

export interface HoSoQuanTriProps {
  hoSo: HoSoQt;
  /** Mở thẻ đơn vị (hỏi tài khoản và mật khẩu nếu đơn vị chưa có trong lô). Không truyền thì ẩn nút "Quản trị" (tài khoản trưởng đơn vị). */
  onQuanTri?: (hoSo: HoSoQt) => void;
  /** Có thì hiện nút quay lại danh sách. */
  onVe?: () => void;
}

/** Chi tiết một hồ sơ trên cổng: đọc danh sách biểu và từng biểu từ cổng, kèm xuất Excel, tải lại và mở thẻ đơn vị. */
export function HoSoQuanTri({ hoSo, onQuanTri, onVe }: HoSoQuanTriProps) {
  const [dangXuat, setDangXuat] = useState(false);
  const [ketQuaXuat, setKetQuaXuat] = useState<{ ok: boolean; noiDung: string } | null>(null);
  const layDanhSach = useCallback(() => api.qtChiTiet(hoSo.id), [hoSo.id]);
  const layBieu = useCallback((khoa: string) => api.qtBieu(hoSo.id, khoa), [hoSo.id]);

  async function xuatExcel() {
    setKetQuaXuat(null);
    try {
      const dich = await save({ defaultPath: `${hoSo.ma || hoSo.id}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!dich) return;
      setDangXuat(true);
      const duong = await api.qtXuatExcel(hoSo.id, dich);
      setKetQuaXuat({ ok: true, noiDung: `Đã xuất: ${duong}` });
    } catch (e) {
      setKetQuaXuat({ ok: false, noiDung: loiThanhChuoi(e) });
    } finally {
      setDangXuat(false);
    }
  }

  return (
    <BoBieuXem
      khoaNap={hoSo.id} tenAria={`Hồ sơ ${hoSo.ten}`} khoaGon="vtvl-batch.gon-hoso" nguon="từ cổng"
      layDanhSach={layDanhSach} layBieu={layBieu}
      dau={(
        <>
          <h2>{hoSo.ten}</h2>
          <p className="hsqt__phu">
            <code>{hoSo.ma}</code> · {NHAN_TRANG_THAI[hoSo.trangThai] ?? hoSo.trangThai} · tiến độ <b>{hoSo.tienDo}%</b> · cập nhật {dinhDangCapNhat(hoSo.capNhat)}
          </p>
          <p className="hsqt__phu">Tài khoản: {hoSo.taiKhoan.length ? hoSo.taiKhoan.map((t) => <code key={t}>{t}</code>) : <i>chưa có tài khoản gắn với đơn vị này</i>}</p>
        </>
      )}
      thongBao={ketQuaXuat && <p className={`thong-bao${ketQuaXuat.ok ? '' : ' thong-bao--loi'}`} role={ketQuaXuat.ok ? 'status' : 'alert'}>{!ketQuaXuat.ok && <IcCanhBao />}{ketQuaXuat.noiDung}</p>}
      nut={({ bieuChon, dangTai, taiLai, coBieu }) => (
        <>
          <button type="button" className="nut" onClick={() => void xuatExcel()} disabled={!coBieu || dangXuat} title="Đọc mọi biểu hiện tại của đơn vị từ cổng và lưu thành bộ biểu theo mẫu B30K (Excel, đủ các biểu A1, A2, B1, B2, C1, C2, C3, D1, D2 và dự báo; giữ công thức, khóa, danh sách chọn của mẫu)">
            {dangXuat ? <span className="quay" aria-hidden="true" /> : <IcTaiXuong />} {dangXuat ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
          <button type="button" className="nut" onClick={taiLai} disabled={!bieuChon || dangTai} title="Đọc lại biểu đang xem từ cổng">
            <IcLamMoi /> Tải lại biểu
          </button>
          {onQuanTri && (
            <button type="button" className="nut nut--chinh" onClick={() => onQuanTri(hoSo)}
              title="Mở thẻ đơn vị: đăng nhập, Excel, chuẩn bị, gửi… (đơn vị chưa có trong lô thì nhập tài khoản và mật khẩu)">
              <IcNguoi /> Quản trị
            </button>
          )}
          {onVe && <button type="button" className="nut nut--chinh" onClick={onVe}>← Danh sách đơn vị</button>}
        </>
      )}
    />
  );
}
