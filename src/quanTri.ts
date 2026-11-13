import type { DongQt, HoSoQt, NutQt, TomTatBieuQt } from './types';

/** Ba biểu cần soi kỹ khi thẩm định: đo khối lượng, xác định nhu cầu, lập phương án. */
export const KHOA_UU_TIEN: readonly string[] = ['b1', 'c3', 'd2'];

/** Bỏ dấu tiếng Việt, đ → d, chữ thường: dùng cho tìm kiếm. */
export const boDau = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export type CheDoLoc = 'tat_ca' | 'chua_dat' | 'chua_co_du_lieu';

export const NHAN_CHE_DO: Record<CheDoLoc, string> = {
  tat_ca: 'Tất cả',
  chua_dat: 'Có dòng chưa đạt',
  chua_co_du_lieu: 'Chưa có dữ liệu',
};

/** Lọc hồ sơ theo chuỗi tìm (tên, mã đơn vị, tên đăng nhập) và chế độ. */
export function locHoSo(ds: readonly HoSoQt[], tim: string, che: CheDoLoc): HoSoQt[] {
  const q = boDau(tim.trim());
  return ds.filter((h) => {
    if (che === 'chua_dat' && h.dongChuaDat === 0) return false;
    if (che === 'chua_co_du_lieu' && h.dongDat + h.dongChuaDat > 0) return false;
    return !q || boDau(`${h.ten} ${h.ma} ${h.taiKhoan.join(' ')}`).includes(q);
  });
}

/** Tab: B1, C3, D2 lên đầu (đúng thứ tự đó), các biểu còn lại theo bước. */
export function sapTab(bieu: readonly TomTatBieuQt[]): { uuTien: TomTatBieuQt[]; khac: TomTatBieuQt[] } {
  const uuTien = KHOA_UU_TIEN.map((k) => bieu.find((b) => b.khoa === k)).filter((b): b is TomTatBieuQt => b !== undefined);
  const khac = bieu.filter((b) => !KHOA_UU_TIEN.includes(b.khoa)).sort((a, b) => a.buoc - b.buoc);
  return { uuTien, khac };
}

/** Nhãn tab: mã biểu; hai biểu trùng mã (B2) thì kèm tên để phân biệt. */
export function nhanBieu(b: TomTatBieuQt, ds: readonly TomTatBieuQt[]): string {
  return ds.filter((x) => x.ma === b.ma).length > 1 ? `${b.ma} · ${b.tieuDe}` : b.ma;
}

export type MauO = 'tot' | 'chu-y' | 'xau';

/** Tô màu ô trạng thái (kết quả kiểm chứng, đối chiếu…); ô thường không tô. Kiểm "không/chưa" trước "đạt". */
export function mauO(giaTri: unknown): MauO | null {
  if (typeof giaTri !== 'string') return null;
  const t = boDau(giaTri.trim());
  if (!t || t.length > 40) return null;
  if (/(khong dat|loi|sai|thieu|khong tinh)/.test(t)) return 'xau';
  if (/(tham khao|chua |uoc luong|cho |canh bao)/.test(t)) return 'chu-y';
  if (/^(dat|da kiem chung|da doi chieu|doi chieu xong|san sang tham dinh|hop le|ok)$/.test(t)) return 'tot';
  return null;
}

export const hienGiaTri = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Lọc dòng: chỉ dòng có lỗi/cảnh báo (khi `chiLoi`) và chuỗi tìm trong mọi ô. */
export function locDong(dong: readonly DongQt[], tim: string, chiLoi: boolean): DongQt[] {
  const q = boDau(tim.trim());
  return dong.filter((d) => {
    if (chiLoi && d.loi.length === 0 && d.trangThai === 'OK') return false;
    return !q || boDau(Object.values(d.duLieu).map(hienGiaTri).join(' ')).includes(q);
  });
}

// ---------------------------------------------------------------------------
// Công cụ thẩm định theo từng biểu: sắp xếp/lọc số, tổng, lọc năm, ước tính số người
// ---------------------------------------------------------------------------

/** Số giờ làm việc một người trong một năm, dùng quy đổi giờ → số người (cùng định mức C3: 1.904 giờ). */
export const GIO_MOT_NGUOI_NAM = 1904;

export type HuongSapXep = 'giam' | 'tang';

/** Cách thẩm định riêng của từng biểu; chữ là chữ cột trong khung biểu (B1: D = phút/SP, G = giờ tổng; D2: B = năm). */
export interface CauHinhBieu {
  /** Cột số cho phép sắp xếp và lọc "≥". */
  sapXepLoc?: { cot: string; nhan: string };
  /** Hiện dòng tổng trên cùng; `loaiTru` là các cột số không được cộng (ví dụ năm). */
  tong?: { loaiTru: readonly string[] };
  /** Nút lọc theo năm theo giá trị của cột này. */
  locNam?: { cot: string };
  /** Ước tính số người = tổng cột giờ ÷ 1.904. */
  soNguoi?: { cotGio: string };
  /** Cột "Người cần bố trí" để cộng lại và so với ước tính của B1. */
  nguoiCanBoTri?: { cot: string };
}

export const CAU_HINH_BIEU: Readonly<Record<string, CauHinhBieu>> = {
  b1: { sapXepLoc: { cot: 'D', nhan: 'Phút/SP (D)' }, soNguoi: { cotGio: 'G' } },
  c3: { tong: { loaiTru: [] }, nguoiCanBoTri: { cot: 'J' } },
  d2: { tong: { loaiTru: ['B'] }, locNam: { cot: 'B' } },
};

/** Đọc số từ ô (số, hoặc chuỗi kiểu 1.234,5 / 1234.5); không đọc được thì null. */
export function soTuO(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.trim().replace(/\s/g, '');
  if (!t || !/^[-+]?[\d.,]+$/.test(t)) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Giữ dòng có giá trị cột `cot` ≥ `nguong`; ô trống hoặc không phải số bị loại. */
export function locTuMuc(dong: readonly DongQt[], cot: string, nguong: number): DongQt[] {
  return dong.filter((d) => { const n = soTuO(d.duLieu[cot]); return n !== null && n >= nguong; });
}

/** Sắp xếp theo cột số (ổn định); ô trống/không phải số luôn xuống cuối, dù tăng hay giảm. */
export function sapXepCot(dong: readonly DongQt[], cot: string, huong: HuongSapXep): DongQt[] {
  const k = huong === 'giam' ? -1 : 1;
  return dong
    .map((d, i) => ({ d, i, n: soTuO(d.duLieu[cot]) }))
    .sort((a, b) => (a.n === null ? (b.n === null ? a.i - b.i : 1) : b.n === null ? -1 : (a.n - b.n) * k || a.i - b.i))
    .map((x) => x.d);
}

/** Tổng một cột số (bỏ ô trống). */
export function tongCot(dong: readonly DongQt[], cot: string): number {
  return dong.reduce((t, d) => t + (soTuO(d.duLieu[cot]) ?? 0), 0);
}

/** Các năm xuất hiện trong cột năm, tăng dần. */
export function cacNam(dong: readonly DongQt[], cot: string): number[] {
  return [...new Set(dong.map((d) => soTuO(d.duLieu[cot])).filter((n): n is number => n !== null))].sort((a, b) => a - b);
}

export function locNam(dong: readonly DongQt[], cot: string, nam: number | null): DongQt[] {
  return nam === null ? [...dong] : dong.filter((d) => soTuO(d.duLieu[cot]) === nam);
}

/** Các năm phương án biên chế của D2 (2027 – 2031); luôn hiện đủ để tích chọn dù hồ sơ chưa có dòng của năm đó. */
export const CAC_NAM_D2: readonly number[] = [2027, 2028, 2029, 2030, 2031];

/** Các năm để tích chọn: năm chuẩn của D2 gộp với năm thật sự có trong dữ liệu, tăng dần. */
export function namDeChon(namCo: readonly number[]): number[] {
  return [...new Set([...CAC_NAM_D2, ...namCo])].sort((a, b) => a - b);
}

/** Giữ dòng có năm thuộc `namChon`; danh sách rỗng nghĩa là tất cả các năm. */
export function locNhieuNam(dong: readonly DongQt[], cot: string, namChon: readonly number[]): DongQt[] {
  if (namChon.length === 0) return [...dong];
  const co = new Set(namChon);
  return dong.filter((d) => { const n = soTuO(d.duLieu[cot]); return n !== null && co.has(n); });
}

/** Bật/tắt một năm trong danh sách đã chọn (bất biến). Chọn đủ mọi năm thì quay về rỗng = tất cả. */
export function doiNam(namChon: readonly number[], nam: number, tatCa: readonly number[]): number[] {
  const moi = namChon.includes(nam) ? namChon.filter((n) => n !== nam) : [...namChon, nam].sort((a, b) => a - b);
  return moi.length >= tatCa.length ? [] : moi;
}

export const gioSangNguoi = (gio: number): number => gio / GIO_MOT_NGUOI_NAM;

/** Số kiểu Việt Nam, tối đa `soLe` chữ số thập phân. */
export const dinhDangTong = (n: number, soLe = 2): string => n.toLocaleString('vi-VN', { maximumFractionDigits: soLe });

/** Lệch giữa B1 và C3 trong khoảng này (±10%) thì coi là khớp; ngoài khoảng thì cần xem lại. Ngưỡng tham khảo, không phải quy định. */
export const NGUONG_LECH_KHOP = 0.1;

export interface SoSanhNguoi {
  gioB1: number;
  nguoiB1: number;
  nguoiC3: number;
  /** B1 − C3 (người); dương = B1 ước tính nhiều hơn C3 đề xuất. */
  chenh: number;
  /** B1 ÷ C3; null khi C3 không có người nào. */
  tyLe: number | null;
  muc: 'khop' | 'lech' | null;
}

/** So số người ước tính từ B1 (tổng giờ ÷ 1.904) với tổng "Người cần bố trí" của C3, trên toàn bộ dòng của hai biểu. */
export function soSanhNguoi(b1: readonly DongQt[], c3: readonly DongQt[]): SoSanhNguoi {
  const gioB1 = tongCot(b1, CAU_HINH_BIEU.b1.soNguoi?.cotGio ?? 'G');
  const nguoiB1 = gioSangNguoi(gioB1);
  const nguoiC3 = tongCot(c3, CAU_HINH_BIEU.c3.nguoiCanBoTri?.cot ?? 'J');
  const tyLe = nguoiC3 > 0 ? nguoiB1 / nguoiC3 : null;
  const muc = tyLe === null ? null : Math.abs(tyLe - 1) <= NGUONG_LECH_KHOP + 1e-9 ? 'khop' : 'lech';
  return { gioB1, nguoiB1, nguoiC3, chenh: nguoiB1 - nguoiC3, tyLe, muc };
}

/** Người quy đổi của một VTVL theo ba phương pháp ở C3 (PP1: cột H, PP2: cột G, PP3: cột I), kèm phương pháp đã chọn và người cần bố trí (cột J). */
export interface NguoiTheoPP {
  ma: string;
  pp1: number;
  pp2: number;
  pp3: number;
  chon: string;
  /** Người quy đổi theo PP đã chọn: cộng các cột PP tương ứng (PP1+PP2 = H + G). */
  quyDoiChon: number;
  canBoTri: number;
  /** Cần bố trí − quy đổi theo PP chọn; ≠ 0 là chỗ người thẩm định cần giải trình (J do người nhập). */
  lech: number;
}

export interface TongTheoPP {
  pp1: number;
  pp2: number;
  pp3: number;
  /** Σ quy đổi theo PP chọn và Σ cần bố trí, toàn biểu; `lech` = cần bố trí − quy đổi. */
  quyDoiChon: number;
  canBoTri: number;
  lech: number;
  /** Mỗi VTVL một dòng (cộng dồn nếu mã lặp ở nhiều dòng C3), theo thứ tự xuất hiện. */
  theoVtvl: NguoiTheoPP[];
  /** Người cần bố trí (cột J) gộp theo phương pháp đã chọn (cột B), kể cả tổ hợp PP1+PP2…; PP đơn luôn hiện, tổ hợp và "chưa chọn" chỉ hiện khi có dòng. */
  theoPPChon: NhomPPChon[];
}

export interface NhomPPChon { pp: string; soDong: number; quyDoi: number; canBoTri: number }

/** Cột người quy đổi của từng phương pháp ở C3. */
const COT_QUY_DOI_PP: Readonly<Record<string, string>> = { PP1: 'H', PP2: 'G', PP3: 'I' };
/** Lệch nhỏ hơn mức này (người) coi là bằng nhau, tránh sai số số thực. */
export const NGUONG_LECH_PP = 0.005;

/** Người quy đổi của một dòng C3 theo phương pháp đã chọn: cộng các cột PP có trong ô B. */
function quyDoiTheoChon(duLieu: Record<string, unknown>): number {
  const chon = String(duLieu.B ?? '').replace(/\s/g, '').toUpperCase();
  return chon.split('+').reduce((t, pp) => t + (COT_QUY_DOI_PP[pp] ? (soTuO(duLieu[COT_QUY_DOI_PP[pp]]) ?? 0) : 0), 0);
}

/** Thứ tự hiện các phương pháp chọn: đơn trước, tổ hợp sau. */
const THU_TU_PP_CHON: readonly string[] = ['PP1', 'PP2', 'PP3', 'PP1+PP2', 'PP1+PP3', 'PP2+PP3', 'PP1+PP2+PP3'];
const CHUA_CHON = '(chưa chọn)';

/** Tổng người quy đổi theo PP1/PP2/PP3 của C3, toàn biểu và từng VTVL. Ô trống tính 0. */
export function tongTheoPP(c3: readonly DongQt[]): TongTheoPP {
  const theoMa = new Map<string, NguoiTheoPP>();
  for (const d of c3) {
    const ma = String(d.duLieu.A ?? '').trim() || `(dòng ${d.so})`;
    const cu = theoMa.get(ma) ?? { ma, pp1: 0, pp2: 0, pp3: 0, chon: '', quyDoiChon: 0, canBoTri: 0, lech: 0 };
    const quyDoi = cu.quyDoiChon + quyDoiTheoChon(d.duLieu);
    const canBoTri = cu.canBoTri + (soTuO(d.duLieu.J) ?? 0);
    const chon = String(d.duLieu.B ?? '').trim().toUpperCase();
    theoMa.set(ma, {
      ma,
      pp1: cu.pp1 + (soTuO(d.duLieu.H) ?? 0),
      pp2: cu.pp2 + (soTuO(d.duLieu.G) ?? 0),
      pp3: cu.pp3 + (soTuO(d.duLieu.I) ?? 0),
      chon: cu.chon && chon && cu.chon !== chon ? `${cu.chon}, ${chon}` : cu.chon || chon,
      quyDoiChon: quyDoi,
      canBoTri,
      lech: canBoTri - quyDoi,
    });
  }
  const theoVtvl = [...theoMa.values()];
  const nhom = new Map<string, NhomPPChon>();
  for (const d of c3) {
    const pp = String(d.duLieu.B ?? '').replace(/\s/g, '').toUpperCase() || CHUA_CHON;
    const cu = nhom.get(pp) ?? { pp, soDong: 0, quyDoi: 0, canBoTri: 0 };
    nhom.set(pp, { pp, soDong: cu.soDong + 1, quyDoi: cu.quyDoi + quyDoiTheoChon(d.duLieu), canBoTri: cu.canBoTri + (soTuO(d.duLieu.J) ?? 0) });
  }
  const bacCua = (pp: string): number => { const i = THU_TU_PP_CHON.indexOf(pp); return i < 0 ? THU_TU_PP_CHON.length : i; };
  const theoPPChon = [
    ...THU_TU_PP_CHON.slice(0, 3).map((pp) => nhom.get(pp) ?? { pp, soDong: 0, quyDoi: 0, canBoTri: 0 }),
    ...[...nhom.values()].filter((g) => !THU_TU_PP_CHON.slice(0, 3).includes(g.pp)).sort((a, b) => bacCua(a.pp) - bacCua(b.pp) || a.pp.localeCompare(b.pp)),
  ];
  const quyDoiChon = theoVtvl.reduce((t, v) => t + v.quyDoiChon, 0);
  const canBoTri = theoVtvl.reduce((t, v) => t + v.canBoTri, 0);
  return {
    theoPPChon, quyDoiChon, canBoTri, lech: canBoTri - quyDoiChon,
    pp1: theoVtvl.reduce((t, v) => t + v.pp1, 0),
    pp2: theoVtvl.reduce((t, v) => t + v.pp2, 0),
    pp3: theoVtvl.reduce((t, v) => t + v.pp3, 0),
    theoVtvl,
  };
}

// ---------------------------------------------------------------------------
// Cây đơn vị: nhóm hồ sơ theo đơn vị cha
// ---------------------------------------------------------------------------

/** Mã nút nhóm giả cho hồ sơ mà cổng không có nút đơn vị tương ứng trong cây. */
export const NUT_CHUA_XEP = '__chua_xep__';

/** Một dòng của cây đang hiện. `hoSo` có khi chính đơn vị này có hồ sơ (chọn được); đơn vị chỉ là nhóm thì `hoSo` null. */
export interface HangCay {
  id: string;
  ten: string;
  ma: string;
  sau: number;
  hoSo: HoSoQt | null;
  coCon: boolean;
  /** Số hồ sơ trong nhánh này (kể cả chính nó), tính trên danh sách đã lọc. */
  soHoSo: number;
  /** Số dòng chưa đạt cộng dồn của cả nhánh. */
  chuaDat: number;
  dangMo: boolean;
}

const soTen = (a: string, b: string): number => a.localeCompare(b, 'vi');

/**
 * Dựng các dòng cây đang hiện. Chỉ giữ nhánh có hồ sơ (trong danh sách đã lọc). Cha ở trên, con thụt vào, anh em xếp theo tên.
 * `moHet` mở mọi nhánh (khi đang tìm kiếm); không thì chỉ mở nhánh có id trong `moRong`.
 * Hồ sơ mà đơn vị không có trong cây gom vào nhóm "Chưa xếp vào cây".
 */
export function dungHangCay(nut: readonly NutQt[], hoSo: readonly HoSoQt[], moRong: ReadonlySet<string>, moHet: boolean): HangCay[] {
  const theoId = new Map(nut.map((n) => [n.id, n]));
  const hoSoCua = new Map<string, HoSoQt>();
  const lacCay: HoSoQt[] = [];
  for (const h of hoSo) {
    if (theoId.has(h.orgId) && !hoSoCua.has(h.orgId)) hoSoCua.set(h.orgId, h);
    else lacCay.push(h);
  }
  const con = new Map<string, NutQt[]>();
  const goc: NutQt[] = [];
  for (const n of nut) {
    if (n.chaId && theoId.has(n.chaId) && n.chaId !== n.id) con.set(n.chaId, [...(con.get(n.chaId) ?? []), n]);
    else goc.push(n);
  }
  // đếm hồ sơ cả nhánh (đệ quy có chặn vòng lặp)
  const tong = new Map<string, { so: number; chua: number }>();
  const dem = (n: NutQt, dangDi: Set<string>): { so: number; chua: number } => {
    const cu = tong.get(n.id);
    if (cu) return cu;
    if (dangDi.has(n.id)) return { so: 0, chua: 0 };
    dangDi.add(n.id);
    const h = hoSoCua.get(n.id);
    let kq = { so: h ? 1 : 0, chua: h?.dongChuaDat ?? 0 };
    for (const c of con.get(n.id) ?? []) { const x = dem(c, dangDi); kq = { so: kq.so + x.so, chua: kq.chua + x.chua }; }
    dangDi.delete(n.id);
    tong.set(n.id, kq);
    return kq;
  };
  goc.forEach((n) => dem(n, new Set()));
  const ra: HangCay[] = [];
  const di = (n: NutQt, sau: number, dangDi: Set<string>) => {
    const t = tong.get(n.id);
    if (!t || t.so === 0 || dangDi.has(n.id)) return;
    const dsCon = (con.get(n.id) ?? []).filter((c) => (tong.get(c.id)?.so ?? 0) > 0).sort((a, b) => soTen(a.ten, b.ten));
    const mo = moHet || moRong.has(n.id);
    ra.push({ id: n.id, ten: n.ten, ma: n.ma, sau, hoSo: hoSoCua.get(n.id) ?? null, coCon: dsCon.length > 0, soHoSo: t.so, chuaDat: t.chua, dangMo: mo && dsCon.length > 0 });
    if (!mo) return;
    dangDi.add(n.id);
    dsCon.forEach((c) => di(c, sau + 1, dangDi));
    dangDi.delete(n.id);
  };
  goc.filter((n) => (tong.get(n.id)?.so ?? 0) > 0).sort((a, b) => soTen(a.ten, b.ten)).forEach((n) => di(n, 0, new Set()));
  if (lacCay.length > 0) {
    const mo = moHet || moRong.has(NUT_CHUA_XEP);
    ra.push({ id: NUT_CHUA_XEP, ten: 'Chưa xếp vào cây đơn vị', ma: '', sau: 0, hoSo: null, coCon: true, soHoSo: lacCay.length, chuaDat: lacCay.reduce((t, h) => t + h.dongChuaDat, 0), dangMo: mo });
    if (mo) [...lacCay].sort((a, b) => soTen(a.ten, b.ten)).forEach((h) => ra.push({ id: h.orgId || h.id, ten: h.ten, ma: h.ma, sau: 1, hoSo: h, coCon: false, soHoSo: 1, chuaDat: h.dongChuaDat, dangMo: false }));
  }
  return ra;
}

/** Id các nút tổ tiên của một đơn vị (để mở nhánh chứa hồ sơ đang chọn). */
export function toTien(nut: readonly NutQt[], orgId: string): string[] {
  const theoId = new Map(nut.map((n) => [n.id, n]));
  const ra: string[] = [];
  const thay = new Set<string>([orgId]);
  for (let c = theoId.get(orgId)?.chaId; c && theoId.has(c) && !thay.has(c); c = theoId.get(c)?.chaId) { ra.push(c); thay.add(c); }
  return ra;
}
