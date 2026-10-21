const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const JSZip = require('jszip')
const { DOMParser } = require('@xmldom/xmldom')
const { normalizeDocxPackage } = require('../../src/service/markdown/docx-package')
const htmlToDocx = require('vscode-html-to-docx')
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const parse = xml => new DOMParser().parseFromString(xml, 'application/xml')
const nodes = (doc, name) => Array.from(doc.getElementsByTagNameNS(W, name))
const elements = node => Array.from(node.childNodes).filter(n => n.nodeType === 1)
const names = node => elements(node).map(n => n.localName)
const borders = '<w:top w:val="single" w:sz="2"/><w:bottom w:val="single" w:sz="2"/><w:left w:val="single" w:sz="2"/><w:right w:val="single" w:sz="2"/>'
const grid = '<w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/></w:tblGrid>'
const row = `<w:tr>${Array.from({length: 3}, (_, c) => `<w:tc><w:tcPr><w:tcBorders>${borders}</w:tcBorders></w:tcPr><w:p><w:r><w:t>日本語 &amp; cell ${c}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`

async function fixture({ conflict = false, linked = false } = {}) {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', `<Types xmlns="${CT}"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`)
    zip.file('_rels/.rels', `<Relationships xmlns="${REL}"><Relationship Id="doc" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`)
    zip.file('word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:tbl><w:tblPr><w:tblBorders>${borders}</w:tblBorders><w:tblCellSpacing w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar><w:jc w:val="center"/></w:tblPr>${grid}${row}${conflict ? grid.replaceAll('2880', '1440') : grid}${row.repeat(4)}</w:tbl><w:p><w:hyperlink r:id="image"/></w:p></w:body></w:document>`)
    zip.file('word/settings.xml', `<w:settings xmlns:w="${W}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=","/></w:settings>`)
    zip.file('word/_rels/document.xml.rels', `<Relationships xmlns="${REL}"><Relationship Id="image" Type="${R}/image" Target="${linked ? 'file:///C:/画像/test.svg' : 'media/test.svg+xml'}"${linked ? ' TargetMode="External"' : ''}/></Relationships>`)
    if (!linked) zip.file('word/media/test.svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>')
    return zip.generateAsync({type: 'nodebuffer'})
}

test('normalizes the reported 5-row table without changing text, widths, border values or image bytes', async () => {
    const input = await fixture()
    const original = Buffer.from(input)
    const before = await JSZip.loadAsync(input)
    const after = await JSZip.loadAsync(await normalizeDocxPackage(input))
    assert.deepEqual(input, original)
    const a = parse(await after.file('word/document.xml').async('string'))
    const b = parse(await before.file('word/document.xml').async('string'))
    assert.equal(nodes(a, 'tr').length, 5)
    assert.equal(nodes(a, 'tc').length, 15)
    assert.deepEqual(nodes(a, 't').map(n => n.textContent), nodes(b, 't').map(n => n.textContent))
    assert.deepEqual(nodes(a, 'gridCol').map(n => n.getAttributeNS(W, 'w')), ['2880', '2880', '2880'])
    assert.deepEqual(names(nodes(a, 'tbl')[0]), ['tblPr', 'tblGrid', 'tr', 'tr', 'tr', 'tr', 'tr'])
    assert.deepEqual(names(nodes(a, 'tblPr')[0]), ['jc', 'tblCellSpacing', 'tblBorders', 'tblCellMar'])
    for (const n of [...nodes(a, 'tblBorders'), ...nodes(a, 'tcBorders')]) {
        assert.deepEqual(names(n), ['top', 'left', 'bottom', 'right'])
        assert.ok(elements(n).every(e => e.getAttributeNS(W, 'sz') === '2'))
    }
    assert.deepEqual(names(nodes(a, 'tblCellMar')[0]), ['top', 'left', 'bottom', 'right'])
    assert.deepEqual(await after.file('word/media/test.svg+xml').async('nodebuffer'), await before.file('word/media/test.svg+xml').async('nodebuffer'))
    const types = parse(await after.file('[Content_Types].xml').async('string'))
    const override = Array.from(types.getElementsByTagNameNS(CT, 'Override')).find(n => n.getAttribute('PartName') === '/word/media/test.svg+xml')
    assert.equal(override.getAttribute('ContentType'), 'image/svg+xml')
    const settings = parse(await after.file('word/settings.xml').async('string'))
    assert.deepEqual(names(settings.documentElement), ['zoom', 'defaultTabStop', 'compat', 'decimalSymbol', 'listSeparator'])
    assert.equal(nodes(settings, 'compatSetting')[0].getAttributeNS(W, 'val'), '15')
})

test('is idempotent for package contents and preserves external links', async () => {
    const once = await normalizeDocxPackage(await fixture({linked: true}))
    const twice = await normalizeDocxPackage(once)
    const a = await JSZip.loadAsync(once)
    const b = await JSZip.loadAsync(twice)
    for (const [name, entry] of Object.entries(a.files)) {
        if (!entry.dir) assert.equal(await entry.async('string'), await b.file(name).async('string'), name)
    }
    assert.match(await b.file('word/_rels/document.xml.rels').async('string'), /TargetMode="External"/)
})

test('refuses to discard conflicting grids', async () => {
    await assert.rejects(normalizeDocxPackage(await fixture({conflict: true})), /conflicting table grids/)
})

for (const [label, mutate, error] of [
    ['malformed XML', z => z.file('word/settings.xml', '<bad>'), /invalid XML/],
    ['missing internal target', z => z.remove('word/media/test.svg+xml'), /missing Relationship target/],
    ['unknown untyped part', z => z.file('word/media/test.unknown', 'x'), /missing Content Type/],
    ['unresolved r:id', async z => z.file('word/document.xml', (await z.file('word/document.xml').async('string')).replace('r:id="image"', 'r:id="absent"')), /unresolved Relationship/],
    ['invalid SVG', z => z.file('word/media/test.svg+xml', '<html/>'), /invalid SVG/],
    ['DTD', z => z.file('word/settings.xml', '<!DOCTYPE x><x/>'), /DTD is not supported/],
    ['duplicate Relationship Id', async z => z.file('word/_rels/document.xml.rels', (await z.file('word/_rels/document.xml.rels').async('string')).replace('</Relationships>', `<Relationship Id="image" Type="${R}/image" Target="other"/></Relationships>`)), /duplicate or missing Relationship/],
]) test(`rejects ${label} before saving`, async () => {
    const z = await JSZip.loadAsync(await fixture())
    await mutate(z)
    await assert.rejects(normalizeDocxPackage(await z.generateAsync({type:'nodebuffer'})), error)
})

test('updates compatibilityMode while preserving other compatibility settings', async () => {
    const z = await JSZip.loadAsync(await fixture())
    z.file('word/settings.xml', `<w:settings xmlns:w="${W}"><w:compat><w:doNotUseHTMLParagraphAutoSpacing/><w:compatSetting w:name="other" w:uri="custom" w:val="7"/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="12"/></w:compat></w:settings>`)
    const output = await JSZip.loadAsync(await normalizeDocxPackage(await z.generateAsync({type:'nodebuffer'})))
    const doc = parse(await output.file('word/settings.xml').async('string'))
    assert.equal(nodes(doc, 'compat').length, 1)
    assert.equal(nodes(doc, 'doNotUseHTMLParagraphAutoSpacing').length, 1)
    assert.deepEqual(nodes(doc, 'compatSetting').map(n => n.getAttributeNS(W, 'val')), ['7', '15'])
})

const examples = {
    'no table': '<p>日本語 &amp; text</p>',
    'thead and tbody': '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr><td></td><td>日本語</td></tr></tbody></table>',
    'multiple tables': '<table><tr><td>A</td></tr></table><p>between</p><table><tr><td>B</td></tr></table>',
    'colspan and rowspan': '<table><tr><td colspan="2">wide</td></tr><tr><td rowspan="2">tall</td><td>B</td></tr><tr><td>C</td></tr></table>',
    'combined colspan rowspan': '<table><tr><td colspan="2" rowspan="2">wide and tall</td><td>A</td></tr><tr><td>B</td></tr></table>',
    'aligned paragraphs': '<p style="text-align:justify;margin-left:20px">日本語 text</p>',
    'SVG image': '<p><img src="data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>').toString('base64') + '"/></p>',
}
for (const [label, ext, mime] of [['PNG', 'png', 'image/png'], ['JPEG', 'jpg', 'image/jpeg']]) {
    const bytes = fs.readFileSync(path.resolve(__dirname, `../fixtures/docx/pixel.${ext}`))
    examples[label + ' image'] = `<p><img src="data:${mime};base64,${bytes.toString('base64')}"/></p>`
}
for (const [name, html] of Object.entries(examples)) test(`real generator: ${name}`, async () => {
    const generated = Buffer.from(await (await htmlToDocx(html, '', {}, '')).arrayBuffer())
    const normalized = await normalizeDocxPackage(generated)
    const fixtureDir = process.env.DOCX_FIXTURE_DIR || path.resolve(__dirname, '../output/docx')
    fs.mkdirSync(fixtureDir, {recursive: true})
    fs.writeFileSync(path.join(fixtureDir, name.replaceAll(' ', '-') + '.docx'), normalized)
    const z = await JSZip.loadAsync(normalized)
    const doc = parse(await z.file('word/document.xml').async('string'))
    const body = nodes(doc, 'body')[0]
    assert.equal(names(body).at(-1), 'sectPr')
    for (const t of nodes(doc, 'tbl')) {
        assert.equal(elements(t).filter(n => n.localName === 'tblGrid').length, 1)
        assert.ok(names(t).indexOf('tblGrid') < names(t).indexOf('tr'))
    }
    for (const props of nodes(doc, 'tcPr')) {
        const span = nodes(props, 'gridSpan')[0]
        if (span) assert.ok(Number(span.getAttributeNS(W, 'val')) >= 1)
        if (nodes(props, 'vMerge').length) {
            assert.ok(names(props).indexOf('vMerge') < names(props).indexOf('tcBorders'))
        }
    }
    assert.equal(nodes(parse(await z.file('word/settings.xml').async('string')), 'compatSetting')[0].getAttributeNS(W, 'val'), '15')
})

test('exportDocx writes a normalized package through the existing command path', async () => {
    const entry = path.resolve(__dirname, '../../src/service/markdown/html-export.js')
    const { transformSync } = require('esbuild')
    const { code } = transformSync(fs.readFileSync(entry, 'utf8'), {format: 'cjs'})
    const localRequire = createRequire(entry)
    const module = {exports: {}}
    vm.runInNewContext(code, {module, exports: module.exports, Buffer, process, console,
        require: name => name === './outline' ? {} : localRequire(name)})
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-export-'))
    try {
        const output = path.join(temp, '日本語 table.docx')
        await module.exports.exportDocx(output, examples['thead and tbody'], {})
        const z = await JSZip.loadAsync(fs.readFileSync(output))
        assert.equal(nodes(parse(await z.file('word/document.xml').async('string')), 'tblGrid').length, 1)
        assert.equal(nodes(parse(await z.file('word/settings.xml').async('string')), 'compatSetting')[0].getAttributeNS(W, 'val'), '15')
    } finally { fs.rmSync(temp, {recursive: true, force: true}) }
})

test('exportDocx preserves an existing file if package validation fails', async () => {
    const entry = path.resolve(__dirname, '../../src/service/markdown/html-export.js')
    const { transformSync } = require('esbuild')
    const { code } = transformSync(fs.readFileSync(entry, 'utf8'), {format: 'cjs'})
    const localRequire = createRequire(entry)
    const module = {exports: {}}
    const invalid = await fixture({conflict: true})
    const logs = []
    vm.runInNewContext(code, {module, exports: module.exports, Buffer, process, console: {log: m => logs.push(m)},
        require: name => name === './outline' ? {} : name === 'vscode-html-to-docx' ?
            async () => ({ arrayBuffer: async () => invalid }) : localRequire(name)})
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-export-failure-'))
    try {
        const output = path.join(temp, 'existing.docx')
        fs.writeFileSync(output, 'existing content')
        await assert.rejects(module.exports.exportDocx(output, '<p>text</p>', {}), /conflicting table grids/)
        assert.equal(fs.readFileSync(output, 'utf8'), 'existing content')
        assert.deepEqual(logs, [])
    } finally { fs.rmSync(temp, {recursive: true, force: true}) }
})
