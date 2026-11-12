import { useEffect, useRef, useState } from 'react';
import { loiThanhChuoi } from '../api';
import type { HoSoQt } from '../types';
import { IcCanhBao, IcNguoi } from './Icons';
import { OMatKhau } from './OMatKhau';

export interface DangNhapDonViDialogProps {
  /** Hồ sơ đang quản trị; null = đóng. */
  hoSo: HoSoQt | null;
  onClose: () => void;
  /** Thêm đơn vị vào lô và mở thẻ đơn vị. Ném lỗi (chuỗi tiếng Việt) nếu thất bại. */
  onXacNhan: (d: { username: string; label: string; password: string }) => Promise<void>;
}

/** Hỏi tài khoản và mật khẩu của đơn vị chưa có trong lô, rồi thêm vào lô (như "Thêm đơn vị") để mở thẻ đơn vị. */
export function DangNhapDonViDialog({ hoSo, onClose, onXacNhan }: DangNhapDonViDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [username, setUsername] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (hoSo && !d.open) { setUsername(hoSo.taiKhoan[0] ?? ''); setMatKhau(''); setLoi(null); d.showModal(); }
    if (!hoSo && d.open) d.close();
  }, [hoSo]);

  const hopLe = username.trim().length > 0 && matKhau.length > 0 && !dangLuu;

  async function gui() {
    if (!hoSo) return;
    setDangLuu(true); setLoi(null);
    try {
      await onXacNhan({ username: username.trim().toLowerCase(), label: hoSo.ten, password: matKhau });
      onClose();
    } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangLuu(false); }
  }

  return (
    <dialog ref={ref} className="hop-them" onClose={onClose} aria-labelledby="dnqt-tieu-de">
      <h2 id="dnqt-tieu-de">Quản trị đơn vị</h2>
      <p className="phu">{hoSo?.ten}</p>
      <p className="phu">Đơn vị chưa có trong lô. Nhập tài khoản và mật khẩu của đơn vị để thêm vào lô và mở thẻ đơn vị.</p>
      <form className="hop-them__luoi" onSubmit={(e) => { e.preventDefault(); if (hopLe) void gui(); }}>
        <label>
          <span>Tài khoản cổng <b className="loi-chu">*</b></span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} list="dnqt-tai-khoan" placeholder="vd: kekhai_nb_dulich" autoComplete="off" spellCheck={false} required />
          {hoSo && hoSo.taiKhoan.length > 0 && <datalist id="dnqt-tai-khoan">{hoSo.taiKhoan.map((t) => <option key={t} value={t} />)}</datalist>}
          {hoSo && hoSo.taiKhoan.length === 0 && <small>Cổng chưa gắn tài khoản nào với đơn vị này, hãy nhập tài khoản đã biết.</small>}
        </label>
        <label>
          <span>Mật khẩu <b className="loi-chu">*</b></span>
          <OMatKhau nhan="Mật khẩu cổng của đơn vị" value={matKhau} onChange={setMatKhau} />
          <small>Được ghi vào tệp JSON của lô như khi thêm đơn vị theo lô (tệp nằm trong .gitignore).</small>
        </label>
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
        <div className="xn-nut">
          <button type="button" className="nut" onClick={onClose} disabled={dangLuu}>Hủy</button>
          <button type="submit" className="nut nut--chinh" disabled={!hopLe}>{dangLuu ? <span className="quay" aria-hidden="true" /> : <IcNguoi />} Mở thẻ đơn vị</button>
        </div>
      </form>
    </dialog>
  );
}
