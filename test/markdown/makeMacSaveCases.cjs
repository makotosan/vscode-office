// Local diagnostic copies only. Input documents may contain private content.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const JSZip = require('jszip')
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom')
const { normalizeDocxPackage } = require('../../src/service/markdown/docx-package')
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const SVG = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const parse = xml => new DOMParser().parseFromString(xml, 'application/xml')
const serialize = doc => new XMLSerializer().serializeToString(doc)
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

async function main() {
    const [input, output] = process.argv.slice(2)
    if (!input || !output) throw new Error('Usage: node test/markdown/makeMacSaveCases.cjs INPUT.docx OUTPUT_DIRECTORY')
    const original = fs.readFileSync(input)
    const raw = await JSZip.loadAsync(original, {checkCRC32: true})
    const fixedBytes = await normalizeDocxPackage(original)
    const fixed = await JSZip.loadAsync(fixedBytes)
    const tables = await JSZip.loadAsync(fixedBytes)
    const svg = await JSZip.loadAsync(original)
    const noSvg = await JSZip.loadAsync(fixedBytes)
    // Keep #7's table, MIME and compatibility corrections, but restore the old
    // direct-SVG reference. This isolates the new drawing change from #7.
    for (const [name, entry] of Object.entries(fixed.files)) {
        if (entry.dir || !name.startsWith('word/') || !name.endsWith('.xml')) continue
        const doc = parse(await entry.async('string'))
        const rawDoc = parse(await raw.file(name).async('string'))
        const oldBlips = Array.from(rawDoc.getElementsByTagNameNS(A, 'blip'))
        const newBlips = Array.from(doc.getElementsByTagNameNS(A, 'blip'))
        for (let i = 0; i < newBlips.length; i++) {
            if (!newBlips[i].getElementsByTagNameNS(SVG, 'svgBlip').length) continue
            newBlips[i].parentNode.replaceChild(doc.importNode(oldBlips[i], true), newBlips[i])
        }
        tables.file(name, serialize(doc))
        // SVG-only: copy only changed drawings into the raw XML. Table and
        // settings defects remain deliberately present in this diagnostic case.
        const fixedDoc = parse(await entry.async('string'))
        const fixedBlips = Array.from(fixedDoc.getElementsByTagNameNS(A, 'blip'))
        for (let i = 0; i < oldBlips.length; i++) {
            if (fixedBlips[i].getElementsByTagNameNS(SVG, 'svgBlip').length) {
                oldBlips[i].parentNode.replaceChild(rawDoc.importNode(fixedBlips[i], true), oldBlips[i])
            }
        }
        svg.file(name, serialize(rawDoc))
        const without = parse(await entry.async('string'))
        for (const vector of Array.from(without.getElementsByTagNameNS(SVG, 'svgBlip'))) {
            const blip = vector.parentNode.parentNode.parentNode
            // Diagnostic isolation: remove the drawing rather than rasterizing.
            let drawing = blip
            while (drawing.parentNode && !(drawing.namespaceURI === 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' && drawing.localName === 'drawing')) drawing = drawing.parentNode
            if (drawing.parentNode) drawing.parentNode.removeChild(drawing)
        }
        noSvg.file(name, serialize(without))
    }
    svg.file('[Content_Types].xml', await fixed.file('[Content_Types].xml').async('nodebuffer'))
    // Remove now-unused SVG image relationships/media from the no-SVG case.
    const svgParts = new Set(Object.keys(noSvg.files).filter(n => /\.svg(?:\+xml)?$/i.test(n)))
    for (const [name, entry] of Object.entries(noSvg.files)) {
        if (entry.dir || !name.endsWith('.rels')) continue
        const doc = parse(await entry.async('string'))
        const sourceDir = path.posix.dirname(path.posix.dirname(name))
        for (const rel of Array.from(doc.documentElement.childNodes)) {
            if (rel.nodeType !== 1 || rel.getAttribute('Type') !== R + '/image' || rel.getAttribute('TargetMode') === 'External') continue
            const target = path.posix.resolve('/', sourceDir, decodeURIComponent(rel.getAttribute('Target'))).slice(1)
            if (svgParts.has(target)) rel.parentNode.removeChild(rel)
        }
        noSvg.file(name, serialize(doc))
    }
    for (const name of svgParts) noSvg.remove(name)
    const types = parse(await noSvg.file('[Content_Types].xml').async('string'))
    for (const e of Array.from(types.documentElement.childNodes)) {
        if (e.nodeType === 1 && e.localName === 'Override' && svgParts.has(e.getAttribute('PartName').slice(1))) e.parentNode.removeChild(e)
    }
    noSvg.file('[Content_Types].xml', serialize(types))
    fs.mkdirSync(output, {recursive: true})
    const cases = {'A-original.docx': original, 'B-issue7-baseline.docx': await tables.generateAsync({type:'nodebuffer'}),
        'C-svg-only.docx': await svg.generateAsync({type:'nodebuffer'}), 'D-combined.docx': fixedBytes,
        'E-without-svg.docx': await noSvg.generateAsync({type:'nodebuffer'})}
    const manifest = {inputSha256: hash(original), cases: {}}
    for (const [name, bytes] of Object.entries(cases)) {
        const target = path.resolve(output, name)
        if (target === path.resolve(input) || fs.existsSync(target)) throw new Error(`Refusing to overwrite ${target}`)
        fs.writeFileSync(target, bytes, {flag:'wx'})
        manifest.cases[name] = hash(bytes)
    }
    if (hash(fs.readFileSync(input)) !== manifest.inputSha256) throw new Error('Input changed')
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), {flag:'wx'})
    console.log(JSON.stringify(manifest, null, 2))
}
main().catch(error => {console.error(error); process.exitCode = 1})
