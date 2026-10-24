// Minimal vector-preserving diagnostic: compare only the SVG image part suffix.
const fs = require('node:fs')
const path = require('node:path')
const JSZip = require('jszip')
const {DOMParser, XMLSerializer} = require('@xmldom/xmldom')
const htmlToDocx = require('vscode-html-to-docx')
const {normalizeDocxPackage} = require('../../src/service/markdown/docx-package')
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const S = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const parse = text => new DOMParser().parseFromString(text, 'application/xml')
const serialize = doc => new XMLSerializer().serializeToString(doc)

async function makeSvgNameCases(svg, png) {
    const image = parse(svg.toString('utf8')).documentElement
    if (image.namespaceURI !== 'http://www.w3.org/2000/svg' || image.localName !== 'svg') throw new Error('Expected SVG')
    if (png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Expected PNG preview')
    const html = '<p>SVG display and save test</p><p><img src="data:image/png;base64,' + png.toString('base64') + '"/></p><p>Add test text here. Save, edit again, save again, close and reopen.</p>'
    const raw = Buffer.from(await (await htmlToDocx(html, '', {}, '')).arrayBuffer())
    const base = await normalizeDocxPackage(raw)
    const result = new Map()
    for (const [name, suffix] of [['01-original-suffix.docx', 'svg+xml'], ['02-standard-suffix.docx', 'svg']]) {
        const zip = await JSZip.loadAsync(base)
        const doc = parse(await zip.file('word/document.xml').async('string'))
        const rels = parse(await zip.file('word/_rels/document.xml.rels').async('string'))
        const types = parse(await zip.file('[Content_Types].xml').async('string'))
        const ids = new Set(Array.from(rels.getElementsByTagNameNS(REL, 'Relationship')).map(e => e.getAttribute('Id')))
        let id = 'rIdSvgTest'
        while (ids.has(id)) id += 'X'
        const part = 'word/media/vector.' + suffix
        zip.file(part, svg)
        const rel = rels.createElementNS(REL, 'Relationship')
        rel.setAttribute('Id', id); rel.setAttribute('Type', R + '/image'); rel.setAttribute('Target', 'media/vector.' + suffix)
        rels.documentElement.appendChild(rel)
        const override = types.createElementNS(CT, 'Override')
        override.setAttribute('PartName', '/' + part); override.setAttribute('ContentType', 'image/svg+xml')
        types.documentElement.appendChild(override)
        const blips = doc.getElementsByTagNameNS(A, 'blip')
        if (blips.length !== 1) throw new Error('Expected one preview drawing')
        const list = doc.createElementNS(A, 'a:extLst')
        const ext = doc.createElementNS(A, 'a:ext')
        ext.setAttribute('uri', '{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
        const vector = doc.createElementNS(S, 'asvg:svgBlip'); vector.setAttributeNS(R, 'r:embed', id)
        ext.appendChild(vector); list.appendChild(ext); blips[0].appendChild(list)
        zip.file('word/document.xml', serialize(doc))
        zip.file('word/_rels/document.xml.rels', serialize(rels))
        zip.file('[Content_Types].xml', serialize(types))
        result.set(name, await normalizeDocxPackage(await zip.generateAsync({type:'nodebuffer'})))
    }
    return result
}

async function main() {
    const [svgPath, pngPath, outputDir] = process.argv.slice(2)
    if (!svgPath || !pngPath || !outputDir) throw new Error('Usage: node makeSvgNameCases.cjs SOURCE.svg PREVIEW.png NEW_OUTPUT_DIR')
    if (fs.existsSync(outputDir)) throw new Error('Output directory must be new')
    const cases = await makeSvgNameCases(fs.readFileSync(svgPath), fs.readFileSync(pngPath))
    fs.mkdirSync(outputDir, {recursive:true})
    for (const [name, bytes] of cases) fs.writeFileSync(path.join(outputDir,name), bytes, {flag:'wx'})
    console.log('Created two vector-preserving, single-image cases in ' + path.resolve(outputDir))
}
module.exports = {makeSvgNameCases}
if (require.main === module) main().catch(e => {console.error(e); process.exitCode = 1})
