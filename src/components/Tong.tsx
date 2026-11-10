import { DIEU_KIEN, NHAN_LOC, type LocTrangThai } from '../loc';
import type { DonVi } from '../types';

export interface TongProps {
  don: DonVi[];
  loc: LocTrangThai | null;
  onLoc: (loc: LocTrangThai | null) => void;
}

interface Chi { khoa: LocTrangThai | null; nhan: string; so: number; phu?: string; sac: 'trung' | 'tot' | 'xau' }

/** Thống kê gọn của lô trên đầu trang. Mỗi chip là nút bật/tắt bộ lọc danh sách theo trạng thái; chip "Đơn vị" bỏ lọc. */
export function Tong({ don, loc, onLoc }: TongProps) {
  const bat = don.filter((d) => d.enabled);
  const ketNoiOn = don.filter(DIEU_KIEN.ketNoi).length;
  const sanSang = don.filter(DIEU_KIEN.sanSang);
  const canXuLy = don.filter(DIEU_KIEN.canXuLy).length;
  const td = sanSang.reduce((a, d) => ({ tao: a.tao + (d.trangThai.thayDoi?.tao ?? 0), sua: a.sua + (d.trangThai.thayDoi?.sua ?? 0), bo: a.bo + (d.trangThai.thayDoi?.bo ?? 0) }), { tao: 0, sua: 0, bo: 0 });
  const cac: Chi[] = [
    { khoa: null, nhan: 'Đơn vị', so: bat.length, phu: don.length > bat.length ? `${don.length - bat.length} tắt` : undefined, sac: 'trung' },
    { khoa: 'ketNoi', nhan: NHAN_LOC.ketNoi, so: ketNoiOn, phu: `/${bat.length}`, sac: ketNoiOn === bat.length && bat.length > 0 ? 'tot' : 'trung' },
    { khoa: 'sanSang', nhan: NHAN_LOC.sanSang, so: sanSang.length, phu: sanSang.length ? `+${td.tao} ~${td.sua} −${td.bo}` : undefined, sac: sanSang.length > 0 ? 'tot' : 'trung' },
    { khoa: 'canXuLy', nhan: NHAN_LOC.canXuLy, so: canXuLy, sac: canXuLy ? 'xau' : 'trung' },
  ];
  return (
    <ul className="thong-ke" aria-label="Tổng quan lô, bấm để lọc danh sách">
      {cac.map((c) => {
        const bam = c.khoa === loc; // chip "Đơn vị" sáng khi không lọc
        return (
          <li key={c.nhan}>
            <button
              type="button"
              className={`thong-ke__chi thong-ke__chi--${c.sac}${bam ? ' thong-ke__chi--bam' : ''}`}
              aria-pressed={bam}
              onClick={() => onLoc(c.khoa === null || c.khoa === loc ? null : c.khoa)}
              title={c.khoa === null ? 'Hiện tất cả đơn vị' : bam ? `Bỏ lọc “${c.nhan}”` : `Chỉ hiện đơn vị “${c.nhan}”`}
            >
              <b>{c.so}</b>
              <span>{c.nhan}</span>
              {c.phu && <small>{c.phu}</small>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
