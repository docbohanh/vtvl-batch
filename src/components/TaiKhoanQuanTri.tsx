import { useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { TaiKhoanDaLuuQt, TinhTrangTaiKhoanQt } from '../types';
import { IcCanhBao, IcDong, IcKhoa, IcThem } from './Icons';
import { OMatKhau } from './OMatKhau';

export interface TaiKhoanQuanTriProps {
  /** null = chưa đọc được (chưa nạp lô). */
  tinhTrang: TinhTrangTaiKhoanQt | null;
  /** Gọi sau khi đã thiết lập tài khoản mới: trang cha quét lại cây đơn vị. */
  onXong: (tt: TinhTrangTaiKhoanQt) => void;
}

const NHAN_NGUON: Record<'ung_dung' | 'lo', string> = { ung_dung: 'thiết lập trong ứng dụng', lo: 'lấy từ tệp JSON của lô' };

/** Nút "Tài khoản" ở đầu trang và hộp thoại thiết lập. Chưa có tài khoản thì tự mở hộp thoại. Quản trị hệ thống hoặc tài khoản được phân công đơn vị; đăng nhập thử thành công mới lưu. */
export function TaiKhoanQuanTri({ tinhTrang, onXong }: TaiKhoanQuanTriProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const daTuMo = useRef(false);
  const [mo, setMo] = useState(false);
  const [ten, setTen] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [moMenu, setMoMenu] = useState(false);
  const [ds, setDs] = useState<TaiKhoanDaLuuQt[]>([]);
  const [dangChuyen, setDangChuyen] = useState<string | null>(null);
  const [loiMenu, setLoiMenu] = useState<{ ten: string; noiDung: string } | null>(null);
  const goc = useRef<HTMLDivElement>(null);

  // đóng danh sách tài khoản khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!moMenu) return;
    const ngoai = (e: MouseEvent) => { if (goc.current && !goc.current.contains(e.target as Node)) setMoMenu(false); };
    const phim = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoMenu(false); };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', phim);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('keydown', phim); };
  }, [moMenu]);

  async function moDanhSach() {
    if (moMenu) { setMoMenu(false); return; }
    setLoiMenu(null);
    try { setDs(await api.qtDsTaiKhoanDaLuu()); } catch { setDs([]); }
    setMoMenu(true);
  }

  async function chuyen(ten: string) {
    setDangChuyen(ten); setLoiMenu(null);
    try {
      const tt = await api.qtChuyenTaiKhoan(ten);
      setMoMenu(false);
      onXong(tt);
    } catch (e) { setLoiMenu({ ten, noiDung: loiThanhChuoi(e) }); } finally { setDangChuyen(null); }
  }

  async function quen(ten: string) {
    try { setDs(await api.qtXoaTaiKhoanDaLuu(ten)); } catch (e) { setLoiMenu({ ten, noiDung: loiThanhChuoi(e) }); }
  }

  function moDangNhap(tenGoiY?: string) {
    setMoMenu(false);
    setTen(tenGoiY ?? '');
    setMo(true);
  }

  // lần đầu thấy chưa có tài khoản quản trị: tự mở hộp thoại một lần
  useEffect(() => {
    if (tinhTrang && !tinhTrang.nguon && !daTuMo.current) { daTuMo.current = true; setMo(true); }
  }, [tinhTrang]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mo && !d.open) { setMatKhau(''); setLoi(null); d.showModal(); }
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
      <div className="tk-qt tk-menu" ref={goc}>
        <span className="nhan-truong"><IcKhoa /> Tài khoản</span>
        <button type="button" className="nut tk-qt__nut" onClick={() => (tinhTrang?.nguon ? void moDanhSach() : moDangNhap(''))} disabled={!tinhTrang} aria-haspopup="menu" aria-expanded={moMenu} title={tinhTrang?.nguon ? `Nguồn: ${NHAN_NGUON[tinhTrang.nguon]}. Bấm để chuyển sang tài khoản khác.` : 'Thiết lập tài khoản'}>
          {tinhTrang?.tenDangNhap ? <b>{tinhTrang.tenDangNhap}</b> : <span className="tk-qt__chua">Chưa thiết lập</span>}
          <span className="tk-qt__doi">Đổi ▾</span>
        </button>
        {moMenu && (
          <ul className="tk-menu__ds" role="menu" aria-label="Tài khoản đã đăng nhập">
            {ds.map((t) => {
              const dang = t.tenDangNhap.toLowerCase() === (tinhTrang?.tenDangNhap ?? '').toLowerCase();
              return (
                <li key={t.tenDangNhap} role="none" className={`tk-menu__dong${dang ? ' tk-menu__dong--dang' : ''}`}>
                  <button type="button" role="menuitem" className="tk-menu__chon" disabled={dangChuyen !== null} aria-current={dang ? 'true' : undefined}
                    onClick={() => { if (dang) setMoMenu(false); else void chuyen(t.tenDangNhap); }}>
                    <span className="tk-menu__dau" aria-hidden="true">{dang ? '✓' : ''}</span>
                    <span className="tk-menu__ten"><b>{t.tenDangNhap}</b><small>{t.hoTen || (t.vaiTro === 'truong_don_vi' ? 'Trưởng đơn vị' : 'Quản trị hệ thống')}</small></span>
                    <span className={`tk-menu__nhan${t.vaiTro === 'truong_don_vi' ? '' : ' tk-menu__nhan--qt'}`}>{t.vaiTro === 'truong_don_vi' ? 'Trưởng đơn vị' : 'Quản trị'}</span>
                    {dangChuyen === t.tenDangNhap && <span className="quay" aria-hidden="true" />}
                  </button>
                  {!dang && <button type="button" className="tk-menu__quen" onClick={() => void quen(t.tenDangNhap)} aria-label={`Quên tài khoản ${t.tenDangNhap}`} title="Quên tài khoản này (xóa mật khẩu đã nhớ)"><IcDong /></button>}
                  {loiMenu?.ten === t.tenDangNhap && (
                    <p className="tk-menu__loi" role="alert"><IcCanhBao />{loiMenu.noiDung} <button type="button" className="tk-menu__lien-ket" onClick={() => moDangNhap(t.tenDangNhap)}>Nhập lại mật khẩu</button></p>
                  )}
                </li>
              );
            })}
            <li role="none"><button type="button" role="menuitem" className="tk-menu__them" onClick={() => moDangNhap('')}><IcThem /> Đăng nhập tài khoản khác…</button></li>
          </ul>
        )}
      </div>

      <dialog ref={ref} className="hop-them" onClose={() => setMo(false)} aria-labelledby="tkqt-tieu-de">
        <h2 id="tkqt-tieu-de">Tài khoản đăng nhập</h2>
        <p className="phu">Tài khoản <b>Quản trị hệ thống</b> quét cây đơn vị và hồ sơ của mọi đơn vị. Tài khoản thường được phân công nhiều đơn vị (trưởng đơn vị) thì sau đăng nhập sẽ chọn đơn vị và kỳ để xem các đơn vị cấp dưới. Đăng nhập thử thành công mới lưu.</p>
        <form className="hop-them__luoi" onSubmit={(e) => { e.preventDefault(); if (hopLe) void luu(); }}>
          <label>
            <span>Tên đăng nhập <b className="loi-chu">*</b></span>
            <input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="tên đăng nhập" autoComplete="off" spellCheck={false} required />
          </label>
          <label>
            <span>Mật khẩu <b className="loi-chu">*</b></span>
            <OMatKhau nhan="Mật khẩu tài khoản quản trị" value={matKhau} onChange={setMatKhau} />
            <small>Đăng nhập thành công thì tài khoản được nhớ trên máy này (thư mục dữ liệu của ứng dụng, đã nằm trong .gitignore, chỉ người dùng máy đọc được) để lần sau chuyển nhanh không phải gõ lại. Không gửi đi đâu ngoài cổng. Có thể quên tài khoản trong danh sách bất cứ lúc nào.</small>
          </label>
          {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
          <div className="xn-nut">
            <button type="button" className="nut" onClick={() => setMo(false)} disabled={dangLuu}>Hủy</button>
            <button type="submit" className="nut nut--chinh" disabled={!hopLe}>{dangLuu ? <span className="quay" aria-hidden="true" /> : <IcKhoa />} Đăng nhập và ghi nhớ</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
