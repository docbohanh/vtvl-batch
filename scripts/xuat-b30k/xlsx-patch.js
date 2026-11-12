import JSZip from 'jszip';

/**
 * Ghi giá trị vào ô NHẬP của một tệp .xlsx bằng cách sửa trực tiếp XML của sheet.
 * Mọi thứ khác (khóa sheet và mật khẩu, liên kết, danh sách chọn, ghi chú, tên vùng, kiểu,
 * sheet ẩn) giữ nguyên từng byte. Lý do không dùng exceljs để ghi: xem docs/S1_ketqua.md.
 */

const SHEET_TAG = /<sheet\b[^>]*>/g;
const REL_TAG = /<Relationship\b[^>]*>/g;
const CELL = /<c r="([A-Z]+\d+)"((?:\s+[\w:]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/c>)/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const fail = (code, message) => Object.assign(new Error(message), { code });

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const decodeXml = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Danh sách sheet: tên, đường dẫn XML trong gói, trạng thái ẩn/hiện. */
export async function listSheets(input) {
  const zip = input instanceof JSZip ? input : await JSZip.loadAsync(input);
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const target = {};
  for (const m of rels.matchAll(REL_TAG)) {
    const id = attr(m[0], 'Id');
    const t = attr(m[0], 'Target');
    if (id && t) target[id] = `xl/${t.replace(/^\/?(xl\/)?/, '')}`;
  }
  return [...wb.matchAll(SHEET_TAG)].map((m) => ({
    name: decodeXml(attr(m[0], 'name')),
    path: target[/r:id="([^"]+)"/.exec(m[0])[1]],
    state: attr(m[0], 'state') || 'visible',
  }));
}

/** Chuyển giá trị JS thành nội dung ô; `null`/`''` xóa ô. */
function encodeValue(value, where) {
  if (value === null || value === '') return null;
  if (typeof value === 'string') {
    const safe = escapeXml(value.replace(CONTROL_CHARS, ''));
    return { t: 'inlineStr', body: `<is><t xml:space="preserve">${safe}</t></is>` };
  }
  if (typeof value === 'number' && Number.isFinite(value)) return { t: null, body: `<v>${Object.is(value, -0) ? 0 : value}</v>` };
  if (typeof value === 'boolean') return { t: 'b', body: `<v>${value ? 1 : 0}</v>` };
  throw fail('BAD_VALUE', `Giá trị không hợp lệ ở ${where}: ${String(value)}`);
}

function patchSheetXml(xml, cells, sheetName) {
  const wanted = new Map(Object.entries(cells));
  const seen = new Set();
  const out = xml.replace(CELL, (whole, ref, attrs, inner) => {
    if (!wanted.has(ref)) return whole;
    seen.add(ref);
    if (inner !== undefined && /<f[\s>/]/.test(inner)) throw fail('FORMULA_CELL', `Ô ${ref} ở "${sheetName}" là ô công thức, không được ghi`);
    const enc = encodeValue(wanted.get(ref), `${sheetName}!${ref}`);
    const base = attrs.replace(/\s+t="[^"]*"/, '');
    if (enc === null) return `<c r="${ref}"${base}/>`;
    return `<c r="${ref}"${base}${enc.t ? ` t="${enc.t}"` : ''}>${enc.body}</c>`;
  });
  for (const ref of wanted.keys()) if (!seen.has(ref)) throw fail('NO_CELL', `Ô ${ref} không có trong "${sheetName}" (ngoài vùng của mẫu)`);
  return out;
}

/**
 * @param {Buffer|Uint8Array} input nội dung tệp .xlsx (mẫu)
 * @param {Record<string, Record<string, string|number|boolean|null>>} patches {tên sheet: {A3: giá trị}}
 * @param {{fullCalcOnLoad?: boolean}} [options] mặc định thêm fullCalcOnLoad="1" để Excel tính lại khi mở
 * @returns {Promise<Buffer>}
 */
/**
 * Cắt các dòng trống cuối sheet: bỏ mọi `<row>` có số dòng lớn hơn `keepLast`, chỉnh lại `<dimension>` và vùng `ref` của công thức dùng chung.
 * Công thức ở sheet khác vẫn tham chiếu vùng $3:$30002 nên không đổi kết quả; dòng đã cắt chỉ là dòng trống chưa dùng.
 * @param {number} minRows chỉ cắt sheet có vùng dữ liệu (`<dimension>`) từ chừng này dòng trở lên
 * @returns {string|null} XML mới, hoặc null nếu sheet không có dòng nào để cắt
 */
export function trimSheetXml(xml, keepLast, minRows = 0) {
  const last = Number(/<dimension ref="[A-Z]+\d+:[A-Z]+(\d+)"/.exec(xml)?.[1] ?? 0);
  if (last < minRows) return null; // chỉ cắt các sheet dữ liệu dài; sheet hướng dẫn/tham số ngắn giữ nguyên
  const start = xml.indexOf(`<row r="${keepLast + 1}"`);
  const end = xml.lastIndexOf('</sheetData>');
  if (start < 0 || end < start) return null;
  const head = xml.slice(0, start).replace(/(<f\b[^>]*\bref=")([A-Z]+)(\d+):([A-Z]+)(\d+)(")/g, (m, a, c1, r1, c2, r2, z) => (Number(r2) > keepLast ? `${a}${c1}${r1}:${c2}${keepLast}${z}` : m));
  return (head + xml.slice(end)).replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)\d+(")/, (m, a, z) => `${a}${keepLast}${z}`);
}

const SHEET_PROTECTION = /<sheetProtection\b[^>]*\/>/g;
const WORKBOOK_PROTECTION = /<workbookProtection\b[^>]*\/>/g;

export async function patchWorkbook(input, patches, { fullCalcOnLoad = true, unprotect = false, trimAfter = null, trimMinRows = 0 } = {}) {
  const zip = await JSZip.loadAsync(input);
  const sheets = await listSheets(zip);
  for (const name of Object.keys(patches)) {
    if (!sheets.some((s) => s.name === name)) throw fail('NO_SHEET', `Không có sheet "${name}"`);
  }
  const touched = Object.keys(patches);
  let trimmed = false;
  for (const sheet of sheets) {
    const hasPatches = Boolean(patches[sheet.name]);
    const needsTrim = trimAfter !== null;
    const needsUnprotect = unprotect;
    if (!hasPatches && !needsTrim && !needsUnprotect) continue;

    let xml = await zip.file(sheet.path).async('string');
    let changed = false;
    if (hasPatches) {
      xml = patchSheetXml(xml, patches[sheet.name], sheet.name);
      changed = true;
    }
    if (needsTrim) {
      const next = trimSheetXml(xml, trimAfter, trimMinRows);
      if (next !== null) {
        xml = next;
        trimmed = true;
        changed = true;
      }
    }
    if (needsUnprotect) {
      const next = xml.replace(SHEET_PROTECTION, '');
      if (next !== xml) {
        xml = next;
        changed = true;
      }
    }
    if (changed) {
      zip.file(sheet.path, xml);
    }
  }
  if (trimmed) { // chuỗi tính toán cũ liệt kê cả ô đã cắt: bỏ đi, Excel tự dựng lại khi mở
    zip.remove('xl/calcChain.xml');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''));
    const types = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', types.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
  }
  let wbXml = null;
  const getWbXml = async () => { wbXml ??= await zip.file('xl/workbook.xml').async('string'); return wbXml; };
  if (unprotect) { // gỡ khóa sheet và khóa cấu trúc sổ để file nháp sửa được tự do khi rà soát
    const wb = await getWbXml();
    wbXml = wb.replace(WORKBOOK_PROTECTION, '');
  }
  if (fullCalcOnLoad && touched.length > 0) {
    const wb = await getWbXml();
    wbXml = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, attrs, close) => (/fullCalcOnLoad=/.test(attrs) ? m : `<calcPr${attrs} fullCalcOnLoad="1"${close}>`));
  }
  if (wbXml !== null) {
    zip.file('xl/workbook.xml', wbXml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
