import JSZip from 'jszip';
import { NHAN_KET_LUAN } from './quanTri.ts';
import { MA_CHAT_LUONG, MA_LOI_C1, MO_TA_MA, type KetQuaRaSoat } from './raSoatCong.ts';
import type { BaoCaoTD, NhomTD } from './types';

/** Một khối của báo cáo văn bản: dùng chung cho bản xem trong ứng dụng và bản xuất DOCX. */
export type Khoi =
  | { k: 'tieu_de'; c: string }
  | { k: 'phu'; c: string }
  | { k: 'h1' | 'h2' | 'p' | 'dau_dong'; c: string }
  | { k: 'bang'; cot: readonly string[]; rong: readonly number[]; hang: readonly (readonly string[])[] };

export interface ThongTinBaoCao { tenTep: string; ngay: string; xacNhan: boolean; /** Lý do công cụ thẩm định web chưa chạy được (không có mạng, thiếu tập lệnh…). */ loiCongCu?: string }

const SO_DONG_TOI_DA = 50;
const SO_VI_DU = 3;
const vn = (n: number): string => n.toLocaleString('vi-VN');

/** Nhóm có mã lỗi "tham khảo" không đưa vào mục việc cần làm. */
const theoMuc = (nhom: readonly NhomTD[], muc: string): NhomTD[] => nhom.filter((g) => g.muc === muc);

const viTri = (m: { bieu: string; cot: string }): string => (m.cot ? `${m.bieu}!${m.cot}` : m.bieu);

function viDu(g: NhomTD): string {
  const ds = g.chiTiet.slice(0, SO_VI_DU).map((m) => `${viTri(m)} dòng ${m.dong}${m.giaTri ? ` (${m.giaTri})` : ''}`);
  const them = g.chiTiet.length - ds.length;
  return `${g.ten}${ds.length ? `. Ví dụ: ${ds.join('; ')}${them > 0 ? `; … +${vn(them)}` : ''}` : ''}`;
}

const bangMa = (rs: KetQuaRaSoat, cacMa: readonly string[]): Khoi | null => {
  const hang = cacMa.filter((m) => (rs.dem[m] ?? 0) > 0).map((m) => [m, MO_TA_MA[m].ten, vn(rs.dem[m]), MO_TA_MA[m].cachSua]);
  return hang.length === 0 ? null : { k: 'bang', cot: ['Mã', 'Nội dung', 'Số dòng', 'Cách sửa'], rong: [800, 3000, 900, 4938], hang };
};

/** Phần căn cứ chính: rà soát theo bộ mã L01–L10, CL1–CL4 của báo cáo Vụ Địa phương I. */
function phanRaSoat(rs: KetQuaRaSoat, d: (c: string) => Khoi): Khoi[] {
  const kq: Khoi[] = [d('Rà soát dữ liệu theo bộ mã của Vụ Địa phương I (căn cứ chính)')];
  kq.push({ k: 'p', c: `Mức ưu tiên: ${rs.mucUuTien}. ${rs.lyDoUuTien}` });
  kq.push({ k: 'p', c: `Biểu C1: ${vn(rs.soDongC1)} dòng, ${vn(rs.dongLoi)} dòng có lỗi L01–L10 (${(rs.tyLeLoi * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%).` });
  const loi = bangMa(rs, MA_LOI_C1);
  kq.push(...(loi ? [{ k: 'h2', c: 'Lỗi dòng C1 (tính vào tỷ lệ lỗi)' } as Khoi, loi] : [{ k: 'p', c: 'Không có dòng C1 nào mang mã lỗi L01–L10.' } as Khoi]));
  const cl = bangMa(rs, MA_CHAT_LUONG);
  if (cl) kq.push({ k: 'h2', c: 'Chỉ số chất lượng (không tính vào tỷ lệ lỗi)' }, cl);
  if (rs.vanDe.length > 0) kq.push({ k: 'h2', c: 'Vấn đề A1, A2, C1 cấp đơn vị' }, { k: 'bang', cot: ['Số lượng', 'Vấn đề'], rong: [1300, 8338], hang: rs.vanDe.map((v) => [vn(v.so), v.nhan]) });
  if (rs.chiTiet.length > 0) {
    kq.push({ k: 'h2', c: `Chi tiết từng dòng C1 có mã${rs.chiTiet.length > SO_DONG_TOI_DA ? ` (${SO_DONG_TOI_DA} dòng đầu trên ${vn(rs.chiTiet.length)})` : ''}` },
      { k: 'bang', cot: ['Dòng', 'Mã VTVL', 'Tên VTVL', 'Loại', 'Quyết định', 'Mã lỗi'], rong: [700, 1500, 2300, 1000, 2738, 1400],
        hang: rs.chiTiet.slice(0, SO_DONG_TOI_DA).map((r) => [String(r.dong), r.ma, r.ten, r.loai, r.quyetDinh, r.maLoi.join(', ')]) });
  }
  return kq;
}

/** Phần bổ sung: kết quả công cụ thẩm định web (phiếu 12 nội dung, mã HS/KT/LK/A1xx…, 18 chỉ số). */
function phanCongCu(bc: BaoCaoTD, tt: ThongTinBaoCao, d: (c: string) => Khoi): Khoi[] {
  const kq: Khoi[] = [
    d(`Bổ sung: công cụ thẩm định ThamDinh_BoBieu_VTVL (${bc.phienBan})`),
    { k: 'p', c: `Mức ${bc.ketLuan} – ${NHAN_KET_LUAN[bc.ketLuan] ?? 'chưa xác định'}.` },
    ...bc.lyDo.map((l): Khoi => ({ k: 'dau_dong', c: l })),
    { k: 'p', c: tt.xacNhan
      ? 'Giả định: hồ sơ đã có xác nhận của người đứng đầu. Nếu chưa có, sẽ phát sinh thêm mã HS02. Đây là kết quả so khớp tự động, cần người thẩm định xác nhận nghiệp vụ.'
      : 'Chạy khi chưa có xác nhận của người đứng đầu nên có thể phát sinh mã HS02. Đây là kết quả so khớp tự động, cần người thẩm định xác nhận nghiệp vụ.' },
    { k: 'h2', c: 'Phiếu 12 nội dung' },
    { k: 'bang', cot: ['TT', 'Nội dung', 'Kết quả', 'BB', 'CB'], rong: [680, 3685, 2835, 1219, 1219],
      hang: bc.phieu.map((p) => [String(p.tt), p.noiDung, p.ketQua, String(p.bb), String(p.cb)]) },
  ];
  const bb = theoMuc(bc.nhom, 'BB');
  kq.push({ k: 'h2', c: 'Lỗi bắt buộc sửa (BB)' });
  if (bb.length === 0) kq.push({ k: 'p', c: 'Không còn lỗi bắt buộc sửa.' });
  for (const g of bb) {
    const dau = g.chiTiet[0];
    kq.push({ k: 'p', c: `${g.id} – ${vn(g.soLuong)} dòng${dau ? ` ở ${viTri(dau)}` : ''}: ${g.ten}` });
    if (g.chiTiet.length > 0) {
      kq.push({ k: 'bang', cot: ['Dòng', 'Biểu', 'Giá trị hiện có', 'Vấn đề / đề nghị'], rong: [900, 1100, 3000, 4638],
        hang: g.chiTiet.slice(0, SO_DONG_TOI_DA).map((m) => [m.dong, viTri(m), m.giaTri, [m.moTa, m.deNghi].filter(Boolean).join(' — ')]) });
      if (g.chiTiet.length > SO_DONG_TOI_DA) kq.push({ k: 'p', c: `… và ${vn(g.chiTiet.length - SO_DONG_TOI_DA)} dòng nữa (xem trong ứng dụng).` });
    }
  }
  const cb = theoMuc(bc.nhom, 'CB').slice().sort((a, b) => b.soLuong - a.soLuong);
  kq.push({ k: 'h2', c: 'Cảnh báo cần giải trình (CB)' });
  if (cb.length === 0) kq.push({ k: 'p', c: 'Không có cảnh báo cần giải trình.' });
  else kq.push(
    { k: 'p', c: `${vn(cb.length)} nhóm mã, ${vn(cb.reduce((s, g) => s + g.soLuong, 0))} phát hiện; sắp theo số dòng giảm dần.` },
    { k: 'bang', cot: ['Mã', 'Số dòng', 'Nội dung / ví dụ'], rong: [900, 1100, 7638], hang: cb.map((g) => [g.id, vn(g.soLuong), viDu(g)]) },
  );
  const tk = theoMuc(bc.nhom, 'TK');
  if (tk.length > 0) kq.push({ k: 'h2', c: 'Mục tham khảo (TK)' }, { k: 'bang', cot: ['Mã', 'Số dòng', 'Nội dung'], rong: [900, 1100, 7638], hang: tk.map((g) => [g.id, vn(g.soLuong), g.ten]) });
  kq.push({ k: 'h2', c: 'Chỉ số đánh giá' }, { k: 'bang', cot: ['TT', 'Chỉ số', 'Giá trị', 'Đánh giá'], rong: [680, 5000, 1500, 2458],
    hang: bc.chiSo.map((c) => [String(c.so), c.ten, c.giaTri, c.danhGia || '—']) });
  return kq;
}

/**
 * Dựng báo cáo văn bản (hàm thuần). Căn cứ chính là rà soát theo bộ mã của báo cáo Vụ Địa phương I (`rs`, chạy offline);
 * kết quả công cụ thẩm định web (`bc`) chỉ là phần bổ sung và có thể vắng (chưa chạy được, không có mạng).
 */
export function dungBaoCao(bc: BaoCaoTD | null, tt: ThongTinBaoCao, rs: KetQuaRaSoat | null): Khoi[] {
  let n = 0;
  const d = (c: string): Khoi => ({ k: 'h1', c: `${++n}. ${c}` });
  const kq: Khoi[] = [
    { k: 'tieu_de', c: 'BÁO CÁO THẨM ĐỊNH BỘ BIỂU VỊ TRÍ VIỆC LÀM' },
    { k: 'phu', c: `Tệp: ${tt.tenTep} · Ngày thẩm định: ${tt.ngay}` },
  ];
  if (rs) kq.push(...phanRaSoat(rs, d));
  if (bc) kq.push(...phanCongCu(bc, tt, d));
  else kq.push(d('Bổ sung: công cụ thẩm định ThamDinh_BoBieu_VTVL'), { k: 'p', c: tt.loiCongCu ? `Chưa chạy được: ${tt.loiCongCu}` : 'Chưa có kết quả.' });
  kq.push(
    d('Giới hạn của báo cáo'),
    { k: 'dau_dong', c: 'Chỉ chấm và giải thích, không sửa tệp, không tự điền số liệu nghiệp vụ.' },
    { k: 'dau_dong', c: 'Rà soát L01–L10, CL1–CL4 theo định nghĩa trong báo cáo Vụ Địa phương I; L07 áp dụng cho dòng tên có “Chủ tịch UBND” (cần xác nhận đây là UBND cấp xã). L04, L05, L06 không có định nghĩa nên không chấm.' },
    { k: 'dau_dong', c: 'Mức C/D của công cụ web là mức khi chưa giải trình gì; ứng dụng chưa ghi nhận trạng thái “đã giải trình”.' },
    { k: 'dau_dong', c: 'Chưa kiểm chứng tệp trong Excel thật.' },
  );
  return kq;
}

/** Tên tệp gợi ý: BaoCao_ThamDinh_<tên tệp bỏ đuôi>.docx, bỏ ký tự không hợp lệ. */
export function tenTepDocx(tenTep: string): string {
  const goc = tenTep.replace(/\.xlsx?$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'bo_bieu';
  return `BaoCao_ThamDinh_${goc}.docx`;
}

// ---- DOCX ----

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
export const thoatXml = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const chay = (c: string, rpr = ''): string => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${thoatXml(c)}</w:t></w:r>`;
const doan = (c: string, ppr = '', rpr = ''): string => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${chay(c, rpr)}</w:p>`;

function bangXml(k: Extract<Khoi, { k: 'bang' }>): string {
  const o = (c: string, i: number, dau: boolean): string =>
    `<w:tc><w:tcPr><w:tcW w:w="${k.rong[i]}" w:type="dxa"/>${dau ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : ''}</w:tcPr>${doan(c, '<w:spacing w:after="40"/>', `${dau ? '<w:b/>' : ''}<w:sz w:val="20"/>`)}</w:tc>`;
  const dong = (r: readonly string[], dau: boolean): string => `<w:tr>${dau ? '<w:trPr><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${r.map((c, i) => o(c, i, dau)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${k.rong.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${k.rong.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${dong(k.cot, true)}${k.hang.map((r) => dong(r, false)).join('')}</w:tbl>${doan('', '<w:spacing w:after="80"/>')}`;
}

function khoiXml(k: Khoi): string {
  switch (k.k) {
    case 'tieu_de': return doan(k.c, '<w:jc w:val="center"/><w:spacing w:after="120"/>', '<w:b/><w:sz w:val="32"/>');
    case 'phu': return doan(k.c, '<w:jc w:val="center"/><w:spacing w:after="200"/>', '<w:i/><w:sz w:val="21"/>');
    case 'h1': return doan(k.c, '<w:pStyle w:val="Heading1"/>');
    case 'h2': return doan(k.c, '<w:pStyle w:val="Heading2"/>');
    case 'p': return doan(k.c, '<w:spacing w:after="100"/>');
    case 'dau_dong': return doan(`• ${k.c}`, '<w:spacing w:after="60"/><w:ind w:left="360" w:hanging="240"/>');
    case 'bang': return bangXml(k);
  }
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:left w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:right w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="808080"/></w:tblBorders></w:tblPr></w:style></w:styles>`;

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

/** XML của word/document.xml (khổ A4, lề 2 cm). */
export function documentXml(khoi: readonly Khoi[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${khoi.map(khoiXml).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

/** Đóng gói thành tệp .docx (byte). */
export async function taoDocx(khoi: readonly Khoi[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const them = (ten: string, noiDung: string): void => { zip.file(ten, noiDung, { createFolders: false }); };
  them('[Content_Types].xml', CONTENT_TYPES);
  them('_rels/.rels', RELS);
  them('word/document.xml', documentXml(khoi));
  them('word/styles.xml', STYLES);
  them('word/_rels/document.xml.rels', DOC_RELS);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

