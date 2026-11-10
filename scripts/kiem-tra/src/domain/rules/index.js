import { freeze, QUY_GIO_PP2, PP_HOP_LE_19_10 } from './common.js';
import { computeB1 } from './b1.js';
import { evaluateB2, aggregateB2 } from './b2.js';
import { c1QuyGio, c1KiemTra } from './c1.js';
import { evaluateC3 } from './c3.js';
import { evaluateD1 } from './d1.js';
import { evaluateForecast } from './forecast.js';
import { evaluateD2 } from './d2.js';
import { b1Row, b2Row, c1Row, c3Row, d1Row, forecastRow, d2Row } from '../rows.js';

export * from './common.js';
export { computeB1, evaluateB2, aggregateB2, c1QuyGio, c1KiemTra, evaluateC3, evaluateD1, evaluateForecast, evaluateD2 };
export { gioGiamTrucTiep } from './b2.js';
export { namHopLe } from './forecast.js';
export { b1Row, b2Row, c1Row, c3Row, d1Row, forecastRow, d2Row };

/**
 * Chạy cả chuỗi B1 → B2 → C3 → D1 → dự báo → D2 trên một bộ dữ liệu (các dòng là đối tượng thường, tên trường theo cột nghiệp vụ).
 * @param {{b1?: object[], b2?: object[], c1?: object[], c3?: object[], d1?: object[], forecast?: object[], d2?: object[]}} data
 * @param {{quyGio?: number|null, ppHopLe?: readonly string[]}} [options]
 */
export function evaluateAll(data, { quyGio = QUY_GIO_PP2, ppHopLe = PP_HOP_LE_19_10 } = {}) {
  const b1 = (data.b1 ?? []).map(b1Row);
  const b2 = (data.b2 ?? []).map(b2Row);
  const c1 = (data.c1 ?? []).map(c1Row);
  const c3 = (data.c3 ?? []).map(c3Row);
  const d1 = (data.d1 ?? []).map(d1Row);
  const fc = (data.forecast ?? []).map(forecastRow);
  const d2 = (data.d2 ?? []).map(d2Row);
  const b1Results = b1.map(computeB1);
  const b2Results = evaluateB2(b2, b1, b1Results);
  const b2Agg = aggregateB2(b2, b2Results);
  const c3Results = evaluateC3(c3, b1, b1Results, b2, b2Results, b2Agg, c1, { quyGio, ppHopLe });
  const forecastResults = evaluateForecast(fc, c3, c3Results);
  return freeze({
    b1: freeze(b1Results), b2: b2Results, b2_agg: b2Agg,
    c1: freeze(c1.map((c) => freeze({ quy_gio: c1QuyGio(c, quyGio), kiem_tra: c1KiemTra(c, quyGio) }))),
    c3: c3Results, d1: evaluateD1(d1, c1, quyGio), forecast: forecastResults,
    d2: evaluateD2(d2, fc, forecastResults, c3, c3Results),
  });
}
