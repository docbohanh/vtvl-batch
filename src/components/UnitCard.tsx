import { useState, type ReactNode } from 'react';
import type { Buoc, DonVi, Tong } from '../types';
import { open as moHopThoai } from '@tauri-apps/plugin-dialog';
import { api, loiThanhChuoi } from '../api';
import { IcCanhBao, IcChua, IcDoiChieu, IcDoiTep, IcGui, IcKetNoi, IcKhoa, IcKiemTra, IcMuiTen, IcSaoChep, IcSua, IcTep, IcThayDoi, IcTongQuan, IcXoa } from './Icons';
import { TongNguoi } from './TongNguoi';
import { KiemTraDialog } from './KiemTraDialog';
import { TongQuanDialog } from './TongQuanDialog';
import { SuaDonViDialog } from './SuaDonViDialog';
import { XoaDuLieuDialog } from './XoaDuLieuDialog';

const NHAN_BUOC: Record<Buoc, string> = {
  chua_chay: 'Chưa chạy', kiem_tra_ket_noi: 'Đang kiểm tra kết nối', dang_kiem_tra_file: 'Đang kiểm tra tệp', can_xem_xet: 'Cần xem xét', da_khop: 'Đã khớp máy chủ',
  san_sang_gui: 'Sẵn sàng gửi', dang_gui: 'Đang gửi', cho_bien_nhan: 'Chờ biên nhận', dong_bo_xong: 'Đã đồng bộ', loi: 'Lỗi', chan: 'Bị chặn', da_huy: 'Đã hủy',
};
const BAN: Buoc[] = ['kiem_tra_ket_noi', 'dang_kiem_tra_file', 'dang_gui'];

type TrangThaiBuoc = 'xong' | 'dang' | 'cho' | 'loi';
interface BuocHien { ten: string; icon: ReactNode; tt: TrangThaiBuoc }

/** Năm bước của một đơn vị, suy từ trạng thái bền: kết nối → kiểm tra tệp → thay đổi → gửi → đối chiếu. */
export function cacBuoc(don: DonVi): BuocHien[] {
  const t = don.trangThai;
  const loi = t.buoc === 'loi' || t.buoc === 'chan';
  const xong = t.buoc === 'dong_bo_xong';
  const raw: [string, ReactNode, boolean, boolean][] = [
    ['Kết nối', <IcKetNoi key="k" />, !!don.ketNoi && don.ketNoi.ketQua !== 'chan', t.buoc === 'kiem_tra_ket_noi'],
    ['Kiểm tra tệp', <IcTep key="t" />, !!t.kiemTra, t.buoc === 'dang_kiem_tra_file'],
    ['Thay đổi', <IcThayDoi key="d" />, !!t.thayDoi, false],
    ['Gửi', <IcGui key="g" />, xong, t.buoc === 'dang_gui' || t.buoc === 'cho_bien_nhan'],
    ['Đối chiếu', <IcDoiChieu key="c" />, xong, false],
  ];
  let daGapLoi = false;
  return raw.map(([ten, icon, done, doing]) => {
    if (done) return { ten, icon, tt: 'xong' as const };
    if (doing) return { ten, icon, tt: 'dang' as const };
    if (loi && !daGapLoi) { daGapLoi = true; return { ten, icon, tt: 'loi' as const }; }
    return { ten, icon, tt: 'cho' as const };
  });
}

const SO_KY_TU_TOI_DA = 56;

/** Rút gọn đường dẫn dài về một dòng: giữ đầu và cuối, bỏ phần giữa ("/Users/conan/…/nguon/ten.xlsx"); tên tệp luôn đủ. */
export function rutGonDuongDan(p: string, toiDa = SO_KY_TU_TOI_DA): { thuMuc: string; ten: string } {
  const dau = p.replace(/\\/g, '/');
  const i = dau.lastIndexOf('/');
  const ten = i >= 0 ? dau.slice(i + 1) : dau;
  const thuMuc = i >= 0 ? dau.slice(0, i + 1) : '';
  const cho = Math.max(12, toiDa - ten.length);
  if (thuMuc.length <= cho) return { thuMuc, ten };
  const doan = thuMuc.split('/').filter(Boolean);
  const dauDoan = `${thuMuc.startsWith('/') ? '/' : ''}${doan.slice(0, 2).join('/')}/`;
  let duoi = '';
  for (let k = doan.length - 1; k >= 2; k -= 1) {
    const thu = `${doan[k]}/${duoi}`;
    if (dauDoan.length + 1 + thu.length > cho) break;
    duoi = thu;
  }
  return { thuMuc: `${dauDoan}…/${duoi}`, ten };
}

/** Thứ tự và nhãn ngắn của biểu khi xem trước số dòng (biểu sau trước, như thứ tự xóa). B2 tổng hợp do hệ thống tự tổng hợp nên không hiện. */
const BIEU_XEM: [string, string][] = [
  ['d2', 'D2'], ['du_bao_5_nam', 'Dự báo'], ['d1', 'D1'], ['c3', 'C3'], ['c2', 'C2'], ['b2_ct', 'B2'], ['b1', 'B1'], ['a2', 'A2'], ['a1', 'A1'], ['c1', 'C1'],
];

const CO_TONG = ['c3', 'd2'];

/** Số dòng theo biểu: bảng đếm gọn (mỗi biểu một cột) và dải vàng "tổng người" của C3, D2 bên dưới. */
function BangSoDong({ cong, excel, tongCong, tongExcel }: { cong: Record<string, number>; excel: Record<string, number>; tongCong?: Tong; tongExcel?: Tong }) {
  const coCong = Object.keys(cong).length > 0;
  const cot = BIEU_XEM.filter(([k]) => k in excel || k in cong).reverse();
  const nguon = [
    { nhan: 'Trên cổng', so: cong, tong: tongCong, ok: coCong },
    { nhan: 'Trong Excel', so: excel, tong: tongExcel, ok: true },
  ];
  return (
    <div className="so-bieu">
      <div className="so-bieu__cuon">
        <table className="bang-dong">
          <thead>
            <tr><td />{cot.map(([k, ten]) => <th key={k} scope="col" className={CO_TONG.includes(k) ? 'co-tong' : ''}>{ten}</th>)}</tr>
          </thead>
          <tbody>
            {nguon.map((h) => (
              <tr key={h.nhan}>
                <th scope="row">{h.nhan}</th>
                {cot.map(([k]) => {
                  const khac = h.nhan === 'Trong Excel' && coCong && k in excel && cong[k] !== excel[k];
                  return (
                    <td key={k} className={khac ? 'khac' : ''} title={khac ? `Khác trên cổng (${cong[k] ?? 0})` : undefined}>
                      {h.ok && k in h.so ? h.so[k] : <span className="phu">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dai-tong" aria-label="Tổng số người biên chế">
        <span className="dai-tong__nhan">Số người biên chế</span>
        {nguon.filter((h) => h.ok).map((h) => (
          <div key={h.nhan} className="dai-tong__hang">
            <span className="dai-tong__nguon">{h.nhan}</span>
            <TongNguoi ten="C3" tong={h.tong?.c3} />
            <TongNguoi ten="D2" tong={h.tong?.d2} />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface UnitCardProps {
  don: DonVi;
  dangBan: boolean;
  onCookie: (cookie: string) => Promise<void>;
  onDangNhap: () => void;
  onChonExcel: (duongDan: string) => void;
  onChonHoSo: (hoSoId: string) => void;
  nguoi: string;
  onXoaXong: () => void;
  onChuanBi: () => void;
  onGui: () => void;
  onGuiLai: () => void;
  onGuiBuoc8: () => void;
  onDonViDoi: (ds: DonVi[]) => void;
  /** Thẻ đang mở rộng hay thu gọn (do trang cha giữ để có nút mở/thu tất cả). */
  moRong: boolean;
  onDoiMoRong: (moRong: boolean) => void;
}

export function UnitCard({ don, dangBan, onCookie, onDangNhap, onChonExcel, onChonHoSo, nguoi, onXoaXong, onChuanBi, onGui, onGuiLai, onGuiBuoc8, onDonViDoi, moRong, onDoiMoRong }: UnitCardProps) {
  const [cookie, setCookie] = useState('');
  const [moXoa, setMoXoa] = useState(false);
  const [moSua, setMoSua] = useState(false);
  const [moKiemTra, setMoKiemTra] = useState(false);
  const [moTongQuan, setMoTongQuan] = useState(false);
  const [tokenHien, setTokenHien] = useState<string | null>(null);
  const [saoChep, setSaoChep] = useState<{ tt: 'dang' | 'xong' | 'loi'; tin: string } | null>(null);
  const t = don.trangThai;
  const dangChay = dangBan || BAN.includes(t.buoc);
  const sanSang = t.buoc === 'san_sang_gui' && !!t.thayDoi && t.thayDoi.tong > 0;
  const guiLai = (t.buoc === 'loi' || t.buoc === 'cho_bien_nhan') && !!t.goiHienTai;
  const ketNoi = don.ketNoi?.ketQua ?? 'chua';
  const thongBaoLoi = t.loi ?? (don.ketNoi?.chan ? `${don.ketNoi.chan.ma}: ${don.ketNoi.chan.thongBao}` : null);

  /**
   * Đăng nhập kênh Desktop và chép token Bearer vào bộ nhớ tạm. Việc chờ lấy token làm mất "cử chỉ người dùng" nên WebKit/WebView2 từ chối
   * `writeText` sau `await`; truyền Promise vào `ClipboardItem` để lệnh ghi được gọi ngay trong lúc bấm. Vẫn lỗi thì hiện token trong ô
   * để tự chép (tự ẩn sau 30 giây). Token không lưu đĩa.
   */
  async function chepBearer() {
    setSaoChep({ tt: 'dang', tin: 'Đang lấy token…' });
    setTokenHien(null);
    const lay = api.layBearer(don.username);
    try {
      const blob = lay.then((t) => new Blob([t], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      setSaoChep({ tt: 'xong', tin: 'Đã chép token Bearer vào bộ nhớ tạm' });
    } catch (e) {
      try {
        const t = await lay;
        setTokenHien(t);
        setTimeout(() => setTokenHien(null), 30000);
        setSaoChep({ tt: 'loi', tin: 'Hệ thống không cho tự chép: hãy chép token trong ô bên dưới (tự ẩn sau 30 giây).' });
        return;
      } catch (e2) {
        setSaoChep({ tt: 'loi', tin: loiThanhChuoi(e2) });
      }
    }
    setTimeout(() => setSaoChep((x) => (x?.tt === 'dang' ? x : null)), 6000);
  }

  async function luuCookie() {
    await onCookie(cookie);
    setCookie('');
  }

  return (
    <article className={`don-vi don-vi--${t.buoc}`} aria-labelledby={`dv-${don.username}`} aria-busy={dangChay}>
      <header className="don-vi__dau">
        <div className="don-vi__trai">
          <button type="button" className="nut-mui-ten" onClick={() => onDoiMoRong(!moRong)} aria-expanded={moRong} aria-controls={`nd-${don.username}`} aria-label={moRong ? `Thu gọn ${don.label || don.username}` : `Mở rộng ${don.label || don.username}`} title={moRong ? 'Thu gọn' : 'Mở rộng'}>
            <IcMuiTen />
          </button>
          <div className="don-vi__ten">
            <h2 id={`dv-${don.username}`}>{don.label || don.username}</h2>
            <p>{don.username}{don.taiKhoan ? ` · ${don.taiKhoan.donVi} · ${don.taiKhoan.ky}` : ' · chưa đọc thông tin tài khoản'}</p>
          </div>
          <div className="nhan-nhom">
            <span className={`nhan nhan--kn-${ketNoi}`}>
              {ketNoi === 'chan' ? <IcChua /> : ketNoi === 'canh_bao' ? <IcCanhBao /> : <IcKetNoi />}
              {ketNoi === 'ok' ? 'Kết nối ổn' : ketNoi === 'canh_bao' ? 'Có cảnh báo' : ketNoi === 'chan' ? 'Bị chặn' : 'Chưa kiểm tra'}
            </span>
            <span className={`nhan nhan--bc-${t.buoc}`}>{dangChay && <span className="quay" aria-hidden="true" />}{NHAN_BUOC[t.buoc]}</span>
          </div>
        </div>
        <div className="hanh-dong" role="group" aria-label="Thao tác đơn vị">
          <button type="button" className="nut nut--gon" onClick={onChuanBi} disabled={dangChay || !(don.coCookie || don.coMatKhau) || !don.enabled || !don.excelCo} title={!(don.coCookie || don.coMatKhau) ? 'Nhập cookie hoặc cấu hình password' : !don.excelCo ? 'Chưa có tệp Excel' : undefined}>Chuẩn bị</button>
          <button type="button" className="nut nut--gon" onClick={() => setMoTongQuan(true)} disabled={dangChay || !don.taiKhoan} title={!don.taiKhoan ? 'Cần Kiểm tra kết nối trước để biết hồ sơ của đơn vị' : 'Xem tổng quan như trang làm việc của ứng dụng Desktop (đọc từ cổng)'}><IcTongQuan /> Tổng quan</button>
          <button type="button" className="nut nut--gon" onClick={() => setMoKiemTra(true)} disabled={dangChay} title="Xem kết quả kiểm tra bộ biểu (lỗi theo từng sheet, số người biên chế trên cổng)"><IcKiemTra /> Kiểm tra</button>
          <button type="button" className="nut nut--gon nut--chinh" onClick={onGui} disabled={dangChay || !sanSang}><IcGui /> Gửi</button>
          <button type="button" className="nut nut--gon" onClick={onGuiBuoc8} disabled={dangChay || !don.taiKhoan} title={!don.taiKhoan ? 'Cần Kiểm tra kết nối trước để biết hồ sơ của đơn vị' : 'Chỉ chạy bước 8 Kiểm tra trên cổng (kiểm tra lại hồ sơ), không gửi dữ liệu'}>Gửi Bước 8</button>
          {guiLai && <button type="button" className="nut nut--gon" onClick={onGuiLai} disabled={dangChay}>Gửi lại</button>}
          <button type="button" className="nut nut--vuong" onClick={() => setMoSua(true)} disabled={dangChay} title="Sửa thông tin đơn vị trong tệp JSON" aria-label="Sửa thông tin đơn vị"><IcSua /></button>
          <button type="button" className="nut nut--vuong nut--nguy-vien" onClick={() => setMoXoa(true)} disabled={dangChay} title="Xóa dữ liệu cũ của hồ sơ trên cổng…" aria-label="Xóa dữ liệu cũ trên cổng"><IcXoa /></button>
        </div>
      </header>

      {!moRong && (
        <div className="dai-tong dai-tong--gon" aria-label="Số người biên chế trên cổng">
          <span className="dai-tong__nhan">Số người biên chế trên cổng</span>
          {t.soDong && Object.keys(t.soDong.cong).length > 0 && (t.soDong.tongCong?.c3 || t.soDong.tongCong?.d2) ? (
            <div className="dai-tong__hang">
              <TongNguoi ten="C3" tong={t.soDong.tongCong?.c3} />
              <TongNguoi ten="D2" tong={t.soDong.tongCong?.d2} />
            </div>
          ) : <span className="phu">Chưa có: bấm Chuẩn bị để tải số liệu từ cổng.</span>}
        </div>
      )}

      <div className="don-vi__noi-dung" id={`nd-${don.username}`} hidden={!moRong}>

      <ol className="cac-buoc" aria-label="Tiến trình">
        {cacBuoc(don).map((b) => (
          <li key={b.ten} className={`buoc buoc--${b.tt}`} aria-current={b.tt === 'dang' ? 'step' : undefined}>
            <span className="buoc__icon">{b.icon}</span>
            <span className="buoc__ten">{b.ten}</span>
            <span className="sr-only">{b.tt === 'xong' ? ' (xong)' : b.tt === 'dang' ? ' (đang chạy)' : b.tt === 'loi' ? ' (lỗi)' : ' (chờ)'}</span>
          </li>
        ))}
      </ol>

      <div className="don-vi__than">
        <dl className="so-lieu">
          <div className="so-lieu__rong">
            <dt>Tệp Excel (đọc từ đây)</dt>
            <dd className="duong-excel">
              <span className="duong-excel__duong" title={don.excelPath}>
                <span className="duong-excel__thu-muc">{rutGonDuongDan(don.excelPath).thuMuc}</span>
                <strong>{rutGonDuongDan(don.excelPath).ten}</strong>
              </span>
              {don.excelCo
                ? <span className="nhan nhan--kn-ok">có tệp</span>
                : <span className="nhan nhan--kn-chan" title="Đặt tệp vào đúng đường dẫn này hoặc chọn lại tệp">chưa có tệp</span>}
              <button type="button" className="nut nut--nho" disabled={dangChay} onClick={() => { void moHopThoai({ multiple: false, directory: false, title: 'Chọn tệp Excel của đơn vị', filters: [{ name: 'Excel', extensions: ['xlsx'] }] }).then((p) => { if (typeof p === 'string') onChonExcel(p); }); }}><IcDoiTep /> Chọn lại tệp…</button>
            </dd>
          </div>
          <div className="so-lieu__rong so-lieu__khung">
            <div className="sl-2"><dt>Kiểm tra tệp</dt><dd>{t.kiemTra ? <><b>{t.kiemTra.tongDong}</b> dòng · <span className={t.kiemTra.dongLoi ? 'loi-chu' : ''}>{t.kiemTra.dongLoi} lỗi</span> · {t.kiemTra.canhBao} xem lại</> : '—'}</dd></div>
            <div className="sl-2"><dt>Thay đổi sẽ gửi</dt><dd>{t.thayDoi ? <><b>{t.thayDoi.tong}</b>: tạo {t.thayDoi.tao} · sửa {t.thayDoi.sua} · <span className={t.thayDoi.bo > 0 ? 'loi-chu' : ''}>xóa {t.thayDoi.bo}</span></> : '—'}</dd></div>
            <div className="sl-4">
              <dt><label htmlFor={`hs-${don.username}`}>Hồ sơ</label></dt>
              <dd>
                {don.taiKhoan && don.taiKhoan.hoSoCoThe.length > 1 ? (
                  <select id={`hs-${don.username}`} className="chon" value={don.taiKhoan.hoSo.id} disabled={dangChay} onChange={(e) => onChonHoSo(e.target.value)}>
                    {don.taiKhoan.hoSoCoThe.map((h) => <option key={h.id} value={h.id}>{h.ten} · {h.trangThai} · v{h.phienBan} · sửa được {h.soBieuSua ?? '?'} biểu</option>)}
                  </select>
                ) : don.taiKhoan ? <>{don.taiKhoan.donVi} · {don.taiKhoan.hoSo.trangThai} · v{don.taiKhoan.hoSo.phienBan}{don.taiKhoan.hoSo.hanNop ? ` · hạn ${don.taiKhoan.hoSo.hanNop}` : ''}</> : '—'}
              </dd>
            </div>
            <div className="sl-4"><dt>Biểu được sửa</dt><dd>{don.taiKhoan ? (don.taiKhoan.bieuDuocSua.length ? don.taiKhoan.bieuDuocSua.join(', ') : 'chưa đọc được') : '—'}</dd></div>
          </div>
          {t.soDong && (
            <div className="so-lieu__rong">
              <dt>Số dòng theo biểu (xem trước)</dt>
              <dd><BangSoDong cong={t.soDong.cong} excel={t.soDong.excel} tongCong={t.soDong.tongCong} tongExcel={t.soDong.tongExcel} /></dd>
            </div>
          )}
        </dl>
      </div>

      {t.ghiChu && <p className={`thong-bao ${t.buoc === 'da_khop' ? 'thong-bao--ok' : 'thong-bao--chu-y'}`} role="status">{t.buoc === 'da_khop' ? <IcDoiChieu /> : <IcCanhBao />}{t.ghiChu}</p>}
      {thongBaoLoi && <p className="thong-bao thong-bao--loi" role="alert"><IcChua />{thongBaoLoi}</p>}

      <div className="chi-tiet">
        <details className="cookie-hop" open={!don.coCookie && !don.coMatKhau}>
          <summary>
            <IcKhoa /> Đăng nhập
            {don.coMatKhau
              ? <span className="nhan nhan--duong-B">kênh Desktop (có quyền sửa)</span>
              : <span className="nhan nhan--kn-canh_bao">{don.coCookie ? 'cookie web (chỉ xem)' : 'chưa có'}</span>}
          </summary>
          <div className="dang-nhap">
            {don.coMatKhau ? (
              <div className="dang-nhap__hang">
                <p>Đã cấu hình <code>password</code>: ứng dụng đăng nhập kênh Desktop (token, tự làm mới và đăng nhập lại khi hết hạn). Kênh này có quyền sửa như ứng dụng Desktop.</p>
                <button type="button" className="nut" onClick={onDangNhap} disabled={dangChay}><IcKhoa /> Đăng nhập và kiểm tra</button>
                <button type="button" className="nut" onClick={() => { void chepBearer(); }} disabled={dangChay || saoChep?.tt === 'dang'} title="Đăng nhập kênh Desktop và chép token Bearer (bí mật, chỉ dùng cho bạn) vào bộ nhớ tạm"><IcSaoChep /> Sao chép Bearer token</button>
                {saoChep && <span className={`sao-chep sao-chep--${saoChep.tt}`} role="status">{saoChep.tin}</span>}
                {tokenHien && <input className="sao-chep__token" readOnly value={tokenHien} onFocus={(e) => e.currentTarget.select()} aria-label="Token Bearer, chép thủ công" />}
              </div>
            ) : (
              <p className="phu">Chưa cấu hình <code>password</code> trong tệp JSON của lô. Hãy thêm để đăng nhập kênh Desktop, vì <b>cookie web chỉ xem được, cổng từ chối mọi thay đổi</b>.</p>
            )}
            {!don.coMatKhau && (
              <form className="cookie" onSubmit={(e) => { e.preventDefault(); void luuCookie(); }}>
                <label htmlFor={`ck-${don.username}`}>Hoặc dán cookie web (D1N; SESSION; XSRF-TOKEN): chỉ để xem, không gửi hay xóa được. Chỉ giữ trong bộ nhớ.</label>
                <div className="cookie__hang">
                  <input id={`ck-${don.username}`} type="password" autoComplete="off" spellCheck={false} value={cookie} placeholder={don.coCookie ? 'Nhập để thay cookie hiện có' : 'D1N=…; SESSION=…; XSRF-TOKEN=…'} onChange={(e) => setCookie(e.target.value)} />
                  <button type="submit" className="nut" disabled={!cookie.trim()}>Lưu</button>
                </div>
              </form>
            )}
          </div>
        </details>
        {don.ketNoi && (
          <details>
            <summary><IcKetNoi /> Các bước kiểm tra kết nối</summary>
            <ul className="buoc-ket-noi">
              {don.ketNoi.cacBuoc.map((b) => <li key={b.ten} className={b.ok ? 'ok' : 'sai'}><span aria-hidden="true">{b.ok ? '✓' : '✗'}</span><span className="sr-only">{b.ok ? 'đạt' : 'không đạt'}</span> <b>{b.ten}</b>: {b.chiTiet}</li>)}
            </ul>
          </details>
        )}
      </div>
      </div>
      <KiemTraDialog don={don} open={moKiemTra} onClose={() => setMoKiemTra(false)} />
      <TongQuanDialog don={don} open={moTongQuan} onClose={() => setMoTongQuan(false)} />
      <SuaDonViDialog don={don} open={moSua} onClose={() => setMoSua(false)} onXong={onDonViDoi} />
      <XoaDuLieuDialog don={don} nguoi={nguoi} open={moXoa} onClose={() => { if (moXoa) { setMoXoa(false); onXoaXong(); } }} />
    </article>
  );
}
