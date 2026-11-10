/**
 * Đối chiếu thông báo kiểm tra của ứng dụng với cách cổng chính thức (kekhaivtvl) diễn đạt trong tệp "Ket_qua_kiem_tra_*.xlsx":
 * mỗi lỗi có Mã (VAL-0xx), Mô tả ("<nhóm>: <TIÊU ĐỀ>") và Hướng xử lý. Bảng dưới lấy từ 27 tệp kết quả thật của cổng
 * (mẫu v2); chỉ ghi những mã, tiêu đề, hướng xử lý đã gặp trong tệp. Điều chưa gặp thì không đoán: trả null để giữ thông báo cũ.
 * Hàm thuần, không đổi đầu vào.
 */

/** Nhóm (tiền tố của Mô tả) trong tệp kết quả của cổng. */
export const NHOM_CONG = Object.freeze({
  loi: 'Lỗi phải sửa',
  xem_lai: 'Cần xem lại',
  cho: 'Chờ bổ sung căn cứ',
  thong_tin: 'Thông tin',
});

const KY_MAC_DINH = '01/10/2025 – 30/09/2026';
const e = (ma, nhom, tieu, huong) => Object.freeze({ ma, nhom, tieu, huong });

/** Theo thông báo của lõi tính (khớp phần trước dấu ":", không phân biệt hoa thường). Khóa: biểu hoặc '*'. */
const THEO_LOI = Object.freeze({
  'THIẾU GIỜ ĐẶC THÙ': { c1: e('VAL-024', 'loi', 'THIẾU GIỜ ĐẶC THÙ', 'Chế độ đặc thù cần giờ riêng lớn hơn 0, căn cứ xác định quỹ giờ và xác nhận Đã kiểm chứng.') },
  'TRÙNG MÃ VTVL Ở C1': { c3: e('VAL-024', 'loi', 'TRÙNG MÃ VTVL Ở C1', 'Mã VTVL bị trùng ở C1. Sửa tại C1.') },
  'PP2: C1 CHƯA ĐỦ CĂN CỨ': { c3: e('VAL-024', 'loi', 'PP2: C1 CHƯA ĐỦ CĂN CỨ', 'Quỹ giờ của VTVL ở C1 chưa ĐẠT.') },
  'PP2: THIẾU GIỜ B1 HOẶC QUỸ GIỜ': { c3: e('VAL-026', 'loi', 'PP2: THIẾU GIỜ B1 HOẶC QUỸ GIỜ', 'Chưa có giờ B1 đủ căn cứ hoặc quỹ giờ của VTVL.') },
  'PP2: CÒN DÒNG B1 CHƯA ĐẠT': { c3: e('VAL-027', 'loi', 'PP2: CÒN DÒNG B1 CHƯA ĐẠT', 'Còn dòng B1 chưa ĐẠT của VTVL. Xử lý hết lỗi ở B1 của VTVL này.') },
  'PP2: B2 CHƯA ĐỦ CĂN CỨ': { c3: e('VAL-028', 'loi', 'PP2: B2 CHƯA ĐỦ CĂN CỨ', 'Bổ sung căn cứ cho các dòng B2 của VTVL (công đoạn, nguồn/bằng chứng, trạng thái Đã kiểm chứng).') },
  'CHỜ XÁC NHẬN NGHIỆP VỤ': { c3: e('VAL-030', 'cho', 'CHỜ XÁC NHẬN NGHIỆP VỤ', 'Chờ đầu mối kiểm chứng xác nhận.') },
  'THIẾU NGUỒN/GIẢI TRÌNH': { c3: e('VAL-030', 'cho', 'THIẾU NGUỒN/GIẢI TRÌNH', 'Ghi nguồn hoặc giải trình.') },
  'THIẾU SẢN LƯỢNG': { b1: e('VAL-014', 'cho', 'THIẾU SẢN LƯỢNG', 'Nhập số sản phẩm thực hiện trong kỳ 12 tháng; ghi 0 nếu đã xác nhận không phát sinh.') },
  'THIẾU THỜI GIAN': { b1: e('VAL-014', 'cho', 'THIẾU THỜI GIAN', 'Nhập phút/sản phẩm đo thực tế, hoặc chọn sản phẩm có định mức đã xác nhận.') },
  'THIẾU NGUỒN SẢN LƯỢNG/CÔNG VIỆC': { b1: e('VAL-013', 'cho', 'THIẾU NGUỒN SẢN LƯỢNG/CÔNG VIỆC', 'Ghi nguồn số liệu sản lượng.') },
  'THIẾU MÃ VTVL': { b1: e('VAL-016', 'loi', 'THIẾU MÃ VTVL', 'Dòng chưa đạt nên chưa được tính vào nhu cầu. Chọn mã VTVL ở A2 và C1 cho công việc này.') },
  'SẢN PHẨM ÁP DỤNG VƯỢT B1': { b2_ct: e('VAL-020', 'loi', 'SẢN PHẨM ÁP DỤNG VƯỢT B1', 'Số sản phẩm áp dụng ở B2 không được lớn hơn số sản phẩm của công việc ở B1.') },
  'THAM KHẢO – KHÔNG TÍNH': { b2_ct: e('VAL-023', 'thong_tin', 'THAM KHẢO – KHÔNG TÍNH', 'Dòng ước lượng tham khảo, không được tính vào nhu cầu.') },
  'CHƯA ĐỦ CĂN CỨ': {
    b2_ct: e('VAL-018', 'cho', 'CHƯA ĐỦ CĂN CỨ', 'Bổ sung công đoạn, nguồn/bằng chứng, kỳ, cơ sở B1 và trạng thái Đã kiểm chứng.'),
    d1: e('VAL-033', 'cho', 'Chưa đủ căn cứ', 'Bổ sung giờ dành cho VTVL, giờ việc khác, nguồn và xác nhận Đã kiểm chứng.'),
  },
  'THIẾU NƠI TÍNH BIÊN CHẾ': { d1: e('VAL-033', 'cho', 'THIẾU NƠI TÍNH BIÊN CHẾ', 'Ghi nơi tính biên chế theo thẩm quyền.') },
  'TRÙNG MÃ NGUỒN LỰC': { d1: e('VAL-031', 'loi', 'TRÙNG MÃ NGUỒN LỰC', 'Mã nguồn lực trùng. Người kiêm nhiệm chỉ ghi một dòng; giờ ở vị trí khác ghi vào cột F.') },
  'VƯỢT QUỸ GIỜ': { d1: e('VAL-032', 'loi', 'Vượt quỹ giờ', 'Tổng giờ phân bổ vượt quỹ giờ. Xem lại phân bổ vị trí, công việc khác.') },
  'C3 CHƯA ĐƯỢC XÁC NHẬN': {
    dubao: e('VAL-035', 'loi', 'C3 CHƯA ĐƯỢC XÁC NHẬN', 'C3 của VTVL chưa được xác nhận.'),
    d2: e('VAL-037', 'loi', 'C3 CHƯA ĐƯỢC XÁC NHẬN', 'C3 của VTVL chưa được xác nhận.'),
  },
  'CHƯA CHỌN TRẠNG THÁI': { d2: e('VAL-036', 'loi', 'CHƯA CHỌN TRẠNG THÁI', 'Chọn trạng thái phương án.') },
  'NĂM KHÔNG HỢP LỆ': { d2: e('VAL-036', 'loi', 'NĂM KHÔNG HỢP LỆ', 'Chọn năm từ 2027 đến 2031.') },
  'TRÙNG MÃ VTVL – NĂM': { d2: e('VAL-036', 'loi', 'TRÙNG MÃ VTVL – NĂM', 'VTVL đã có phương án năm này ở dòng khác của D2. Mỗi VTVL chỉ một phương án cho mỗi năm.') },
  'CHƯA CÓ DỰ BÁO NĂM ĐÃ KIỂM CHỨNG': { d2: e('VAL-037', 'loi', 'CHƯA CÓ DỰ BÁO NĂM ĐÃ KIỂM CHỨNG', 'Chưa có dự báo năm này đã ĐẠT cho VTVL. Bổ sung ở Dự báo 5 năm.') },
  'ĐANG XÂY DỰNG': { d2: e('VAL-038', 'cho', 'ĐANG XÂY DỰNG', 'Phương án đang xây dựng. Chọn Đã hoàn thành ở đơn vị khi xong.') },
  'THAY ĐỔI SO VỚI NĂM CƠ SỞ – CÓ DỰ BÁO': { d2: e('VAL-038', 'thong_tin', 'THAY ĐỔI SO VỚI NĂM CƠ SỞ – CÓ DỰ BÁO', 'Nhu cầu năm khác năm cơ sở do có dự báo.') },
  'MÃ VTVL CHƯA CÓ Ở C1': { '*': e('VAL-010', 'loi', 'MÃ VTVL CHƯA CÓ Ở C1', 'Chọn mã VTVL trong danh sách hoặc bổ sung ở C1.') },
});

/** Theo mã quy tắc của ứng dụng (cột `ma` của kết quả kiểm tra), có thể phụ thuộc biểu và cột. */
function theoMaUngDung(f, ky) {
  const { bieu, truong, ma } = f;
  switch (ma) {
    case 'THIEU':
      if (bieu === 'a1' && truong === 'trang_thai') return e('VAL-008', 'loi', 'Chưa chọn trạng thái', 'Chọn Tiếp tục thực hiện / Mới tiếp nhận / Đã chuyển giao / Không còn thực hiện.');
      if (/^ma_/.test(truong ?? '')) return e('VAL-001', 'loi', 'THIẾU MÃ', 'Nhập mã theo danh mục có thẩm quyền.');
      return null;
    case 'NGOAI-DANH-SACH':
      if (bieu === 'a1' && truong === 'trang_thai') return e('VAL-008', 'loi', 'Giá trị ngoài danh mục', 'Chọn Tiếp tục thực hiện / Mới tiếp nhận / Đã chuyển giao / Không còn thực hiện.');
      return e('VAL-003', 'loi', 'Giá trị ngoài danh mục', 'Giá trị không có trong danh mục của biểu. Chọn lại trong danh sách.');
    case 'D2-TT': return e('VAL-003', 'loi', 'GIÁ TRỊ CHỈ NGƯỜI CÓ THẨM QUYỀN GHI', 'Trạng thái Đã thẩm định / Đã được quyết định do cấp có thẩm quyền ghi nhận.');
    case 'SP-01': return e('VAL-003', 'loi', 'MÃ SẢN PHẨM KHÔNG CÓ TRONG DANH MỤC', 'Chọn mã sản phẩm còn hiệu lực trong danh mục, hoặc để trống và ghi phút đo thực tế.');
    case 'KY-01': return e('VAL-004', 'loi', 'Kỳ không khớp kỳ hồ sơ', `Ghi kỳ ${ky ?? KY_MAC_DINH}.`);
    case 'A1-NGUON': return e('VAL-007', 'cho', 'THIẾU NGUỒN', 'Bổ sung căn cứ văn bản hoặc địa chỉ nguồn để kiểm chứng.');
    case 'A2-A1-BI-LOAI': return e('VAL-009', 'loi', 'chưa có nhiệm vụ nguồn A1', 'Chọn nhiệm vụ trong danh sách hoặc bổ sung ở A1.');
    case 'D2-DUBAO': return e('VAL-037', 'loi', 'CHƯA CÓ DỰ BÁO NĂM ĐÃ KIỂM CHỨNG', 'Chưa có dự báo năm này đã ĐẠT cho VTVL. Dùng "Chuẩn hóa D2" hoặc bổ sung ở Dự báo 5 năm.');
    case 'MA-CHUA-CO':
      if (bieu === 'a2' && truong === 'ma_nhiem_vu') return e('VAL-009', 'loi', 'chưa có nhiệm vụ nguồn A1', 'Chọn nhiệm vụ trong danh sách hoặc bổ sung ở A1.');
      if (bieu === 'a2' && truong === 'ma_vtvl') return e('VAL-010', 'loi', 'chưa có mã VTVL nền C1', 'Chọn VTVL trong danh sách hoặc bổ sung ở C1.');
      if (truong === 'ma_vtvl') return e('VAL-010', 'loi', 'MÃ VTVL CHƯA CÓ Ở C1', 'Chọn mã VTVL trong danh sách hoặc bổ sung ở C1.');
      if (bieu === 'b1' && truong === 'ma_cong_viec') return e('VAL-012', 'loi', 'chưa có công việc nguồn A2', 'Chọn công việc trong danh sách hoặc bổ sung ở A2.');
      return null;
    case 'MA-01':
      if (bieu === 'a1') return e('VAL-006', 'loi', 'TRÙNG MÃ NHIỆM VỤ', 'Mã nhiệm vụ trùng với dòng khác. Đối chiếu mã nguồn và phạm vi.');
      if (bieu === 'a2') return e('VAL-011', 'loi', 'TRÙNG MÃ CÔNG VIỆC', 'Mã công việc phải duy nhất trong phạm vi và liên kết nhiệm vụ.');
      if (bieu === 'b1') return e('VAL-011', 'loi', 'TRÙNG MÃ CÔNG VIỆC', 'Mỗi công việc chỉ có một sản phẩm, một dòng ở B1. Gộp các dòng cùng mã công việc thành một dòng (cộng số sản phẩm, phút/sản phẩm bình quân gia quyền để giữ nguyên tổng giờ).');
      if (bieu === 'c1') return e('VAL-011', 'loi', 'TRÙNG MÃ VTVL', 'Mỗi mã VTVL chỉ một dòng ở C1: sửa mã hoặc xóa dòng trùng.');
      if (bieu === 'c2') return e('VAL-011', 'loi', 'TRÙNG MÃ VTVL', 'Mỗi vị trí việc làm chỉ giữ một dòng mô tả, khung năng lực. Xóa hoặc gộp các dòng trùng.');
      return null;
    default: return null;
  }
}

/** Phần tiêu đề của thông báo lõi: bỏ chi tiết sau ": " khi chi tiết được nối bằng `${msg}: ${chi_tiet}`. */
function khoaLoi(thongBao) {
  const t = String(thongBao ?? '').trim().toUpperCase();
  const goc = Object.keys(THEO_LOI).find((k) => t === k || t.startsWith(`${k}: `));
  return goc ?? null;
}

/**
 * Cách cổng diễn đạt một kết quả kiểm tra của ứng dụng.
 * @param {{bieu: string, truong?: string|null, ma?: string, thong_bao?: string}} f một phần tử `findings` của checkModel
 * @param {{ky?: string}} [ctx] `ky`: kỳ hồ sơ, dùng để gợi ý đúng kỳ cho lỗi "Kỳ không khớp"
 * @returns {{ma_cong: string, nhom: string, mo_ta: string, huong_xu_ly: string} | null} null khi chưa có đối chiếu với cổng
 */
export function thongBaoCong(f, { ky } = {}) {
  const ung = theoMaUngDung(f, ky);
  let hit = ung;
  if (!hit && (f.ma === 'LOI-NGHIEP-VU' || f.ma === 'CANH-BAO-NGHIEP-VU')) {
    const k = khoaLoi(f.thong_bao);
    if (k) hit = THEO_LOI[k][f.bieu] ?? THEO_LOI[k]['*'] ?? null;
  }
  if (!hit) return null;
  return Object.freeze({ ma_cong: hit.ma, nhom: NHOM_CONG[hit.nhom], mo_ta: `${NHOM_CONG[hit.nhom]}: ${hit.tieu}`, huong_xu_ly: hit.huong });
}
