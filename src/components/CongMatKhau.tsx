import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { api, loiThanhChuoi } from '../api';
import logoCo from '../assets/logo-co.png';
import type { TinhTrangKhoa } from '../types';

const SO_O = 6;

export interface CongMatKhauProps {
  onMo: () => void;
}

type Pha = { loai: 'dang_tai' } | { loai: 'loi_tai'; thongBao: string } | { loai: 'nhap'; tt: TinhTrangKhoa } | { loai: 'khoa'; thongBao: string };

/** Màn hình nhập mã 6 số trước khi vào ứng dụng (cùng logic với cổng mật khẩu của vtvl_app: mã băm lấy từ máy chủ, tối đa 3 lần). */
export function CongMatKhau({ onMo }: CongMatKhauProps) {
  const [pha, setPha] = useState<Pha>({ loai: 'dang_tai' });
  const [ky, setKy] = useState<string[]>(Array(SO_O).fill(''));
  const [loi, setLoi] = useState<string | null>(null);
  const [dangKiem, setDangKiem] = useState(false);
  const [lac, setLac] = useState(false);
  const o = useRef<(HTMLInputElement | null)[]>([]);

  const tai = useCallback(async () => {
    setPha({ loai: 'dang_tai' });
    try {
      const tt = await api.khoiDongKhoa();
      if (tt.daMo) onMo(); else setPha({ loai: 'nhap', tt });
    } catch (e) { setPha({ loai: 'loi_tai', thongBao: loiThanhChuoi(e) }); }
  }, [onMo]);

  useEffect(() => { void tai(); }, [tai]);
  useEffect(() => { if (pha.loai === 'nhap') o.current[0]?.focus(); }, [pha.loai]);

  async function gui(chuSo: string[]) {
    setDangKiem(true);
    setLoi(null);
    try {
      const kq = await api.kiemTraMa(chuSo.join(''));
      if (kq.ok) { onMo(); return; }
      setLac(true);
      setTimeout(() => setLac(false), 400);
      if (kq.conLai <= 0) { setPha({ loai: 'khoa', thongBao: 'Nhập sai quá số lần cho phép. Hãy đóng và mở lại ứng dụng.' }); return; }
      setLoi(`Mã không đúng. Còn ${kq.conLai} lần thử.`);
      setKy(Array(SO_O).fill(''));
      o.current[0]?.focus();
    } catch (e) {
      setPha({ loai: 'khoa', thongBao: loiThanhChuoi(e) });
    } finally { setDangKiem(false); }
  }

  function datO(i: number, v: string) {
    const so = v.replace(/\D/g, '');
    if (!so) { setKy((k) => k.map((x, j) => (j === i ? '' : x))); return; }
    const moi = [...ky];
    [...so].slice(0, SO_O - i).forEach((c, j) => { moi[i + j] = c; });
    setKy(moi);
    const tiep = Math.min(i + so.length, SO_O - 1);
    o.current[tiep]?.focus();
    if (moi.every(Boolean) && !dangKiem) void gui(moi);
  }

  function phim(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !ky[i] && i > 0) { setKy((k) => k.map((x, j) => (j === i - 1 ? '' : x))); o.current[i - 1]?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) o.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < SO_O - 1) o.current[i + 1]?.focus();
  }

  function dan(e: ClipboardEvent<HTMLInputElement>) {
    const so = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, SO_O);
    if (!so) return;
    e.preventDefault();
    datO(0, so);
  }

  return (
    <main className="cong-mk">
      <section className="cong-mk__khung" aria-labelledby="cong-mk-tieu-de">
        <img className="logo" src={logoCo} alt="" width={54} height={36} />
        <h1 id="cong-mk-tieu-de">Xác thực</h1>
        {pha.loai === 'dang_tai' && <p className="cong-mk__phu" role="status"><span className="quay" aria-hidden="true" /> Đang lấy cấu hình mật khẩu…</p>}
        {pha.loai === 'loi_tai' && (
          <>
            <p className="thong-bao thong-bao--loi" role="alert">{pha.thongBao}</p>
            <button type="button" className="nut nut--chinh" onClick={() => { void tai(); }}>Thử lại</button>
          </>
        )}
        {pha.loai === 'khoa' && <p className="thong-bao thong-bao--loi" role="alert">{pha.thongBao}</p>}
        {pha.loai === 'nhap' && (
          <>
            <p className="cong-mk__phu">Nhập mã {SO_O} số để tiếp tục</p>
            <div className={`cong-mk__o${lac ? ' cong-mk__o--lac' : ''}`} role="group" aria-label="Mã xác thực 6 số">
              {ky.map((c, i) => (
                <input
                  key={i}
                  ref={(el) => { o.current[i] = el; }}
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={SO_O}
                  value={c}
                  disabled={dangKiem}
                  aria-label={`Chữ số ${i + 1}`}
                  onChange={(e) => datO(i, e.target.value)}
                  onKeyDown={(e) => phim(i, e)}
                  onPaste={dan}
                  onFocus={(e) => e.currentTarget.select()}
                />
              ))}
            </div>
            {loi && <p className="cong-mk__loi" role="alert">{loi}</p>}
            {pha.tt.tuBanSao && <p className="cong-mk__phu cong-mk__phu--nho" role="status">Không kết nối được máy chủ mật khẩu ({pha.tt.loiMang}); dùng bản đã lưu lần trước.</p>}
          </>
        )}
      </section>
    </main>
  );
}
