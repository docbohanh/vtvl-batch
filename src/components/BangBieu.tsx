import { memo, useDeferredValue, useMemo, useState } from 'react';
import { hienGiaTri, locDong, mauO } from '../quanTri';
import type { DuLieuBieuQt } from '../types';
import { IcCanhBao, IcTim } from './Icons';

const BUOC_HIEN = 200;

export interface BangBieuProps {
  du: DuLieuBieuQt;
}

/** Bảng dữ liệu một biểu để thẩm định: cột theo khung biểu, ô tính tự động tô nền nhạt, dòng cổng báo lỗi/cảnh báo nổi bật và hiện nội dung lỗi ngay dưới dòng. */
export const BangBieu = memo(function BangBieu({ du }: BangBieuProps) {
  const [tim, setTim] = useState('');
  const [chiLoi, setChiLoi] = useState(false);
  const [soHien, setSoHien] = useState(BUOC_HIEN);
  const timTre = useDeferredValue(tim);
  const dong = useMemo(() => locDong(du.dong, timTre, chiLoi), [du.dong, timTre, chiLoi]);
  const soDongCoVanDe = useMemo(() => du.dong.filter((d) => d.loi.length > 0 || d.trangThai !== 'OK').length, [du.dong]);
  const cot = du.bieu.cot;

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
      </div>

      {du.biCat && <p className="thong-bao thong-bao--loi" role="status"><IcCanhBao />Biểu có {du.tong} dòng, chỉ tải {du.dong.length} dòng đầu.</p>}

      {du.tong === 0 ? (
        <p className="bb__rong">Biểu chưa có dòng nào.</p>
      ) : dong.length === 0 ? (
        <p className="bb__rong">Không có dòng nào khớp bộ lọc.</p>
      ) : (
        <div className="bb__cuon" tabIndex={0} role="region" aria-label={`Dữ liệu biểu ${du.bieu.ma}`}>
          <table className="bb__bang">
            <thead>
              <tr>
                <th scope="col" className="bb__stt">#</th>
                {cot.map((c) => (
                  <th key={c.chu} scope="col" className={c.loai === 'INPUT' ? '' : 'bb__tu-dong'} title={`${c.chu} · ${c.loai === 'INPUT' ? 'cột nhập' : 'cột tự động'}`}>
                    <span className="bb__chu">{c.chu}</span>{c.tieuDe}
                  </th>
                ))}
              </tr>
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
        </div>
      )}

      {dong.length > soHien && (
        <div className="bb__them">
          <span className="bb__phu">Đang hiện {soHien}/{dong.length} dòng</span>
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
