import { useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, DongDem, KetQuaXoa } from '../types';
import { IcCanhBao, IcLamMoi, IcXoa } from './Icons';

const CHUOI_XAC_NHAN = 'XOA TOAN BO';

export interface XoaDuLieuDialogProps {
  don: DonVi;
  nguoi: string;
  open: boolean;
  onClose: () => void;
}

/** Hộp thoại "Xóa dữ liệu cũ trên cổng" của một đơn vị: xem trước số dòng, gõ chuỗi xác nhận, xóa. Không hoàn tác được. */
export function XoaDuLieuDialog({ don, nguoi, open, onClose }: XoaDuLieuDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [xem, setXem] = useState<DongDem[] | null>(null);
  const [ketQua, setKetQua] = useState<KetQuaXoa[] | null>(null);
  const [xacNhan, setXacNhan] = useState('');
  const [dangDem, setDangDem] = useState(false);
  const [dangXoa, setDangXoa] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setXem(null); setKetQua(null); setXacNhan(''); setLoi(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const tk = don.taiKhoan;
  const tong = xem?.reduce((a, d) => a + (d.soDong ?? 0), 0) ?? 0;
  const bu = dangDem || dangXoa;
  const duocXoa = !!xem && xacNhan.trim() === CHUOI_XAC_NHAN && !!nguoi.trim() && !bu && !ketQua;

  async function demDong() {
    setDangDem(true); setLoi(null); setKetQua(null);
    try { setXem(await api.xoaDem(don.username)); } catch (e) { setLoi(loiThanhChuoi(e)); setXem(null); } finally { setDangDem(false); }
  }

  async function xoa() {
    setDangXoa(true); setLoi(null);
    try { setKetQua(await api.xoaDuLieu(don.username, xacNhan.trim())); setXacNhan(''); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangXoa(false); }
  }

  return (
    <dialog ref={ref} className="hop-xoa" onClose={onClose} aria-labelledby={`xoa-${don.username}`}>
      <header className="hop-xoa__dau">
        <span className="hop-xoa__icon" aria-hidden="true"><IcCanhBao /></span>
        <div>
          <h2 id={`xoa-${don.username}`}>Xóa dữ liệu cũ trên cổng</h2>
          <p>Xóa các dòng A1, A2, B1, B2, C1, C2, C3, D1, Dự báo, D2 của hồ sơ (từ biểu sau về biểu trước). <b>Không hoàn tác được.</b></p>
        </div>
      </header>

      <dl className="hop-xoa__thong-tin">
        <div><dt>Tài khoản cổng</dt><dd>{don.label || don.username} · {don.username}{tk ? ` · ${tk.donVi}` : ''}</dd></div>
        <div><dt>Hồ sơ</dt><dd>{tk ? `${tk.ky}` : 'Chưa biết: cần Kiểm tra kết nối trước'}{tk && <><br /><code>{tk.hoSo.id}</code></>}</dd></div>
        <div><dt>Người thực hiện</dt><dd>{nguoi.trim() || <span className="loi-chu">Chưa nhập ở đầu trang</span>}</dd></div>
      </dl>
      <p className="hop-xoa__chu">Xóa theo cách ứng dụng Desktop: tạo thay đổi <code>DELETE</code> cho từng dòng rồi đẩy lên cổng bằng gói thay đổi (cổng chặn xóa trực tiếp qua web). Chạy bằng cookie của tài khoản này và ghi vào nhật ký của đơn vị. Ở chế độ khô (<code>choPhepGuiThat: false</code>) nút xóa bị khóa.</p>

      <div className="hop-xoa__hang">
        <button type="button" className="nut" onClick={() => { void demDong(); }} disabled={bu || !tk}>{dangDem ? <span className="quay" aria-hidden="true" /> : <IcLamMoi />} Xem trước số dòng</button>
      </div>

      {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}

      {xem && !ketQua && (
        <>
          <table className="bang">
            <caption className="sr-only">Số dòng sẽ bị xóa theo biểu</caption>
            <thead><tr><th scope="col">Biểu</th><th scope="col" className="so">Số dòng</th></tr></thead>
            <tbody>
              {xem.map((d) => <tr key={d.khoa}><td>{d.ten}</td><td className="so">{d.soDong ?? <span className="loi-chu" title={d.loi ?? undefined}>lỗi</span>}</td></tr>)}
            </tbody>
            <tfoot><tr><th scope="row">Tổng</th><td className="so">{tong}</td></tr></tfoot>
          </table>
          <label className="hop-xoa__xn" htmlFor={`xn-${don.username}`}>Gõ <b>{CHUOI_XAC_NHAN}</b> để xác nhận</label>
          <input id={`xn-${don.username}`} value={xacNhan} onChange={(e) => setXacNhan(e.target.value)} placeholder={CHUOI_XAC_NHAN} autoComplete="off" spellCheck={false} />
        </>
      )}

      {ketQua && (
        <>
          <h3 className="hop-xoa__tieu-de-nho">Kết quả</h3>
          <table className="bang">
            <thead><tr><th scope="col">Biểu</th><th scope="col" className="so">Đã xóa</th><th scope="col" className="so">Còn lại</th></tr></thead>
            <tbody>
              {ketQua.map((k) => (
                <tr key={k.khoa}>
                  <td>{k.ten}{k.loi && <span className="loi-chu"> · {k.loi}</span>}</td>
                  <td className="so">{k.daXoa}</td>
                  <td className={`so${k.conLai ? ' loi-chu' : ''}`}>{k.conLai ?? '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="thong-bao thong-bao--chu-y" role="status"><IcCanhBao />Đã xong. Chạy lại Chuẩn bị để tính thay đổi trên dữ liệu mới.</p>
        </>
      )}

      <footer className="hop-xoa__chan">
        <button type="button" className="nut" onClick={onClose}>{ketQua ? 'Đóng' : 'Hủy'}</button>
        {!ketQua && <button type="button" className="nut nut--nguy" onClick={() => { void xoa(); }} disabled={!duocXoa}>{dangXoa ? <span className="quay" aria-hidden="true" /> : <IcXoa />} Xóa toàn bộ dữ liệu</button>}
      </footer>
    </dialog>
  );
}
