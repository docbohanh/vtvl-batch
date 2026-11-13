import { useCallback, useMemo } from 'react';
import type { DuLieuBieuQt, KetQuaThamDinh, TomTatBieuQt } from '../types';
import { BoBieuXem } from './BoBieuXem';
import { IcCanhBao, IcKiemTra } from './Icons';

const dungLuong = (b: number): string => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const tomTat = (b: DuLieuBieuQt): TomTatBieuQt => ({ khoa: b.bieu.khoa, ma: b.bieu.ma, tieuDe: b.bieu.tieuDe, buoc: b.bieu.buoc, soDong: b.tong, trangThai: b.trangThai, dongChuaDat: b.dongChuaDat });

export interface ThamDinhExcelPageProps {
  kq: KetQuaThamDinh | null;
  dangChay: boolean;
  loi: string | null;
  /** Mã tăng sau mỗi lần nạp tệp để giao diện xem biểu đặt lại. */
  lanNap: number;
  onChonTep: () => void;
  onVe: () => void;
}

/** Trang "Thẩm định Excel": xem một tệp bộ biểu độc lập như khi chọn một đơn vị (tab từng biểu, tìm/lọc/sắp xếp, so sánh B1 ↔ C3). Dữ liệu đọc từ tệp trên máy, không qua cổng và không được lưu. */
export function ThamDinhExcelPage({ kq, dangChay, loi, lanNap, onChonTep, onVe }: ThamDinhExcelPageProps) {
  const layDanhSach = useCallback(async () => (kq ? kq.bieu.map(tomTat) : []), [kq]);
  const layBieu = useCallback(async (khoa: string) => {
    const b = kq?.bieu.find((x) => x.bieu.khoa === khoa);
    if (!b) throw new Error('Tệp không có biểu này');
    return b;
  }, [kq]);
  const thongBao = useMemo(() => (kq && kq.canhBao.length > 0 ? <p className="thong-bao thong-bao--chu-y"><IcCanhBao />{kq.canhBao.join(' · ')}</p> : null), [kq]);

  return (
    <div className="qt">
      {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
      {dangChay && <p className="thong-bao thong-bao--thong-tin" role="status"><span className="quay" aria-hidden="true" /> Đang kiểm tra tệp, bộ biểu lớn có thể mất vài chục giây…</p>}
      {!kq && !dangChay && (
        <div className="rong qt__rong">
          <h2>Thẩm định Excel</h2>
          <p>Chọn một tệp bộ biểu .xlsx để xem và kiểm tra độc lập ngay trên máy: không đăng nhập, không gửi gì lên cổng, kết quả không được lưu.</p>
          <div className="nhom-nut">
            <button type="button" className="nut nut--chinh" onClick={onChonTep}><IcKiemTra /> Chọn tệp Excel</button>
            <button type="button" className="nut" onClick={onVe}>← Quay lại</button>
          </div>
        </div>
      )}
      {kq && (
        <div className="qt__chi-tiet">
          <BoBieuXem
            khoaNap={`excel-${lanNap}`} tenAria={`Thẩm định tệp ${kq.tenTep}`} khoaGon="vtvl-batch.gon-excel" nguon="từ tệp Excel"
            layDanhSach={layDanhSach} layBieu={layBieu} thongBao={thongBao}
            dau={(
              <>
                <h2>{kq.tenTep}</h2>
                <p className="hsqt__phu">{dungLuong(kq.kichThuoc)} · <b>{kq.tongDong.toLocaleString('vi-VN')}</b> dòng · <b>{kq.dongLoi.toLocaleString('vi-VN')}</b> dòng có lỗi · thẩm định trên máy, không qua cổng</p>
                <p className="hsqt__phu">“Đạt” chỉ là kiểm tra kỹ thuật; vẫn cần người thẩm định xác nhận nghiệp vụ. Các cột tự tính chưa có trong tệp để trống, riêng B1 tính sẵn mã VTVL, giờ SP và giờ tổng (ước tính theo phút đo thực tế).</p>
              </>
            )}
            nut={() => (
              <>
                <button type="button" className="nut" onClick={onChonTep} disabled={dangChay}><IcKiemTra /> Chọn tệp khác</button>
                <button type="button" className="nut nut--chinh" onClick={onVe}>← Quay lại</button>
              </>
            )}
          />
        </div>
      )}
    </div>
  );
}
