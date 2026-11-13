//! Thẩm định độc lập một tệp Excel bộ biểu (B30K) trên máy: chạy bộ kiểm tra cục bộ rồi dựng dữ liệu từng biểu cùng dạng với biểu đọc từ cổng,
//! để giao diện xem/lọc/so sánh B1 ↔ C3 như khi chọn một đơn vị. Không đăng nhập, không gọi cổng, không ghi gì vào dữ liệu đơn vị.

use crate::kiem_tra_local::{self, DongTho, KetQuaKiemTra};
use crate::quan_tri::{Bieu, Cot, Dong, DuLieuBieu};
use crate::{lay_lo, AppState};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::State;

/// Biểu theo thứ tự hiển thị: (khóa, mã tab, tiêu đề, bước).
const BIEU: [(&str, &str, &str, u64); 10] = [
    ("a1", "A1", "Danh mục nhiệm vụ", 1), ("a2", "A2", "Danh mục công việc", 2), ("b1", "B1", "Khối lượng và thời gian", 3),
    ("b2_ct", "B2", "Tác động chuyển đổi số", 4), ("c1", "C1", "Danh mục vị trí việc làm", 5), ("c2", "C2", "Mô tả năng lực", 5),
    ("c3", "C3", "Nhu cầu nhân lực", 6), ("d1", "D1", "Nhân lực hiện có", 7), ("du_bao_5_nam", "Dự báo", "Dự báo 5 năm", 7), ("d2", "D2", "Phương án biên chế", 7),
];
const TRANG_THAI_LOI: &str = "Lỗi";
const TRANG_THAI_XEM_LAI: &str = "Cần xem lại";

#[derive(Debug, Serialize)]
pub struct KetQuaThamDinh {
    #[serde(rename = "tenTep")]
    pub ten_tep: String,
    #[serde(rename = "kichThuoc")]
    pub kich_thuoc: u64,
    #[serde(rename = "tongDong")]
    pub tong_dong: u64,
    #[serde(rename = "dongLoi")]
    pub dong_loi: u64,
    #[serde(rename = "canhBao")]
    pub canh_bao: Vec<String>,
    pub bieu: Vec<DuLieuBieu>,
}

fn lam_tron(v: f64) -> f64 { (v * 10_000.0).round() / 10_000.0 }

/// Cột tự tính của B1 mà tệp không lưu: B (mã VTVL tra từ A2), F = C × D ÷ 60, G = F + E. Các cột tự tính khác để trống.
/// F dùng phút đo thực tế (D); cột "Phút/SP dùng để tính" (P) của cổng có thể thay bằng phút chuẩn nên số này là ước tính.
pub fn tinh_b1(dong: &mut BTreeMap<String, Value>, vtvl_cua_cv: &HashMap<String, String>) {
    let lay = |d: &BTreeMap<String, Value>, c: &str| d.get(c).and_then(|v| v.as_str()).and_then(|s| s.trim().replace(',', ".").parse::<f64>().ok());
    if let Some(ma) = dong.get("A").and_then(|v| v.as_str()).and_then(|a| vtvl_cua_cv.get(a.trim())) {
        dong.insert("B".into(), Value::String(ma.clone()));
    }
    let (c, d, e) = (lay(dong, "C"), lay(dong, "D"), lay(dong, "E"));
    if c.is_none() && d.is_none() { return; }
    let f = c.unwrap_or(0.0) * d.unwrap_or(0.0) / 60.0;
    dong.insert("F".into(), Value::from(lam_tron(f)));
    dong.insert("G".into(), Value::from(lam_tron(f + e.unwrap_or(0.0))));
}

fn vtvl_theo_cong_viec(a2: &[DongTho]) -> HashMap<String, String> {
    a2.iter().filter_map(|r| Some((r.data.get("A")?.as_deref()?.trim().to_string(), r.data.get("C")?.as_deref()?.trim().to_string()))).filter(|(a, c)| !a.is_empty() && !c.is_empty()).collect()
}

fn kieu_cot(kieu: &str) -> &'static str { if kieu == "number" { "DECIMAL" } else { "TEXT" } }

fn dung_bieu(khoa: &str, ma: &str, tieu_de: &str, buoc: u64, kq: &KetQuaKiemTra, loi_dong: &HashMap<u32, Vec<(bool, String)>>, vtvl: &HashMap<String, String>) -> Option<DuLieuBieu> {
    let cot_tho = kq.cot.get(khoa)?;
    let rows = kq.dong.get(khoa)?;
    let cot: Vec<Cot> = cot_tho.iter().map(|c| Cot { chu: c.letter.clone(), tieu_de: c.title.clone(), loai: c.kind.clone(), kieu: kieu_cot(&c.kieu).into() }).collect();
    let (mut dat, mut chua, mut canh) = (0u64, 0u64, 0u64);
    let dong: Vec<Dong> = rows.iter().map(|r| {
        let mut du_lieu: BTreeMap<String, Value> = r.data.iter().filter_map(|(k, v)| v.clone().map(|x| (k.clone(), Value::String(x)))).collect();
        if khoa == "b1" { tinh_b1(&mut du_lieu, vtvl); }
        let van = loi_dong.get(&r.row_no).map(Vec::as_slice).unwrap_or(&[]);
        let trang_thai = if van.iter().any(|(nang, _)| *nang) { chua += 1; TRANG_THAI_LOI } else if !van.is_empty() { canh += 1; TRANG_THAI_XEM_LAI } else { dat += 1; "OK" };
        Dong { so: r.row_no as u64, du_lieu, trang_thai: trang_thai.into(), loi: van.iter().map(|(_, t)| t.clone()).collect(), cap_nhat: String::new() }
    }).collect();
    Some(DuLieuBieu {
        bieu: Bieu { khoa: khoa.into(), ma: ma.into(), tieu_de: tieu_de.into(), buoc, cot },
        trang_thai: String::new(), tong: dong.len() as u64, dong_dat: dat, dong_chua_dat: chua, canh_bao: canh, dong, bi_cat: false,
    })
}

/// Dựng dữ liệu các biểu có trong tệp từ kết quả kiểm tra. Thuần.
pub fn dung_ket_qua(kq: &KetQuaKiemTra, ten_tep: String, kich_thuoc: u64) -> KetQuaThamDinh {
    let vtvl = kq.dong.get("a2").map(|a| vtvl_theo_cong_viec(a)).unwrap_or_default();
    let bieu = BIEU.iter().filter_map(|(khoa, ma, td, buoc)| {
        let mut loi_dong: HashMap<u32, Vec<(bool, String)>> = HashMap::new();
        for e in kq.loi.iter().filter(|e| e.bieu.as_deref() == Some(*khoa)) {
            let Some(d) = e.dong else { continue };
            let o = if e.o.is_empty() { String::new() } else { format!("[{}] ", e.o) };
            loi_dong.entry(d).or_default().push((e.muc == "loi", format!("{o}{} ({})", e.noi_dung, e.ma)));
        }
        dung_bieu(khoa, ma, td, *buoc, kq, &loi_dong, &vtvl)
    }).collect();
    KetQuaThamDinh { ten_tep, kich_thuoc, tong_dong: kq.tong_dong, dong_loi: kq.dong_loi, canh_bao: kq.canh_bao.clone(), bieu }
}

/// Tệp phải có đuôi .xlsx và tồn tại; trả đường dẫn và kích thước.
pub fn kiem_tra_tep(duong_dan: &str) -> Result<(PathBuf, u64), String> {
    let p = PathBuf::from(duong_dan.trim());
    if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("xlsx")) { return Err("Chỉ thẩm định được tệp Excel .xlsx".into()); }
    let md = std::fs::metadata(&p).map_err(|e| format!("Không đọc được tệp {}: {e}", p.display()))?;
    if !md.is_file() { return Err("Đường dẫn không phải là một tệp".into()); }
    Ok((p, md.len()))
}

/// Thẩm định tệp Excel `duong_dan` (cả bộ biểu). Dùng bản danh mục sản phẩm đã tải sẵn nếu có; chưa có thì bỏ qua kiểm tra mã sản phẩm.
#[tauri::command]
pub async fn tham_dinh_excel(duong_dan: String, state: State<'_, AppState>) -> Result<KetQuaThamDinh, String> {
    let (excel, kich_thuoc) = kiem_tra_tep(&duong_dan)?;
    let lo = lay_lo(&state)?;
    let ten = excel.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    chay_tham_dinh(&lo, &excel, ten, kich_thuoc).await
}

/// Chạy bộ kiểm tra cục bộ trên một tệp Excel và dựng dữ liệu các biểu.
pub(crate) async fn chay_tham_dinh(lo: &crate::Lo, excel: &Path, ten_tep: String, kich_thuoc: u64) -> Result<KetQuaThamDinh, String> {
    let s = &lo.cfg.settings;
    let script = if Path::new(&s.kiem_tra_script).is_absolute() { PathBuf::from(&s.kiem_tra_script) } else { lo.goc.join(&s.kiem_tra_script) };
    let dm = crate::danh_muc::tep_chung(&lo.root);
    let y = kiem_tra_local::YeuCau {
        node: &s.node, script: &script, excel, mode: "workbook", form_key: None, ky: None, danh_muc: dm.is_file().then_some(dm.as_path()),
        timeout: Duration::from_secs(s.timeout_sec),
    };
    let (kq, _) = kiem_tra_local::chay(&y).await?;
    Ok(dung_ket_qua(&kq, ten_tep, kich_thuoc))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kq() -> KetQuaKiemTra {
        let out = r#"{"tong_dong":4,"dong_loi":1,"dong_hop_le":3,"loi":[{"sheet":"B1","bieu":"b1","dong":4,"o":"G4","ma":"VAL-1","muc":"xem_lai","noi_dung":"a"},{"sheet":"B1","bieu":"b1","dong":4,"o":"C4","ma":"VAL-2","muc":"loi","noi_dung":"b"}],"canh_bao":["w"],"dong":{"a2":[{"rowNo":3,"data":{"A":"CV1","C":"VT.01"}}],"b1":[{"rowNo":3,"data":{"A":"CV1","C":"120","D":"60","E":"10,5"}},{"rowNo":4,"data":{"A":"CV9","C":null,"D":null,"E":null}}]},"cot_nhap":{},"cot":{"b1":[{"letter":"A","title":"Mã công việc","kind":"CATALOG","type":"text"},{"letter":"C","title":"Số SP/năm","kind":"INPUT","type":"number"}]}}"#;
        kiem_tra_local::doc_ket_qua(out).unwrap().0
    }

    #[test]
    fn dung_bieu_tinh_b1_va_gan_loi_vao_dong() {
        let r = dung_ket_qua(&kq(), "a.xlsx".into(), 10);
        assert_eq!(r.bieu.len(), 1, "chỉ biểu có cột định nghĩa và có dòng");
        let b1 = &r.bieu[0];
        assert_eq!((b1.bieu.ma.as_str(), b1.tong, b1.dong_dat, b1.dong_chua_dat, b1.canh_bao), ("B1", 2, 1, 1, 0));
        assert_eq!(b1.bieu.cot[1].kieu, "DECIMAL");
        let d0 = &b1.dong[0].du_lieu;
        assert_eq!((d0["B"].as_str(), d0["F"].as_f64(), d0["G"].as_f64()), (Some("VT.01"), Some(120.0), Some(130.5)));
        assert_eq!(b1.dong[1].trang_thai, TRANG_THAI_LOI);
        assert_eq!(b1.dong[1].loi.len(), 2);
        assert!(!b1.dong[1].du_lieu.contains_key("G"), "dòng trống không có giờ tính");
    }

    #[test]
    fn chi_nhan_tep_xlsx_ton_tai() {
        assert!(kiem_tra_tep("/khong/co/tep.xlsx").is_err());
        assert!(kiem_tra_tep("/tmp/a.csv").unwrap_err().contains(".xlsx"));
    }
}
