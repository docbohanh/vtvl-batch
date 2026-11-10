import { useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, SuaDonVi } from '../types';
import { OMatKhau } from './OMatKhau';
import { IcCanhBao, IcSua, IcXoa } from './Icons';

export interface SuaDonViDialogProps {
  don: DonVi;
  open: boolean;
  onClose: () => void;
  onXong: (ds: DonVi[]) => void;
}

function tuDon(d: DonVi): SuaDonVi {
  return { username: d.username, label: d.label, password: '', xoaMatKhau: false, excelFile: d.cauHinh.excelFile, duong: d.cauHinh.duong, enabled: d.enabled };
}

/** Hộp thoại sửa thông tin một đơn vị: ghi thẳng vào mục tương ứng trong tệp JSON của lô. Tài khoản (tên thư mục dữ liệu) không đổi được. */
export function SuaDonViDialog({ don, open, onClose, onXong }: SuaDonViDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState<SuaDonVi>(() => tuDon(don));
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [xacNhanXoa, setXacNhanXoa] = useState(false);
  const [tenXoa, setTenXoa] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setF(tuDon(don)); setLoi(null); setXacNhanXoa(false); setTenXoa(''); d.showModal(); }
    if (!open && d.open) d.close();
    // chỉ nạp lại biểu mẫu lúc mở, không ghi đè khi trạng thái nền cập nhật
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dat = (k: keyof SuaDonVi) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const hopLe = f.excelFile.trim().length > 0 && !dangLuu;

  async function luu() {
    setDangLuu(true); setLoi(null);
    try { onXong(await api.suaDonVi(f)); onClose(); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangLuu(false); }
  }

  async function xoa() {
    setDangLuu(true); setLoi(null);
    try { onXong(await api.xoaDonVi(don.username)); onClose(); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangLuu(false); }
  }

  return (
    <dialog ref={ref} className="hop-them" onClose={onClose} aria-labelledby={`sua-${don.username}`}>
      <h2 id={`sua-${don.username}`}>Sửa thông tin đơn vị</h2>
      <p className="phu">Ghi vào mục của đơn vị này trong tệp JSON của lô. Tài khoản <code>{don.username}</code> không đổi được vì là tên thư mục dữ liệu.</p>
      <form className="hop-them__luoi" onSubmit={(e) => { e.preventDefault(); if (hopLe) void luu(); }}>
        <label>
          <span>Tên đơn vị</span>
          <input value={f.label} onChange={dat('label')} autoComplete="off" />
        </label>
        <label>
          <span>Mật khẩu cổng</span>
          <OMatKhau nhan="Mật khẩu cổng" value={f.password} onChange={(v) => setF((x) => ({ ...x, password: v, xoaMatKhau: false }))} placeholder={don.coMatKhau ? 'Để trống để giữ mật khẩu hiện có' : 'Chưa có mật khẩu'} disabled={f.xoaMatKhau} />
          {don.coMatKhau && (
            <small className="hop-them__kiem">
              <input id={`xmk-${don.username}`} type="checkbox" checked={f.xoaMatKhau} onChange={(e) => setF((x) => ({ ...x, xoaMatKhau: e.target.checked, password: '' }))} />
              <label htmlFor={`xmk-${don.username}`}>Xóa mật khẩu khỏi tệp JSON</label>
            </small>
          )}
        </label>
        <label>
          <span>Tệp Excel (tương đối trong thư mục tài khoản)</span>
          <input value={f.excelFile} onChange={dat('excelFile')} autoComplete="off" spellCheck={false} required />
          <small>Đổi đường dẫn sẽ bỏ lựa chọn tệp đã chọn riêng trên thẻ.</small>
        </label>
        <label>
          <span>Đường gửi</span>
          <select className="chon" value={f.duong} onChange={dat('duong')}>
            <option value="">Tự chọn theo quyền (khuyến nghị)</option>
            <option value="B">B: gói thay đổi</option>
            <option value="A">A: nhập tệp qua cổng</option>
          </select>
        </label>
        <label className="hop-them__kiem hop-them__kiem--dong">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF((x) => ({ ...x, enabled: e.target.checked }))} />
          <span>Bật đơn vị trong lô (tắt thì bị bỏ qua khi kiểm tra và gửi)</span>
        </label>
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
        <section className="vung-nguy" aria-label="Xóa đơn vị khỏi JSON">
          {!xacNhanXoa ? (
            <button type="button" className="nut nut--nguy-vien nut--gon" onClick={() => setXacNhanXoa(true)} disabled={dangLuu}><IcXoa /> Xóa đơn vị khỏi JSON…</button>
          ) : (
            <>
              <p className="phu">Xóa mục <code>{don.username}</code> khỏi tệp JSON của lô. <b>Thư mục dữ liệu <code>data/{don.username}/</code> được giữ lại</b> (gói thay đổi, biên nhận, nhật ký), không xóa dữ liệu trên cổng. Gõ tên tài khoản để xác nhận.</p>
              <div className="vung-nguy__hang">
                <input value={tenXoa} onChange={(e) => setTenXoa(e.target.value)} placeholder={don.username} autoComplete="off" spellCheck={false} aria-label="Gõ tên tài khoản để xác nhận xóa" />
                <button type="button" className="nut nut--nguy nut--gon" onClick={() => { void xoa(); }} disabled={dangLuu || tenXoa.trim().toLowerCase() !== don.username.toLowerCase()}><IcXoa /> Xóa khỏi JSON</button>
                <button type="button" className="nut nut--gon" onClick={() => { setXacNhanXoa(false); setTenXoa(''); }} disabled={dangLuu}>Thôi</button>
              </div>
            </>
          )}
        </section>
        <div className="xn-nut">
          <button type="button" className="nut" onClick={onClose} disabled={dangLuu}>Hủy</button>
          <button type="submit" className="nut nut--chinh" disabled={!hopLe}>{dangLuu ? <span className="quay" aria-hidden="true" /> : <IcSua />} Lưu vào JSON</button>
        </div>
      </form>
    </dialog>
  );
}
