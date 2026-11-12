import { useEffect, useMemo, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { CayDonVi, DongBaoCao, DonVi, KetQuaTao, NutCay } from '../types';
import { IcCanhBao, IcSaoChep, IcThem, IcTim } from './Icons';

const TOI_DA_HIEN = 40;
const hai = (n: number) => String(n).padStart(2, '0');
/** Tên tệp báo cáo theo thời điểm mở hộp thoại: TaiKhoan_YYYYMMDD_HHMMSS. */
const tenTepMoi = () => { const d = new Date(); return `TaiKhoan_${d.getFullYear()}${hai(d.getMonth() + 1)}${hai(d.getDate())}_${hai(d.getHours())}${hai(d.getMinutes())}${hai(d.getSeconds())}`; };
const boDau = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export interface TaoTaiKhoanDialogProps {
  open: boolean;
  daNapLo: boolean;
  onClose: () => void;
  /** Lô vừa được thêm đơn vị mới. */
  onXong: (ds: DonVi[]) => void;
}

/** Hộp thoại tạo đơn vị con + tài khoản kê khai trên cổng bằng tài khoản quản trị (cấu hình `settings.taiKhoanQuanTri`). */
export function TaoTaiKhoanDialog({ open, daNapLo, onClose, onXong }: TaoTaiKhoanDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [cay, setCay] = useState<CayDonVi | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [tim, setTim] = useState('');
  const [cha, setCha] = useState<NutCay | null>(null);
  const [ten, setTen] = useState('');
  const [tenDn, setTenDn] = useState('');
  const [ma, setMa] = useState('');
  const [themVaoLo, setThemVaoLo] = useState(true);
  const [dangTao, setDangTao] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [kq, setKq] = useState<KetQuaTao | null>(null);
  const [daChep, setDaChep] = useState(false);
  const [daTao, setDaTao] = useState<DongBaoCao[]>([]);
  const [tenTep, setTenTep] = useState(tenTepMoi);
  const [duongBaoCao, setDuongBaoCao] = useState<string | null>(null);
  const [loiBaoCao, setLoiBaoCao] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTim(''); setCha(null); setTen(''); setTenDn(''); setMa(''); setThemVaoLo(true); setLoi(null); setKq(null); setDaChep(false); setCay(null); setDaTao([]); setTenTep(tenTepMoi()); setDuongBaoCao(null); setLoiBaoCao(null);
      d.showModal();
      setDangTai(true);
      api.tqLayCay().then(setCay).catch((e) => setLoi(loiThanhChuoi(e))).finally(() => setDangTai(false));
    }
    if (!open && d.open) d.close();
  }, [open]);

  const goiY = useMemo(() => {
    if (!cay) return [];
    const k = boDau(tim.trim());
    if (!k) return [];
    return cay.nut.filter((n) => boDau(`${n.ten} ${n.ma}`).includes(k)).slice(0, TOI_DA_HIEN);
  }, [cay, tim]);

  const tenDnChuan = tenDn.trim().toLowerCase();
  const trungTenDn = !!cay && tenDnChuan !== '' && cay.tenDangNhap.some((u) => u.toLowerCase() === tenDnChuan);
  const hopLe = !!cha && ten.trim() !== '' && tenDnChuan !== '' && !trungTenDn && !dangTao && !kq;

  async function tao() {
    if (!cha) return;
    setDangTao(true); setLoi(null);
    try {
      const r = await api.tqTao({ chaId: cha.id, ten: ten.trim(), ma: ma.trim(), tenDangNhap: tenDnChuan }, themVaoLo && daNapLo);
      setKq(r);
      if (r.donVi) onXong(r.donVi);
      await xuatBaoCao([...daTao, { ten: ten.trim(), taiKhoan: r.tenDangNhap, matKhau: r.matKhau }]);
    } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangTao(false); }
  }

  /** Ghi lại toàn bộ tài khoản đã tạo trong phiên này ra một tệp Excel (Tên đơn vị | Tài khoản | Mật khẩu). */
  async function xuatBaoCao(ds: DongBaoCao[]) {
    setDaTao(ds); setLoiBaoCao(null);
    try { setDuongBaoCao(await api.tqXuatExcel(ds, tenTep)); } catch (e) { setLoiBaoCao(loiThanhChuoi(e)); }
  }

  function taoThem() {
    setKq(null); setCha(cha); setTen(''); setTenDn(''); setMa(''); setLoi(null); setDaChep(false);
    setCay((c) => c && kq ? { ...c, tenDangNhap: [...c.tenDangNhap, kq.tenDangNhap] } : c);
  }

  async function chep() {
    if (!kq) return;
    try { await navigator.clipboard.writeText(`${kq.tenDangNhap} / ${kq.matKhau}`); setDaChep(true); } catch { setDaChep(false); }
  }

  return (
    <dialog ref={ref} className="hop-them" onClose={onClose} aria-labelledby="tq-tieu-de">
      <h2 id="tq-tieu-de">Tạo tài khoản</h2>
      <p className="phu">Tạo đơn vị con dưới đơn vị cha và một tài khoản (Đầu mối dữ liệu + Cán bộ kê khai) trên cổng <b>thật</b>, bằng tài khoản quản trị trong cấu hình.</p>
      {kq ? (
        <div className="hop-them__luoi" role="status">
          <p className="thong-bao thong-bao--ok">{kq.donViMoi ? 'Đã tạo đơn vị' : 'Dùng lại đơn vị có sẵn'} <b>{kq.ma}</b> và tạo tài khoản <b>{kq.tenDangNhap}</b>.</p>
          {kq.matKhau ? (
            <label>
              <span>Mật khẩu tạm (chỉ hiện một lần)</span>
              <input readOnly value={kq.matKhau} onFocus={(e) => e.currentTarget.select()} aria-label="Mật khẩu tạm của tài khoản mới" />
            </label>
          ) : <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />Cổng không trả mật khẩu tạm: cần đặt lại mật khẩu trên cổng.</p>}
          {kq.donVi && <p className="phu">Đã thêm tài khoản vào lô JSON (kèm mật khẩu) để dùng ngay.</p>}
          {duongBaoCao && <p className="phu">Báo cáo Excel ({daTao.length} tài khoản trong phiên này): <code title={duongBaoCao}>{duongBaoCao}</code></p>}
          {loiBaoCao && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />Chưa xuất được báo cáo Excel: {loiBaoCao}</p>}
          <div className="xn-nut">
            <button type="button" className="nut" onClick={taoThem}><IcThem /> Tạo thêm</button>
            {kq.matKhau && <button type="button" className="nut" onClick={() => { void chep(); }}><IcSaoChep /> {daChep ? 'Đã chép' : 'Chép tài khoản / mật khẩu'}</button>}
            <button type="button" className="nut nut--chinh" onClick={onClose}>Xong</button>
          </div>
        </div>
      ) : (
        <form className="hop-them__luoi" onSubmit={(e) => { e.preventDefault(); if (hopLe) void tao(); }}>
          <label>
            <span>Đơn vị cha <b className="loi-chu">*</b></span>
            {cha ? (
              <span className="hop-them__tep-hang">
                <span className="hop-them__tep-ten" title={cha.ten}>{cha.ten} <span className="phu">({cha.ma})</span></span>
                <button type="button" className="nut nut--gon" onClick={() => { setCha(null); setTim(''); }}>Đổi…</button>
              </span>
            ) : (
              <>
                <span className="tim-kiem tim-kiem--hop">
                  <IcTim aria-hidden="true" />
                  <input type="search" value={tim} onChange={(e) => setTim(e.target.value)} placeholder={dangTai ? 'Đang tải cây đơn vị từ cổng…' : 'Gõ tên hoặc mã đơn vị cha…'} disabled={!cay} autoComplete="off" spellCheck={false} aria-label="Tìm đơn vị cha" />
                </span>
                {goiY.length > 0 && (
                  <ul className="goi-y" role="listbox" aria-label="Đơn vị cha gợi ý">
                    {goiY.map((n) => (
                      <li key={n.id} role="option" aria-selected={false}>
                        <button type="button" onClick={() => setCha(n)}><span>{n.ten}</span><small>{n.ma}</small></button>
                      </li>
                    ))}
                  </ul>
                )}
                {cay && tim.trim() !== '' && goiY.length === 0 && <small>Không có đơn vị nào khớp.</small>}
              </>
            )}
          </label>
          <label>
            <span>Tên đơn vị <b className="loi-chu">*</b></span>
            <input value={ten} onChange={(e) => setTen(e.target.value)} placeholder="vd: Trường Mầm non Khánh Hội" autoComplete="off" required />
          </label>
          <label>
            <span>Tên đăng nhập <b className="loi-chu">*</b></span>
            <input value={tenDn} onChange={(e) => setTenDn(e.target.value)} placeholder="vd: khanhhoi_mn" autoComplete="off" spellCheck={false} required aria-invalid={trungTenDn} />
            {trungTenDn && <small className="loi-chu">Tên đăng nhập này đã có trên cổng.</small>}
          </label>
          <label>
            <span>Mã đơn vị</span>
            <input value={ma} onChange={(e) => setMa(e.target.value)} placeholder="Để trống: tự sinh mã kế tiếp dưới đơn vị cha" autoComplete="off" spellCheck={false} />
            <small>Nếu đã có đơn vị con cùng tên dưới đơn vị cha, tài khoản được gắn vào đơn vị đó (không tạo trùng).</small>
          </label>
          <div className="hop-them__kiem">
            <input id="tq-them-lo" type="checkbox" checked={themVaoLo && daNapLo} disabled={!daNapLo} onChange={(e) => setThemVaoLo(e.target.checked)} />
            <label htmlFor="tq-them-lo">Thêm luôn tài khoản vào lô JSON (kèm mật khẩu tạm)</label>
          </div>
          {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
          <div className="xn-nut">
            <button type="button" className="nut" onClick={onClose} disabled={dangTao}>Hủy</button>
            <button type="submit" className="nut nut--chinh" disabled={!hopLe}>{dangTao ? <span className="quay" aria-hidden="true" /> : <IcThem />} Tạo trên cổng</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
