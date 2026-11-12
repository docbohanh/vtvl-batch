import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import { dinhDangCapNhat } from '../tongQuan';
import { dungHangCay, locHoSo, NHAN_CHE_DO, NUT_CHUA_XEP, type CheDoLoc } from '../quanTri';
import type { DanhSachQt, HoSoQt } from '../types';
import { CayHoSo } from './CayHoSo';
import { HoSoQuanTri } from './HoSoQuanTri';
import { IcCanhBao, IcLamMoi, IcTim } from './Icons';

const CAC_CHE_DO = Object.keys(NHAN_CHE_DO) as CheDoLoc[];

export interface QuanTriPageProps {
  daNapLo: boolean;
  /** Tăng khi vừa thiết lập tài khoản quản trị mới: bỏ cache và quét lại cây đơn vị. */
  lanDoiTaiKhoan: number;
  /** Mở thẻ đơn vị của hồ sơ (nếu chưa có trong lô thì hỏi tài khoản và mật khẩu). */
  onQuanTri: (hoSo: HoSoQt) => void;
}

/** Trang quản trị (chỉ đọc): danh sách hồ sơ của kỳ hiện tại quét một lần từ cổng và lưu cache, bấm "Cập nhật" để quét lại; chọn một hồ sơ để xem từng biểu. */
export function QuanTriPage({ daNapLo, lanDoiTaiKhoan, onQuanTri }: QuanTriPageProps) {
  const [ds, setDs] = useState<DanhSachQt | null>(null);
  const [dangQuet, setDangQuet] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const [che, setChe] = useState<CheDoLoc>('tat_ca');
  const [chon, setChon] = useState<string | null>(null);
  const [moRong, setMoRong] = useState<ReadonlySet<string>>(new Set()); // nhánh đang mở trong cây

  const tai = useCallback(async (lamMoi: boolean) => {
    setDangQuet(true); setLoi(null);
    try { setDs(await api.qtDanhSach(lamMoi)); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangQuet(false); }
  }, []);

  useEffect(() => { if (daNapLo) void tai(false); }, [daNapLo, tai]);
  useEffect(() => { if (lanDoiTaiKhoan > 0) { setChon(null); void tai(true); } }, [lanDoiTaiKhoan, tai]);

  // mỗi lần có danh sách mới: mở các gốc của cây để thấy ngay cấp đầu tiên
  const cacNut = ds?.donVi ?? [];
  useEffect(() => {
    if (!ds) return;
    const co = new Set((ds.donVi ?? []).map((n) => n.id));
    setMoRong(new Set([NUT_CHUA_XEP, ...(ds.donVi ?? []).filter((n) => !n.chaId || !co.has(n.chaId)).map((n) => n.id)]));
  }, [ds]);

  const hienThi = useMemo(() => (ds ? locHoSo(ds.hoSo, tim, che) : []), [ds, tim, che]);
  const dangTim = tim.trim() !== '' || che !== 'tat_ca'; // đang lọc thì mở hết để thấy mọi kết quả
  const hangCay = useMemo(() => dungHangCay(cacNut, hienThi, moRong, dangTim), [cacNut, hienThi, moRong, dangTim]);
  const doiNhanh = (id: string) => setMoRong((cu) => { const n = new Set(cu); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const coCon = useMemo(() => new Set(cacNut.map((n) => n.chaId).filter((c): c is string => !!c)), [cacNut]);
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
          <div className="qt__cay-nut">
            <button type="button" className="loc-nut" onClick={() => setMoRong(new Set([NUT_CHUA_XEP, ...coCon]))} disabled={!ds}>Mở hết</button>
            <button type="button" className="loc-nut" onClick={() => setMoRong(new Set([NUT_CHUA_XEP, ...cacNut.filter((n) => !n.chaId || !cacNut.some((x) => x.id === n.chaId)).map((n) => n.id)]))} disabled={!ds}>Chỉ cấp đầu</button>
            <span className="qt__phu">{hienThi.length} hồ sơ</span>
          </div>
          <div className="qt__cuon-cay">
            {ds && cacNut.length === 0 && <p className="thong-bao thong-bao--chu-y"><IcCanhBao />Bản lưu cũ chưa có cây đơn vị. Bấm “Cập nhật” để dựng cây.</p>}
            <CayHoSo hang={hangCay} chon={chon} onChon={setChon} onDoi={doiNhanh} />
            {ds && hienThi.length === 0 && <p className="qt__phu qt__them">Không có hồ sơ nào khớp.</p>}
          </div>
        </aside>

        <div className="qt__chi-tiet">
          {hoSoChon ? <HoSoQuanTri key={hoSoChon.id} hoSo={hoSoChon} onQuanTri={onQuanTri} /> : (
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
