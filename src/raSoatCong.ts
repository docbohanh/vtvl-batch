import { boDau } from './quanTri.ts';

/**
 * Rà soát dữ liệu theo bộ mã của "Phụ lục kết quả rà soát dữ liệu VTVL – Vụ Địa phương I" (L01–L10, CL1–CL4, mức ưu tiên 1–4).
 * Đây là căn cứ chính của báo cáo thẩm định; công cụ web ThamDinh_BoBieu_VTVL (mã HS/KT/LK/A1xx…) chỉ bổ sung.
 * Hàm thuần: không I/O, không sửa dữ liệu vào.
 */

export interface DongNguon { so: number; duLieu: Readonly<Record<string, unknown>> }
export interface DauVaoRaSoat { c1: readonly DongNguon[]; a1: readonly DongNguon[]; a2: readonly DongNguon[] }

export const MA_LOI_C1 = ['L01', 'L02', 'L03', 'L03b', 'L03c', 'L07', 'L08', 'L09', 'L10'] as const;
export const MA_CHAT_LUONG = ['CL1', 'CL2', 'CL3', 'CL4'] as const;

/** Tên và cách sửa của từng mã, lấy từ sheet "Hướng dẫn" của báo cáo. */
export const MO_TA_MA: Readonly<Record<string, { ten: string; cachSua: string }>> = {
  L01: { ten: 'Không ghi quyết định', cachSua: 'Ghi quyết định phê duyệt VTVL có số hiệu.' },
  L02: { ten: 'Tự ghi chưa có quyết định phê duyệt', cachSua: 'Có quyết định thì ghi số hiệu; chưa có thì để dòng “Đề nghị bổ sung” kèm căn cứ pháp lý.' },
  L03: { ten: 'Căn cứ không có số hiệu văn bản', cachSua: 'Ghi đủ số/ký hiệu, dạng 1261/QĐ-UBND.' },
  L03b: { ten: 'Dẫn sai loại văn bản (tuyển dụng, bổ nhiệm, nâng lương, điều động)', cachSua: 'Thay bằng văn bản phê duyệt VTVL hoặc danh mục VTVL.' },
  L03c: { ten: 'Số hiệu để trống', cachSua: 'Điền số còn thiếu trong “Quyết định số …/QĐ-…”.' },
  L07: { ten: 'Chủ tịch/Phó Chủ tịch UBND ghi “Công chức”', cachSua: 'Đổi loại nhân lực thành “Cán bộ” (chức danh bầu cử).' },
  L08: { ten: 'Không ghi loại nhân lực', cachSua: 'Chọn loại nhân lực.' },
  L09: { ten: 'VTVL lập theo người', cachSua: 'Gộp các dòng “… 1”, “… 2”; số lượng nhập ở cột số người.' },
  L10: { ten: 'Thiếu mã hoặc tên VTVL', cachSua: 'Bổ sung mã/tên hoặc xóa dòng thừa.' },
  CL1: { ten: 'Tên VTVL lặp trong đơn vị', cachSua: 'Gộp hoặc đổi tên cho khác nhau.' },
  CL2: { ten: 'Mã VTVL lặp trong đơn vị', cachSua: 'Mỗi VTVL một mã.' },
  CL3: { ten: 'Tên VTVL dài hơn 120 ký tự', cachSua: 'Rút gọn tên.' },
  CL4: { ten: 'Tên VTVL có ngoặc hoặc “kiêm”', cachSua: 'Xem xét tách hoặc đặt tên rõ ràng.' },
};

export interface DongLoiC1 { dong: number; ma: string; ten: string; loai: string; quyetDinh: string; trangThai: string; maLoi: string[] }
export interface VanDeKhac { nhan: string; so: number }
export interface KetQuaRaSoat {
  soDongC1: number;
  dongLoi: number;
  /** 0..1, 0 khi không có dòng C1. */
  tyLeLoi: number;
  /** Số dòng mang từng mã (L… và CL…); mã không có dòng nào thì vắng. */
  dem: Readonly<Record<string, number>>;
  chiTiet: readonly DongLoiC1[];
  vanDe: readonly VanDeKhac[];
  mucUuTien: string;
  lyDoUuTien: string;
}

const NGUONG_TY_LE = 0.5;
const NGUONG_DONG = 10;
const DO_DAI_TEN_TOI_DA = 120;

const chu = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Số hiệu văn bản: 1261/QĐ-UBND, 150/2025/NĐ-CP, 12/TB-UBND. */
const SO_HIEU = /\d{1,6}(?:\/\d{4})?\/[A-ZĐa-zđ][A-ZĐa-zđ0-9]*(?:[-–][A-ZĐa-zđ0-9]+)*/;
const CHI_TRANG_THAI = new Set(['tiep tuc su dung', 'quyet dinh', 'cap nhat', 'can cap nhat', 'khong', 'khong co', 'dang cap nhat']);
const CUM_CHUA_CO = ['chua co', 'chua phe duyet', 'du thao', 'cho phe duyet', 'dang xay dung', 'chua cung cap'];
const SAI_LOAI = ['tuyen dung', 'bo nhiem', 'nang luong', 'dieu dong', 'bao hiem'];
const TRUOC_SO_KHONG_TINH = /(hang|bac|khu vuc|co so|diem|loai|nhom|cap|vung|ngach|lop)\s*$/;

export const laTrangThaiHoacKyHieu = (d: string): boolean => {
  const t = boDau(d).replace(/\s+/g, ' ').trim();
  return t === '' || /^[\W_]+$/.test(t) || CHI_TRANG_THAI.has(t);
};

/** Mã lỗi thuộc nhóm căn cứ C1!D của một dòng (L01, L02, L03, L03b, L03c). */
export function loiCanCu(quyetDinh: string, trangThai: string): string[] {
  const d = quyetDinh.trim();
  const dn = boDau(d);
  const kq: string[] = [];
  const deNghiBoSung = boDau(trangThai).includes('de nghi bo sung');
  if (laTrangThaiHoacKyHieu(d)) { if (!deNghiBoSung) kq.push('L01'); return kq; }
  const coSoHieu = SO_HIEU.test(d);
  if (!coSoHieu && CUM_CHUA_CO.some((c) => dn.includes(c))) kq.push('L02');
  if (!coSoHieu) {
    kq.push('L03');
    if (/so\s*[.…_\s]*\/\s*[a-zđ]/i.test(dn) || /so\s*[.…_]{2,}/.test(dn)) kq.push('L03c');
  }
  if (SAI_LOAI.some((c) => dn.includes(c)) && !dn.includes('phe duyet')) kq.push('L03b');
  return kq;
}

const goc = (ten: string): string | null => {
  const t = boDau(ten).replace(/\s+/g, ' ').trim();
  const m = /^(.*\S)\s+(\d{1,3})$/.exec(t);
  return m && !TRUOC_SO_KHONG_TINH.test(m[1]) ? m[1] : null;
};

/** Các dòng thuộc nhóm "lập theo người": cùng tên gốc, chỉ khác số thứ tự cuối, từ 2 dòng. */
function dongTheoNguoi(ten: readonly string[]): Set<number> {
  const nhom = new Map<string, number[]>();
  ten.forEach((t, i) => { const g = goc(t); if (g) nhom.set(g, [...(nhom.get(g) ?? []), i]); });
  const kq = new Set<number>();
  for (const ds of nhom.values()) if (ds.length >= 2) ds.forEach((i) => kq.add(i));
  return kq;
}

function dongLap(khoa: readonly string[]): Set<number> {
  const dem = new Map<string, number>();
  khoa.forEach((k) => { if (k) dem.set(k, (dem.get(k) ?? 0) + 1); });
  return new Set(khoa.map((k, i) => (k && (dem.get(k) ?? 0) >= 2 ? i : -1)).filter((i) => i >= 0));
}

const laChuTichUbnd = (ten: string): boolean => {
  const t = boDau(ten);
  return t.includes('chu tich') && (t.includes('ubnd') || t.includes('uy ban nhan dan'));
};

function raSoatC1(c1: readonly DongNguon[]): { chiTiet: DongLoiC1[]; dem: Record<string, number>; dongLoi: number; coL07: boolean } {
  const ma = c1.map((r) => chu(r.duLieu.A));
  const ten = c1.map((r) => chu(r.duLieu.B));
  const theoNguoi = dongTheoNguoi(ten);
  const lapTen = dongLap(ten.map((t) => boDau(t).replace(/\s+/g, ' ')));
  const lapMa = dongLap(ma.map((m) => m.toLowerCase()));
  const dem: Record<string, number> = {};
  const chiTiet: DongLoiC1[] = [];
  let dongLoi = 0;
  let coL07 = false;
  c1.forEach((r, i) => {
    const loai = chu(r.duLieu.C), qd = chu(r.duLieu.D), tt = chu(r.duLieu.G);
    const loi: string[] = [];
    if (!ma[i] || !ten[i]) loi.push('L10');
    if (!loai) loi.push('L08');
    loi.push(...loiCanCu(qd, tt));
    if (laChuTichUbnd(ten[i]) && boDau(loai) === 'cong chuc') { loi.push('L07'); coL07 = true; }
    if (theoNguoi.has(i)) loi.push('L09');
    const cl: string[] = [];
    if (lapTen.has(i)) cl.push('CL1');
    if (lapMa.has(i)) cl.push('CL2');
    if (ten[i].length > DO_DAI_TEN_TOI_DA) cl.push('CL3');
    if (/[(（]/.test(ten[i]) || boDau(ten[i]).includes('kiem')) cl.push('CL4');
    if (loi.length > 0) dongLoi += 1;
    [...loi, ...cl].forEach((m) => { dem[m] = (dem[m] ?? 0) + 1; });
    if (loi.length + cl.length > 0) chiTiet.push({ dong: r.so, ma: ma[i], ten: ten[i], loai, quyetDinh: qd, trangThai: tt, maLoi: [...loi, ...cl] });
  });
  return { chiTiet, dem, dongLoi, coL07 };
}

function vanDeA1A2(c1: readonly DongNguon[], a1: readonly DongNguon[], a2: readonly DongNguon[]): VanDeKhac[] {
  const kq: VanDeKhac[] = [];
  const them = (nhan: string, so: number): void => { if (so > 0) kq.push({ nhan, so }); };
  const maNv = new Set(a1.map((r) => chu(r.duLieu.A)).filter(Boolean));
  const nvCoCv = new Set(a2.map((r) => chu(r.duLieu.B)).filter(Boolean));
  const vtvlCoCv = new Set(a2.map((r) => chu(r.duLieu.C)).filter(Boolean));
  const khongSoHieu = a1.filter((r) => !SO_HIEU.test(chu(r.duLieu.D))).length;
  if (khongSoHieu > 0) kq.push({ nhan: `nhiệm vụ không có số hiệu căn cứ (A1!D), trên tổng ${a1.length}`, so: khongSoHieu });
  them('dòng nhiệm vụ lặp tên (A1)', dongLap(a1.map((r) => boDau(chu(r.duLieu.B)).replace(/\s+/g, ' '))).size);
  them('nhiệm vụ chưa có công việc (A1 không có dòng A2 trỏ tới)', a1.filter((r) => { const m = chu(r.duLieu.A); return m && !nvCoCv.has(m); }).length);
  them('công việc trỏ tới nhiệm vụ không có ở A1 (A2!B)', a2.filter((r) => { const m = chu(r.duLieu.B); return m && !maNv.has(m); }).length);
  them('dòng công việc lặp tên trong cùng nhiệm vụ và VTVL (A2)', dongLap(a2.map((r) => (chu(r.duLieu.D) ? `${chu(r.duLieu.B)}|${chu(r.duLieu.C)}|${boDau(chu(r.duLieu.D))}` : ''))).size);
  them('VTVL chưa được giao công việc ở A2', c1.filter((r) => { const m = chu(r.duLieu.A); return m && !vtvlCoCv.has(m); }).length);
  return kq;
}

/** Mức ưu tiên theo sheet "Hướng dẫn": ≥50% dòng lỗi (tối thiểu 10 dòng) hoặc L07 → 1; có lỗi → 2; chỉ có vấn đề phụ/chất lượng → 3; sạch → 4. */
function xepMuc(soDong: number, dongLoi: number, coL07: boolean, coPhu: boolean): { muc: string; ly: string } {
  if (soDong === 0) return { muc: '1 - Ưu tiên chỉnh sửa', ly: 'Không có dòng VTVL ở Biểu C1.' };
  if (dongLoi >= NGUONG_DONG && dongLoi / soDong >= NGUONG_TY_LE) return { muc: '1 - Ưu tiên chỉnh sửa', ly: `${dongLoi}/${soDong} dòng C1 có lỗi (từ 50% trở lên).` };
  if (coL07) return { muc: '1 - Ưu tiên chỉnh sửa', ly: 'Chủ tịch/Phó Chủ tịch UBND ghi “Công chức” (L07).' };
  if (dongLoi > 0) return { muc: '2 - Có lỗi C1', ly: `${dongLoi} dòng C1 có lỗi L01–L10, dưới ngưỡng ưu tiên 1.` };
  if (coPhu) return { muc: '3 - Có vấn đề A1/A2, chất lượng', ly: 'Không có lỗi C1 nhưng còn vấn đề chất lượng hoặc A1/A2.' };
  return { muc: '4 - Chưa phát hiện vấn đề', ly: 'Không phát hiện vấn đề theo các tiêu chí rà soát.' };
}

export function raSoatCong(vao: DauVaoRaSoat): KetQuaRaSoat {
  const { chiTiet, dem, dongLoi, coL07 } = raSoatC1(vao.c1);
  const vanDe = vanDeA1A2(vao.c1, vao.a1, vao.a2);
  const coChatLuong = MA_CHAT_LUONG.some((m) => (dem[m] ?? 0) > 0);
  const { muc, ly } = xepMuc(vao.c1.length, dongLoi, coL07, vanDe.length > 0 || coChatLuong);
  return {
    soDongC1: vao.c1.length, dongLoi, tyLeLoi: vao.c1.length > 0 ? dongLoi / vao.c1.length : 0,
    dem, chiTiet, vanDe, mucUuTien: muc, lyDoUuTien: ly,
  };
}
