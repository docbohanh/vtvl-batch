import { useCallback, useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, DongDem, KetQuaXoa } from '../types';
import { IcCanhBao, IcLamMoi, IcXoa } from './Icons';
import { HET_HAN_MS, laLanBamThuHai } from '../haiBuoc';

export interface XoaDuLieuDialogProps {
  don: DonVi;
  nguoi: string;
  open: boolean;
  onClose: () => void;
}

/** Hộp thoại "Xóa dữ liệu cũ trên cổng" của một đơn vị: xem trước số dòng, bấm xóa hai lần để xác nhận. Không hoàn tác được. */
export function XoaDuLieuDialog({ don, nguoi, open, onClose }: XoaDuLieuDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [xem, setXem] = useState<DongDem[] | null>(null);
  const [ketQua, setKetQua] = useState<KetQuaXoa[] | null>(null);
  const [sanSangLuc, setSanSangLuc] = useState<number | null>(null); // đã bấm lần một (thời điểm); lần hai mới xóa
  const hetHan = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dangDem, setDangDem] = useState(false);
  const [dangXoa, setDangXoa] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const huyXacNhan = useCallback(() => {
    if (hetHan.current) clearTimeout(hetHan.current);
    hetHan.current = null;
    setSanSangLuc(null);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setXem(null); setKetQua(null); huyXacNhan(); setLoi(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, huyXacNhan]);

  useEffect(() => huyXacNhan, [huyXacNhan]); // dọn bộ đếm khi đóng thẻ

  const tk = don.taiKhoan;
  const tong = xem?.reduce((a, d) => a + (d.soDong ?? 0), 0) ?? 0;
  const bu = dangDem || dangXoa;
  const duocXoa = !!xem && !!nguoi.trim() && !bu && !ketQua;

  async function demDong() {
    huyXacNhan(); setDangDem(true); setLoi(null); setKetQua(null);
    try { setXem(await api.xoaDem(don.username)); } catch (e) { setLoi(loiThanhChuoi(e)); setXem(null); } finally { setDangDem(false); }
  }

  /** Lần bấm đầu: chuyển nút sang "Bấm lần nữa để xóa" (tự hủy sau `HET_HAN_MS`); lần hai: xóa thật. */
  function bamXoa() {
    if (!laLanBamThuHai(sanSangLuc, Date.now())) {
      if (sanSangLuc === null) {
        setSanSangLuc(Date.now());
        hetHan.current = setTimeout(huyXacNhan, HET_HAN_MS);
      }
      return;
    }
    huyXacNhan();
    void xoa();
  }

  async function xoa() {
    setDangXoa(true); setLoi(null);
    try { setKetQua(await api.xoaDuLieu(don.username)); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangXoa(false); }
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
        {!ketQua && sanSangLuc !== null && <span className="hop-xoa__nhac" role="status">Bấm lần nữa trong {HET_HAN_MS / 1000} giây để xóa. Không hoàn tác được.</span>}
        {!ketQua && (
          <button type="button" className={`nut nut--nguy${sanSangLuc !== null ? ' nut--san-sang' : ''}`} onClick={bamXoa} disabled={!duocXoa} title={!xem ? 'Bấm Xem trước số dòng trước' : !nguoi.trim() ? 'Nhập tên người vận hành ở đầu trang' : undefined}>
            {dangXoa ? <span className="quay" aria-hidden="true" /> : <IcXoa />} {sanSangLuc !== null ? 'Bấm lần nữa để xóa' : 'Xóa toàn bộ dữ liệu'}
          </button>
        )}
      </footer>
    </dialog>
  );
}
