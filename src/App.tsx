import { useCallback, useEffect, useState } from 'react';
import { api, loiThanhChuoi } from './api';
import logoCo from './assets/logo-co.png';
import { CongMatKhau } from './components/CongMatKhau';
import { ChonCauHinh } from './components/ChonCauHinh';
import { HopDonVi } from './components/HopDonVi';
import { IcNguoi } from './components/Icons';
import { QuanTriPage } from './components/QuanTriPage';
import { UnitCard } from './components/UnitCard';
import { docLichSu, ghiLichSu, themLichSu, xoaMucLichSu, type MucLichSu } from './lichSuLo';
import type { DonVi } from './types';
import './styles.css';

const CHU_KY_MS = 1000;
const KHOA_DUONG_DAN = 'vtvl-batch.cau-hinh';

/** Nhớ tệp cấu hình đã chọn lần trước (chỉ tiện lợi; bộ nhớ trình duyệt có thể không dùng được). */
function docDuongDanCu(): string {
  try { return localStorage.getItem(KHOA_DUONG_DAN) ?? ''; } catch { return ''; }
}
function nhoDuongDan(p: string): void {
  try { localStorage.setItem(KHOA_DUONG_DAN, p); } catch { /* bỏ qua */ }
}

/** Nhánh admin: cả ứng dụng là trang Quản trị toàn màn hình. Lô đơn vị chỉ được nạp ngầm (lấy tài khoản quản trị và để mở thẻ đơn vị trong hộp thoại). */
export default function App() {
  const [daMo, setDaMo] = useState(true); // NHÁNH ADMIN: tạm bỏ cổng mật khẩu khởi động (đặt false để bật lại; Rust: TAM_BO_MAT_KHAU_KHOI_DONG)
  const [duongDan, setDuongDan] = useState(docDuongDanCu);
  const [daNapLo, setDaNapLo] = useState(false);
  const [nguoi, setNguoi] = useState('');
  const [don, setDon] = useState<DonVi[]>([]);
  const [dangBan, setDangBan] = useState<ReadonlySet<string>>(new Set());
  const [thongBao, setThongBao] = useState<string | null>(null);
  const [lichSu, setLichSu] = useState<MucLichSu[]>(docLichSu);
  const [donMo, setDonMo] = useState<string | null>(null); // tên đăng nhập của đơn vị đang mở trong hộp thoại

  const lamMoi = useCallback(async () => {
    try { setDon(await api.trangThai()); } catch { /* chưa nạp lô */ }
  }, []);

  useEffect(() => {
    if (!daMo) return undefined;
    const t = setInterval(() => { void lamMoi(); }, CHU_KY_MS);
    return () => clearInterval(t);
  }, [lamMoi, daMo]);

  const chay = useCallback(async (username: string, viec: () => Promise<unknown>) => {
    setDangBan((s) => new Set(s).add(username));
    setThongBao(null);
    try { await viec(); } catch (e) { setThongBao(`${username}: ${loiThanhChuoi(e)}`); } finally {
      setDangBan((s) => { const n = new Set(s); n.delete(username); return n; });
      await lamMoi();
    }
  }, [lamMoi]);

  const napLo = useCallback(async (p: string) => {
    setThongBao(null);
    try {
      const ds = await api.nap(p);
      setDon(ds);
      setDaNapLo(true);
      nhoDuongDan(p);
      setLichSu((cu) => { const moi = themLichSu(cu, { duongDan: p, luc: new Date().toISOString(), soDonVi: ds.length }); ghiLichSu(moi); return moi; });
      setNguoi(await api.layNguoi());
    } catch (e) { setThongBao(loiThanhChuoi(e)); }
  }, []);

  const capNhatLichSu = (moi: MucLichSu[]) => { setLichSu(moi); ghiLichSu(moi); };

  useEffect(() => {
    if (!daMo) return;
    const cu = docDuongDanCu();
    if (cu) { void napLo(cu); return; } // mở lại ứng dụng: nạp ngay tệp đã chọn lần trước
    void api.khoiTaoLoTrong().then((p) => { setDuongDan(p); return napLo(p); }).catch((e) => setThongBao(loiThanhChuoi(e)));
  }, [napLo, daMo]);

  /** Đơn vị trong lô có tên đăng nhập trùng một tài khoản của hồ sơ (khớp không phân biệt hoa thường). */
  const timDonVi = useCallback((taiKhoan: readonly string[]): DonVi | undefined => {
    const t = new Set(taiKhoan.map((x) => x.toLowerCase()));
    return don.find((d) => t.has(d.username.toLowerCase()));
  }, [don]);

  if (!daMo) return <CongMatKhau onMo={() => setDaMo(true)} />;
  const donChon = don.find((d) => d.username === donMo);

  return (
    <div className="ung-dung ung-dung--qt">
      <header className="thanh-tren thanh-tren--qt">
        <div className="thuong-hieu">
          <img className="logo" src={logoCo} alt="" width={54} height={36} />
          <div>
            <h1>VTVL Batch · Quản trị</h1>
            <p>Thẩm định bộ biểu của mọi đơn vị trong kỳ hiện tại</p>
          </div>
        </div>
        <div className="thanh-tren__phai">
          <ChonCauHinh duongDan={duongDan} dangBan={dangBan.size > 0} onChon={(p) => { setDuongDan(p); void napLo(p); }} onNapLai={() => { void napLo(duongDan); }} lichSu={lichSu} onChonLichSu={(p) => { setDuongDan(p); void napLo(p); }} onXoaLichSu={(p) => capNhatLichSu(xoaMucLichSu(lichSu, p))} onXoaHetLichSu={() => capNhatLichSu([])} />
          <label className="nguoi">
            <span className="nhan-truong"><IcNguoi /> Người vận hành</span>
            <input value={nguoi} onChange={(e) => { setNguoi(e.target.value); void api.datNguoi(e.target.value); }} placeholder="Họ và tên người xác nhận" autoComplete="name" />
          </label>
        </div>
      </header>

      {thongBao && <p className="thong-bao thong-bao--loi" role="alert">{thongBao}</p>}

      <QuanTriPage daNapLo={daNapLo} timDonVi={timDonVi} onQuanTri={setDonMo} />

      <HopDonVi open={donChon !== undefined} tieuDe={donChon?.label || donChon?.username || ''} onClose={() => setDonMo(null)}>
        {donChon && (
          <UnitCard
            don={donChon}
            dangBan={dangBan.has(donChon.username)}
            onCookie={async (c) => { try { await api.datCookie(donChon.username, c); await lamMoi(); } catch (e) { setThongBao(loiThanhChuoi(e)); } }}
            onDangNhap={() => { void chay(donChon.username, () => api.dangNhap(donChon.username)); }}
            onChonHoSo={(id) => { void chay(donChon.username, () => api.chonHoSo(donChon.username, id)); }}
            onChonExcel={(p) => { void chay(donChon.username, () => api.chonExcel(donChon.username, p)); }}
            nguoi={nguoi}
            onXoaXong={() => { void lamMoi(); }}
            onChuanBi={() => { void chay(donChon.username, () => api.chuanBi(donChon.username)); }}
            onGui={() => { void chay(donChon.username, () => api.gui(donChon.username, donChon.trangThai.thayDoi?.tong ?? 0)); }}
            onGuiLai={() => { void chay(donChon.username, () => api.guiLai(donChon.username)); }}
            onGuiBuoc8={() => { void chay(donChon.username, () => api.guiBuoc8(donChon.username)); }}
            onDonViDoi={setDon}
            moRong
            onDoiMoRong={() => undefined}
          />
        )}
      </HopDonVi>
    </div>
  );
}
