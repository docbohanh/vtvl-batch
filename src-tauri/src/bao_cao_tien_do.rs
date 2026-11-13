//! "Báo cáo tiến độ nhập liệu": đơn vị chưa nhập và đơn vị chậm tiến độ, mỗi loại một sheet, theo cây đơn vị phân cấp.
//! Chỉ dùng danh sách hồ sơ đã quét (cache quản trị), không gọi cổng.
//! - Chưa nhập: hồ sơ chưa có dòng dữ liệu nào (đạt + chưa đạt = 0) hoặc tiến độ 0%.
//! - Chậm tiến độ: đã có dữ liệu nhưng tiến độ dưới 100%.

use crate::quan_tri::{DanhSach, HoSoQt, NutQt};
use crate::{lay_lo, AppState};
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, Worksheet};
use std::collections::{HashMap, HashSet};
use tauri::State;

pub const TEN_BAO_CAO: &str = "Báo cáo tiến độ nhập liệu";
const TIEN_DO_XONG: u64 = 100;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Loai { ChuaNhap, ChamTienDo }

/// Hồ sơ thuộc loại nào (nếu có). Chưa nhập loại trừ chậm tiến độ.
pub fn phan_loai(h: &HoSoQt) -> Option<Loai> {
    if h.tien_do == 0 || h.dong_dat + h.dong_chua_dat == 0 { Some(Loai::ChuaNhap) }
    else if h.tien_do < TIEN_DO_XONG { Some(Loai::ChamTienDo) }
    else { None }
}

/// Số ngày từ lần cập nhật cuối (RFC 3339) đến `bay_gio` (cũng RFC 3339); None nếu không đọc được.
pub fn so_ngay_chua_cap_nhat(cap_nhat: &str, bay_gio: &str) -> Option<i64> {
    let a = chrono::DateTime::parse_from_rfc3339(cap_nhat).ok()?;
    let b = chrono::DateTime::parse_from_rfc3339(bay_gio).ok()?;
    Some((b - a).num_days().max(0))
}

fn so_ten(a: &&NutQt, b: &&NutQt) -> std::cmp::Ordering { a.ten.to_lowercase().cmp(&b.ten.to_lowercase()) }

/// Một dòng của cây đã lọc theo một loại: thứ tự duyệt (cha trước con), độ sâu, hồ sơ riêng (nếu thuộc loại) và số hồ sơ cả nhánh.
pub struct Dong<'a> { pub nut: &'a NutQt, pub sau: u8, pub ho_so: Option<&'a HoSoQt>, pub so_nhanh: u32, pub co_con: bool }

/// Dựng cây chỉ giữ nhánh có hồ sơ thuộc `loai`. Hồ sơ không có nút trong cây gom vào nhóm giả "Chưa xếp vào cây đơn vị".
pub fn dung_cay<'a>(ds: &'a DanhSach, loai: Loai, nut_lac: &'a NutQt) -> Vec<Dong<'a>> {
    let nut: HashMap<&str, &NutQt> = ds.don_vi.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut hs: HashMap<&str, &HoSoQt> = HashMap::new();
    let mut lac: Vec<&HoSoQt> = Vec::new();
    for h in ds.ho_so.iter().filter(|h| phan_loai(h) == Some(loai)) {
        if nut.contains_key(h.org_id.as_str()) && !hs.contains_key(h.org_id.as_str()) { hs.insert(h.org_id.as_str(), h); } else { lac.push(h); }
    }
    let mut con: HashMap<&str, Vec<&NutQt>> = HashMap::new();
    let mut goc: Vec<&NutQt> = Vec::new();
    for n in &ds.don_vi {
        match n.cha_id.as_deref() { Some(c) if nut.contains_key(c) && c != n.id => con.entry(c).or_default().push(n), _ => goc.push(n) }
    }
    con.values_mut().for_each(|v| v.sort_by(so_ten));
    goc.sort_by(so_ten);
    let mut dem: HashMap<&str, u32> = HashMap::new();
    fn tinh<'a>(n: &'a NutQt, con: &HashMap<&str, Vec<&'a NutQt>>, hs: &HashMap<&str, &HoSoQt>, dem: &mut HashMap<&'a str, u32>, di: &mut HashSet<&'a str>) -> u32 {
        if let Some(x) = dem.get(n.id.as_str()) { return *x; }
        if !di.insert(n.id.as_str()) { return 0; }
        let mut t = u32::from(hs.contains_key(n.id.as_str()));
        for c in con.get(n.id.as_str()).into_iter().flatten() { t += tinh(c, con, hs, dem, di); }
        di.remove(n.id.as_str());
        dem.insert(n.id.as_str(), t);
        t
    }
    for n in &goc { tinh(n, &con, &hs, &mut dem, &mut HashSet::new()); }
    let mut ra = Vec::new();
    fn di<'a>(n: &'a NutQt, sau: u8, con: &HashMap<&str, Vec<&'a NutQt>>, hs: &HashMap<&str, &'a HoSoQt>, dem: &HashMap<&str, u32>, ra: &mut Vec<Dong<'a>>, dang: &mut HashSet<&'a str>) {
        let so = dem.get(n.id.as_str()).copied().unwrap_or(0);
        if so == 0 || !dang.insert(n.id.as_str()) { return; }
        let kids: Vec<&NutQt> = con.get(n.id.as_str()).into_iter().flatten().copied().filter(|c| dem.get(c.id.as_str()).copied().unwrap_or(0) > 0).collect();
        ra.push(Dong { nut: n, sau, ho_so: hs.get(n.id.as_str()).copied(), so_nhanh: so, co_con: !kids.is_empty() });
        for c in kids { di(c, sau + 1, con, hs, dem, ra, dang); }
        dang.remove(n.id.as_str());
    }
    for n in goc { di(n, 0, &con, &hs, &dem, &mut ra, &mut HashSet::new()); }
    if !lac.is_empty() {
        ra.push(Dong { nut: nut_lac, sau: 0, ho_so: None, so_nhanh: lac.len() as u32, co_con: true });
        lac.sort_by(|a, b| a.ten.to_lowercase().cmp(&b.ten.to_lowercase()));
        // hồ sơ lạc cây: nút giả dùng chung `nut_lac` chỉ để mang tên nhóm; từng hồ sơ ghi riêng ở `ghi_sheet`
        for h in lac { ra.push(Dong { nut: nut_lac, sau: 1, ho_so: Some(h), so_nhanh: 1, co_con: false }); }
    }
    ra
}

fn e(x: rust_xlsxwriter::XlsxError) -> String { x.to_string() }

fn ghi_sheet(ws: &mut Worksheet, ds: &DanhSach, loai: Loai, ten: &str, tieu_de: &str, ghi_chu: &str, bay_gio: &str) -> Result<usize, String> {
    let nut_lac = NutQt { id: "__lac__".into(), ma: String::new(), ten: "Chưa xếp vào cây đơn vị".into(), cha_id: None };
    let dong = dung_cay(ds, loai, &nut_lac);
    ws.set_name(ten).map_err(e)?;
    let vien = |f: Format| f.set_border(FormatBorder::Thin).set_border_color(Color::RGB(0xBFBFBF)).set_font_name("Times New Roman");
    let f_td = vien(Format::new()).set_bold().set_font_color(Color::White).set_background_color(Color::RGB(0x1F4E78)).set_align(FormatAlign::Center).set_align(FormatAlign::VerticalCenter).set_text_wrap();
    let f_chu = vien(Format::new());
    let f_nhom = vien(Format::new()).set_bold().set_background_color(Color::RGB(0xF2F2F2));
    let f_so = vien(Format::new()).set_num_format("#,##0");
    let f_so_nhom = vien(Format::new()).set_bold().set_background_color(Color::RGB(0xF2F2F2)).set_num_format("#,##0");
    let f_do = vien(Format::new()).set_bold().set_font_color(Color::RGB(0x9C0006)).set_background_color(Color::RGB(0xFFC7CE)).set_num_format("#,##0");
    let f_14 = Format::new().set_bold().set_font_size(14).set_font_name("Times New Roman");
    let f_phu = Format::new().set_italic().set_font_size(10).set_font_name("Times New Roman");
    let tong: u32 = dong.iter().filter(|d| d.sau == 0).map(|d| d.so_nhanh).sum();
    ws.write_string_with_format(0, 0, format!("{} – {tieu_de} ({tong} đơn vị)", TEN_BAO_CAO.to_uppercase()), &f_14).map_err(e)?;
    ws.write_string_with_format(1, 0, ghi_chu, &f_phu).map_err(e)?;
    let cot = ["STT", "Tên đơn vị (theo cây)", "Mã", "Cấp", "Tài khoản", "Tiến độ (%)", "Dòng đạt", "Dòng chưa đạt", "Cảnh báo", "Cập nhật lần cuối", "Số ngày chưa cập nhật", "Số đơn vị trong nhánh"];
    for (i, t) in cot.iter().enumerate() { ws.write_string_with_format(3, i as u16, *t, &f_td).map_err(e)?; }
    ws.set_row_height(3, 34).map_err(e)?;
    for (i, d) in dong.iter().enumerate() {
        let r = 4 + i as u32;
        let la_nhom = d.co_con;
        let (fc, fs) = if la_nhom { (&f_nhom, &f_so_nhom) } else { (&f_chu, &f_so) };
        let thut = vien(Format::new()).set_indent(d.sau.min(8));
        let thut = if la_nhom { thut.set_bold().set_background_color(Color::RGB(0xF2F2F2)) } else { thut };
        ws.write_number_with_format(r, 0, (i + 1) as f64, fs).map_err(e)?;
        let (ten_dv, ma) = match d.ho_so { Some(h) if !la_nhom => (h.ten.as_str(), h.ma.as_str()), _ => (d.nut.ten.as_str(), d.nut.ma.as_str()) };
        ws.write_string_with_format(r, 1, ten_dv, &thut).map_err(e)?;
        ws.write_string_with_format(r, 2, ma, fc).map_err(e)?;
        match d.ho_so {
            Some(h) => {
                ws.write_string_with_format(r, 3, &h.cap, fc).map_err(e)?;
                ws.write_string_with_format(r, 4, h.tai_khoan.join(", "), fc).map_err(e)?;
                let nho = if h.tien_do < 50 { &f_do } else { fs };
                ws.write_number_with_format(r, 5, h.tien_do as f64, nho).map_err(e)?;
                ws.write_number_with_format(r, 6, h.dong_dat as f64, fs).map_err(e)?;
                ws.write_number_with_format(r, 7, h.dong_chua_dat as f64, fs).map_err(e)?;
                ws.write_number_with_format(r, 8, h.canh_bao as f64, fs).map_err(e)?;
                ws.write_string_with_format(r, 9, h.cap_nhat.get(..10).unwrap_or(""), fc).map_err(e)?;
                match so_ngay_chua_cap_nhat(&h.cap_nhat, bay_gio) { Some(n) => ws.write_number_with_format(r, 10, n as f64, fs).map(|_| ()).map_err(e)?, None => ws.write_string_with_format(r, 10, "", fc).map(|_| ()).map_err(e)? }
            }
            None => for c in 3..=10u16 { ws.write_string_with_format(r, c, "", fc).map_err(e)?; },
        }
        ws.write_number_with_format(r, 11, d.so_nhanh as f64, fs).map_err(e)?;
        for _ in 0..d.sau.min(7) { ws.group_rows(r, r).map_err(e)?; }
    }
    for (c, w) in [6.0, 62.0, 20.0, 7.0, 24.0, 10.0, 10.0, 11.0, 10.0, 14.0, 12.0, 12.0].iter().enumerate() { ws.set_column_width(c as u16, *w).map_err(e)?; }
    ws.set_freeze_panes(4, 2).map_err(e)?;
    if !dong.is_empty() { ws.autofilter(3, 0, 3 + dong.len() as u32, cot.len() as u16 - 1).map_err(e)?; }
    Ok(tong as usize)
}

/// Ghi báo cáo ra tệp xlsx: sheet "Chưa nhập" và sheet "Chậm tiến độ".
pub fn xuat(duong_dan: &std::path::Path, ds: &DanhSach, bay_gio: &str) -> Result<(), String> {
    if ds.don_vi.is_empty() { return Err("Chưa có cây đơn vị. Bấm \"Cập nhật\" ở trang Quản trị rồi thử lại.".into()); }
    let mut wb = Workbook::new();
    let mo_ta = format!("Kỳ {}. Số liệu quét lúc {}. Dòng nhóm in đậm là đơn vị cha (cột \"Số đơn vị trong nhánh\" là số đơn vị thuộc loại này trong nhánh). Bấm +/− ở lề trái để thu gọn / mở nhánh.", ds.ky.ten, ds.quet_luc);
    ghi_sheet(wb.add_worksheet(), ds, Loai::ChuaNhap, "Chưa nhập", "ĐƠN VỊ CHƯA NHẬP LIỆU", &format!("Hồ sơ chưa có dòng dữ liệu nào hoặc tiến độ 0%. {mo_ta}"), bay_gio)?;
    ghi_sheet(wb.add_worksheet(), ds, Loai::ChamTienDo, "Chậm tiến độ", "ĐƠN VỊ CHẬM TIẾN ĐỘ", &format!("Đã có dữ liệu nhưng tiến độ dưới 100% (tiến độ dưới 50% tô đỏ). {mo_ta}"), bay_gio)?;
    wb.save(duong_dan).map_err(e)
}

/// Lập báo cáo tiến độ nhập liệu ra tệp Excel từ danh sách hồ sơ đã quét (không gọi cổng).
#[tauri::command]
pub fn bc_tien_do_xuat(duong_dan: String, state: State<'_, AppState>) -> Result<String, String> {
    let mut dich = std::path::PathBuf::from(duong_dan.trim());
    if dich.as_os_str().is_empty() { return Err("Chưa chọn nơi lưu tệp".into()); }
    if dich.extension().is_none_or(|x| !x.eq_ignore_ascii_case("xlsx")) { dich.set_extension("xlsx"); }
    let lo = lay_lo(&state)?;
    let ds: DanhSach = crate::lo::doc_json(&crate::quan_tri::tep_cache(&lo)).map_err(|_| "Chưa có danh sách đơn vị. Mở trang Quản trị và bấm \"Cập nhật\" trước.".to_string())?;
    xuat(&dich, &ds, &crate::lo::bay_gio())?;
    Ok(dich.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hs(id: &str, org: &str, td: u64, dat: u64, chua: u64) -> HoSoQt {
        HoSoQt { id: id.into(), org_id: org.into(), ma: id.into(), ten: format!("HS {id}"), cap: "XA".into(), trang_thai: "DRAFT".into(), tien_do: td, cap_nhat: "2026-11-10T10:00:00Z".into(), dong_dat: dat, dong_chua_dat: chua, canh_bao: 0, tai_khoan: vec![] }
    }

    #[test]
    fn phan_loai_chua_nhap_cham_va_xong() {
        assert_eq!(phan_loai(&hs("a", "o", 0, 0, 0)), Some(Loai::ChuaNhap));
        assert_eq!(phan_loai(&hs("a", "o", 30, 0, 0)), Some(Loai::ChuaNhap));
        assert_eq!(phan_loai(&hs("a", "o", 0, 5, 0)), Some(Loai::ChuaNhap));
        assert_eq!(phan_loai(&hs("a", "o", 90, 10, 1)), Some(Loai::ChamTienDo));
        assert_eq!(phan_loai(&hs("a", "o", 100, 10, 0)), None);
    }

    #[test]
    fn so_ngay_tinh_den_bay_gio_va_khong_am() {
        assert_eq!(so_ngay_chua_cap_nhat("2026-11-10T10:00:00Z", "2026-11-12T09:00:00Z"), Some(1));
        assert_eq!(so_ngay_chua_cap_nhat("2026-11-12T10:00:00Z", "2026-11-10T10:00:00Z"), Some(0));
        assert_eq!(so_ngay_chua_cap_nhat("khong hop le", "2026-11-10T10:00:00Z"), None);
    }

    #[test]
    fn cay_chi_giu_nhanh_co_ho_so_thuoc_loai() {
        let nut = |id: &str, cha: Option<&str>| NutQt { id: id.into(), ma: id.into(), ten: id.into(), cha_id: cha.map(String::from) };
        let ds = DanhSach {
            quet_luc: "x".into(),
            ky: crate::quan_tri::Ky { id: "k".into(), ma: "k".into(), ten: "k".into(), tu_ngay: "".into(), den_ngay: "".into(), trang_thai: "".into(), han_gui: "".into() },
            tai_khoan: vec![],
            ho_so: vec![hs("1", "con1", 40, 5, 0), hs("2", "con2", 100, 5, 0), hs("3", "lac", 0, 0, 0)],
            bieu: vec![],
            don_vi: vec![nut("goc", None), nut("con1", Some("goc")), nut("con2", Some("goc"))],
        };
        let lac = nut("__lac__", None);
        let cham = dung_cay(&ds, Loai::ChamTienDo, &lac);
        assert_eq!(cham.iter().map(|d| (d.nut.id.as_str(), d.sau)).collect::<Vec<_>>(), vec![("goc", 0), ("con1", 1)]);
        assert_eq!(cham[0].so_nhanh, 1);
        let chua = dung_cay(&ds, Loai::ChuaNhap, &lac);
        assert_eq!(chua.len(), 2); // nhóm "Chưa xếp vào cây" + hồ sơ lạc
        assert_eq!(chua[1].ho_so.map(|h| h.id.as_str()), Some("3"));
    }

    /// VTVL_CACHE=<quan-tri.json> VTVL_RA=<ra.xlsx> cargo test xuat_tu_tep_tien_do -- --ignored
    #[test]
    #[ignore]
    fn xuat_tu_tep_tien_do() {
        let (c, r) = (std::env::var("VTVL_CACHE").unwrap(), std::env::var("VTVL_RA").unwrap());
        let ds: DanhSach = crate::lo::doc_json(std::path::Path::new(&c)).unwrap();
        xuat(std::path::Path::new(&r), &ds, &crate::lo::bay_gio()).unwrap();
    }
}
