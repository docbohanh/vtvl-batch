import { useCallback, useEffect, useState } from 'react';
import { api, loiThanhChuoi } from './api';
import logoCo from './assets/logo-co.png';
import { docLichSu, ghiLichSu, themLichSu, type MucLichSu } from './lichSuLo';
import { DangNhapDonViDialog } from './components/DangNhapDonViDialog';
import { CapNhatPhienBan } from './components/CapNhatPhienBan';
import { BaoCaoMenu } from './components/BaoCaoMenu';
import { CongMatKhau } from './components/CongMatKhau';
import { HopDonVi } from './components/HopDonVi';
import { IcNguoi, IcThuMuc } from './components/Icons';
import { LoPage } from './components/LoPage';
import { Tong } from './components/Tong';
import type { LocTrangThai } from './loc';
import { TaiKhoanQuanTri } from './components/TaiKhoanQuanTri';
import { QuanTriPage } from './components/QuanTriPage';
import { UnitCard } from './components/UnitCard';
import type { DonVi, HoSoQt, TinhTrangTaiKhoanQt } from './types';
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
  const [trang, setTrang] = useState<'quan_tri' | 'lo'>('quan_tri'); // trang Quản trị luôn được giữ nguyên trạng thái khi xem giao diện lô
  const [loc, setLoc] = useState<LocTrangThai | null>(null); // bộ lọc trạng thái của giao diện lô (cụm chip ở đầu trang)
  const [lichSu, setLichSu] = useState<MucLichSu[]>(docLichSu);
  const [daNapLo, setDaNapLo] = useState(false);
  const [nguoi, setNguoi] = useState('');
  const [don, setDon] = useState<DonVi[]>([]);
  const [dangBan, setDangBan] = useState<ReadonlySet<string>>(new Set());
  const [thongBao, setThongBao] = useState<string | null>(null);
  const [tkQuanTri, setTkQuanTri] = useState<TinhTrangTaiKhoanQt | null>(null);
  const [lanDoiTaiKhoan, setLanDoiTaiKhoan] = useState(0); // tăng mỗi lần thiết lập tài khoản quản trị mới: quét lại cây đơn vị
  const [donMo, setDonMo] = useState<string | null>(null); // tên đăng nhập của đơn vị đang mở trong hộp thoại
  const [hoSoHoiMk, setHoSoHoiMk] = useState<HoSoQt | null>(null); // hồ sơ của đơn vị chưa có trong lô: đang hỏi tài khoản + mật khẩu

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

  // đọc tài khoản quản trị đang dùng khi đã có lô
  useEffect(() => {
    if (!daNapLo) return;
    api.qtTaiKhoan().then(setTkQuanTri).catch((e) => setThongBao(loiThanhChuoi(e)));
  }, [daNapLo]);

  useEffect(() => {
    if (!daMo) return;
    const cu = docDuongDanCu();
    if (cu) { void napLo(cu); return; } // mở lại ứng dụng: nạp ngay tệp đã chọn lần trước
    void api.khoiTaoLoTrong().then((p) => { setDuongDan(p); return napLo(p); }).catch((e) => setThongBao(loiThanhChuoi(e)));
  }, [napLo, daMo]);

  /** Nút Quản trị: đơn vị đã có trong lô (khớp tên đăng nhập, không phân biệt hoa thường) thì mở thẻ ngay, chưa có thì hỏi tài khoản và mật khẩu. */
  const moDonVi = useCallback((hoSo: HoSoQt) => {
    const t = new Set(hoSo.taiKhoan.map((x) => x.toLowerCase()));
    const co = don.find((d) => t.has(d.username.toLowerCase()));
    if (co) setDonMo(co.username); else setHoSoHoiMk(hoSo);
  }, [don]);

  /** Thêm đơn vị vào lô như "Thêm đơn vị", mở thẻ và kiểm tra kết nối (đăng nhập) ngay. */
  const themDonViRoiMo = useCallback(async (d: { username: string; label: string; password: string }) => {
    const co = don.find((x) => x.username.toLowerCase() === d.username);
    if (!co) setDon(await api.themDonVi({ ...d, excelFile: '', duong: '' }));
    setDonMo(d.username);
    void chay(d.username, () => api.dangNhap(d.username));
  }, [don, chay]);

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
        {trang === 'lo' && don.length > 0 && <div className="thanh-tren__giua"><Tong don={don} loc={loc} onLoc={setLoc} /></div>}
        <div className="thanh-tren__phai">
          <BaoCaoMenu />
          <CapNhatPhienBan />
          <TaiKhoanQuanTri tinhTrang={tkQuanTri} onXong={(tt) => { setTkQuanTri(tt); setLanDoiTaiKhoan((n) => n + 1); }} />
          <div className="tk-qt">
            <span className="nhan-truong"><IcThuMuc /> Batch JSON</span>
            <button type="button" className={`nut tk-qt__nut${trang === 'lo' ? ' nut--chinh' : ''}`} aria-pressed={trang === 'lo'} onClick={() => setTrang((t) => (t === 'lo' ? 'quan_tri' : 'lo'))} title={trang === 'lo' ? 'Quay lại trang Quản trị' : 'Xem giao diện theo lô (tệp JSON): thêm đơn vị, kiểm tra kết nối, chuẩn bị, gửi'}>
              {trang === 'lo' ? '← Về Quản trị' : 'Xem giao diện json'}
            </button>
          </div>
          <label className="nguoi">
            <span className="nhan-truong"><IcNguoi /> Người vận hành</span>
            <input value={nguoi} onChange={(e) => { setNguoi(e.target.value); void api.datNguoi(e.target.value); }} placeholder="Họ và tên người xác nhận" autoComplete="name" />
          </label>
        </div>
      </header>

      {trang === 'quan_tri' && thongBao && <p className="thong-bao thong-bao--loi" role="alert">{thongBao}</p>}

      <div className="trang-khung" hidden={trang !== 'quan_tri'}>
        <QuanTriPage daNapLo={daNapLo} lanDoiTaiKhoan={lanDoiTaiKhoan} onQuanTri={moDonVi} />
      </div>
      {trang === 'lo' && (
        <div className="trang-khung trang-khung--cuon">
          <LoPage daNapLo={daNapLo} duongDan={duongDan} don={don} setDon={setDon} dangBan={dangBan} nguoi={nguoi} thongBao={thongBao} setThongBao={setThongBao} lamMoi={lamMoi} chay={chay} napLo={napLo} setDuongDan={setDuongDan} loc={loc} lichSu={lichSu} capNhatLichSu={capNhatLichSu} />
        </div>
      )}
      <DangNhapDonViDialog hoSo={hoSoHoiMk} onClose={() => setHoSoHoiMk(null)} onXacNhan={themDonViRoiMo} />

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
