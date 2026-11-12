import { useEffect, useRef, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { api, loiThanhChuoi } from '../api';
import { IcCanhBao, IcTaiXuong } from './Icons';

const homNay = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export interface XuatTienDoDialogProps { mo: boolean; onDong: () => void }

/** Hộp thoại "Báo cáo tiến độ nhập liệu": đơn vị chưa nhập, đơn vị chậm tiến độ (mỗi loại một sheet, theo cây). Dùng danh sách hồ sơ đã quét, không gọi cổng. */
export function XuatTienDoDialog({ mo, onDong }: XuatTienDoDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dangChay, setDangChay] = useState(false);
  const [kq, setKq] = useState<{ ok: boolean; noiDung: string } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mo && !d.open) { setKq(null); d.showModal(); }
    if (!mo && d.open) d.close();
  }, [mo]);

  async function xuat() {
    setKq(null);
    try {
      const dich = await save({ defaultPath: `Báo cáo tiến độ nhập liệu (${homNay()}).xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!dich) return;
      setDangChay(true);
      setKq({ ok: true, noiDung: `Đã xuất: ${await api.bcTienDoXuat(dich)}` });
    } catch (e) {
      setKq({ ok: false, noiDung: loiThanhChuoi(e) });
    } finally {
      setDangChay(false);
    }
  }

  return (
    <dialog ref={ref} className="hop-them" onClose={onDong} aria-labelledby="xtd-tieu-de">
      <h2 id="xtd-tieu-de">Báo cáo tiến độ nhập liệu</h2>
      <p className="phu">Excel gồm 2 sheet, mỗi sheet theo cây đơn vị phân cấp: <b>Chưa nhập</b> (chưa có dòng dữ liệu nào hoặc tiến độ 0%) và <b>Chậm tiến độ</b> (đã có dữ liệu nhưng tiến độ dưới 100%). Dùng danh sách hồ sơ lần cập nhật gần nhất, không quét lại cổng; muốn số mới nhất hãy bấm "Cập nhật" ở trang Quản trị trước.</p>
      <div className="hop-them__luoi">
        {kq && <p className={`thong-bao ${kq.ok ? '' : 'thong-bao--loi'}`} role={kq.ok ? 'status' : 'alert'}>{!kq.ok && <IcCanhBao />}{kq.noiDung}</p>}
        <div className="xn-nut">
          <button type="button" className="nut" onClick={onDong} disabled={dangChay}>Đóng</button>
          <button type="button" className="nut nut--chinh" onClick={() => void xuat()} disabled={dangChay}>{dangChay ? <span className="quay" aria-hidden="true" /> : <IcTaiXuong />} Chọn nơi lưu và xuất</button>
        </div>
      </div>
    </dialog>
  );
}
