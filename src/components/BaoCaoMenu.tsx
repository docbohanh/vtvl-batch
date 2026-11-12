import { useEffect, useId, useRef, useState } from 'react';
import { IcTaiXuong } from './Icons';
import { XuatBaoCaoDialog } from './XuatBaoCaoDialog';
import { XuatTienDoDialog } from './XuatTienDoDialog';

/** Danh mục báo cáo. Thêm báo cáo mới: thêm một mục ở đây và một nhánh trong `HopBaoCao`. */
export interface MucBaoCao { khoa: string; ten: string; moTa: string }
export const DANH_MUC_BAO_CAO: readonly MucBaoCao[] = [
  { khoa: 'tong_hop_cay', ten: 'Báo cáo tổng hợp - Biểu 01', moTa: 'Theo cây đơn vị: nhiệm vụ, công việc, sản phẩm, VTVL, nhu cầu nhân lực, phương án biên chế 2027–2031, B1, C3 (Excel 3 sheet)' },
  { khoa: 'tien_do', ten: 'Báo cáo tiến độ nhập liệu', moTa: 'Đơn vị chưa nhập và đơn vị chậm tiến độ, mỗi loại một sheet, theo cây đơn vị phân cấp' },
];

function HopBaoCao({ khoa, onDong }: { khoa: string | null; onDong: () => void }) {
  return (
    <>
      <XuatBaoCaoDialog mo={khoa === 'tong_hop_cay'} onDong={onDong} />
      <XuatTienDoDialog mo={khoa === 'tien_do'} onDong={onDong} />
    </>
  );
}

/** Nút "Báo cáo" ở header: bấm mở menu chọn báo cáo cần xuất, chọn xong mở hộp thoại của báo cáo đó. */
export function BaoCaoMenu() {
  const [moMenu, setMoMenu] = useState(false);
  const [dangMo, setDangMo] = useState<string | null>(null);
  const goc = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!moMenu) return;
    const ngoai = (e: MouseEvent) => { if (goc.current && !goc.current.contains(e.target as Node)) setMoMenu(false); };
    const phim = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoMenu(false); };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', phim);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('keydown', phim); };
  }, [moMenu]);

  return (
    <div className="tk-qt bc-menu" ref={goc}>
      <span className="nhan-truong"><IcTaiXuong /> Báo cáo</span>
      <button type="button" className="nut tk-qt__nut" aria-haspopup="menu" aria-expanded={moMenu} aria-controls={id} onClick={() => setMoMenu((m) => !m)} title="Chọn báo cáo cần xuất">
        Xuất báo cáo <span className="bc-menu__mui" aria-hidden="true">▾</span>
      </button>
      {moMenu && (
        <ul id={id} className="bc-menu__ds" role="menu" aria-label="Chọn báo cáo cần xuất">
          {DANH_MUC_BAO_CAO.map((m) => (
            <li key={m.khoa} role="none">
              <button type="button" role="menuitem" className="bc-menu__muc" onClick={() => { setMoMenu(false); setDangMo(m.khoa); }}>
                <b>{m.ten}</b>
                <small>{m.moTa}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <HopBaoCao khoa={dangMo} onDong={() => setDangMo(null)} />
    </div>
  );
}
