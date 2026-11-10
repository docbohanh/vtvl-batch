import { useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, ThemDonVi } from '../types';
import { OMatKhau } from './OMatKhau';
import { open as moHopThoai } from '@tauri-apps/plugin-dialog';
import { IcCanhBao, IcDoiTep, IcThem } from './Icons';

const TRONG: ThemDonVi = { username: '', label: '', password: '', excelFile: '', duong: '' };

export interface ThemDonViDialogProps {
  open: boolean;
  daNapLo: boolean;
  onClose: () => void;
  onXong: (ds: DonVi[]) => void;
  /** Báo lỗi sau khi đơn vị đã được thêm (vd: chép tệp Excel thất bại). */
  onCanhBao: (thongBao: string) => void;
}

const tenTep = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Hộp thoại thêm đơn vị thủ công: ghi thêm một mục vào mảng `units` của tệp JSON lô đang nạp. */
export function ThemDonViDialog({ open, daNapLo, onClose, onXong, onCanhBao }: ThemDonViDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState<ThemDonVi>(TRONG);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [tepChon, setTepChon] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setF(TRONG); setTepChon(''); setLoi(null); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  const dat = (k: keyof ThemDonVi) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const username = f.username.trim().toLowerCase();
  const hopLe = username.length > 0 && daNapLo && !dangLuu;

  async function chonTep() {
    const p = await moHopThoai({ multiple: false, directory: false, title: 'Chọn tệp Excel của đơn vị', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
    if (typeof p === 'string') setTepChon(p);
  }

  async function luu() {
    setDangLuu(true); setLoi(null);
    try {
      // tệp đã chọn sẽ được chép vào data/<tài khoản>/nguon/<tên tệp>
      const excelFile = tepChon ? `nguon/${tenTep(tepChon)}` : f.excelFile;
      const ds = await api.themDonVi({ ...f, username, excelFile });
      onXong(ds);
      onClose();
      if (tepChon) {
        try { await api.chonExcel(username, tepChon); onXong(await api.trangThai()); } catch (e) { onCanhBao(`${username}: đã thêm đơn vị nhưng chưa chép được tệp Excel: ${loiThanhChuoi(e)}`); }
      }
    } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangLuu(false); }
  }

  return (
    <dialog ref={ref} className="hop-them" onClose={onClose} aria-labelledby="them-tieu-de">
      <h2 id="them-tieu-de">Thêm đơn vị</h2>
      <p className="phu">Ghi thêm một mục vào <code>units</code> trong tệp JSON của lô và tạo thư mục <code>data/&lt;tài khoản&gt;/</code>.</p>
      <form className="hop-them__luoi" onSubmit={(e) => { e.preventDefault(); if (hopLe) void luu(); }}>
        <label>
          <span>Tài khoản cổng <b className="loi-chu">*</b></span>
          <input value={f.username} onChange={dat('username')} placeholder="vd: kekhai_nb_dulich" autoComplete="off" spellCheck={false} required />
        </label>
        <label>
          <span>Tên đơn vị</span>
          <input value={f.label} onChange={dat('label')} placeholder="vd: Sở Du lịch" autoComplete="off" />
        </label>
        <label>
          <span>Mật khẩu cổng</span>
          <OMatKhau nhan="Mật khẩu cổng" value={f.password} onChange={(v) => setF((x) => ({ ...x, password: v }))} placeholder="Để trống nếu chỉ dán cookie (chỉ xem)" />
          <small>Có mật khẩu mới đăng nhập kênh Desktop và có quyền sửa. Được ghi vào tệp JSON (đã nằm trong .gitignore).</small>
        </label>
        <div className="hop-them__tep">
          <span>Tệp Excel</span>
          <div className="hop-them__tep-hang">
            <span className={`hop-them__tep-ten${tepChon ? '' : ' phu'}`} title={tepChon || undefined}>{tepChon ? tenTep(tepChon) : 'Chưa chọn: dùng nguon/<tài khoản>.xlsx'}</span>
            <button type="button" className="nut nut--gon" onClick={() => { void chonTep(); }} disabled={dangLuu}><IcDoiTep /> {tepChon ? 'Chọn lại…' : 'Chọn tệp…'}</button>
          </div>
          {!tepChon && (
            <input value={f.excelFile} onChange={dat('excelFile')} placeholder={`hoặc nhập đường dẫn: nguon/${username || '<tài khoản>'}.xlsx`} autoComplete="off" spellCheck={false} aria-label="Đường dẫn tệp Excel tương đối" />
          )}
          <small>Tệp được chép vào <code>data/{username || '<tài khoản>'}/nguon/</code>. Có thể bỏ qua và chọn sau trên thẻ đơn vị.</small>
        </div>
        <label>
          <span>Đường gửi</span>
          <select className="chon" value={f.duong} onChange={dat('duong')}>
            <option value="">Tự chọn theo quyền (khuyến nghị)</option>
            <option value="B">B: gói thay đổi</option>
            <option value="A">A: nhập tệp qua cổng</option>
          </select>
        </label>
        {!daNapLo && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />Chưa nạp tệp JSON của lô: chọn tệp trước.</p>}
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
        <div className="xn-nut">
          <button type="button" className="nut" onClick={onClose} disabled={dangLuu}>Hủy</button>
          <button type="submit" className="nut nut--chinh" disabled={!hopLe}>{dangLuu ? <span className="quay" aria-hidden="true" /> : <IcThem />} Lưu vào JSON</button>
        </div>
      </form>
    </dialog>
  );
}
