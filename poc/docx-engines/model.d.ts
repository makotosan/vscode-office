export type ImageMode = 'embedded' | 'linked';
export interface Asset { id: string; sourceUri: string; mime: string; sha256: string; bytes: Uint8Array; widthPx: number; heightPx: number; }
export interface Run { text: string; bold?: boolean; italic?: boolean; color?: string; }
export type Block = { type: 'paragraph' | 'heading'; level?: number; runs: Run[]; align?: string } |
  { type: 'image'; assetId: string } | { type: 'pageBreak' } |
  { type: 'list'; ordered: boolean; items: Block[][] } |
  { type: 'table'; rows: { cells: { blocks: Block[]; colSpan: number; rowSpan: number; widthTwips?: number }[] }[] };
export interface Input { html: string; css: string; assets: Asset[]; page: { widthTwips: number; heightTwips: number }; imageMode: ImageMode; }
export interface Diagnostic { code: string; message: string; severity: 'error' | 'warning'; }
export interface Adapter { generate(input: Input): Promise<{ bytes: Uint8Array; diagnostics: Diagnostic[] }>; }
