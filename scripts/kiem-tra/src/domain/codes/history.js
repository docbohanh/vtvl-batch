/** Lịch sử đổi mã (R9, R17): không xóa mã cũ, bắt buộc căn cứ và người xác nhận. Bất biến. */

export const CHANGE_REASONS = Object.freeze(['thay_ma_tam', 'sua_loi_nguon', 'doi_danh_muc', 'tach', 'gop', 'chuyen_giao']);

const fail = (field) => Object.assign(new Error(`Thiếu hoặc sai trường "${field}" khi đổi mã`), { code: 'BAD_CHANGE', field });
const text = (v) => typeof v === 'string' && v.trim() !== '';

export const emptyHistory = () => Object.freeze({ entries: Object.freeze([]) });

/** @returns {{entries: readonly object[]}} lịch sử mới, `history` không bị sửa */
export function replaceCode(history, change) {
  for (const f of ['objectId', 'type', 'from', 'to', 'basis']) if (!text(change[f])) throw fail(f);
  if (!CHANGE_REASONS.includes(change.reason)) throw fail('reason');
  if (!change.by || !text(change.by.name) || !text(change.by.title)) throw fail('by');
  if (change.from === change.to) throw Object.assign(new Error('Trường "to" phải khác "from"'), { code: 'BAD_CHANGE', field: 'to' });
  const entry = Object.freeze({
    objectId: change.objectId, type: change.type, from: change.from, to: change.to, reason: change.reason,
    basis: change.basis, by: Object.freeze({ name: change.by.name.trim(), title: change.by.title.trim() }),
    at: change.at ?? new Date().toISOString(),
  });
  return Object.freeze({ entries: Object.freeze([...history.entries, entry]) });
}
