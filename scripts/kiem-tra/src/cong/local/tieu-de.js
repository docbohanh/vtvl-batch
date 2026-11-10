/**
 * Tiêu đề cột trên mẫu Bộ biểu VTVL v2 theo cổng (bản web 1.2.8, tệp `src-*.js`: `Gt` là tiêu đề mẫu, `Kt` là tiêu đề thay thế được chấp nhận).
 * Dùng cho kiểm tiêu đề dòng 2 (IMP-HEADER). Dữ liệu thuần, tạo từ mã nguồn của cổng.
 */

export const TIEU_DE_MAU = Object.freeze({
  a1: Object.freeze({ A: "Mã nhiệm vụ", B: "Tên nhiệm vụ", C: "Cơ quan", D: "Căn cứ", E: "Kỳ", F: "Trạng thái", G: "Nguồn" }),
  a2: Object.freeze({ A: "Mã công việc", B: "Mã nhiệm vụ", C: "Mã VTVL", D: "Tên công việc", E: "Sản phẩm", F: "Đơn vị tính", G: "Chất lượng", H: "Căn cứ (nguồn)" }),
  b1: Object.freeze({ A: "Mã công việc", B: "Mã VTVL", C: "Số SP/kỳ báo cáo", D: "Trung bình phút/SP (đo thực tế)", E: "Giờ bổ sung (công việc liên quan, giờ)", F: "Giờ SP (tính, giờ)", G: "Giờ tổng (tính, giờ)", H: "Nguồn SL", I: "Nguồn thời gian", J: "Trạng thái căn cứ thời gian", K: "Kỳ", L: "Mã SP trong danh mục", M: "Nhóm (tự tra)", N: "Phút/SP chuẩn (tự tra)", O: "Xác nhận chuẩn (tự tra)", P: "Phút/SP dùng để tính", Q: "Nguồn thời gian dùng tính", R: "Cảnh báo dữ liệu", S: "Giải trình khác chuẩn" }),
  b2_ct: Object.freeze({ A: "Mã công việc", B: "Mã VTVL", C: "Loại tác động", D: "Công đoạn", E: "SP áp dụng", F: "Phút trước (phút/SP)", G: "Phút sau (phút/SP)", H: "Giờ giảm trực tiếp (giờ)", I: "Giờ việc mới phát sinh trong kỳ (giờ)", J: "Nguồn/bằng chứng", K: "Kỳ", L: "Cơ sở B1", M: "Trạng thái", N: "Giờ giảm hợp lệ (giờ)", O: "Giờ tăng hợp lệ (giờ)", P: "Kiểm tra", Q: "Kinh phí trước", R: "Kinh phí sau", S: "Đối chiếu trùng/phạm vi (cán bộ xác nhận)" }),
  c1: Object.freeze({ A: "Mã VTVL", B: "Tên VTVL", C: "Loại nhân lực", D: "Quyết định", E: "Giờ chuẩn PP2 (giờ)", F: "Căn cứ xác định quỹ giờ", G: "Trạng thái", H: "Giờ riêng được xác nhận (giờ)", I: "Xác nhận giờ riêng", J: "Chế độ làm việc", K: "Kiểm tra quỹ giờ PP2" }),
  c2: Object.freeze({ A: "Mã VTVL", B: "Trách nhiệm", C: "Năng lực chung", D: "Chuyên môn", E: "Lãnh đạo", F: "Căn cứ", G: "Nguồn bản mô tả" }),
  c3: Object.freeze({ A: "Mã VTVL", B: "Phương pháp", C: "Giờ B1 (giờ)", D: "Giờ tác động B2 (giờ)", E: "Giờ ròng (giờ)", F: "Giờ PP2 (từ C1, giờ)", G: "Người quy đổi PP2", H: "Người PP1", I: "Người PP3 (ước lượng, cần giải trình)", J: "Người cần bố trí", K: "Nguồn/giải trình", L: "Trạng thái", M: "Cảnh báo", N: "Số dòng B1 chưa đạt" }),
  d1: Object.freeze({ A: "Mã nguồn lực", B: "Mã VTVL", C: "Loại nhân lực", D: "Giờ quy đổi/năm (tự lấy, giờ)", E: "Giờ dành cho VTVL (giờ)", F: "Giờ việc khác (giờ)", G: "Nơi tính BC", H: "Nguồn", I: "Trạng thái", J: "Cảnh báo", K: "Giờ riêng theo chế độ (giờ)" }),
  d2: Object.freeze({ A: "Mã VTVL", B: "Năm", C: "Số người cần bố trí trong năm phương án", D: "Số người có thể bố trí (cùng đơn vị tính)", E: "Biên chế được giao theo đúng cấp", F: "Điều chuyển/bố trí lại", G: "Đề nghị điều chỉnh", H: "Nguồn/giải trình", I: "Trạng thái", J: "Cảnh báo", K: "PP2: người quy đổi (tham khảo)", L: "Người cần bố trí C3 năm cơ sở (tham khảo)", M: "Kiểm soát cơ sở đối chiếu", N: "Văn bản thẩm định/quyết định (số, ngày, cơ quan)" }),
  du_bao_5_nam: Object.freeze({ A: "Mã VTVL", B: "Năm", C: "Biến động so C3 (+/− người)", D: "Nội dung thay đổi / xác nhận không đổi", E: "Căn cứ nguồn và thời điểm", F: "Trạng thái xác nhận", G: "Người C3 năm cơ sở", H: "Người cần bố trí trong năm", I: "Kiểm tra, đối chiếu", J: "Ghi chú đầu mối" }),
});

export const TIEU_DE_PHU = Object.freeze({
  b1: Object.freeze({ C: "Số SP/năm", E: "Giờ bổ sung (công việc liên quan)", F: "Giờ SP (tính)", G: "Giờ tổng (tính)" }),
  b2_ct: Object.freeze({ F: "Phút trước", G: "Phút sau", H: "Giờ giảm trực tiếp", I: "Giờ việc mới", N: "Giờ giảm hợp lệ", O: "Giờ tăng hợp lệ" }),
  c1: Object.freeze({ E: "Giờ chuẩn PP2", H: "Giờ riêng được xác nhận" }),
  c3: Object.freeze({ C: "Giờ B1", D: "Giờ tác động B2", E: "Giờ ròng", F: "Giờ PP2 (từ C1)" }),
  d1: Object.freeze({ D: "Giờ quy đổi/năm (tự lấy)", E: "Giờ dành cho VTVL", F: "Giờ việc khác", K: "Giờ riêng theo chế độ" }),
});
