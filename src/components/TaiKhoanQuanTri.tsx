import { useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { TinhTrangTaiKhoanQt } from '../types';
import { IcCanhBao, IcKhoa } from './Icons';
import { OMatKhau } from './OMatKhau';

export interface TaiKhoanQuanTriProps {
  /** null = chưa đọc được (chưa nạp lô). */
  tinhTrang: TinhTrangTaiKhoanQt | null;
  /** Gọi sau khi đã thiết lập tài khoản mới: trang cha quét lại cây đơn vị. */
  onXong: (tt: TinhTrangTaiKhoanQt) => void;
}

const NHAN_NGUON: Record<'ung_dung' | 'lo', string> = { ung_dung: 'thiết lập trong ứng dụng', lo: 'lấy từ tệp JSON của lô' };

/** Nút "Tài khoản quản trị" ở đầu trang và hộp thoại thiết lập. Chưa có tài khoản thì tự mở hộp thoại. Đăng nhập thử và phải là Quản trị hệ thống mới lưu. */
export function TaiKhoanQuanTri({ tinhTrang, onXong }: TaiKhoanQuanTriProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const daTuMo = useRef(false);
  const [mo, setMo] = useState(false);
  const [ten, setTen] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);

  // lần đầu thấy chưa có tài khoản quản trị: tự mở hộp thoại một lần
  useEffect(() => {
    if (tinhTrang && !tinhTrang.nguon && !daTuMo.current) { daTuMo.current = true; setMo(true); }
  }, [tinhTrang]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mo && !d.open) { setTen(tinhTrang?.tenDangNhap ?? ''); setMatKhau(''); setLoi(null); d.showModal(); }
    if (!mo && d.open) d.close();
  }, [mo, tinhTrang]);

  const hopLe = ten.trim().length > 0 && matKhau.length > 0 && !dangLuu;

  async function luu() {
    setDangLuu(true); setLoi(null);
    try {
      const tt = await api.qtDatTaiKhoan(ten.trim(), matKhau);
      setMo(false);
      onXong(tt);
    } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangLuu(false); }
  }

  return (
    <>
      <div className="tk-qt">
        <span className="nhan-truong"><IcKhoa /> Tài khoản quản trị</span>
        <button type="button" className="nut tk-qt__nut" onClick={() => setMo(true)} disabled={!tinhTrang} title={tinhTrang?.nguon ? `Nguồn: ${NHAN_NGUON[tinhTrang.nguon]}. Bấm để đổi tài khoản quản trị.` : 'Thiết lập tài khoản quản trị'}>
          {tinhTrang?.tenDangNhap ? <b>{tinhTrang.tenDangNhap}</b> : <span className="tk-qt__chua">Chưa thiết lập</span>}
          <span className="tk-qt__doi">Đổi…</span>
        </button>
      </div>

      <dialog ref={ref} className="hop-them" onClose={() => setMo(false)} aria-labelledby="tkqt-tieu-de">
        <h2 id="tkqt-tieu-de">Tài khoản quản trị</h2>
        <p className="phu">Dùng để quét cây đơn vị, tài khoản và hồ sơ của mọi đơn vị. Phải là tài khoản có vai trò Quản trị hệ thống. Đăng nhập thử thành công mới lưu, rồi cây đơn vị được tải lại.</p>
        <form className="hop-them__luoi" onSubmit={(e) => { e.preventDefault(); if (hopLe) void luu(); }}>
          <label>
            <span>Tên đăng nhập <b className="loi-chu">*</b></span>
            <input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="vd: quantri_nb_ubnd" autoComplete="off" spellCheck={false} required />
          </label>
          <label>
            <span>Mật khẩu <b className="loi-chu">*</b></span>
            <OMatKhau nhan="Mật khẩu tài khoản quản trị" value={matKhau} onChange={setMatKhau} />
            <small>Lưu trên máy này, trong thư mục dữ liệu của ứng dụng (đã nằm trong .gitignore). Không gửi đi đâu ngoài cổng.</small>
          </label>
          {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
          <div className="xn-nut">
            <button type="button" className="nut" onClick={() => setMo(false)} disabled={dangLuu}>Hủy</button>
            <button type="submit" className="nut nut--chinh" disabled={!hopLe}>{dangLuu ? <span className="quay" aria-hidden="true" /> : <IcKhoa />} Đăng nhập thử và lưu</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
