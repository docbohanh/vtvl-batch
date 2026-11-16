//! Đổi tệp Excel cũ .xls sang .xlsx để ứng dụng đọc, kiểm tra và gửi được.
//!
//! Chỉ giữ GIÁ TRỊ ô (chữ, số, ngày, đúng/sai) và tên, trạng thái ẩn của sheet; công thức, khóa sheet, danh sách chọn, định dạng của tệp .xls
//! không mang sang. Đủ cho đường B (ứng dụng tự tính thay đổi từ các ô nhập); đường A (cổng kiểm tra chính tệp) có thể từ chối tệp đã đổi.

use calamine::{open_workbook_auto, Data, Reader, SheetVisible};
use rust_xlsxwriter::{Format, Workbook};
use std::path::Path;

/// Số hàng, cột tối đa của .xlsx.
const HANG_TOI_DA: u32 = 1_048_575;
const COT_TOI_DA: u32 = 16_383;
/// Excel giới hạn tên sheet 31 ký tự.
const TEN_SHEET_TOI_DA: usize = 31;

/// Tệp có đuôi .xls (không phân biệt hoa thường) hay không. Thuần.
pub fn la_xls(p: &Path) -> bool {
    p.extension().is_some_and(|e| e.eq_ignore_ascii_case("xls"))
}

/// Tên tệp sau khi đổi: đổi đuôi .xls thành .xlsx, giữ nguyên các tên khác. Thuần.
pub fn ten_xlsx(ten: &str) -> String {
    match ten.rsplit_once('.') {
        Some((goc, duoi)) if duoi.eq_ignore_ascii_case("xls") => format!("{goc}.xlsx"),
        _ => ten.to_string(),
    }
}

/// Tên sheet hợp lệ cho .xlsx: bỏ ký tự cấm, cắt còn 31 ký tự. Thuần.
fn ten_sheet_hop_le(ten: &str) -> String {
    let s: String = ten.chars().filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\')).take(TEN_SHEET_TOI_DA).collect();
    if s.trim().is_empty() { "Sheet".into() } else { s }
}

fn loi<E: std::fmt::Display>(e: E) -> String {
    format!("Không đổi được tệp .xls sang .xlsx: {e}")
}

/// Đọc `nguon` (.xls) rồi ghi `dich` (.xlsx). Mỗi sheet giữ tên, vị trí ô và trạng thái ẩn.
pub fn xls_sang_xlsx(nguon: &Path, dich: &Path) -> Result<(), String> {
    let mut doc = open_workbook_auto(nguon).map_err(|e| loi(format!("không đọc được {}: {e}", nguon.display())))?;
    let ngay = Format::new().set_num_format("dd/mm/yyyy hh:mm:ss");
    let mut ra = Workbook::new();
    let sheets: Vec<(String, SheetVisible)> = doc.sheets_metadata().iter().map(|s| (s.name.clone(), s.visible)).collect();
    if sheets.is_empty() {
        return Err(loi("tệp không có sheet nào"));
    }
    let mut da_dung: Vec<String> = Vec::new();
    for (ten, hien) in sheets {
        let vung = doc.worksheet_range(&ten).map_err(|e| loi(format!("sheet \"{ten}\": {e}")))?;
        let mut ten_ra = ten_sheet_hop_le(&ten);
        let mut so = 2;
        while da_dung.iter().any(|t| t.eq_ignore_ascii_case(&ten_ra)) {
            let hau = format!("_{so}");
            ten_ra = format!("{}{hau}", ten_sheet_hop_le(&ten).chars().take(TEN_SHEET_TOI_DA - hau.len()).collect::<String>());
            so += 1;
        }
        da_dung.push(ten_ra.clone());
        let ws = ra.add_worksheet();
        ws.set_name(&ten_ra).map_err(loi)?;
        if hien != SheetVisible::Visible {
            ws.set_hidden(true);
        }
        let (h0, c0) = vung.start().unwrap_or((0, 0));
        for (h, c, v) in vung.cells() {
            let (hang, cot) = (h0 + h as u32, c0 + c as u32);
            if hang > HANG_TOI_DA || cot > COT_TOI_DA {
                continue;
            }
            let (hang, cot) = (hang, cot as u16);
            match v {
                Data::Empty => {}
                Data::Int(n) => { ws.write_number(hang, cot, *n as f64).map_err(loi)?; }
                Data::Float(n) => { ws.write_number(hang, cot, *n).map_err(loi)?; }
                Data::String(s) | Data::DateTimeIso(s) | Data::DurationIso(s) => { ws.write_string(hang, cot, s).map_err(loi)?; }
                Data::Bool(b) => { ws.write_boolean(hang, cot, *b).map_err(loi)?; }
                Data::DateTime(d) => { ws.write_number_with_format(hang, cot, d.as_f64(), &ngay).map_err(loi)?; }
                Data::Error(e) => { ws.write_string(hang, cot, format!("{e}")).map_err(loi)?; }
            }
        }
    }
    ra.save(dich).map_err(|e| loi(format!("không ghi được {}: {e}", dich.display())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nhan_ra_tep_xls_khong_phan_biet_hoa_thuong() {
        assert!(la_xls(Path::new("a.xls")) && la_xls(Path::new("B.XLS")));
        assert!(!la_xls(Path::new("a.xlsx")) && !la_xls(Path::new("a")));
    }

    #[test]
    fn doi_duoi_xls_thanh_xlsx_va_giu_ten_khac() {
        assert_eq!(ten_xlsx("Bo bieu.v2.xls"), "Bo bieu.v2.xlsx");
        assert_eq!(ten_xlsx("A.XLS"), "A.xlsx");
        assert_eq!(ten_xlsx("a.xlsx"), "a.xlsx");
        assert_eq!(ten_xlsx("khong_duoi"), "khong_duoi");
    }

    #[test]
    fn ten_sheet_bo_ky_tu_cam_va_cat_31_ky_tu() {
        assert_eq!(ten_sheet_hop_le("A1/B2:[x]"), "A1B2x");
        assert_eq!(ten_sheet_hop_le(&"a".repeat(40)).chars().count(), 31);
        assert_eq!(ten_sheet_hop_le("///"), "Sheet");
    }

    #[test]
    fn bao_loi_ro_khi_tep_khong_phai_excel() {
        let d = std::env::temp_dir().join(format!("vtvl-xls-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let sai = d.join("hong.xls");
        std::fs::write(&sai, b"khong phai excel").unwrap();
        let e = xls_sang_xlsx(&sai, &d.join("ra.xlsx")).unwrap_err();
        assert!(e.starts_with("Không đổi được tệp .xls sang .xlsx"), "{e}");
        let _ = std::fs::remove_dir_all(&d);
    }
}
