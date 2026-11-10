import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, loiThanhChuoi } from './api';
import logoCo from './assets/logo-co.png';
import { CongMatKhau } from './components/CongMatKhau';
import { ChonCauHinh, chonTepCauHinh } from './components/ChonCauHinh';
import { IcGui, IcKetNoi, IcMoTatCa, IcNguoi, IcThem, IcThuMuc, IcThuTatCa, IcTim } from './components/Icons';
import { ThemDonViDialog } from './components/ThemDonViDialog';
import { DIEU_KIEN, NHAN_LOC, type LocTrangThai } from './loc';
import { Tong } from './components/Tong';
import { UnitCard } from './components/UnitCard';
import type { DonVi, KetQuaGui } from './types';
import './styles.css';

const CHU_KY_MS = 1000;

/** Chuẩn hóa để tìm kiếm: bỏ dấu tiếng Việt, đ → d, chữ thường. */
const boDau = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const KHOA_DUONG_DAN = 'vtvl-batch.cau-hinh';

/** Nhớ tệp cấu hình đã chọn lần trước (chỉ tiện lợi; bộ nhớ trình duyệt có thể không dùng được). */
function docDuongDanCu(): string {
  try { return localStorage.getItem(KHOA_DUONG_DAN) ?? ''; } catch { return ''; }
}
function nhoDuongDan(p: string): void {
  try { localStorage.setItem(KHOA_DUONG_DAN, p); } catch { /* bỏ qua */ }
}

export default function App() {
  const [daMo, setDaMo] = useState(false); // đã qua cổng mật khẩu khởi động
  const [duongDan, setDuongDan] = useState(docDuongDanCu);
  const [nguoi, setNguoi] = useState('');
  const [don, setDon] = useState<DonVi[]>([]);
  const [dangBan, setDangBan] = useState<ReadonlySet<string>>(new Set());
  const [toanCuc, setToanCuc] = useState(false);
  const [thongBao, setThongBao] = useState<string | null>(null);
  const [xacNhan, setXacNhan] = useState(false);
  const [moThem, setMoThem] = useState(false);
  const [tim, setTim] = useState('');
  const [dangMo, setDangMo] = useState<ReadonlySet<string>>(new Set()); // đơn vị đang mở rộng; mặc định (kể cả đơn vị mới thêm) là thu gọn
  const [loc, setLoc] = useState<LocTrangThai | null>(null);
  const hopXacNhan = useRef<HTMLDialogElement>(null);

  const lamMoi = useCallback(async () => {
    try { setDon(await api.trangThai()); } catch { /* chưa nạp lô */ }
  }, []);

  useEffect(() => {
    if (!daMo) return undefined;
    const t = setInterval(() => { void lamMoi(); }, CHU_KY_MS);
    return () => clearInterval(t);
  }, [lamMoi, daMo]);

  useEffect(() => {
    const d = hopXacNhan.current;
    if (!d) return;
    if (xacNhan && !d.open) d.showModal();
    if (!xacNhan && d.open) d.close();
  }, [xacNhan]);

  const chay = useCallback(async (username: string, viec: () => Promise<unknown>) => {
    setDangBan((s) => new Set(s).add(username));
    setThongBao(null);
    try { await viec(); } catch (e) { setThongBao(`${username}: ${loiThanhChuoi(e)}`); } finally {
      setDangBan((s) => { const n = new Set(s); n.delete(username); return n; });
      await lamMoi();
    }
  }, [lamMoi]);

  const bat = useMemo(() => don.filter((d) => d.enabled), [don]);
  const daKiemTraKetNoi = bat.length > 0 && bat.every((d) => d.ketNoi !== null);
  const sanSang = useMemo(() => bat.filter((d) => d.trangThai.buoc === 'san_sang_gui' && (d.trangThai.thayDoi?.tong ?? 0) > 0), [bat]);
  const tong = useMemo(() => sanSang.reduce((a, d) => ({ tao: a.tao + (d.trangThai.thayDoi?.tao ?? 0), sua: a.sua + (d.trangThai.thayDoi?.sua ?? 0), bo: a.bo + (d.trangThai.thayDoi?.bo ?? 0) }), { tao: 0, sua: 0, bo: 0 }), [sanSang]);
  const hienThi = useMemo(() => {
    const k = boDau(tim.trim());
    const theoTrangThai = loc ? don.filter(DIEU_KIEN[loc]) : don;
    return k ? theoTrangThai.filter((d) => boDau(`${d.label} ${d.taiKhoan?.donVi ?? ''} ${d.username}`).includes(k)) : theoTrangThai;
  }, [don, tim, loc]);
  const tatCaDong = don.length > 0 && don.every((d) => !dangMo.has(d.username));
  const doiMoRong = (username: string, mo: boolean) => setDangMo((s) => { const n = new Set(s); if (mo) n.add(username); else n.delete(username); return n; });
  const bao = toanCuc || dangBan.size > 0;

  const napLo = useCallback(async (p: string) => {
    setThongBao(null);
    try { setDon(await api.nap(p)); nhoDuongDan(p); setNguoi(await api.layNguoi()); } catch (e) { setThongBao(loiThanhChuoi(e)); }
  }, []);

  useEffect(() => {
    if (!daMo) return;
    const cu = docDuongDanCu();
    if (cu) void napLo(cu); // mở lại ứng dụng: nạp ngay tệp đã chọn lần trước
  }, [napLo, daMo]);

  async function kiemTraTatCa() {
    setToanCuc(true);
    setThongBao(null);
    try { setDon(await api.kiemTraKetNoiTatCa()); } catch (e) { setThongBao(loiThanhChuoi(e)); } finally { setToanCuc(false); }
  }

  async function guiTatCa() {
    setXacNhan(false);
    setToanCuc(true);
    try {
      const kq: KetQuaGui[] = await api.guiTatCa(sanSang.map((d) => ({ username: d.username, soThayDoi: d.trangThai.thayDoi?.tong ?? 0 })));
      const loi = kq.filter((k) => !k.ok).map((k) => `${k.username}: ${k.loi ?? 'lỗi'}`);
      setThongBao(loi.length ? loi.join(' · ') : null);
    } catch (e) { setThongBao(loiThanhChuoi(e)); } finally { setToanCuc(false); await lamMoi(); }
  }

  if (!daMo) return <CongMatKhau onMo={() => setDaMo(true)} />;

  return (
    <div className="ung-dung">
      <div className="dau-trang">
        <header className="thanh-tren">
          <div className="thuong-hieu">
            <img className="logo" src={logoCo} alt="" width={54} height={36} />
            <div>
              <h1>VTVL Batch</h1>
              <p>Đồng bộ nhiều đơn vị · Gửi hồ sơ hàng loạt</p>
            </div>
          </div>
          {don.length > 0 && <Tong don={don} loc={loc} onLoc={setLoc} />}
          <label className="nguoi">
            <span className="nhan-truong"><IcNguoi /> Người vận hành</span>
            <input value={nguoi} onChange={(e) => { setNguoi(e.target.value); void api.datNguoi(e.target.value); }} placeholder="Họ và tên người xác nhận gửi" autoComplete="name" />
          </label>
        </header>

        <section className="bang-dieu-khien" aria-label="Điều khiển lô">
          <ChonCauHinh duongDan={duongDan} dangBan={bao} onChon={(p) => { setDuongDan(p); void napLo(p); }} onNapLai={() => { void napLo(duongDan); }} />
          {don.length > 0 && (
            <label className="tim-kiem">
              <IcTim aria-hidden="true" />
              <input type="search" value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm đơn vị, tài khoản…" aria-label="Tìm đơn vị" autoComplete="off" spellCheck={false} />
              {(tim || loc) && <span className="tim-kiem__dem">{hienThi.length}/{don.length}</span>}
            </label>
          )}
          {don.length > 0 && (
            <button type="button" className="nut" onClick={() => setDangMo(tatCaDong ? new Set(don.map((d) => d.username)) : new Set())} title={tatCaDong ? 'Mở rộng tất cả thẻ đơn vị' : 'Thu gọn tất cả thẻ đơn vị, chỉ giữ phần đầu'}>
              {tatCaDong ? <IcMoTatCa /> : <IcThuTatCa />} {tatCaDong ? 'Mở rộng tất cả' : 'Thu gọn tất cả'}
            </button>
          )}
          <div className="hanh-dong-chinh">
            <button type="button" className="nut" onClick={() => setMoThem(true)} disabled={bao} title={don.length === 0 ? 'Chọn tệp JSON của lô trước' : 'Thêm đơn vị vào tệp JSON của lô'}><IcThem /> Thêm đơn vị</button>
            <button type="button" className="nut" onClick={() => { void kiemTraTatCa(); }} disabled={bao || bat.length === 0}>
              {toanCuc ? <span className="quay" aria-hidden="true" /> : <IcKetNoi />} Kiểm tra kết nối tất cả
            </button>
            <button type="button" className="nut nut--cta" onClick={() => setXacNhan(true)} disabled={bao || !daKiemTraKetNoi || sanSang.length === 0 || !nguoi.trim()} title={!daKiemTraKetNoi ? 'Kiểm tra kết nối tất cả trước' : !nguoi.trim() ? 'Nhập tên người vận hành' : undefined}>
              <IcGui /> Gửi tất cả <span className="dem">{sanSang.length}</span>
            </button>
          </div>
        </section>
      </div>

      {thongBao && <p className="thong-bao thong-bao--loi" role="alert">{thongBao}</p>}

      {don.length === 0 ? (
        <section className="rong" aria-labelledby="rong-tieu-de">
          <span className="rong__icon" aria-hidden="true"><IcThuMuc /></span>
          <h2 id="rong-tieu-de">Chưa nạp lô đơn vị</h2>
          <p>Chọn tệp JSON khai báo danh sách đơn vị (xem <code>config/lo.example.json</code>) để bắt đầu.</p>
          <ol className="rong__buoc">
            <li><b>1</b> Chọn tệp cấu hình và dán cookie từng đơn vị</li>
            <li><b>2</b> Kiểm tra kết nối tất cả</li>
            <li><b>3</b> Chuẩn bị từng đơn vị, xem thay đổi</li>
            <li><b>4</b> Gửi tất cả hoặc gửi từng đơn vị</li>
          </ol>
          <button type="button" className="nut nut--chinh" onClick={() => { void chonTepCauHinh().then((p) => { if (p) { setDuongDan(p); void napLo(p); } }); }}><IcThuMuc /> Chọn tệp JSON…</button>
        </section>
      ) : (
        <main className="danh-sach">
          {hienThi.length === 0 && <p className="rong-tim">Không có đơn vị nào khớp{loc ? ` trạng thái “${NHAN_LOC[loc]}”` : ''}{tim.trim() ? ` “${tim.trim()}”` : ''}.</p>}
          {hienThi.map((d) => (
            <UnitCard
              key={d.username}
              don={d}
              dangBan={dangBan.has(d.username) || toanCuc}
              onCookie={async (c) => { try { await api.datCookie(d.username, c); await lamMoi(); } catch (e) { setThongBao(loiThanhChuoi(e)); } }}
              onDangNhap={() => { void chay(d.username, () => api.dangNhap(d.username)); }}
              onChonHoSo={(id) => { void chay(d.username, () => api.chonHoSo(d.username, id)); }}
              onChonExcel={(p) => { void chay(d.username, () => api.chonExcel(d.username, p)); }}
              nguoi={nguoi}
              onXoaXong={() => { void lamMoi(); }}
              onChuanBi={() => { void chay(d.username, () => api.chuanBi(d.username)); }}
              onGui={() => { void chay(d.username, () => api.gui(d.username, d.trangThai.thayDoi?.tong ?? 0)); }}
              onGuiLai={() => { void chay(d.username, () => api.guiLai(d.username)); }}
              onDonViDoi={setDon}
              moRong={dangMo.has(d.username)}
              onDoiMoRong={(mo) => doiMoRong(d.username, mo)}
            />
          ))}
        </main>
      )}

      <ThemDonViDialog open={moThem} daNapLo={duongDan !== '' && don.length > 0} onClose={() => setMoThem(false)} onXong={setDon} onCanhBao={setThongBao} />

      <dialog ref={hopXacNhan} onClose={() => setXacNhan(false)} aria-labelledby="xn-tieu-de">
        <h2 id="xn-tieu-de">Gửi thay đổi lên cổng?</h2>
        <p className="xn-so"><b>{sanSang.length}</b> đơn vị · tạo <b>{tong.tao}</b> · sửa <b>{tong.sua}</b> · <b className={tong.bo > 0 ? 'loi-chu' : ''}>xóa {tong.bo}</b> dòng</p>
        {tong.bo > 0 && <p className="thong-bao thong-bao--loi" role="alert"><IcKetNoi />Có thay đổi XÓA dòng đang có trên máy chủ. Kiểm tra kỹ tệp Excel trước khi gửi.</p>}
        <p className="phu">Người xác nhận: <b>{nguoi || '(chưa nhập)'}</b>. Hệ thống chỉ đẩy gói thay đổi, không nộp hồ sơ.</p>
        <form method="dialog" className="xn-nut">
          <button className="nut" value="huy">Hủy</button>
          <button type="button" className="nut nut--cta" onClick={() => { void guiTatCa(); }}><IcGui /> Xác nhận gửi</button>
        </form>
      </dialog>
    </div>
  );
}
