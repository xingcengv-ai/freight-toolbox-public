import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import templateUrl from '../assets/templates/price-adjustment-template.xlsx?url'

export interface PriceAdjustmentExportRow {
  waybill: string
  service: string
  destination: string
  weightKg: number
  systemPrice: number
  applicationUnitPrice?: number
}

const SHEET_PATH = 'xl/worksheets/sheet1.xml'
const FORMAL_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

function contentWidth(value: string): number {
  return Array.from(value).reduce((width, character) => (
    width + (/^[\u0000-\u00ff]$/.test(character) ? 1 : 2)
  ), 0)
}

function clampedContentWidth(values: string[], minimum: number, maximum: number): number {
  const longest = Math.max(0, ...values.map(contentWidth))
  return Math.min(maximum, Math.max(minimum, longest + 2))
}

function columnsXml(prefix: string, serviceWidth: number, destinationWidth: number): string {
  const widths = [18, 10, 16, 8, 7, 7, 7, 10, 10, 10, 18, serviceWidth, destinationWidth, 8, 10, 10]
  return `<${prefix}cols>${widths.map((width, index) => (
    `<${prefix}col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  )).join('')}</${prefix}cols>`
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cellXml(prefix: string, column: string, row: number, value: string | number, style?: string): string {
  const reference = `${column}${row}`
  const styleAttribute = style ? ` s="${style}"` : ''
  if (value === '') return `<${prefix}c r="${reference}"${styleAttribute}/>`
  if (typeof value === 'number') return `<${prefix}c r="${reference}"${styleAttribute}><${prefix}v>${value}</${prefix}v></${prefix}c>`
  return `<${prefix}c r="${reference}"${styleAttribute} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${xmlText(value)}</${prefix}t></${prefix}is></${prefix}c>`
}

function xmlPrefix(xml: string): string {
  return xml.match(/<([A-Za-z_][\w.-]*:)?worksheet\b/)?.[1] ?? ''
}

function addWorkbookView(xml: string, prefix: string): string {
  const sheetViewsPattern = new RegExp(`<${prefix}sheetViews\\b`)
  const sheetFormatPattern = new RegExp(`<${prefix}sheetFormatPr\\b`)
  if (!sheetViewsPattern.test(xml)) {
    const sheetViews = `<${prefix}sheetViews><${prefix}sheetView workbookViewId="0" zoomScale="100" zoomScaleNormal="100"><${prefix}selection activeCell="A1" sqref="A1"/></${prefix}sheetView></${prefix}sheetViews>`
    return xml.replace(sheetFormatPattern, `${sheetViews}<${prefix}sheetFormatPr`)
  }

  const sheetViewPattern = new RegExp(`<${prefix}sheetView\\b([^>]*?)(/?)>`)
  let updated = xml.replace(sheetViewPattern, (_match, attributes: string, selfClosing: string) => {
    const cleaned = attributes.replace(/\szoomScale(?:Normal)?="[^"]*"/g, '')
    const opening = `<${prefix}sheetView${cleaned} zoomScale="100" zoomScaleNormal="100">`
    return selfClosing ? `${opening}<${prefix}selection activeCell="A1" sqref="A1"/></${prefix}sheetView>` : opening
  })
  const selectionPattern = new RegExp(`<${prefix}selection\\b[^>]*/>`)
  if (selectionPattern.test(updated)) {
    updated = updated.replace(selectionPattern, `<${prefix}selection activeCell="A1" sqref="A1"/>`)
  } else {
    updated = updated.replace(new RegExp(`</${prefix}sheetView>`), `<${prefix}selection activeCell="A1" sqref="A1"/></${prefix}sheetView>`)
  }
  return updated
}

export function buildPriceAdjustmentFile(
  templateBytes: Uint8Array,
  rows: PriceAdjustmentExportRow[],
): Uint8Array {
  const files = unzipSync(templateBytes)
  const originalXml = strFromU8(files[SHEET_PATH])
  const prefix = xmlPrefix(originalXml)
  const sheetDataPattern = new RegExp(`<${prefix}sheetData>([\\s\\S]*?)</${prefix}sheetData>`)
  const sheetData = originalXml.match(sheetDataPattern)?.[1]
  const headerRow = sheetData?.match(new RegExp(`<${prefix}row\\b[^>]*\\br="1"[^>]*>[\\s\\S]*?</${prefix}row>`))?.[0]
  const sampleRow = sheetData?.match(new RegExp(`<${prefix}row\\b[^>]*\\br="2"[^>]*>[\\s\\S]*?</${prefix}row>`))?.[0]
  if (!headerRow || !sampleRow) throw new Error('异价导入模板结构无法识别')

  const styleByColumn = new Map<string, string>()
  for (const column of FORMAL_COLUMNS) {
    const style = sampleRow.match(new RegExp(`<${prefix}c\\b[^>]*\\br="${column}2"[^>]*\\bs="(\\d+)"`))?.[1]
    if (style) styleByColumn.set(column, style)
  }
  const normalBodyStyle = styleByColumn.get('A')
  const wrappedBodyStyle = styleByColumn.get('C')
  const serviceWidth = clampedContentWidth(rows.map((row) => row.service), 18, 30)
  const destinationWidth = clampedContentWidth(rows.map((row) => row.destination), 14, 26)

  const bodyRows = rows.map((item, index) => {
    const rowNumber = index + 2
    const values: Array<string | number> = [
      item.waybill, '', '按单价', '运费', 'RMB', 1, 'kgs',
      item.applicationUnitPrice ?? '', '', '', '',
      item.service, item.destination, item.weightKg, item.systemPrice,
      item.applicationUnitPrice === undefined
        ? ''
        : Math.round((item.applicationUnitPrice - item.systemPrice) * 100) / 100,
    ]
    const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']
    const cells = columns.map((column, columnIndex) => {
      const auxiliaryStyle = column === 'L' || column === 'M' ? wrappedBodyStyle : normalBodyStyle
      return cellXml(prefix, column, rowNumber, values[columnIndex], styleByColumn.get(column) || auxiliaryStyle)
    }).join('')
    const wrappedLines = Math.max(
      1,
      Math.ceil(contentWidth(item.service) / serviceWidth),
      Math.ceil(contentWidth(item.destination) / destinationWidth),
    )
    const rowHeight = Math.min(60, Math.max(15, wrappedLines * 15))
    return `<${prefix}row r="${rowNumber}" spans="1:16" ht="${rowHeight}" customHeight="1">${cells}</${prefix}row>`
  }).join('')

  const lastRow = Math.max(1, rows.length + 1)
  const dimensionPattern = new RegExp(`<${prefix}dimension\\b[^>]*\\bref="[^"]*"[^>]*/>`)
  const columnsPattern = new RegExp(`<${prefix}cols>[\\s\\S]*?</${prefix}cols>`)
  let updatedXml = originalXml.replace(sheetDataPattern, `<${prefix}sheetData>${headerRow}${bodyRows}</${prefix}sheetData>`)
  updatedXml = columnsPattern.test(updatedXml)
    ? updatedXml.replace(columnsPattern, columnsXml(prefix, serviceWidth, destinationWidth))
    : updatedXml.replace(new RegExp(`<${prefix}sheetData>`), `${columnsXml(prefix, serviceWidth, destinationWidth)}<${prefix}sheetData>`)
  updatedXml = addWorkbookView(updatedXml, prefix)
  updatedXml = dimensionPattern.test(updatedXml)
    ? updatedXml.replace(dimensionPattern, `<${prefix}dimension ref="A1:P${lastRow}"/>`)
    : updatedXml.replace(new RegExp(`<${prefix}sheetViews\\b`), `<${prefix}dimension ref="A1:P${lastRow}"/><${prefix}sheetViews`)

  files[SHEET_PATH] = strToU8(updatedXml)
  return zipSync(files, { level: 6 })
}

export async function downloadPriceAdjustmentWorkbook(rows: PriceAdjustmentExportRow[], companyName: string): Promise<string> {
  const response = await fetch(templateUrl)
  if (!response.ok) throw new Error('异价导入模板加载失败')
  const outputBytes = buildPriceAdjustmentFile(new Uint8Array(await response.arrayBuffer()), rows)
  const now = new Date()
  const dateStamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const safeCompanyName = companyName.trim().replace(/[\\/:*?"<>|]/g, '_') || '报价公司'
  const fileName = `${safeCompanyName}-${dateStamp}.xlsx`
  const blob = new Blob([outputBytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
  return fileName
}
