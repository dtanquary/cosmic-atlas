// Regenerates the JavaScript-format fixtures from the web source. Run: node native/Tests/Fixtures/generate.mjs
// The Swift link codec must match these byte for byte; never hand-edit the JSON.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {encodeView} from '../../../src/view-link.ts';

const dir = fileURLToPath(new URL('.', import.meta.url));
// Deterministic pseudo-random doubles across the magnitudes links carry (|v| < 1e6), plus edge cases.
let seed = 0x9e3779b9;
const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const values = [0, -0, 1, -1, 0.5, 0.1, 1e-7, 2e-7, 1e-6, 0.000001, 0.0000015, 9.999999999995e-7, 123456.789012345, 999999.5, -999999, 4800 + 1.2345678901e-5, 1.2345678901e-5, 12345678901.5, 0.1 + 0.2, 1 / 3, 2 / 3, 1e-12, 5e-324, 1234567890.125, 0.000123456789012345, 100000, 1e5, 123456789012, 0.30000000000000004];
for (let i = 0; i < 400; i++) {
  const magnitude = Math.pow(10, Math.floor(rand() * 15) - 9);
  const v = (rand() - 0.5) * 2 * magnitude * (1 + rand());
  values.push(v);
}
const format = values.map(v => [v, `${+v.toPrecision(12)}`]);
const views = [
  {target: [0, 0, 0], camera: [0, 0, .06], identity: 'sun'},
  {target: [-8.2e-3, 0, 0], camera: [-8.2e-3, .04, .03], identity: 'core'},
  {target: [.785, 0, .1], camera: [.8, -.2, .3], identity: 'nearby:m31'},
  {target: [4800, -1200, 300], camera: [4800 + 1.2345678901e-5, -1200 - 2.3456789012e-5, 300 + 3.4567890123e-5], identity: {node: '42', row: 815, targetId: '39627670392150409'}},
  {target: [1, 2, 3], camera: [100, 200, 300], identity: null},
  {target: [999999, 0, 0], camera: [999999.5, 0, 0], identity: null},
  {target: [-999999, 2e-7, 3], camera: [0, 2e-7, 3], identity: 'nearby:lmc'},
];
for (let i = 0; i < 60; i++) {
  const t = [0, 0, 0].map(() => (rand() - 0.5) * 2 * Math.pow(10, Math.floor(rand() * 7) - 3));
  const o = [0, 0, 0].map(() => (rand() - 0.5) * 2 * Math.pow(10, Math.floor(rand() * 9) - 6));
  views.push({target: t, camera: t.map((v, i) => v + o[i]), identity: null});
}
writeFileSync(dir + 'js-number-format.json', JSON.stringify({format, views: views.map(v => [v, encodeView(v)])}, null, 1) + '\n');
console.log('wrote', format.length, 'numbers and', views.length, 'views');
