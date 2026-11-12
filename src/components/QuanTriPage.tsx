import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import { dinhDangCapNhat } from '../tongQuan';
import { locHoSo, NHAN_CHE_DO, type CheDoLoc } from '../quanTri';
import type { DanhSachQt, DonVi, HoSoQt } from '../types';
import { HoSoQuanTri } from './HoSoQuanTri';
import { IcCanhBao, IcLamMoi, IcTim } from './Icons';

const SO_HIEN_TOI_DA = 300;
const CAC_CHE_DO = Object.keys(NHAN_CHE_DO) as CheDoLoc[];

export interface QuanTriPageProps {
  daNapLo: boolean;
  /** Tìm đơn vị trong lô theo các tên đăng nhập của hồ sơ. */
  timDonVi: (taiKhoan: readonly string[]) => DonVi | undefined;
  /** Mở thẻ đơn vị (trong hộp thoại) theo tên đăng nhập trong lô. */
  onQuanTri: (username: string) => void;
}

/** Trang quản trị (chỉ đọc): danh sách hồ sơ của kỳ hiện tại quét một lần từ cổng và lưu cache, bấm "Cập nhật" để quét lại; chọn một hồ sơ để xem từng biểu. */
export function QuanTriPage({ daNapLo, timDonVi, onQuanTri }: QuanTriPageProps) {
  const [ds, setDs] = useState<DanhSachQt | null>(null);
  const [dangQuet, setDangQuet] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const [che, setChe] = useState<CheDoLoc>('tat_ca');
  const [chon, setChon] = useState<string | null>(null);

  const tai = useCallback(async (lamMoi: boolean) => {
    setDangQuet(true); setLoi(null);
    try { setDs(await api.qtDanhSach(lamMoi)); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangQuet(false); }
  }, []);

  useEffect(() => { if (daNapLo) void tai(false); }, [daNapLo, tai]);

  const hienThi = useMemo(() => (ds ? locHoSo(ds.hoSo, tim, che) : []), [ds, tim, che]);
  const hoSoChon: HoSoQt | undefined = ds?.hoSo.find((h) => h.id === chon);

  if (!daNapLo) {
    return (
      <section className="rong" aria-labelledby="qt-rong">
        <h2 id="qt-rong">Chưa nạp lô đơn vị</h2>
        <p>Trang quản trị dùng tài khoản <code>settings.taiKhoanQuanTri</code> trong tệp JSON của lô. Hãy nạp lô ở trang “Lô đơn vị” trước.</p>
      </section>
    );
  }

  return (
    <div className="qt">
      <div className="qt__thanh">
        <p className="qt__tom-tat" role="status">
          {ds ? (
            <>Kỳ <b>{ds.ky.ma}</b> ({ds.ky.tuNgay} – {ds.ky.denNgay}) · <b>{ds.hoSo.length}</b> hồ sơ · <b>{ds.taiKhoan.length}</b> tài khoản · quét lúc {dinhDangCapNhat(ds.quetLuc)}</>
          ) : dangQuet ? 'Đang quét cổng lần đầu (tài khoản, hồ sơ, khung biểu), có thể mất vài chục giây…' : ' '}
        </p>
        <button type="button" className="nut" onClick={() => { void tai(true); }} disabled={dangQuet} title="Quét lại tài khoản và hồ sơ trên cổng, ghi đè cache">
          {dangQuet ? <span className="quay" aria-hidden="true" /> : <IcLamMoi />} Cập nhật
        </button>
      </div>
      {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}

      <div className="qt__bo-cuc">
        <aside className="qt__ds" aria-label="Danh sách hồ sơ">
          <label className="tim-kiem">
            <IcTim aria-hidden="true" />
            <input type="search" value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm đơn vị, mã, tài khoản…" aria-label="Tìm hồ sơ" autoComplete="off" spellCheck={false} disabled={!ds} />
          </label>
          <div className="qt__loc" role="group" aria-label="Lọc hồ sơ">
            {CAC_CHE_DO.map((c) => (
              <button key={c} type="button" className={`loc-nut${che === c ? ' loc-nut--chon' : ''}`} aria-pressed={che === c} onClick={() => setChe(c)}>{NHAN_CHE_DO[c]}</button>
            ))}
          </div>
          <ul className="qt__muc" aria-label={`${hienThi.length} hồ sơ`}>
            {hienThi.slice(0, SO_HIEN_TOI_DA).map((h) => (
              <li key={h.id}>
                <button type="button" className={`qt__hang${h.id === chon ? ' qt__hang--chon' : ''}`} aria-current={h.id === chon} onClick={() => setChon(h.id)}>
                  <span className="qt__ten">{h.ten}</span>
                  <span className="qt__phu">{h.taiKhoan[0] ?? 'chưa có tài khoản'}{h.taiKhoan.length > 1 ? ` +${h.taiKhoan.length - 1}` : ''}</span>
                  <span className="qt__so">
                    <span className="qt__tien-do" aria-label={`Tiến độ ${h.tienDo}%`}><i style={{ width: `${Math.min(100, h.tienDo)}%` }} /></span>
                    {h.dongChuaDat > 0 && <span className="qt__chua-dat">{h.dongChuaDat} chưa đạt</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {hienThi.length > SO_HIEN_TOI_DA && <p className="qt__phu qt__them">Hiện {SO_HIEN_TOI_DA}/{hienThi.length}. Gõ để thu hẹp danh sách.</p>}
          {ds && hienThi.length === 0 && <p className="qt__phu qt__them">Không có hồ sơ nào khớp.</p>}
        </aside>

        <div className="qt__chi-tiet">
          {hoSoChon ? <HoSoQuanTri key={hoSoChon.id} hoSo={hoSoChon} donVi={timDonVi(hoSoChon.taiKhoan)} onQuanTri={onQuanTri} /> : (
            <div className="rong qt__rong">
              <h2>Chọn một hồ sơ để xem các biểu</h2>
              <p>Mỗi biểu là một tab. B1, C3 và D2 đứng đầu để thẩm định.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
