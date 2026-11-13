import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { loiThanhChuoi } from '../api';
import { laManHinhHep, useNhoBoolean } from '../boNho';
import { dinhDangTong, GIO_MOT_NGUOI_NAM, KHOA_UU_TIEN, nhanBieu, NGUONG_LECH_KHOP, sapTab, soSanhNguoi, tongTheoPP, NGUONG_LECH_PP, chiSoThamDinh, type ChiSoThamDinh, type TongTheoPP } from '../quanTri';
import type { DuLieuBieuQt, TomTatBieuQt } from '../types';
import { BangBieu } from './BangBieu';
import { IcCanhBao, IcDong, IcLenTren, IcLenXuong } from './Icons';

type TaiBieu = { loai: 'dang_tai' } | { loai: 'loi'; thongBao: string } | { loai: 'xong'; du: DuLieuBieuQt };

/** Ngữ cảnh trao cho vùng nút bên phải đầu trang. */
export interface NguCanhNut {
  bieuChon: TomTatBieuQt | undefined;
  dangTai: boolean;
  /** Đọc lại biểu đang xem. */
  taiLai: () => void;
  coBieu: boolean;
}

export interface BoBieuXemProps {
  /** Đổi giá trị này thì bỏ dữ liệu cũ và nạp lại (id hồ sơ, hoặc mã lần nạp tệp Excel). */
  khoaNap: string;
  tenAria: string;
  /** Nửa trái đầu trang: tiêu đề và các dòng chú thích (dòng chú thích thứ hai ẩn khi thu gọn). */
  dau: ReactNode;
  nut: (c: NguCanhNut) => ReactNode;
  /** Thông báo hiện ngay dưới đầu trang (kết quả xuất…). */
  thongBao?: ReactNode;
  layDanhSach: () => Promise<TomTatBieuQt[]>;
  layBieu: (khoa: string) => Promise<DuLieuBieuQt>;
  khoaGon: string;
  /** Chữ nói về nguồn đọc biểu: "từ cổng", "từ tệp Excel". */
  nguon: string;
}

/** Thân xem một bộ biểu: đầu trang, dải so sánh B1 ↔ C3, mỗi biểu một tab (B1, C3, D2 đứng đầu). Nguồn dữ liệu (cổng hay tệp Excel) do bên ngoài cấp qua `layDanhSach` và `layBieu`. Chỉ đọc. */
export function BoBieuXem({ khoaNap, tenAria, dau, nut: veNut, thongBao, layDanhSach, layBieu, khoaGon, nguon }: BoBieuXemProps) {
  const [bieu, setBieu] = useState<TomTatBieuQt[] | null>(null);
  const [loiBieu, setLoiBieu] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(KHOA_UU_TIEN[0]);
  const [da, setDa] = useState<Record<string, TaiBieu>>({});
  const lanTai = useRef(0);
  const [gonDau, setGonDau] = useNhoBoolean(khoaGon, laManHinhHep); // ẩn dòng phụ và dải so sánh B1 ↔ C3

  const taiBieu = useCallback(async (khoa: string) => {
    const lan = lanTai.current;
    setDa((d) => ({ ...d, [khoa]: { loai: 'dang_tai' } }));
    try {
      const du = await layBieu(khoa);
      if (lan === lanTai.current) setDa((d) => ({ ...d, [khoa]: { loai: 'xong', du } }));
    } catch (e) {
      if (lan === lanTai.current) setDa((d) => ({ ...d, [khoa]: { loai: 'loi', thongBao: loiThanhChuoi(e) } }));
    }
  }, [layBieu]);

  // đổi nguồn: bỏ dữ liệu cũ, đọc lại danh sách biểu
  useEffect(() => {
    const lan = ++lanTai.current;
    setBieu(null); setLoiBieu(null); setDa({}); setTab(KHOA_UU_TIEN[0]);
    layDanhSach()
      .then((b) => { if (lan === lanTai.current) setBieu(b); })
      .catch((e) => { if (lan === lanTai.current) setLoiBieu(loiThanhChuoi(e)); });
    // chỉ nạp lại khi đổi nguồn (khoaNap), không theo danh tính hàm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoaNap]);

  // đọc biểu của tab đang mở, cùng B1 và C3 (để đầu trang so sánh số người) — mỗi biểu một lần
  useEffect(() => {
    if (!bieu) return;
    for (const k of new Set([tab, 'b1', 'c3', 'c1'])) {
      if (bieu.some((b) => b.khoa === k) && !da[k]) void taiBieu(k);
    }
  }, [bieu, tab, da, taiBieu]);

  const { uuTien, khac } = bieu ? sapTab(bieu) : { uuTien: [], khac: [] };
  const moi = [...uuTien, ...khac];

  function phimTab(e: KeyboardEvent<HTMLDivElement>) {
    const i = moi.findIndex((b) => b.khoa === tab);
    const di = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!di || i < 0) return;
    e.preventDefault();
    const b = moi[(i + di + moi.length) % moi.length];
    setTab(b.khoa);
    document.getElementById(`tab-${b.khoa}`)?.focus();
  }

  const nutTab = (b: TomTatBieuQt, nhanh: boolean) => (
    <button key={b.khoa} id={`tab-${b.khoa}`} type="button" role="tab" aria-selected={tab === b.khoa} aria-controls={`bang-${b.khoa}`} tabIndex={tab === b.khoa ? 0 : -1}
      className={`tab${nhanh ? ' tab--uu-tien' : ''}${tab === b.khoa ? ' tab--chon' : ''}`} title={b.tieuDe} onClick={() => setTab(b.khoa)}>
      {nhanBieu(b, moi)}
      <span className="tab__dem">{b.soDong}</span>
      {b.dongChuaDat > 0 && <span className="tab__chua-dat" title={`${b.dongChuaDat} dòng chưa đạt`}>{b.dongChuaDat}</span>}
    </button>
  );
  const hienTai = da[tab];
  const b1 = da.b1;
  const c3 = da.c3;
  const soSanh = b1?.loai === 'xong' && c3?.loai === 'xong' ? soSanhNguoi(b1.du.dong, c3.du.dong) : null;
  const c1 = da.c1;
  const chiSo = b1?.loai === 'xong' && c3?.loai === 'xong' ? chiSoThamDinh(b1.du.dong, c3.du.dong, c1?.loai === 'xong' ? c1.du.dong : null) : [];
  const bieuChon = moi.find((b) => b.khoa === tab);

  return (
    <section className="hsqt" aria-label={tenAria}>
      <header className={`hsqt__dau${gonDau ? ' hsqt__dau--gon' : ''}`}>
        <div>{dau}</div>
        <div className="hsqt__nut">
          <button type="button" className="nut" aria-expanded={!gonDau} onClick={() => setGonDau((g) => !g)} title={gonDau ? 'Hiện chi tiết và so sánh B1 ↔ C3' : 'Ẩn chi tiết và so sánh B1 ↔ C3 để xem biểu rộng hơn'}>
            {gonDau ? <IcLenXuong /> : <IcLenTren />} {gonDau ? 'Chi tiết' : 'Thu gọn'}
          </button>
          {veNut({ bieuChon, dangTai: hienTai?.loai === 'dang_tai', taiLai: () => { if (bieuChon) void taiBieu(bieuChon.khoa); }, coBieu: bieu !== null })}
        </div>
        <SoSanhB1C3 soSanh={soSanh} chiSo={chiSo} pp={c3?.loai === 'xong' ? tongTheoPP(c3.du.dong) : null} dangTai={bieu !== null && (b1?.loai === 'dang_tai' || c3?.loai === 'dang_tai' || !b1 || !c3)} />
      </header>

      {thongBao}
      {loiBieu && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loiBieu}</p>}
      {!bieu && !loiBieu && <p className="hsqt__trang" role="status"><span className="quay" aria-hidden="true" /> Đang đọc danh sách biểu…</p>}

      {bieu && (
        <>
          <div className="tab-dai" role="tablist" aria-label="Các biểu" onKeyDown={phimTab}>
            <span className="tab-dai__nhom">Thẩm định</span>
            {uuTien.map((b) => nutTab(b, true))}
            {khac.length > 0 && <span className="tab-dai__nhom tab-dai__nhom--khac">Biểu khác</span>}
            {khac.map((b) => nutTab(b, false))}
          </div>
          <div id={`bang-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={hienTai?.loai === 'dang_tai'} className="hsqt__noi-dung">
            {bieuChon && <p className="hsqt__tieu-de-bieu">{bieuChon.ma} · {bieuChon.tieuDe}</p>}
            {(!hienTai || hienTai.loai === 'dang_tai') && <p className="hsqt__trang" role="status"><span className="quay" aria-hidden="true" /> Đang đọc biểu {nguon}…</p>}
            {hienTai?.loai === 'loi' && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{hienTai.thongBao}</p>}
            {hienTai?.loai === 'xong' && <BangBieu du={hienTai.du} />}
          </div>
        </>
      )}
    </section>
  );
}

interface SoSanhB1C3Props {
  soSanh: ReturnType<typeof soSanhNguoi> | null;
  /** Chỉ số thẩm định tính từ B1, C3, C1 (rỗng khi chưa đọc đủ). */
  chiSo: ChiSoThamDinh[];
  pp: TongTheoPP | null;
  dangTai: boolean;
}

/** Dải so sánh trên đầu hồ sơ: số người ước tính từ B1 (tổng giờ ÷ 1.904) với tổng "Người cần bố trí" ở C3, trên toàn bộ dòng hai biểu. */
function SoSanhB1C3({ soSanh, chiSo, pp, dangTai }: SoSanhB1C3Props) {
  const [moDoiSoat, setMoDoiSoat] = useState(false);
  if (!soSanh) {
    return <p className="ss ss--cho" role="status">{dangTai ? <><span className="quay" aria-hidden="true" /> Đang đọc B1 và C3 để so sánh số người…</> : 'Chưa so sánh được: không đọc được B1 hoặc C3 của hồ sơ này.'}</p>;
  }
  const { nguoiB1, nguoiC3, chenh, tyLe, muc, gioB1 } = soSanh;
  const lonNhat = Math.max(nguoiB1, nguoiC3, 1e-9);
  const dau = chenh > 0 ? '+' : chenh < 0 ? '−' : '';
  const phanTram = tyLe === null ? null : Math.abs(tyLe - 1) * 100;
  const ketLuan = muc === null ? 'C3 chưa có người cần bố trí' : muc === 'khop' ? `Khớp (lệch ≤ ${NGUONG_LECH_KHOP * 100}%)` : chenh > 0 ? `B1 cao hơn C3 ${dinhDangTong(phanTram ?? 0, 1)}%` : `B1 thấp hơn C3 ${dinhDangTong(phanTram ?? 0, 1)}%`;
  return (
    <div className={`ss${muc === 'khop' ? ' ss--khop' : muc === 'lech' ? ' ss--lech' : ''}`} role="group" aria-label="So sánh số người ước tính B1 với người cần bố trí C3">
      <p className="ss__tieu-de">So sánh B1 ↔ C3</p>
      <dl className="ss__so">
        <div title={`Tổng giờ B1 (cột G) ${dinhDangTong(gioB1)} ÷ ${GIO_MOT_NGUOI_NAM.toLocaleString('vi-VN')}`}>
          <dt>B1 ước tính</dt>
          <dd>{dinhDangTong(nguoiB1)} <small>người</small></dd>
          <span className="ss__thanh" aria-hidden="true"><i className="ss__thanh--b1" style={{ width: `${(nguoiB1 / lonNhat) * 100}%` }} /></span>
        </div>
        <div className={pp ? 'ss__the-bam' : undefined} title={pp ? 'Tổng cột J (Người cần bố trí) của C3. Bấm để đối soát theo PP1/PP2/PP3 và kết hợp' : 'Tổng cột J (Người cần bố trí) của C3'}
          {...(pp ? { role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog' as const, onClick: () => setMoDoiSoat(true), onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMoDoiSoat(true); } } } : {})}>
          <dt>C3 cần bố trí</dt>
          <dd>{dinhDangTong(nguoiC3)} <small>người</small></dd>
          <span className="ss__thanh" aria-hidden="true"><i className="ss__thanh--c3" style={{ width: `${(nguoiC3 / lonNhat) * 100}%` }} /></span>
          {pp && <span className={`ss__ket-luan ss__the-goi-y${coLech(pp.lech) ? ' ss__the-goi-y--lech' : ''}`}>Đối soát PP{coLech(pp.lech) ? ` · lệch ${dauLech(pp.lech)}${dinhDangTong(Math.abs(pp.lech))}` : ' · khớp'} ›</span>}
        </div>
        <div>
          <dt>Chênh lệch (B1 − C3)</dt>
          <dd className="ss__chenh">{dau}{dinhDangTong(Math.abs(chenh))} <small>người{tyLe !== null ? ` · B1/C3 = ${dinhDangTong(tyLe)}` : ''}</small></dd>
          <span className="ss__ket-luan">{ketLuan}</span>
        </div>
      </dl>
      {chiSo.length > 0 && <ChiSo chiSo={chiSo} />}
      {pp && <DoiSoatPP pp={pp} open={moDoiSoat} onClose={() => setMoDoiSoat(false)} />}
    </div>
  );
}

const NHAN_MUC: Record<string, string> = { tot: 'Đạt', chu_y: 'Cần giải trình', xau: 'Trả lại' };

/** Chỉ số thẩm định tính từ B1, C3, C1 (mở/đóng). Chỉ số 1 là cổng thật sự của kết luận; các chỉ số khác chỉ nêu chỗ cần giải trình, không phải lỗi. */
function ChiSo({ chiSo }: { chiSo: ChiSoThamDinh[] }) {
  const [mo, setMo] = useNhoBoolean('vtvl-batch.mo-chi-so', () => false);
  const canGiaiTrinh = chiSo.filter((c) => c.muc === 'chu_y' || c.muc === 'xau').length;
  return (
    <div className={`ss__pp${canGiaiTrinh > 0 ? ' ss__pp--lech' : ''}`}>
      <button type="button" className="ss__pp-dau" aria-expanded={mo} aria-controls="ss-chi-so" onClick={() => setMo((m) => !m)}
        title={mo ? 'Thu gọn chỉ số thẩm định' : 'Mở chỉ số thẩm định'}>
        {mo ? <IcLenTren /> : <IcLenXuong />}
        <span className="ss__pp-nhan">Chỉ số thẩm định</span>
        <span className="ss__pp-tom">
          {chiSo.filter((c) => c.so === 1).map((c) => <span key={c.so} className="ss__pp-tom-lech">VTVL đủ căn cứ <b>{c.giaTri}</b></span>)}
          <span className="ss__pp-tom-lech">{canGiaiTrinh > 0 ? `${canGiaiTrinh} chỉ số cần giải trình` : 'Không có chỉ số ngoài ngưỡng'}</span>
        </span>
      </button>
      {mo && (
        <div id="ss-chi-so" className="ss__pp-noi-dung">
          <div className="ss__pp-bang" tabIndex={0}>
            <table>
              <caption className="ss__pp-nhan">Tính từ B1, C3, C1 của hồ sơ; các chỉ số cần Nguồn 1/4/5 hoặc D2 không tính ở đây</caption>
              <thead><tr><th scope="col">TT</th><th scope="col">Chỉ số</th><th scope="col">Giá trị</th><th scope="col">Ngưỡng</th><th scope="col">Mức</th></tr></thead>
              <tbody>
                {chiSo.map((c) => (
                  <tr key={c.so} className={c.muc === 'chu_y' || c.muc === 'xau' ? 'ss__pp-hang--lech' : undefined}>
                    <td>{c.so}</td>
                    <th scope="row" title={c.chiTiet}>{c.ten}<small className="ss__chi-tiet">{c.chiTiet}</small></th>
                    <td><b>{c.giaTri}</b></td>
                    <td>{c.nguong}</td>
                    <td className="ss__pp-lech">{c.muc ? NHAN_MUC[c.muc] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ss__ghi-chu">Dòng đạt theo kết quả kiểm tra của cổng. Chỉ số 1 là cổng thật sự của kết luận; các chỉ số khác là ngưỡng tham khảo, không phải lỗi.</p>
        </div>
      )}
    </div>
  );
}

const dauLech = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '');
const coLech = (n: number): boolean => Math.abs(n) > NGUONG_LECH_PP;

/** Hộp thoại đối soát: tổng người quy đổi ở C3 theo PP1/PP2/PP3 và tổ hợp so với người cần bố trí, kèm bảng từng VTVL (lọc VTVL lệch). Mở khi bấm ô "C3 cần bố trí". */
function DoiSoatPP({ pp, open, onClose }: { pp: TongTheoPP; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [chiLech, setChiLech] = useState(false);
  const tong = [['PP1', pp.pp1], ['PP2', pp.pp2], ['PP3', pp.pp3]] as const;
  const soLech = pp.theoVtvl.filter((v) => coLech(v.lech)).length;
  const hien = chiLech ? pp.theoVtvl.filter((v) => coLech(v.lech)) : pp.theoVtvl;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="hop-doi-soat" aria-labelledby="doi-soat-tieu-de" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hop-doi-soat__dau">
        <h2 id="doi-soat-tieu-de">Đối soát PP1/PP2/PP3 + kết hợp</h2>
        <button type="button" className="nut nut--bieu-tuong" onClick={onClose} aria-label="Đóng"><IcDong /></button>
      </div>
      <p className={`ss__pp-tom hop-doi-soat__tom${coLech(pp.lech) ? ' ss__pp--lech' : ''}`}>
        <span>Quy đổi <b>{dinhDangTong(pp.quyDoiChon)}</b></span>
        <span>Cần bố trí <b>{dinhDangTong(pp.canBoTri)}</b></span>
        <span className="ss__pp-tom-lech">Lệch <b>{dauLech(pp.lech)}{dinhDangTong(Math.abs(pp.lech))}</b></span>
        <span className="ss__pp-tom-lech">{coLech(pp.lech) ? `${soLech} VTVL lệch` : 'Khớp'}</span>
      </p>
      <div className="hop-doi-soat__than">
      <p className="ss__pp-tong">
        <span className="ss__pp-nhan">Người quy đổi C3</span>
        {tong.map(([ten, v]) => <span key={ten} className="ss__pp-o"><b>{ten}</b> {dinhDangTong(v)}</span>)}
      </p>
      <div className="ss__pp-bang ss__pp-bang--nhom" role="group" aria-label="Đối soát theo phương pháp chọn, gồm cả tổ hợp">
        <table>
          <caption className="ss__pp-nhan">Đối soát theo PP chọn (PP đơn và kết hợp)</caption>
          <thead><tr><th scope="col">PP chọn</th><th scope="col">Số dòng</th><th scope="col">Quy đổi</th><th scope="col">Cần bố trí</th><th scope="col">Lệch</th></tr></thead>
          <tbody>
            {pp.theoPPChon.map((g) => {
              const lech = g.canBoTri - g.quyDoi;
              return (
                <tr key={g.pp} className={coLech(lech) ? 'ss__pp-hang--lech' : undefined}>
                  <th scope="row">{g.pp}{g.pp.includes('+') && <small> (kết hợp)</small>}</th>
                  <td>{g.soDong}</td><td>{dinhDangTong(g.quyDoi)}</td><td>{dinhDangTong(g.canBoTri)}</td>
                  <td className="ss__pp-lech">{coLech(lech) ? `${dauLech(lech)}${dinhDangTong(Math.abs(lech))}` : '0'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><th scope="row">Cộng PP1 + PP2 + PP3 + kết hợp</th><td>{pp.theoPPChon.reduce((t, g) => t + g.soDong, 0)}</td><td>{dinhDangTong(pp.quyDoiChon)}</td><td>{dinhDangTong(pp.canBoTri)}</td><td className="ss__pp-lech">{coLech(pp.lech) ? `${dauLech(pp.lech)}${dinhDangTong(Math.abs(pp.lech))}` : '0'}</td></tr>
          </tfoot>
        </table>
      </div>
      {pp.theoVtvl.length > 0 && (
        <details className="ss__pp-chi-tiet" open>
          <summary>Từng VTVL ({pp.theoVtvl.length}{soLech > 0 ? `, ${soLech} lệch` : ''})</summary>
          {soLech > 0 && (
            <label className="ss__pp-loc"><input type="checkbox" checked={chiLech} onChange={(e) => setChiLech(e.target.checked)} /> Chỉ hiện VTVL lệch ({soLech})</label>
          )}
          <div className="ss__pp-bang" tabIndex={0}>
            <table>
              <thead><tr><th scope="col">Mã VTVL</th><th scope="col">PP1</th><th scope="col">PP2</th><th scope="col">PP3</th><th scope="col">PP chọn</th><th scope="col">Quy đổi theo PP chọn</th><th scope="col">Cần bố trí</th><th scope="col">Lệch</th></tr></thead>
              <tbody>
                {hien.map((v) => (
                  <tr key={v.ma} className={coLech(v.lech) ? 'ss__pp-hang--lech' : undefined}>
                    <th scope="row">{v.ma}</th>
                    <td>{dinhDangTong(v.pp1)}</td><td>{dinhDangTong(v.pp2)}</td><td>{dinhDangTong(v.pp3)}</td>
                    <td>{v.chon || '—'}</td><td>{dinhDangTong(v.quyDoiChon)}</td><td>{dinhDangTong(v.canBoTri)}</td>
                    <td className="ss__pp-lech">{coLech(v.lech) ? `${dauLech(v.lech)}${dinhDangTong(Math.abs(v.lech))}` : '0'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Tổng</th><td>{dinhDangTong(pp.pp1)}</td><td>{dinhDangTong(pp.pp2)}</td><td>{dinhDangTong(pp.pp3)}</td><td></td><td>{dinhDangTong(pp.quyDoiChon)}</td><td>{dinhDangTong(pp.canBoTri)}</td><td className="ss__pp-lech">{coLech(pp.lech) ? `${dauLech(pp.lech)}${dinhDangTong(Math.abs(pp.lech))}` : '0'}</td></tr></tfoot>
            </table>
          </div>
        </details>
      )}
      </div>
    </dialog>
  );
}
