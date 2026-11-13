import { memo, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CAU_HINH_BIEU, cacNam, dinhDangTong, doiNam, doiPP, GIO_MOT_NGUOI_NAM, gioSangNguoi, cacPP, hienGiaTri, locDong, locTheoPP, locNhieuNam, locTuMuc, namDeChon, mauO, sapXepCot, soTuO, tongCot, type HuongSapXep } from '../quanTri';
import type { CotQt, DuLieuBieuQt } from '../types';
import { IcCanhBao, IcTim } from './Icons';

const BUOC_HIEN = 200;
const KIEU_SO = ['DECIMAL', 'INTEGER'];

export interface BangBieuProps {
  du: DuLieuBieuQt;
}

/** Bảng dữ liệu một biểu để thẩm định. Cột theo khung biểu, ô tính tự động tô nền nhạt, dòng cổng báo lỗi nổi bật.
 *  Công cụ riêng từng biểu (xem `CAU_HINH_BIEU`): B1 sắp xếp và lọc ≥ cột D, ước tính số người; C3, D2 có dòng tổng trên cùng; D2 lọc theo năm. */
export const BangBieu = memo(function BangBieu({ du }: BangBieuProps) {
  const ch = CAU_HINH_BIEU[du.bieu.khoa] ?? {};
  const cot = du.bieu.cot;
  const [tim, setTim] = useState('');
  const [chiLoi, setChiLoi] = useState(false);
  const [soHien, setSoHien] = useState(BUOC_HIEN);
  const [huong, setHuong] = useState<HuongSapXep | null>(null);
  const [nguong, setNguong] = useState('');
  const [namChon, setNamChon] = useState<readonly number[]>([]); // rỗng = tất cả các năm
  const [ppChon, setPpChon] = useState<readonly string[]>([]); // rỗng = mọi phương pháp
  const timTre = useDeferredValue(tim);
  const nguongSo = nguong.trim() === '' ? null : soTuO(nguong);

  const cacNamCo = useMemo(() => (ch.locNam ? namDeChon(cacNam(du.dong, ch.locNam.cot)) : []), [du.dong, ch.locNam]);
  const cacPPCo = useMemo(() => (ch.locPP ? cacPP(du.dong, ch.locPP.cot) : []), [du.dong, ch.locPP]);
  const dong = useMemo(() => {
    let r = locDong(du.dong, timTre, chiLoi);
    if (ch.locPP) r = locTheoPP(r, ch.locPP.cot, ppChon);
    if (ch.sapXepLoc && nguongSo !== null) r = locTuMuc(r, ch.sapXepLoc.cot, nguongSo);
    if (ch.locNam) r = locNhieuNam(r, ch.locNam.cot, namChon);
    if (ch.sapXepLoc && huong) r = sapXepCot(r, ch.sapXepLoc.cot, huong);
    return r;
  }, [du.dong, timTre, chiLoi, ch.sapXepLoc, ch.locNam, ch.locPP, nguongSo, namChon, ppChon, huong]);
  const soDongCoVanDe = useMemo(() => du.dong.filter((d) => d.loi.length > 0 || d.trangThai !== 'OK').length, [du.dong]);
  const tongGio = ch.soNguoi ? tongCot(dong, ch.soNguoi.cotGio) : 0;
  const coTong = (c: CotQt) => !!ch.tong && KIEU_SO.includes(c.kieu) && !ch.tong.loaiTru.includes(c.chu);

  // dòng tổng dính ngay dưới hàng tiêu đề: cần chiều cao thật của hàng tiêu đề (tiêu đề dài có thể xuống dòng)
  const hangDau = useRef<HTMLTableRowElement>(null);
  const [caoDau, setCaoDau] = useState(0);
  useLayoutEffect(() => {
    const el = hangDau.current;
    if (!el) return undefined;
    const do_ = () => setCaoDau(el.offsetHeight);
    do_();
    const ro = new ResizeObserver(do_);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cot, dong.length === 0]);

  const doiHuong = () => { setHuong((h) => (h === null ? 'giam' : h === 'giam' ? 'tang' : null)); setSoHien(BUOC_HIEN); };
  const sx = ch.sapXepLoc;
  const nhanCotDau = cot.find((c) => !KIEU_SO.includes(c.kieu))?.chu;

  return (
    <div className="bb">
      <div className="bb__dau">
        <ul className="bb__so" aria-label="Tóm tắt biểu">
          <li><b>{du.tong}</b> dòng</li>
          <li className="bb__so--tot"><b>{du.dongDat}</b> đạt</li>
          <li className={du.dongChuaDat > 0 ? 'bb__so--xau' : ''}><b>{du.dongChuaDat}</b> chưa đạt</li>
          <li className={du.canhBao > 0 ? 'bb__so--chu-y' : ''}><b>{du.canhBao}</b> cảnh báo</li>
        </ul>
        <label className="tim-kiem bb__tim">
          <IcTim aria-hidden="true" />
          <input type="search" value={tim} onChange={(e) => { setTim(e.target.value); setSoHien(BUOC_HIEN); }} placeholder="Tìm trong biểu…" aria-label="Tìm trong biểu" autoComplete="off" spellCheck={false} />
        </label>
        <label className="bb__chon">
          <input type="checkbox" checked={chiLoi} onChange={(e) => { setChiLoi(e.target.checked); setSoHien(BUOC_HIEN); }} />
          Chỉ dòng có vấn đề <span className="bb__phu">({soDongCoVanDe})</span>
        </label>
        {sx && (
          <label className="bb__loc-so">
            {sx.nhan} ≥
            <input type="number" inputMode="decimal" min="0" step="any" value={nguong} onChange={(e) => { setNguong(e.target.value); setSoHien(BUOC_HIEN); }} placeholder="vd 1000" aria-label={`Chỉ hiện dòng có ${sx.nhan} lớn hơn hoặc bằng`} />
            {nguong !== '' && <button type="button" className="bb__xoa" onClick={() => setNguong('')} aria-label="Bỏ lọc">×</button>}
          </label>
        )}
        {ch.locNam && cacNamCo.length > 0 && (
          <div className="bb__nam" role="group" aria-label="Lọc theo năm">
            <span className="bb__phu">Năm</span>
            <label className={`loc-hop${namChon.length === 0 ? ' loc-hop--chon' : ''}`}>
              <input type="checkbox" checked={namChon.length === 0} onChange={() => { setNamChon([]); setSoHien(BUOC_HIEN); }} />Tất cả
            </label>
            {cacNamCo.map((n) => (
              <label key={n} className={`loc-hop${namChon.includes(n) ? ' loc-hop--chon' : ''}`}>
                <input type="checkbox" checked={namChon.includes(n)} onChange={() => { setNamChon((cu) => doiNam(cu, n, cacNamCo)); setSoHien(BUOC_HIEN); }} />{n}
              </label>
            ))}
          </div>
        )}
        {ch.locPP && (
          <div className="bb__nam" role="group" aria-label="Lọc theo phương pháp (cột B)">
            <span className="bb__phu">Phương pháp</span>
            <label className={`loc-hop${ppChon.length === 0 ? ' loc-hop--chon' : ''}`}>
              <input type="checkbox" checked={ppChon.length === 0} onChange={() => { setPpChon([]); setSoHien(BUOC_HIEN); }} />Tất cả
            </label>
            {cacPPCo.map(({ pp, so }) => (
              <label key={pp} className={`loc-hop${ppChon.includes(pp) ? ' loc-hop--chon' : ''}${so === 0 ? ' loc-hop--trong' : ''}`}>
                <input type="checkbox" checked={ppChon.includes(pp)} onChange={() => { setPpChon((cu) => doiPP(cu, pp, cacPPCo.map((x) => x.pp))); setSoHien(BUOC_HIEN); }} />{pp} <span className="bb__phu">({so})</span>
              </label>
            ))}
          </div>
        )}
        {ch.soNguoi && (
          <p className="bb__uoc-tinh" role="status" title={`Ước tính = tổng giờ (cột ${ch.soNguoi.cotGio}) ÷ ${GIO_MOT_NGUOI_NAM}, tính trên các dòng đang hiện`}>
            Tổng giờ <b>{dinhDangTong(tongGio)}</b> ÷ {GIO_MOT_NGUOI_NAM.toLocaleString('vi-VN')} ≈ <b className="bb__nguoi">{dinhDangTong(gioSangNguoi(tongGio))}</b> người
          </p>
        )}
      </div>

      {du.biCat && <p className="thong-bao thong-bao--loi" role="status"><IcCanhBao />Biểu có {du.tong} dòng, chỉ tải {du.dong.length} dòng đầu.</p>}

      {du.tong === 0 ? (
        <p className="bb__rong">Biểu chưa có dòng nào.</p>
      ) : (
        <div className="bb__cuon" tabIndex={0} role="region" aria-label={`Dữ liệu biểu ${du.bieu.ma}`}>
          <table className="bb__bang">
            <thead>
              <tr ref={hangDau}>
                <th scope="col" className="bb__stt">#</th>
                {cot.map((c) => {
                  const sapXep = sx?.cot === c.chu;
                  return (
                    <th key={c.chu} scope="col" className={c.loai === 'INPUT' ? '' : 'bb__tu-dong'} title={`${c.chu} · ${c.loai === 'INPUT' ? 'cột nhập' : 'cột tự động'}`}
                      aria-sort={sapXep ? (huong === 'giam' ? 'descending' : huong === 'tang' ? 'ascending' : 'none') : undefined}>
                      <span className="bb__chu">{c.chu}</span>{c.tieuDe}
                      {sapXep && (
                        <button type="button" className={`bb__sx${huong ? ' bb__sx--bat' : ''}`} onClick={doiHuong} aria-label={`Sắp xếp theo ${c.tieuDe}: ${huong === 'giam' ? 'cao đến thấp' : huong === 'tang' ? 'thấp đến cao' : 'chưa sắp xếp'}. Bấm để đổi`} title="Bấm để đổi: cao → thấp → thấp → cao → bỏ sắp xếp">
                          {huong === 'giam' ? '↓ Cao→thấp' : huong === 'tang' ? '↑ Thấp→cao' : '↕ Sắp xếp'}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
              {ch.tong && (
                <tr className="bb__tong" style={{ ['--bb-cao-dau' as string]: `${caoDau}px` }}>
                  <th scope="row" className="bb__stt" title="Dòng tổng">Σ</th>
                  {cot.map((c) => (
                    <td key={c.chu} className={coTong(c) ? 'bb__so-tong' : ''}>
                      {coTong(c) ? dinhDangTong(tongCot(dong, c.chu)) : c.chu === nhanCotDau ? <span>Tổng · {dong.length} dòng{namChon.length > 0 ? ` · năm ${namChon.join(', ')}` : ''}{ppChon.length > 0 ? ` · ${ppChon.join(', ')}` : ''}</span> : ''}
                    </td>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {dong.slice(0, soHien).map((d) => {
                const van = d.loi.length > 0 || d.trangThai !== 'OK';
                return (
                  <DongBang key={d.so} so={d.so} van={van} thongBao={d.loi} trangThai={d.trangThai} soCot={cot.length + 1}
                    o={cot.map((c) => ({ chu: c.chu, tuDong: c.loai !== 'INPUT', giaTri: d.duLieu[c.chu] }))} />
                );
              })}
            </tbody>
          </table>
          {dong.length === 0 && <p className="bb__rong">Không có dòng nào khớp bộ lọc.</p>}
        </div>
      )}

      {dong.length > soHien && (
        <div className="bb__them">
          <span className="bb__phu">Đang hiện {soHien}/{dong.length} dòng (dòng tổng tính trên cả {dong.length} dòng)</span>
          <button type="button" className="nut" onClick={() => setSoHien((n) => n + BUOC_HIEN)}>Hiện thêm {Math.min(BUOC_HIEN, dong.length - soHien)} dòng</button>
          <button type="button" className="nut" onClick={() => setSoHien(dong.length)}>Hiện tất cả</button>
        </div>
      )}
    </div>
  );
});

interface DongBangProps {
  so: number;
  van: boolean;
  thongBao: string[];
  trangThai: string;
  soCot: number;
  o: { chu: string; tuDong: boolean; giaTri: unknown }[];
}

const DongBang = memo(function DongBang({ so, van, thongBao, trangThai, soCot, o }: DongBangProps) {
  return (
    <>
      <tr className={van ? 'bb__dong bb__dong--van-de' : 'bb__dong'}>
        <th scope="row" className="bb__stt">{so}</th>
        {o.map((x) => {
          const mau = mauO(x.giaTri);
          const chu = hienGiaTri(x.giaTri);
          return (
            <td key={x.chu} className={x.tuDong ? 'bb__tu-dong' : ''} title={chu.length > 40 ? chu : undefined}>
              {mau ? <span className={`bb__nhan bb__nhan--${mau}`}>{chu}</span> : chu}
            </td>
          );
        })}
      </tr>
      {van && (
        <tr className="bb__loi">
          <td colSpan={soCot}>
            <IcCanhBao /> <b>{trangThai}</b>{thongBao.length > 0 ? ': ' + thongBao.join(' · ') : ''}
          </td>
        </tr>
      )}
    </>
  );
});
