//! Xuất các biểu đã đọc từ cổng của một hồ sơ ra một tệp Excel (mỗi biểu một sheet). Chỉ đọc cổng, không sửa gì.

use crate::quan_tri::DuLieuBieu;
use rust_xlsxwriter::{Format, Workbook, Worksheet};
use serde_json::Value;

const SHEET_TOI_DA: usize = 31;

/// Tên sheet hợp lệ của Excel: bỏ ký tự cấm, tối đa 31 ký tự; trùng thì thêm số thứ tự.
pub fn ten_sheet(ma: &str, da_dung: &[String]) -> String {
    let sach: String = ma.chars().filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\')).collect();
    let goc: String = sach.trim().chars().take(SHEET_TOI_DA - 3).collect();
    let goc = if goc.is_empty() { "Bieu".to_string() } else { goc };
    let trung = |t: &str| da_dung.iter().any(|d| d.eq_ignore_ascii_case(t));
    if !trung(&goc) { return goc; }
    (2..).map(|i| format!("{goc} ({i})")).find(|t| !trung(t)).unwrap_or(goc)
}

fn ghi_o(ws: &mut Worksheet, r: u32, c: u16, v: &Value) -> Result<(), String> {
    let kq = match v {
        Value::Null => return Ok(()),
        Value::Number(n) => ws.write_number(r, c, n.as_f64().unwrap_or(0.0)).map(|_| ()),
        Value::Bool(b) => ws.write_boolean(r, c, *b).map(|_| ()),
        Value::String(s) => ws.write_string(r, c, s).map(|_| ()),
        khac => ws.write_string(r, c, khac.to_string()).map(|_| ()),
    };
    kq.map_err(|e| e.to_string())
}

fn ghi_bieu(ws: &mut Worksheet, du: &DuLieuBieu) -> Result<(), String> {
    let dam = Format::new().set_bold();
    let e = |x: rust_xlsxwriter::XlsxError| x.to_string();
    let n = du.bieu.cot.len() as u16;
    ws.write_string_with_format(0, 0, "STT", &dam).map_err(e)?;
    for (i, c) in du.bieu.cot.iter().enumerate() {
        let tieu_de = if c.tieu_de.is_empty() { c.chu.clone() } else { format!("{} ({})", c.tieu_de, c.chu) };
        ws.write_string_with_format(0, i as u16 + 1, tieu_de, &dam).map_err(e)?;
    }
    ws.write_string_with_format(0, n + 1, "Kiểm tra", &dam).map_err(e)?;
    ws.write_string_with_format(0, n + 2, "Lỗi", &dam).map_err(e)?;
    for (i, d) in du.dong.iter().enumerate() {
        let r = i as u32 + 1;
        ws.write_number(r, 0, d.so as f64).map_err(e)?;
        for (j, c) in du.bieu.cot.iter().enumerate() {
            if let Some(v) = d.du_lieu.get(&c.chu) { ghi_o(ws, r, j as u16 + 1, v)?; }
        }
        ws.write_string(r, n + 1, &d.trang_thai).map_err(e)?;
        ws.write_string(r, n + 2, d.loi.join("; ")).map_err(e)?;
    }
    ws.set_freeze_panes(1, 1).map_err(e)?;
    ws.set_column_width(0, 6).map_err(e)?;
    Ok(())
}

/// Ghi mọi biểu vào một tệp xlsx tại `duong_dan`.
pub fn xuat(duong_dan: &std::path::Path, cac_bieu: &[DuLieuBieu]) -> Result<(), String> {
    if cac_bieu.is_empty() { return Err("Hồ sơ chưa có biểu nào để xuất".into()); }
    let mut wb = Workbook::new();
    let mut da_dung: Vec<String> = Vec::new();
    for du in cac_bieu {
        let ten = ten_sheet(&du.bieu.ma, &da_dung);
        let ws = wb.add_worksheet();
        ws.set_name(&ten).map_err(|e| e.to_string())?;
        ghi_bieu(ws, du)?;
        da_dung.push(ten);
    }
    wb.save(duong_dan).map_err(|e| format!("Không ghi được tệp Excel: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ten_sheet_bo_ky_tu_cam_cat_do_dai_va_tranh_trung() {
        assert_eq!(ten_sheet("B1/[x]", &[]), "B1x");
        assert_eq!(ten_sheet("", &[]), "Bieu");
        assert_eq!(ten_sheet(&"a".repeat(50), &[]).chars().count(), 28);
        assert_eq!(ten_sheet("B1", &["b1".to_string()]), "B1 (2)");
    }
}
