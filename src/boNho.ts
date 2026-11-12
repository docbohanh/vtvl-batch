import { useCallback, useState } from 'react';

/** Trạng thái bật/tắt nhớ lại giữa các lần mở (chỉ tiện lợi; bộ nhớ trình duyệt có thể không dùng được). */
export function useNhoBoolean(khoa: string, macDinh: () => boolean): [boolean, (v: boolean | ((cu: boolean) => boolean)) => void] {
  const [giaTri, dat] = useState<boolean>(() => {
    try {
      const c = localStorage.getItem(khoa);
      if (c === '1') return true;
      if (c === '0') return false;
    } catch { /* bỏ qua */ }
    return macDinh();
  });
  const doi = useCallback((v: boolean | ((cu: boolean) => boolean)) => {
    dat((cu) => {
      const moi = typeof v === 'function' ? v(cu) : v;
      try { localStorage.setItem(khoa, moi ? '1' : '0'); } catch { /* bỏ qua */ }
      return moi;
    });
  }, [khoa]);
  return [giaTri, doi];
}

/** Màn hình hẹp (laptop 1024×768 trở xuống): mặc định thu gọn đầu trang và cây đơn vị. */
export const MAN_HINH_HEP_PX = 1280;
export const laManHinhHep = (): boolean => typeof window !== 'undefined' && window.innerWidth < MAN_HINH_HEP_PX;
