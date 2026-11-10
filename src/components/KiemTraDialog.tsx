import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, KetQuaKiemTraTep } from '../types';
import { IcCanhBao, IcDong, IcKiemTra, IcLamMoi } from './Icons';
import { TongNguoi } from './TongNguoi';

const SO_DONG_TOI_DA = 200;

export interface KiemTraDialogProps {
  don: DonVi;
  open: boolean;
  onClose: () => void;
}

const thoiDiem = (runId: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(runId);
  return m ? `${m[4]}:${m[5]}:${m[6]} ${m[3]}/${m[2]}/${m[1]}` : runId;
};

/** Giao diện "Xem kết quả" kiểm tra bộ biểu (theo ứng dụng Desktop): số liệu tổng, chi tiết từng sheet, kèm số người biên chế trên cổng. */
export function KiemTraDialog({ don, open, onClose }: KiemTraDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kq, setKq] = useState<KetQuaKiemTraTep | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [dangKiem, setDangKiem] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    try { setKq(await api.layKetQuaKiemTra(don.username)); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangTai(false); }
  }, [don.username]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setLoi(null); setSheet(null); d.showModal(); void tai(); }
    if (!open && d.open) d.close();
  }, [open, tai]);

  // mở lên thì chọn sheet đầu tiên có lỗi, không thì sheet đầu
  useEffect(() => {
    if (!kq || sheet) return;
    const s = kq.ketQua.sheets;
    setSheet((s.find((x) => x.so_loi > 0) ?? s.find((x) => !x.dat) ?? s[0])?.ten ?? null);
  }, [kq, sheet]);

  async function kiemLai() {
    setDangKiem(true); setLoi(null);
    try { await api.kiemTraTep(don.username); setSheet(null); await tai(); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangKiem(false); }
  }

  const k = kq?.ketQua;
  const muc = useMemo(() => (k && sheet ? k.loi.filter((x) => x.sheet === sheet) : []), [k, sheet]);
  const sheetHien = k?.sheets.find((x) => x.ten === sheet);
  const tong = don.trangThai.soDong?.tongCong;
  const coTong = !!(tong?.c3 || tong?.d2);
  const bu = dangTai || dangKiem;
  const kiemDuoc = !!don.taiKhoan && don.excelCo && !bu;

  return (
    <dialog ref={ref} className="hop-kt" onClose={onClose} aria-labelledby={`kt-${don.username}`}>
      <header className="hop-kt__dau">
        <div>
          <h2 id={`kt-${don.username}`}>Kết quả kiểm tra bộ biểu</h2>
          <p>{don.label || don.username}{kq ? ` · ${kq.tep.ten ?? 'tệp Excel'} · ${thoiDiem(kq.runId)}${kq.quyTac.phienBan ? ` · quy tắc ${kq.quyTac.phienBan}` : ''}` : ''}</p>
        </div>
        <button type="button" className="nut nut--vuong nut--gon" onClick={onClose} aria-label="Đóng"><IcDong /></button>
      </header>

      <div className="hop-kt__than">
        <p className="thong-bao thong-bao--thong-tin" role="note"><IcKiemTra />Tệp được kiểm tra ngay trên máy này, không cần mạng và không thay đổi dữ liệu trên cổng. Chỉ gửi lên cổng khi bạn bấm Gửi.</p>
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}

        {!k && !bu && <p className="rong-tim">Chưa có kết quả kiểm tra tệp cho đơn vị này. Bấm “Kiểm tra tệp” để chạy.</p>}
        {bu && <p className="cong-mk__phu" role="status"><span className="quay" aria-hidden="true" /> {dangKiem ? 'Đang kiểm tra tệp Excel…' : 'Đang đọc kết quả…'}</p>}

        {k && (
          <>
            <ul className="kt-the" aria-label="Tổng hợp">
              <li className="kt-the__o kt-the__o--chinh"><b>{k.tong_dong}</b><span>Tổng số dòng kiểm tra</span></li>
              <li className={`kt-the__o ${k.dong_loi ? 'kt-the__o--xau' : 'kt-the__o--trung'}`}><b>{k.dong_loi}</b><span>Số dòng còn lỗi phải sửa</span></li>
              <li className="kt-the__o kt-the__o--tot"><b>{k.dong_hop_le}</b><span>Số dòng hợp lệ</span></li>
            </ul>

            <div className="dai-tong" aria-label="Số người biên chế trên cổng">
              <span className="dai-tong__nhan">Số người biên chế trên cổng</span>
              {coTong ? (
                <div className="dai-tong__hang">
                  <TongNguoi ten="C3" tong={tong?.c3} />
                  <TongNguoi ten="D2" tong={tong?.d2} />
                </div>
              ) : <span className="phu">Chưa có số liệu từ cổng: bấm Chuẩn bị hoặc Nạp lại tệp đã sửa để tải.</span>}
            </div>

            <section className="kt-sheet" aria-label="Chi tiết theo sheet">
              <h3>Chi tiết theo sheet</h3>
              <div className="kt-sheet__tab" role="tablist">
                {k.sheets.map((x) => (
                  <button key={x.ten} type="button" role="tab" aria-selected={x.ten === sheet} className={`kt-tab${x.ten === sheet ? ' kt-tab--chon' : ''}`} onClick={() => setSheet(x.ten)}>
                    {x.ten}
                    {x.dat ? <span className="nhan nhan--kn-ok">Đạt</span> : <span className="nhan nhan--kn-chan">{x.so_loi} lỗi</span>}
                    {x.so_xem_lai > 0 && <span className="nhan nhan--kn-canh_bao" title="Mục cần xem lại, không chặn">{x.so_xem_lai} xem lại</span>}
                  </button>
                ))}
              </div>
              <div className="kt-sheet__noi-dung" role="tabpanel">
                {muc.length === 0 ? (
                  <p className="rong-tim">Sheet này không có lỗi{sheetHien ? ` (${sheetHien.so_dong} dòng)` : ''}.</p>
                ) : (
                  <div className="kt-bang-cuon">
                    <table className="kt-bang">
                      <thead><tr><th>Dòng</th><th>Ô</th><th>Cột</th><th>Mức</th><th>Mã</th><th>Nội dung</th><th>Hướng xử lý</th></tr></thead>
                      <tbody>
                        {muc.slice(0, SO_DONG_TOI_DA).map((x, i) => (
                          <tr key={`${x.o}-${x.ma}-${i}`}>
                            <td className="so">{x.dong ?? '—'}</td>
                            <td><code>{x.o}</code></td>
                            <td>{x.cot ?? '—'}</td>
                            <td><span className={`nhan ${x.muc === 'loi' ? 'nhan--kn-chan' : 'nhan--kn-canh_bao'}`}>{x.muc === 'loi' ? 'Lỗi' : 'Xem lại'}</span></td>
                            <td><code>{x.ma}</code></td>
                            <td>{x.noi_dung}</td>
                            <td className="phu">{x.huong_xu_ly ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {muc.length > SO_DONG_TOI_DA && <p className="phu kt-bang__them">Hiện {SO_DONG_TOI_DA}/{muc.length} mục đầu của sheet này.</p>}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <footer className="hop-kt__chan">
        <p className="phu">Sửa lỗi ngay trong tệp Excel rồi nạp lại để kiểm tra lại. Sau khi kiểm tra lại, bấm Chuẩn bị để tính lại thay đổi trước khi gửi.</p>
        <div className="hop-kt__nut">
          <button type="button" className="nut nut--chinh" onClick={() => { void kiemLai(); }} disabled={!kiemDuoc} title={!don.taiKhoan ? 'Cần Kiểm tra kết nối trước' : !don.excelCo ? 'Chưa có tệp Excel' : undefined}>
            {dangKiem ? <span className="quay" aria-hidden="true" /> : <IcLamMoi />} {k ? 'Nạp lại tệp đã sửa' : 'Kiểm tra tệp'}
          </button>
          <button type="button" className="nut" onClick={onClose}>Đóng</button>
        </div>
      </footer>
    </dialog>
  );
}
