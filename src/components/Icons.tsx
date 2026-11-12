import type { SVGProps } from 'react';

/** Bộ biểu tượng SVG kiểu Lucide (24×24, nét 2). Chỉ trang trí nên `aria-hidden`; chữ đi kèm luôn có. */
function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IcThuMuc = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>;
export const IcKetNoi = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" /></Icon>;
export const IcTep = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></Icon>;
export const IcThayDoi = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M11 18H8a2 2 0 0 1-2-2V9" /></Icon>;
export const IcGui = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></Icon>;
export const IcDoiChieu = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></Icon>;
export const IcCanhBao = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></Icon>;
export const IcChua = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></Icon>;
export const IcKhoa = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></Icon>;
export const IcLamMoi = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></Icon>;
export const IcLoa = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></Icon>;
export const IcNguoi = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Icon>;
export const IcXoa = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></Icon>;
export const IcDoiTep = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3-3 3 3" /></Icon>;
export const IcThem = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
export const IcSua = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>;
export const IcMat = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const IcMatGach = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.9 4M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6" /><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" /><path d="m2 2 20 20" /></Icon>;
export const IcTim = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>;
export const IcSaoChep = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>;
export const IcMuiTen = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
export const IcMoTatCa = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></Icon>;
export const IcThuTatCa = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m7 20 5-5 5 5" /><path d="m7 4 5 5 5-5" /></Icon>;
export const IcDong = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
export const IcKiemTra = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon>;
export const IcLichSu = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></Icon>;
export const IcTongQuan = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Icon>;
export const IcMui = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
