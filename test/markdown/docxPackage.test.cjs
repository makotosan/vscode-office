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
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const SVG = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
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
examples['table and multiple SVG and PNG'] = examples['thead and tbody'] + examples['SVG image'].repeat(2) + examples['PNG image']
for (const [name, html] of Object.entries(examples)) test(`real generator: ${name}`, async () => {
    const generated = Buffer.from(await (await htmlToDocx(html, '', {}, '')).arrayBuffer())
    const normalized = await normalizeDocxPackage(generated)
    const fixtureDir = process.env.DOCX_FIXTURE_DIR || path.resolve(__dirname, '../output/docx')
    fs.mkdirSync(fixtureDir, {recursive: true})
    fs.writeFileSync(path.join(fixtureDir, name.replaceAll(' ', '-') + '.docx'), normalized)
    const z = await JSZip.loadAsync(normalized)
    const doc = parse(await z.file('word/document.xml').async('string'))
    const body = nodes(doc, 'body')[0]
    const rels = parse(await z.file('word/_rels/document.xml.rels').async('string'))
    const targets = new Map(Array.from(rels.getElementsByTagNameNS(REL, 'Relationship')).map(e => [e.getAttribute('Id'), e.getAttribute('Target')]))
    for (const blip of Array.from(doc.getElementsByTagNameNS(A, 'blip'))) {
        const vectors = Array.from(blip.getElementsByTagNameNS(SVG, 'svgBlip'))
        if (vectors.length) {
            assert.equal(vectors.length, 1)
            assert.equal(blip.hasAttributeNS(R, 'embed'), false)
            assert.match(targets.get(vectors[0].getAttributeNS(R, 'embed')), /\.svg(?:\+xml)?$/)
            assert.equal(vectors[0].parentNode.getAttribute('uri'), '{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
        } else {
            assert.doesNotMatch(targets.get(blip.getAttributeNS(R, 'embed')), /\.svg(?:\+xml)?$/)
        }
    }
    if (html.includes('image/svg+xml')) assert.ok(doc.getElementsByTagNameNS(SVG, 'svgBlip').length)
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

test('SVG drawing normalization preserves vectors, raster images and package contents on a second pass', async () => {
    const raw = Buffer.from(await (await htmlToDocx(examples['table and multiple SVG and PNG'], '', {}, '')).arrayBuffer())
    const before = await JSZip.loadAsync(raw)
    const once = await JSZip.loadAsync(await normalizeDocxPackage(raw))
    const twice = await JSZip.loadAsync(await normalizeDocxPackage(await once.generateAsync({type: 'nodebuffer'})))
    assert.deepEqual(Object.keys(once.files).sort(), Object.keys(before.files).sort())
    for (const [name, entry] of Object.entries(once.files)) {
        if (entry.dir) continue
        assert.deepEqual(await entry.async('nodebuffer'), await twice.file(name).async('nodebuffer'), name)
        if (name.startsWith('word/media/')) assert.deepEqual(await entry.async('nodebuffer'), await before.file(name).async('nodebuffer'), name)
    }
    const doc = parse(await once.file('word/document.xml').async('string'))
    assert.equal(doc.getElementsByTagNameNS(SVG, 'svgBlip').length, 2)
    assert.equal(Array.from(doc.getElementsByTagNameNS(A, 'blip')).filter(e => e.hasAttributeNS(R, 'embed')).length, 1)
})

test('normalizes embedded SVG in headers using that part\'s relationships and leaves linked SVG unchanged', async () => {
    const z = await JSZip.loadAsync(await fixture())
    z.file('word/header1.xml', `<w:hdr xmlns:w="${W}" xmlns:a="${A}" xmlns:r="${R}"><w:p><a:blip r:embed="image"/><a:blip r:link="external"/></w:p></w:hdr>`)
    z.file('word/_rels/header1.xml.rels', `<Relationships xmlns="${REL}"><Relationship Id="image" Type="${R}/image" Target="media/test.svg+xml"/><Relationship Id="external" Type="${R}/image" Target="file:///tmp/test.svg" TargetMode="External"/></Relationships>`)
    const out = await JSZip.loadAsync(await normalizeDocxPackage(await z.generateAsync({type: 'nodebuffer'})))
    const doc = parse(await out.file('word/header1.xml').async('string'))
    assert.equal(doc.getElementsByTagNameNS(SVG, 'svgBlip')[0].getAttributeNS(R, 'embed'), 'image')
    assert.equal(doc.getElementsByTagNameNS(A, 'blip')[1].getAttributeNS(R, 'link'), 'external')
})

test('preserves an existing raster fallback with its SVG extension', async () => {
    const z = await JSZip.loadAsync(Buffer.from(await (await htmlToDocx(examples['PNG image'], '', {}, '')).arrayBuffer()))
    const doc = parse(await z.file('word/document.xml').async('string'))
    const blip = doc.getElementsByTagNameNS(A, 'blip')[0]
    const rasterId = blip.getAttributeNS(R, 'embed')
    const list = doc.createElementNS(A, 'a:extLst')
    const ext = doc.createElementNS(A, 'a:ext')
    ext.setAttribute('uri', '{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
    const vector = doc.createElementNS(SVG, 'asvg:svgBlip')
    vector.setAttributeNS(R, 'r:embed', 'vector')
    ext.appendChild(vector); list.appendChild(ext); blip.appendChild(list)
    const { XMLSerializer } = require('@xmldom/xmldom')
    z.file('word/document.xml', new XMLSerializer().serializeToString(doc))
    const rels = parse(await z.file('word/_rels/document.xml.rels').async('string'))
    const rel = rels.createElementNS(REL, 'Relationship')
    rel.setAttribute('Id', 'vector'); rel.setAttribute('Type', R + '/image'); rel.setAttribute('Target', 'media/vector.svg')
    rels.documentElement.appendChild(rel)
    z.file('word/_rels/document.xml.rels', new XMLSerializer().serializeToString(rels))
    z.file('word/media/vector.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')
    const out = await JSZip.loadAsync(await normalizeDocxPackage(await z.generateAsync({type:'nodebuffer'})))
    const result = parse(await out.file('word/document.xml').async('string'))
    assert.equal(result.getElementsByTagNameNS(A, 'blip')[0].getAttributeNS(R, 'embed'), rasterId)
    assert.equal(result.getElementsByTagNameNS(SVG, 'svgBlip')[0].getAttributeNS(R, 'embed'), 'vector')
})

test('refuses conflicting SVG extension rather than discarding a different image reference', async () => {
    const z = await JSZip.loadAsync(Buffer.from(await (await htmlToDocx(examples['SVG image'], '', {}, '')).arrayBuffer()))
    const doc = parse(await z.file('word/document.xml').async('string'))
    const blip = doc.getElementsByTagNameNS(A, 'blip')[0]
    const list = doc.createElementNS(A, 'a:extLst')
    const ext = doc.createElementNS(A, 'a:ext')
    ext.setAttribute('uri', '{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
    const vector = doc.createElementNS(SVG, 'asvg:svgBlip')
    vector.setAttributeNS(R, 'r:embed', 'different')
    ext.appendChild(vector); list.appendChild(ext); blip.appendChild(list)
    z.file('word/document.xml', new (require('@xmldom/xmldom').XMLSerializer)().serializeToString(doc))
    await assert.rejects(normalizeDocxPackage(await z.generateAsync({type: 'nodebuffer'})), /conflicting SVG drawing/)
})

test('diagnostic matrix isolates drawing changes and keeps the source unchanged', async () => {
    const { execFileSync } = require('node:child_process')
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-matrix-'))
    try {
        const raw = Buffer.from(await (await htmlToDocx(examples['table and multiple SVG and PNG'], '', {}, '')).arrayBuffer())
        const input = path.join(temp, 'source.docx')
        const output = path.join(temp, 'cases')
        fs.writeFileSync(input, raw)
        const script = path.resolve(__dirname, 'makeMacSaveCases.cjs')
        execFileSync(process.execPath, [script, input, output])
        assert.deepEqual(fs.readFileSync(input), raw)
        assert.deepEqual(fs.readFileSync(path.join(output, 'A-original.docx')), raw)
        const docs = {}
        for (const name of ['B-issue7-baseline', 'C-svg-only', 'D-combined', 'E-without-svg']) {
            const z = await JSZip.loadAsync(fs.readFileSync(path.join(output, name + '.docx')))
            docs[name] = parse(await z.file('word/document.xml').async('string'))
        }
        assert.equal(docs['B-issue7-baseline'].getElementsByTagNameNS(SVG, 'svgBlip').length, 0)
        assert.equal(docs['C-svg-only'].getElementsByTagNameNS(SVG, 'svgBlip').length, 2)
        assert.equal(docs['D-combined'].getElementsByTagNameNS(SVG, 'svgBlip').length, 2)
        assert.equal(docs['E-without-svg'].getElementsByTagNameNS(A, 'blip').length, 1)
        const original = parse(await (await JSZip.loadAsync(raw)).file('word/document.xml').async('string'))
        assert.deepEqual(names(nodes(docs['C-svg-only'], 'tbl')[0]), names(nodes(original, 'tbl')[0]))
        assert.equal(nodes(docs['B-issue7-baseline'], 'tblGrid').length, 1)
        assert.throws(() => execFileSync(process.execPath, [script, input, output], {stdio:'pipe'}))
        assert.deepEqual(fs.readFileSync(input), raw)
    } finally { fs.rmSync(temp, {recursive: true, force: true}) }
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
