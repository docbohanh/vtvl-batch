import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { api, loiThanhChuoi } from '../api';
import { IcCanhBao, IcTaiXuong } from './Icons';

interface TienDo { xong: number; tong: number }
type KetQua = { ok: boolean; noiDung: string };

const hienTai = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export interface XuatBaoCaoDialogProps { mo: boolean; onDong: () => void }

/** Hộp thoại "Báo cáo tổng hợp - Biểu 01", mở từ menu "Báo cáo" ở header. */
export function XuatBaoCaoDialog({ mo, onDong }: XuatBaoCaoDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [daCo, setDaCo] = useState<string | null>(null);
  const [quetLai, setQuetLai] = useState(false);
  const [dangChay, setDangChay] = useState(false);
  const [tienDo, setTienDo] = useState<TienDo | null>(null);
  const [kq, setKq] = useState<KetQua | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mo && !d.open) d.showModal();
    if (!mo && d.open) d.close();
  }, [mo]);

  useEffect(() => {
    let huy: (() => void) | undefined;
    void listen<TienDo>('bao-cao-tien-do', (e) => setTienDo(e.payload)).then((f) => { huy = f; });
    return () => huy?.();
  }, []);

  useEffect(() => {
    if (!mo) return;
    setKq(null); setTienDo(null); setQuetLai(false); setDaCo(null);
    void api.bcCayTrangThai().then(setDaCo).catch(() => { /* chưa có số liệu đã lưu: coi như chưa có */ });
  }, [mo]);

  async function xuat() {
    setKq(null); setTienDo(null);
    try {
      const dich = await save({ defaultPath: `Báo cáo tổng hợp - Biểu 01 (${hienTai()}).xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!dich) return;
      setDangChay(true);
      const duong = await api.bcCayXuat(dich, quetLai || daCo === null);
      setKq({ ok: true, noiDung: `Đã xuất: ${duong}` });
      setDaCo(await api.bcCayTrangThai().catch(() => null));
    } catch (e) {
      setKq({ ok: false, noiDung: loiThanhChuoi(e) });
    } finally {
      setDangChay(false);
    }
  }

  const phanTram = tienDo && tienDo.tong > 0 ? Math.round((tienDo.xong / tienDo.tong) * 100) : 0;

  return (
    <>
      <dialog ref={ref} className="hop-them" onClose={() => { if (!dangChay) onDong(); }} onCancel={(e) => { if (dangChay) e.preventDefault(); }} aria-labelledby="xbc-tieu-de">
        <h2 id="xbc-tieu-de">Báo cáo tổng hợp - Biểu 01</h2>
        <p className="phu">Excel gồm 3 sheet: <b>Tổng</b>, <b>Danh sách đơn vị</b> và <b>Thiếu PA bố trí 2028-2031</b>; hai sheet sau theo cây đơn vị. Cột khớp Biểu 01: nhiệm vụ, công việc, sản phẩm, VTVL, nhu cầu nhân lực, phương án biên chế 2027–2031, kèm B1 và C3.</p>
        <div className="hop-them__luoi">
          {daCo !== null ? (
            <>
              <p className="phu">Số liệu đã quét: {daCo}</p>
              <div className="hop-them__kiem">
                <input id="xbc-quet-lai" type="checkbox" checked={quetLai} onChange={(e) => setQuetLai(e.target.checked)} disabled={dangChay} />
                <label htmlFor="xbc-quet-lai">Quét lại từ cổng (chậm hơn, cho số liệu mới nhất)</label>
              </div>
            </>
          ) : (
            <p className="phu">Chưa có số liệu đã lưu. Lần đầu sẽ quét B1, C3, D2 của mọi hồ sơ từ cổng (chỉ đọc, có thể mất vài phút đến hơn chục phút).</p>
          )}
          {dangChay && (
            <div role="status" aria-live="polite">
              <div className="qt__tien-do" style={{ width: '100%', height: 8 }}><i style={{ width: `${phanTram}%` }} /></div>
              <small>{tienDo ? `Đã quét ${tienDo.xong}/${tienDo.tong} hồ sơ (${phanTram}%)` : 'Đang chuẩn bị…'}</small>
            </div>
          )}
          {kq && <p className={`thong-bao ${kq.ok ? '' : 'thong-bao--loi'}`} role={kq.ok ? 'status' : 'alert'}>{!kq.ok && <IcCanhBao />}{kq.noiDung}</p>}
          <div className="xn-nut">
            <button type="button" className="nut" onClick={onDong} disabled={dangChay}>Đóng</button>
            <button type="button" className="nut nut--chinh" onClick={() => void xuat()} disabled={dangChay}>{dangChay ? <span className="quay" aria-hidden="true" /> : <IcTaiXuong />} Chọn nơi lưu và xuất</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
