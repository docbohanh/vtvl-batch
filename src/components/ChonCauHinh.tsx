import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { MucLichSu } from '../lichSuLo';
import { IcLamMoi, IcTep, IcThuMuc, IcXoa } from './Icons';

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
  /** Các lô đã nạp, mới nhất trước. */
  lichSu: MucLichSu[];
  onChonLichSu: (duongDan: string) => void;
  onXoaLichSu: (duongDan: string) => void;
  onXoaHetLichSu: () => void;
}

const tenTep = (p: string) => p.split(/[\\/]/).pop() ?? p;
const thuMucCha = (p: string) => p.split(/[\\/]/).slice(-3, -1).join('/');
const gioVi = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }); };

/** Nhóm "Cấu hình JSON": tên tệp một dòng (đường dẫn đầy đủ khi rê chuột), nút chọn tệp, nút nạp lại. */
export function ChonCauHinh({ duongDan, dangBan, onChon, onNapLai, lichSu, onChonLichSu, onXoaLichSu, onXoaHetLichSu }: ChonCauHinhProps) {
  const ten = tenTep(duongDan);
  const [moLs, setMoLs] = useState(false);
  const goc = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moLs) return;
    const dong = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !goc.current?.contains(e.target as Node)) setMoLs(false); };
    document.addEventListener('mousedown', dong);
    document.addEventListener('keydown', dong);
    return () => { document.removeEventListener('mousedown', dong); document.removeEventListener('keydown', dong); };
  }, [moLs]);
  return (
    <div className="cau-hinh">
      <span className="nhan-truong">Cấu hình JSON</span>
      <div className="cau-hinh__nhom">
        <div className="lich-su" ref={goc}>
          <button type="button" className={`cau-hinh__tep cau-hinh__tep--nut${duongDan ? '' : ' cau-hinh__tep--trong'}`} disabled={dangBan} onClick={() => setMoLs((v) => !v)} aria-haspopup="true" aria-expanded={moLs} title={duongDan ? `${duongDan}\nBấm để xem lịch sử các lô đã dùng` : 'Bấm để xem lịch sử các lô đã dùng'}>
            <IcTep />
            <span>{duongDan ? ten : 'Chưa chọn tệp'}</span>
          </button>
          {moLs && (
            <div className="lich-su__bang" role="menu" aria-label="Lịch sử các lô đã nạp">
              {lichSu.length === 0 ? <p className="phu lich-su__trong">Chưa có lô nào được nạp.</p> : (
                <>
                  <ul>
                    {lichSu.map((m) => (
                      <li key={m.duongDan} className={m.duongDan === duongDan ? 'lich-su__dang' : undefined}>
                        <button type="button" role="menuitem" className="lich-su__muc" title={m.duongDan} onClick={() => { setMoLs(false); onChonLichSu(m.duongDan); }}>
                          <b>{tenTep(m.duongDan)}</b>
                          <small>{thuMucCha(m.duongDan)} · {m.soDonVi} đơn vị · {gioVi(m.luc)}</small>
                        </button>
                        <button type="button" className="lich-su__xoa" onClick={() => onXoaLichSu(m.duongDan)} aria-label={`Xóa ${tenTep(m.duongDan)} khỏi lịch sử`} title="Xóa khỏi lịch sử (không xóa tệp)"><IcXoa /></button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="lich-su__het" onClick={() => { onXoaHetLichSu(); setMoLs(false); }}>Xóa toàn bộ lịch sử</button>
                </>
              )}
            </div>
          )}
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
