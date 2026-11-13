import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { api, loiThanhChuoi } from '../api';
import { boDau } from '../quanTri';
import { dinhDangCapNhat } from '../tongQuan';
import type { DanhSachTdv, HoSoQt, KyQt, ThongTinTdv, TinhTrangTaiKhoanQt } from '../types';
import { HoSoQuanTri } from './HoSoQuanTri';
import { IcCanhBao, IcLamMoi, IcTaiXuong, IcTim } from './Icons';

const NHAN_TRANG_THAI: Record<string, string> = { DRAFT: 'Đang kê khai', SUBMITTED: 'Đã gửi', RETURNED: 'Bị trả lại', APPROVED: 'Đã duyệt' };
const KHOA_DON_VI = 'vtvl-batch.tdv.don-vi';
type Loc = 'tat_ca' | keyof typeof NHAN_TRANG_THAI;

const nhoDonVi = (id: string): void => { try { localStorage.setItem(KHOA_DON_VI, id); } catch { /* bỏ qua */ } };
const docDonVi = (): string => { try { return localStorage.getItem(KHOA_DON_VI) ?? ''; } catch { return ''; } };
const ngayVi = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

/** Dòng chữ của một kỳ trong ô chọn, ví dụ "Kỳ 01/10/2025 – 30/09/2026 · đang mở, hạn gửi 15/11/2026". */
export function nhanKy(k: KyQt): string {
  const mo = k.trangThai === 'OPEN';
  const han = mo && k.hanGui ? `, hạn gửi ${ngayVi(k.hanGui)}` : '';
  return `${k.ten || `Kỳ ${k.ma}`} · ${mo ? 'đang mở' : 'đã đóng'}${han}`;
}

interface ChonKyProps { ky: readonly KyQt[]; giaTri: string; onDoi: (id: string) => void }

/** Ô chọn kỳ dạng danh sách thả (thay cho thẻ select của hệ điều hành): mỗi kỳ một dòng có tên, hạn gửi và nhãn đang mở/đã đóng. Mở lên trên vì nằm ở cuối trang. */
function ChonKy({ ky, giaTri, onDoi }: ChonKyProps) {
  const [mo, setMo] = useState(false);
  const goc = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => { if (goc.current && !goc.current.contains(e.target as Node)) setMo(false); };
    const phim = (e: KeyboardEvent) => { if (e.key === 'Escape') setMo(false); };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', phim);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('keydown', phim); };
  }, [mo]);
  const dang = ky.find((k) => k.id === giaTri);
  return (
    <div className="ky-chon tdv__chon-ky" ref={goc}>
      <button type="button" className="tdv__ky-nut" aria-haspopup="listbox" aria-expanded={mo} aria-controls="tdv-ky-ds" aria-labelledby="tdv-ky-nhan" onClick={() => setMo((m) => !m)}>
        <span className="tdv__ky-chu">{dang ? nhanKy(dang) : 'Chọn kỳ kê khai'}</span>
        <span className="tdv__ky-mui" aria-hidden="true" />
      </button>
      {mo && (
        <ul id="tdv-ky-ds" className="ky-ds ky-ds--len" role="listbox" aria-label="Kỳ kê khai">
          {ky.map((k) => {
            const chon = k.id === giaTri;
            return (
              <li key={k.id} role="none">
                <button type="button" role="option" aria-selected={chon} className={`ky-ds__muc${chon ? ' ky-ds__muc--chon' : ''}`} onClick={() => { onDoi(k.id); setMo(false); }}>
                  <span className="ky-ds__dau" aria-hidden="true">{chon ? '✓' : ''}</span>
                  <span className="ky-ds__thong-tin">
                    <b>{k.ten || `Kỳ ${k.ma}`}</b>
                    <small>{k.trangThai === 'OPEN' && k.hanGui ? `Hạn gửi ${ngayVi(k.hanGui)}` : `${ngayVi(k.tuNgay)} – ${ngayVi(k.denNgay)}`}</small>
                  </span>
                  <span className={`ky-ds__nhan ky-ds__nhan--${k.trangThai === 'OPEN' ? 'mo' : 'khac'}`}>{k.trangThai === 'OPEN' ? 'đang mở' : 'đã đóng'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface TruongDonViPageProps {
  tinhTrang: TinhTrangTaiKhoanQt | null;
  /** Tăng khi vừa đăng nhập tài khoản mới: về lại bước chọn đơn vị và kỳ. */
  lanDoiTaiKhoan: number;
}

/** Màn hình của tài khoản trưởng đơn vị: (1) chọn đơn vị và kỳ kê khai, (2) danh sách đơn vị cấp dưới với Xem hồ sơ và Tải hồ sơ. Chỉ đọc. */
export function TruongDonViPage({ tinhTrang, lanDoiTaiKhoan }: TruongDonViPageProps) {
  const [tt, setTt] = useState<ThongTinTdv | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [donId, setDonId] = useState('');
  const [kyId, setKyId] = useState('');
  const [timDonVi, setTimDonVi] = useState('');
  const [ds, setDs] = useState<DanhSachTdv | null>(null);
  const [xem, setXem] = useState<HoSoQt | null>(null);
  const [tim, setTim] = useState('');
  const [loc, setLoc] = useState<Loc>('tat_ca');
  const [dangTaiHoSo, setDangTaiHoSo] = useState<string | null>(null);
  const [tinNhan, setTinNhan] = useState<{ ok: boolean; noiDung: string } | null>(null);

  const dangNhap = tinhTrang?.tenDangNhap ?? '';
  const taiThongTin = useCallback(async () => {
    setDangTai(true); setLoi(null); setDs(null); setXem(null);
    try {
      const t = await api.tdvThongTin();
      setTt(t);
      const cu = docDonVi();
      setDonId((d) => (t.donVi.some((x) => x.id === d) ? d : t.donVi.some((x) => x.id === cu) ? cu : t.donVi[0]?.id ?? ''));
      setKyId((k) => (t.ky.some((x) => x.id === k) ? k : (t.ky.find((x) => x.trangThai === 'OPEN') ?? t.ky[0])?.id ?? ''));
    } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangTai(false); }
  }, []);

  // đăng nhập tài khoản mới (hoặc mới mở ứng dụng): đọc đơn vị được phân công và các kỳ
  useEffect(() => { if (dangNhap) void taiThongTin(); }, [dangNhap, lanDoiTaiKhoan, taiThongTin]);

  async function vaoLamViec() {
    setDangTai(true); setLoi(null); setTinNhan(null);
    try {
      setDs(await api.tdvDanhSach(donId, kyId));
      nhoDonVi(donId);
      setTim(''); setLoc('tat_ca'); setXem(null);
    } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangTai(false); }
  }

  async function taiHoSo(h: HoSoQt) {
    setTinNhan(null);
    try {
      const dich = await save({ defaultPath: `${h.ma || h.id}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!dich) return;
      setDangTaiHoSo(h.id);
      setTinNhan({ ok: true, noiDung: `Đã tải bộ biểu của ${h.ten}: ${await api.qtXuatExcel(h.id, dich)}` });
    } catch (e) { setTinNhan({ ok: false, noiDung: loiThanhChuoi(e) }); } finally { setDangTaiHoSo(null); }
  }

  const donHienThi = useMemo(() => {
    const t = boDau(timDonVi.trim());
    return (tt?.donVi ?? []).filter((d) => !t || boDau(`${d.ten} ${d.ma}`).includes(t));
  }, [tt, timDonVi]);
  const dem = useMemo(() => {
    const r: Record<string, number> = {};
    for (const h of ds?.hoSo ?? []) r[h.trangThai] = (r[h.trangThai] ?? 0) + 1;
    return r;
  }, [ds]);
  const hoSoHien = useMemo(() => {
    const t = boDau(tim.trim());
    return (ds?.hoSo ?? []).filter((h) => (loc === 'tat_ca' || h.trangThai === loc) && (!t || boDau(`${h.ten} ${h.ma}`).includes(t)));
  }, [ds, tim, loc]);

  if (!dangNhap) {
    return <section className="rong"><h2>Chưa đăng nhập</h2><p>Bấm nút “Tài khoản” ở đầu trang để đăng nhập.</p></section>;
  }

  if (xem) return <div className="qt"><div className="qt__chi-tiet"><HoSoQuanTri key={xem.id} hoSo={xem} onVe={() => setXem(null)} /></div></div>;

  if (!ds) {
    return (
      <section className="tdv" aria-labelledby="tdv-tieu-de">
        <p className="tdv__chao">Chào {tt?.hoTen || dangNhap}</p>
        <h2 id="tdv-tieu-de">Chọn đơn vị và kỳ kê khai</h2>
        {tt && <p className="phu">Danh sách gồm {tt.donVi.length} đơn vị được phân công.</p>}
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
        {dangTai && !tt && <p className="hsqt__trang" role="status"><span className="quay" aria-hidden="true" /> Đang đọc đơn vị và kỳ…</p>}
        {tt && (
          <>
            <label className="tim-kiem tdv__tim">
              <IcTim aria-hidden="true" />
              <input type="search" value={timDonVi} onChange={(e) => setTimDonVi(e.target.value)} placeholder="Tìm theo tên đơn vị (gõ không dấu cũng được)" aria-label="Tìm đơn vị" autoComplete="off" spellCheck={false} />
            </label>
            <div className="tdv__don-vi" role="radiogroup" aria-label="Đơn vị">
              {donHienThi.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={donId === d.id} className={`tdv__the${donId === d.id ? ' tdv__the--chon' : ''}`} onClick={() => setDonId(d.id)}>
                  <b>{d.ten}</b>
                  <small>Mã đơn vị: {d.ma}</small>
                </button>
              ))}
              {donHienThi.length === 0 && <p className="phu">Không có đơn vị nào khớp.</p>}
            </div>
            <div className="tdv__chan">
              <span id="tdv-ky-nhan" className="tdv__chan-nhan">Kỳ kê khai</span>
              <ChonKy ky={tt.ky} giaTri={kyId} onDoi={setKyId} />
              <button type="button" className="tdv__vao" onClick={() => void vaoLamViec()} disabled={!donId || !kyId || dangTai}>
                {dangTai ? <span className="quay" aria-hidden="true" /> : null} Vào làm việc <span aria-hidden="true">→</span>
              </button>
              <small className="tdv__chan-ghi">Kỳ đã đóng chỉ xem được, không sửa số liệu.</small>
            </div>
          </>
        )}
      </section>
    );
  }

  const tongSo = ds.hoSo.length;
  return (
    <div className="qt">
      <div className="qt__thanh">
        <p className="qt__tom-tat" role="status">
          <b>{ds.donVi.ten}</b> · Kỳ <b>{ds.ky.ma}</b> · <b>{tongSo}</b> đơn vị cấp dưới · quét lúc {dinhDangCapNhat(ds.quetLuc)}
        </p>
        <div className="nhom-nut">
          <button type="button" className="nut" onClick={() => { setDs(null); setTinNhan(null); }}>Đổi đơn vị / kỳ</button>
          <button type="button" className="nut" onClick={() => void vaoLamViec()} disabled={dangTai} title="Đọc lại danh sách hồ sơ từ cổng">
            {dangTai ? <span className="quay" aria-hidden="true" /> : <IcLamMoi />} Cập nhật
          </button>
        </div>
      </div>
      {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
      {tinNhan && <p className={`thong-bao${tinNhan.ok ? '' : ' thong-bao--loi'}`} role={tinNhan.ok ? 'status' : 'alert'}>{!tinNhan.ok && <IcCanhBao />}{tinNhan.noiDung}</p>}

      <div className="tdv__bo-loc">
        <div className="qt__loc" role="group" aria-label="Lọc theo trạng thái">
          <button type="button" className={`loc-nut${loc === 'tat_ca' ? ' loc-nut--chon' : ''}`} aria-pressed={loc === 'tat_ca'} onClick={() => setLoc('tat_ca')}>Tất cả {tongSo}</button>
          {Object.keys(NHAN_TRANG_THAI).map((k) => (
            <button key={k} type="button" className={`loc-nut${loc === k ? ' loc-nut--chon' : ''}`} aria-pressed={loc === k} onClick={() => setLoc(k)}>{NHAN_TRANG_THAI[k]} {dem[k] ?? 0}</button>
          ))}
        </div>
        <label className="tim-kiem tdv__tim">
          <IcTim aria-hidden="true" />
          <input type="search" value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm đơn vị…" aria-label="Tìm đơn vị cấp dưới" autoComplete="off" spellCheck={false} />
        </label>
      </div>

      <div className="tdv__cuon">
        <table className="kt-bang tdv__bang">
          <thead><tr><th>Đơn vị</th><th>Trạng thái</th><th>Tiến độ</th><th>Dòng chưa đạt</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>
            {hoSoHien.map((h) => (
              <tr key={h.id}>
                <td><b>{h.ten}</b><br /><small className="phu">{h.ma}</small></td>
                <td><span className={`tdv__nhan tdv__nhan--${h.trangThai.toLowerCase()}`}>{NHAN_TRANG_THAI[h.trangThai] ?? h.trangThai}</span></td>
                <td><span className="tdv__tien" aria-hidden="true"><i style={{ width: `${Math.min(100, h.tienDo)}%` }} /></span> {h.tienDo}%</td>
                <td className="so">{h.dongChuaDat > 0 ? <b className="loi-chu">{h.dongChuaDat}</b> : '–'}</td>
                <td>{dinhDangCapNhat(h.capNhat)}</td>
                <td>
                  <div className="tdv__thao-tac">
                    <button type="button" className="nut nut--nho" onClick={() => setXem(h)}>Xem hồ sơ</button>
                    <button type="button" className="nut nut--nho" onClick={() => void taiHoSo(h)} disabled={dangTaiHoSo !== null} title="Tải bộ biểu B30K hiện tại của đơn vị về máy">
                      {dangTaiHoSo === h.id ? <span className="quay" aria-hidden="true" /> : <IcTaiXuong />} Tải hồ sơ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hoSoHien.length === 0 && <p className="qt__phu qt__them">{tongSo === 0 ? 'Đơn vị này chưa có đơn vị cấp dưới nào có hồ sơ trong kỳ.' : 'Không có hồ sơ nào khớp.'}</p>}
      </div>
    </div>
  );
}
