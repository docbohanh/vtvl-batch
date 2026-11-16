import { useCallback, useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, KetQuaForceSync } from '../types';
import { IcCanhBao, IcLamMoi } from './Icons';
import { HET_HAN_MS, laLanBamThuHai } from '../haiBuoc';

export interface ForceSyncDialogProps {
  don: DonVi;
  nguoi: string;
  open: boolean;
  onClose: () => void;
}

const CAC_BUOC = [
  'Kiểm tra kết nối và tệp Excel: phải đọc được, có dữ liệu, không còn dòng lỗi chặn',
  'Xóa hết dữ liệu của hồ sơ trên cổng (A1, A2, B1, B2, C1, C2, C3, D1, Dự báo, D2)',
  'Chuẩn bị lại: so Excel với cổng đã trống (mọi dòng thành dòng tạo mới)',
  'Gửi đồng bộ Excel mới lên cổng',
];

/** Hộp thoại "Force Sync": kiểm tra Excel, xóa hết dữ liệu trên cổng rồi gửi lại Excel mới trong một lần chạy. Bấm hai lần để xác nhận. Không hoàn tác được. */
export function ForceSyncDialog({ don, nguoi, open, onClose }: ForceSyncDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sanSangLuc, setSanSangLuc] = useState<number | null>(null);
  const hetHan = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [ketQua, setKetQua] = useState<KetQuaForceSync | null>(null);
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
      setKetQua(null); setLoi(null); huyXacNhan();
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, huyXacNhan]);

  useEffect(() => huyXacNhan, [huyXacNhan]);

  async function chay() {
    setDangChay(true); setLoi(null); setKetQua(null);
    try { setKetQua(await api.forceSync(don.username)); } catch (e) { setLoi(loiThanhChuoi(e)); } finally { setDangChay(false); }
  }

  /** Lần bấm đầu: nút chuyển sang "Bấm lần nữa" (tự hủy sau `HET_HAN_MS`); lần hai: chạy thật. */
  function bam() {
    if (!laLanBamThuHai(sanSangLuc, Date.now())) {
      if (sanSangLuc === null) {
        setSanSangLuc(Date.now());
        hetHan.current = setTimeout(huyXacNhan, HET_HAN_MS);
      }
      return;
    }
    huyXacNhan();
    void chay();
  }

  const tk = don.taiKhoan;
  const duocChay = !!nguoi.trim() && !dangChay && !ketQua && don.excelCo;

  return (
    <dialog ref={ref} className="hop-xoa" onClose={onClose} onCancel={(e) => { if (dangChay) e.preventDefault(); }} aria-labelledby={`fs-${don.username}`}>
      <header className="hop-xoa__dau">
        <span className="hop-xoa__icon" aria-hidden="true"><IcCanhBao /></span>
        <div>
          <h2 id={`fs-${don.username}`}>Force Sync</h2>
          <p>Xóa hết dữ liệu hiện có của hồ sơ trên cổng rồi gửi lại Excel mới. <b>Xóa không hoàn tác được.</b></p>
        </div>
      </header>

      <dl className="hop-xoa__thong-tin">
        <div><dt>Tài khoản cổng</dt><dd>{don.label || don.username} · {don.username}{tk ? ` · ${tk.donVi}` : ''}</dd></div>
        <div><dt>Hồ sơ</dt><dd>{tk ? tk.ky : 'Sẽ lấy khi kiểm tra kết nối'}{tk && <><br /><code>{tk.hoSo.id}</code></>}</dd></div>
        <div><dt>Người thực hiện</dt><dd>{nguoi.trim() || <span className="loi-chu">Chưa nhập ở đầu trang</span>}</dd></div>
      </dl>

      <ol className="hop-xoa__chu">
        {CAC_BUOC.map((b) => <li key={b}>{b}</li>)}
      </ol>
      <p className="hop-xoa__chu">Nếu bước 1 không đạt, cổng còn nguyên. Từ bước 2 trở đi cổng đã bị xóa: nếu bước 3 hoặc 4 lỗi, sửa rồi bấm Chuẩn bị và Gửi để đưa dữ liệu lên lại. Ở chế độ khô (<code>choPhepGuiThat: false</code>) Force Sync bị khóa.</p>

      {dangChay && <p className="thong-bao" role="status"><span className="quay" aria-hidden="true" /> Đang chạy, đừng đóng ứng dụng. Theo dõi bước hiện tại trên thẻ đơn vị.</p>}
      {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
      {ketQua && <p className="thong-bao" role="status">Đã xong: xóa {ketQua.daXoa} dòng trên cổng, gửi {ketQua.daGui} thay đổi từ Excel mới.</p>}

      <footer className="hop-xoa__chan">
        <button type="button" className="nut" onClick={onClose} disabled={dangChay}>{ketQua || loi ? 'Đóng' : 'Hủy'}</button>
        {!ketQua && sanSangLuc !== null && <span className="hop-xoa__nhac" role="status">Bấm lần nữa trong {HET_HAN_MS / 1000} giây để chạy. Không hoàn tác được.</span>}
        {!ketQua && (
          <button type="button" className={`nut nut--nguy${sanSangLuc !== null ? ' nut--san-sang' : ''}`} onClick={bam} disabled={!duocChay}
            title={!nguoi.trim() ? 'Nhập tên người vận hành ở đầu trang' : !don.excelCo ? 'Chưa có tệp Excel' : undefined}>
            {dangChay ? <span className="quay" aria-hidden="true" /> : <IcLamMoi />} {sanSangLuc !== null ? 'Bấm lần nữa để chạy' : loi ? 'Chạy lại Force Sync' : 'Force Sync'}
          </button>
        )}
      </footer>
    </dialog>
  );
}
