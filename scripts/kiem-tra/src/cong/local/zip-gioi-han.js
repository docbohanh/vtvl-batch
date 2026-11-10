/**
 * Chặn tệp .xlsx "bom nén" trước khi giải nén, theo giới hạn của cổng (bản 1.2.8, `v` trong `excel-*.js`): tối đa 10.000 mục,
 * tổng dung lượng giải nén 500 MB. Chỉ đọc thư mục trung tâm của ZIP, không giải nén. Hàm thuần.
 */

export const GIOI_HAN = Object.freeze({ mucZip: 10000, byteGiaiNen: 524288000 });
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const SENTINEL = 0xffffffff;
const EOCD_SEARCH = 65557;

/** @returns {{vuot: 'mucZip'|'byteGiaiNen', gia_tri: number}|null} giới hạn bị vượt, null nếu ổn hoặc không đọc được thư mục (để thư viện xlsx tự báo hỏng) */
export function kiemGioiHanZip(buf, gioiHan = GIOI_HAN) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - EOCD_SEARCH); i -= 1) if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  if (entries > gioiHan.mucZip) return { vuot: 'mucZip', gia_tri: entries };
  let pos = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CENTRAL) return null;
    const packed = buf.readUInt32LE(pos + 20);
    const raw = buf.readUInt32LE(pos + 24);
    if (raw === SENTINEL || packed === SENTINEL) return { vuot: 'byteGiaiNen', gia_tri: SENTINEL };
    total += raw;
    if (total > gioiHan.byteGiaiNen) return { vuot: 'byteGiaiNen', gia_tri: total };
    pos += 46 + buf.readUInt16LE(pos + 28) + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  return null;
}
