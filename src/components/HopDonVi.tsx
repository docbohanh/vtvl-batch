import { useEffect, useRef, type ReactNode } from 'react';
import { IcDong } from './Icons';

export interface HopDonViProps {
  open: boolean;
  tieuDe: string;
  onClose: () => void;
  children: ReactNode;
}

/** Hộp thoại chứa thẻ đơn vị của lô (đăng nhập, Excel, chuẩn bị, gửi…) để quản trị làm việc với một đơn vị ngay từ trang Quản trị. */
export function HopDonVi({ open, tieuDe, onClose, children }: HopDonViProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="hop-kt hop-don-vi" onClose={onClose} aria-label={`Quản trị đơn vị ${tieuDe}`}>
      <header className="hop-kt__dau">
        <div>
          <p className="hop-tq__vet">Quản trị đơn vị</p>
          <h2>{tieuDe}</h2>
        </div>
        <button type="button" className="nut nut--vuong nut--gon" onClick={onClose} aria-label="Đóng"><IcDong /></button>
      </header>
      <div className="hop-kt__than">{open ? children : null}</div>
    </dialog>
  );
}
