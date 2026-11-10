import { open } from '@tauri-apps/plugin-dialog';
import { IcLamMoi, IcTep, IcThuMuc } from './Icons';

/** Mở hộp thoại hệ điều hành chọn tệp JSON cấu hình lô; trả đường dẫn hoặc null nếu hủy. */
export async function chonTepCauHinh(): Promise<string | null> {
  const kq = await open({ multiple: false, directory: false, title: 'Chọn tệp cấu hình lô (.json)', filters: [{ name: 'Cấu hình lô', extensions: ['json'] }] });
  return typeof kq === 'string' ? kq : null;
}

export interface ChonCauHinhProps {
  duongDan: string;
  dangBan: boolean;
  onChon: (duongDan: string) => void;
  onNapLai: () => void;
}

/** Nhóm "Cấu hình JSON": tên tệp một dòng (đường dẫn đầy đủ khi rê chuột), nút chọn tệp, nút nạp lại. */
export function ChonCauHinh({ duongDan, dangBan, onChon, onNapLai }: ChonCauHinhProps) {
  const ten = duongDan.split(/[\\/]/).pop() ?? '';
  return (
    <div className="cau-hinh">
      <span className="nhan-truong">Cấu hình JSON</span>
      <div className="cau-hinh__nhom">
        <div className={`cau-hinh__tep${duongDan ? '' : ' cau-hinh__tep--trong'}`} title={duongDan || undefined}>
          <IcTep />
          <span>{duongDan ? ten : 'Chưa chọn tệp'}</span>
        </div>
        <button type="button" className="nut nut--gon" disabled={dangBan} onClick={() => { void chonTepCauHinh().then((p) => { if (p) onChon(p); }); }}>
          <IcThuMuc /> {duongDan ? 'Đổi tệp…' : 'Chọn tệp…'}
        </button>
        <button type="button" className="nut nut--vuong nut--gon" disabled={dangBan || !duongDan} onClick={onNapLai} aria-label="Nạp lại cấu hình" title="Nạp lại cấu hình">
          <IcLamMoi />
        </button>
      </div>
    </div>
  );
}
