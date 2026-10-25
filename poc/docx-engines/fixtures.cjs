const fs = require('node:fs');
const path = require('node:path');
const data = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const pixels = path.resolve(__dirname, '../../test/fixtures/docx');
const png = data('image/png', fs.readFileSync(path.join(pixels, 'pixel.png')));
const jpeg = data('image/jpeg', fs.readFileSync(path.join(pixels, 'pixel.jpg')));
const svg = data('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"><rect width="48" height="24" fill="#2463eb"/></svg>');
const img = (src, label) => `<img src="${src}" width="48" height="24" alt="${label}">`;
const table = '<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody>' +
  Array.from({length: 4}, (_, r) => `<tr><td>${r}</td><td>日本語</td><td></td></tr>`).join('') + '</tbody></table>';
const fixtures = {
  'no-table': '<h1>見出し</h1><p>日本語 <strong>bold</strong> <em>italic</em></p><ul><li>one</li><li>two</li></ul><div class="page-break"></div><h2>次ページ</h2>',
  'table-five-rows': table,
  'multiple-tables': table + '<p>between</p>' + table,
  'table-style': '<table style="width:480px;border:1px solid #222"><tr><td style="width:160px;background-color:#eeeeee;border:1px solid #222">A</td><td style="width:320px;border:1px solid #222">B</td></tr></table>',
  'merged-cells': '<table><tr><td colspan="2" rowspan="2">wide tall</td><td>A</td></tr><tr><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr></table>',
  'png-jpeg': `<p>${img(png, 'png')}${img(jpeg, 'jpeg')}</p>`,
  'svg': `<p>${img(svg, 'svg')}</p>`,
  'duplicate-images': `<p>${img(png, 'first')}${img(png, 'second')}${img(svg, 'third')}</p>`,
  'mermaid': '<div class="mermaid">graph LR; A[Input] --&gt; B[Output]</div>',
  'katex': require('katex').renderToString('x^2 + y^2 = z^2', {throwOnError:true}),
  'broken-image': '<p><img src="./not-found.png" width="48" height="24"></p>',
};
module.exports = { fixtures, png, jpeg, svg };
