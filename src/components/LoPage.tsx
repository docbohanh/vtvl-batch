import { useEffect, useMemo, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import { DIEU_KIEN, NHAN_LOC, type LocTrangThai } from '../loc';
import type { MucLichSu } from '../lichSuLo';
import { xoaMucLichSu } from '../lichSuLo';
import { boDau } from '../quanTri';
import type { DonVi, KetQuaGui } from '../types';
import { ChonCauHinh, chonTepCauHinh } from './ChonCauHinh';
import { IcGui, IcKetNoi, IcKiemTra, IcMoTatCa, IcNguoi, IcThem, IcThuMuc, IcThuTatCa, IcTim } from './Icons';
import { TaoTaiKhoanDialog } from './TaoTaiKhoanDialog';
import { ThemDonViDialog } from './ThemDonViDialog';
import { UnitCard } from './UnitCard';

export interface LoPageProps {
  daNapLo: boolean;
  duongDan: string;
  don: DonVi[];
  setDon: (ds: DonVi[]) => void;
  dangBan: ReadonlySet<string>;
  nguoi: string;
  thongBao: string | null;
  setThongBao: (t: string | null) => void;
  lamMoi: () => Promise<void>;
  chay: (username: string, viec: () => Promise<unknown>) => Promise<void>;
  napLo: (duongDan: string) => Promise<void>;
  setDuongDan: (p: string) => void;
  /** Bộ lọc trạng thái chọn từ cụm chip ở đầu trang (do trang cha giữ). */
  loc: LocTrangThai | null;
  lichSu: MucLichSu[];
  capNhatLichSu: (moi: MucLichSu[]) => void;
}

/** Giao diện theo lô (tệp JSON): chọn tệp lô, thêm đơn vị, kiểm tra kết nối, chuẩn bị, gửi tất cả và danh sách thẻ đơn vị. */
export function LoPage({ daNapLo, duongDan, don, setDon, dangBan, nguoi, thongBao, setThongBao, lamMoi, chay, napLo, setDuongDan, loc, lichSu, capNhatLichSu }: LoPageProps) {
  const [toanCuc, setToanCuc] = useState(false);
  const [xacNhan, setXacNhan] = useState(false);
  const [moThem, setMoThem] = useState(false);
  const [moTaoTk, setMoTaoTk] = useState(false);
  const [tim, setTim] = useState('');
  const [dangMo, setDangMo] = useState<ReadonlySet<string>>(new Set()); // đơn vị đang mở rộng; mặc định (kể cả đơn vị mới thêm) là thu gọn
  const hopXacNhan = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = hopXacNhan.current;
    if (!d) return;
    if (xacNhan && !d.open) d.showModal();
    if (!xacNhan && d.open) d.close();
  }, [xacNhan]);

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

  async function kiemTraTatCa() {
    setToanCuc(true);
    setThongBao(null);
    try { setDon(await api.kiemTraKetNoiTatCa()); } catch (e) { setThongBao(loiThanhChuoi(e)); } finally { setToanCuc(false); }
  }

  async function chuanBiTatCa() {
    setToanCuc(true);
    setThongBao(null);
    try { setDon(await api.chuanBiTatCa()); } catch (e) { setThongBao(loiThanhChuoi(e)); } finally { setToanCuc(false); }
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

  return (
    <div className="lo-trang">
        <section className="bang-dieu-khien" aria-label="Điều khiển lô">
          <ChonCauHinh duongDan={duongDan} dangBan={bao} onChon={(p) => { setDuongDan(p); void napLo(p); }} onNapLai={() => { void napLo(duongDan); }} lichSu={lichSu} onChonLichSu={(p) => { setDuongDan(p); void napLo(p); }} onXoaLichSu={(p) => capNhatLichSu(xoaMucLichSu(lichSu, p))} onXoaHetLichSu={() => capNhatLichSu([])} />
          {don.length > 0 && (
            <label className="tim-kiem">
              <IcTim aria-hidden="true" />
              <input type="search" value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm đơn vị, tài khoản…" aria-label="Tìm đơn vị" autoComplete="off" spellCheck={false} />
              {(tim || loc) && <span className="tim-kiem__dem">{hienThi.length}/{don.length}</span>}
            </label>
          )}
          <div className="hanh-dong-chinh">
            <div className="nhom-nut" role="group" aria-label="Xem và thêm đơn vị">
              <button type="button" className="nut nut--vuong" onClick={() => setDangMo(tatCaDong ? new Set(don.map((d) => d.username)) : new Set())} disabled={don.length === 0} title={tatCaDong ? 'Mở rộng tất cả thẻ đơn vị' : 'Thu gọn tất cả thẻ đơn vị, chỉ giữ phần đầu'} aria-label={tatCaDong ? 'Mở rộng tất cả thẻ đơn vị' : 'Thu gọn tất cả thẻ đơn vị'}>
                {tatCaDong ? <IcMoTatCa /> : <IcThuTatCa />}
              </button>
              <button type="button" className="nut nut--vuong" onClick={() => setMoThem(true)} disabled={bao || !daNapLo} title={!daNapLo ? 'Chọn tệp JSON của lô trước' : 'Thêm đơn vị vào tệp JSON của lô'} aria-label="Thêm đơn vị"><IcThem /></button>
            </div>
            <span className="ngan-cach" aria-hidden="true" />
            <div className="nhom-nut" role="group" aria-label="Quy trình gửi hồ sơ">
              <button type="button" className="nut" onClick={() => setMoTaoTk(true)} disabled={bao || !daNapLo} title="Tạo đơn vị con và tài khoản kê khai trên cổng (bằng tài khoản quản trị)"><IcNguoi /> Tạo tài khoản</button>
              <button type="button" className="nut" onClick={() => { void kiemTraTatCa(); }} disabled={bao || bat.length === 0} title="Kiểm tra kết nối tất cả đơn vị đang bật">
                {toanCuc ? <span className="quay" aria-hidden="true" /> : <IcKetNoi />} Kiểm tra kết nối
              </button>
              <button type="button" className="nut" onClick={() => { void chuanBiTatCa(); }} disabled={bao || bat.length === 0} title="Chuẩn bị tất cả đơn vị đang bật: kiểm tra tệp Excel và tính thay đổi (không gửi gì)">
                <IcKiemTra /> Chuẩn bị
              </button>
              <button type="button" className="nut nut--cta" onClick={() => setXacNhan(true)} disabled={bao || !daKiemTraKetNoi || sanSang.length === 0 || !nguoi.trim()} title={!daKiemTraKetNoi ? 'Kiểm tra kết nối tất cả trước' : !nguoi.trim() ? 'Nhập tên người vận hành' : undefined}>
                <IcGui /> Gửi tất cả <span className="dem">{sanSang.length}</span>
              </button>
            </div>
          </div>
        </section>

      {thongBao && <p className="thong-bao thong-bao--loi" role="alert">{thongBao}</p>}

      {!daNapLo ? (
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
      ) : don.length === 0 ? (
        <section className="rong" aria-labelledby="rong-trong-tieu-de">
          <span className="rong__icon" aria-hidden="true"><IcThem /></span>
          <h2 id="rong-trong-tieu-de">Lô chưa có đơn vị nào</h2>
          <p>Thêm đơn vị bằng tay, mỗi đơn vị gồm tài khoản cổng, mật khẩu và tệp Excel bộ biểu. Danh sách được lưu trong <code>{duongDan}</code>.</p>
          <button type="button" className="nut nut--chinh" onClick={() => setMoThem(true)} disabled={bao}><IcThem /> Thêm đơn vị</button>
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
              onGuiBuoc8={() => { void chay(d.username, () => api.guiBuoc8(d.username)); }}
              onDonViDoi={setDon}
              moRong={dangMo.has(d.username)}
              onDoiMoRong={(mo) => doiMoRong(d.username, mo)}
            />
          ))}
        </main>
      )}

      <TaoTaiKhoanDialog open={moTaoTk} daNapLo={daNapLo} onClose={() => setMoTaoTk(false)} onXong={setDon} />
      <ThemDonViDialog open={moThem} daNapLo={daNapLo} onClose={() => setMoThem(false)} onXong={setDon} onCanhBao={setThongBao} />

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
