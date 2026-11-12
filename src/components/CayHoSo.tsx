import type { HangCay } from '../quanTri';
import { IcMui } from './Icons';

export interface CayHoSoProps {
  hang: readonly HangCay[];
  /** Mã hồ sơ đang chọn. */
  chon: string | null;
  onChon: (idHoSo: string) => void;
  /** Mở/đóng một nhánh. */
  onDoi: (idNut: string) => void;
}

const THUT_MOI_CAP_PX = 18;

/** Cây đơn vị: đơn vị cha ở trên, đơn vị con thụt vào. Đơn vị có hồ sơ thì chọn được; đơn vị chỉ là nhóm thì bấm để mở/đóng nhánh. */
export function CayHoSo({ hang, chon, onChon, onDoi }: CayHoSoProps) {
  return (
    <ul className="cay" role="tree" aria-label={`Cây đơn vị, ${hang.length} dòng đang hiện`}>
      {hang.map((h) => {
        const laHoSo = h.hoSo !== null;
        const dangChon = laHoSo && h.hoSo?.id === chon;
        return (
          <li key={h.id} role="none">
            <div role="treeitem" aria-level={h.sau + 1} aria-expanded={h.coCon ? h.dangMo : undefined} aria-selected={laHoSo ? dangChon : undefined}
              className={`cay__hang${laHoSo ? ' cay__hang--ho-so' : ' cay__hang--nhom'}${dangChon ? ' cay__hang--chon' : ''}`} style={{ paddingLeft: 6 + h.sau * THUT_MOI_CAP_PX }}>
              {h.coCon ? (
                <button type="button" className={`cay__mui${h.dangMo ? ' cay__mui--mo' : ''}`} onClick={() => onDoi(h.id)} aria-label={`${h.dangMo ? 'Thu gọn' : 'Mở'} nhánh ${h.ten}`}><IcMui /></button>
              ) : <span className="cay__mui cay__mui--trong" aria-hidden="true" />}
              <button type="button" className="cay__ten" onClick={() => { if (h.hoSo) onChon(h.hoSo.id); else onDoi(h.id); }} title={h.ten}>
                <span className="cay__ten-chu">{h.ten}</span>
                {h.hoSo && <span className="cay__phu" title={h.hoSo.taiKhoan.join(', ')}>{h.hoSo.taiKhoan[0] ?? 'chưa có tài khoản'}{h.hoSo.taiKhoan.length > 1 ? ` +${h.hoSo.taiKhoan.length - 1}` : ''}</span>}
              </button>
              <span className="cay__so">
                {h.hoSo && (
                  <span className="qt__tien-do" role="img" aria-label={`Tiến độ ${h.hoSo.tienDo}%`}><i style={{ width: `${Math.min(100, h.hoSo.tienDo)}%` }} /></span>
                )}
                {h.chuaDat > 0 && <span className="qt__chua-dat" title={`${h.chuaDat} dòng chưa đạt${h.coCon ? ' trong nhánh' : ''}`}>{h.chuaDat}</span>}
                {h.coCon && <span className="cay__dem" title={`${h.soHoSo} hồ sơ trong nhánh`}>{h.soHoSo}</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
