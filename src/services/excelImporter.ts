import * as XLSX from 'xlsx'
import type { FreightRate, RateDataset } from '../types'

const TARGET_SHEET = '美国海运-亚马逊快递派系列'
const CHANNEL_COLUMNS = [3, 9, 15, 21] as const
const WAREHOUSE_ROWS = [13, 14, 15] as const
const REGION_ROWS = [8, 9, 10] as const

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function number(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function aliases(serviceName: string): string[] {
  const withoutParentheses = serviceName.replace(/[（(].*?[）)]/g, '').trim()
  const code = serviceName.match(/[（(]([A-Z-]+)[）)]/)?.[1]
  return Array.from(new Set([serviceName.replaceAll(' ', ''), withoutParentheses, code].filter(Boolean))) as string[]
}

function destinationAliases(raw: string): string[] {
  const region = raw.match(/美[西中东]/)?.[0]
  if (!region) return [raw]
  return [raw, region, `${region}快递-亚马逊地址`, `${region}亚马逊地址`]
}

function destinationTokens(raw: string): string[] {
  return Array.from(new Set(raw
    .split(/[,，、/\n]+/)
    .map((item) => item.trim().replace(/^[-—]+/, ''))
    .filter(Boolean)
    .flatMap((item) => {
      const withoutWarehouseSuffix = item.replace(/(?:号)?仓$/, '')
      return withoutWarehouseSuffix && withoutWarehouseSuffix !== item
        ? [item, withoutWarehouseSuffix]
        : [item]
    })))
}

function parseVersionDate(fileName: string, workbook: XLSX.WorkBook): string | undefined {
  const match = fileName.match(/(\d{2})(\d{2})更新/)
  if (!match) return undefined
  const modified = workbook.Props?.ModifiedDate
  const year = modified instanceof Date && !Number.isNaN(modified.getTime())
    ? modified.getFullYear()
    : new Date().getFullYear()
  return `${year}-${match[1]}-${match[2]}`
}

function knownDestinationCodes(workbook: XLSX.WorkBook): string[] {
  const destinationSheet = workbook.Sheets['目的仓']
  if (!destinationSheet) return []
  const values = XLSX.utils.sheet_to_json<unknown[]>(destinationSheet, { header: 1, raw: true, defval: null })
  const codes = values.flatMap((row) => row
    .map(text)
    .filter((value) => /^[A-Z0-9][A-Z0-9-]{2,15}$/i.test(value)))
  return Array.from(new Set(codes.map((code) => code.toUpperCase())))
}

export async function importRateWorkbook(file: File): Promise<RateDataset> {
  const importedAt = new Date().toISOString()
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[TARGET_SHEET]
  if (!sheet) throw new Error(`Excel 中缺少 Sheet：${TARGET_SHEET}`)

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })
  const rates: FreightRate[] = []
  const warnings: string[] = []

  for (const rowIndex of [...REGION_ROWS, ...WAREHOUSE_ROWS]) {
    const row = matrix[rowIndex] ?? []
    const isRegionRow = REGION_ROWS.includes(rowIndex as (typeof REGION_ROWS)[number])
    const rawDestination = text(row[isRegionRow ? 2 : 1])
    const codes = isRegionRow
      ? destinationAliases(rawDestination)
      : rawDestination.split(/[,，、/\n]+/).map((item) => item.trim().toUpperCase()).filter(Boolean)
    if (!codes.length) {
      warnings.push(`${TARGET_SHEET} 第 ${rowIndex + 1} 行没有解析到仓库代码。`)
      continue
    }

    for (const columnIndex of CHANNEL_COLUMNS) {
      const serviceName = text(matrix[6]?.[columnIndex])
      const firstPrice = number(row[columnIndex])
      const secondPrice = number(row[columnIndex + 1])
      if (!serviceName) {
        warnings.push(`${TARGET_SHEET} ${XLSX.utils.encode_cell({ r: 6, c: columnIndex })} 渠道名为空。`)
        continue
      }

      const common = {
        serviceName,
        serviceAliases: aliases(serviceName),
        destinationCodes: codes,
        currency: 'CNY' as const,
        unit: 'KG' as const,
        transitTime: text(row[columnIndex + 3]) || text(matrix[13]?.[columnIndex + 3]),
        compensationTime: text(row[columnIndex + 4]) || text(matrix[13]?.[columnIndex + 4]),
        schedule: text(row[columnIndex + 5]) || text(matrix[13]?.[columnIndex + 5]),
      }

      if (firstPrice != null) {
        rates.push({
          id: `${file.name}-${rowIndex + 1}-${columnIndex + 1}-12-49`,
          ...common,
          minWeightKg: 12,
          maxWeightKg: 49,
          unitPrice: firstPrice,
          source: {
            fileName: file.name,
            sheetName: TARGET_SHEET,
            cells: [
              XLSX.utils.encode_cell({ r: rowIndex, c: isRegionRow ? 2 : 1 }),
              XLSX.utils.encode_cell({ r: 6, c: columnIndex }),
              XLSX.utils.encode_cell({ r: 12, c: columnIndex }),
              XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex }),
            ],
            importedAt,
          },
        })
      }
      if (secondPrice != null) {
        rates.push({
          id: `${file.name}-${rowIndex + 1}-${columnIndex + 2}-50-plus`,
          ...common,
          minWeightKg: 50,
          unitPrice: secondPrice,
          source: {
            fileName: file.name,
            sheetName: TARGET_SHEET,
            cells: [
              XLSX.utils.encode_cell({ r: rowIndex, c: isRegionRow ? 2 : 1 }),
              XLSX.utils.encode_cell({ r: 6, c: columnIndex }),
              XLSX.utils.encode_cell({ r: 12, c: columnIndex + 1 }),
              XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex + 1 }),
            ],
            importedAt,
          },
        })
      }
    }
  }

  const addSimpleKgRate = (input: {
    serviceName: string
    serviceAliases: string[]
    destinationCodes: string[]
    minWeightKg: number
    maxWeightKg?: number
    unitPrice: number
    sheetName: string
    cells: string[]
    transitTime?: string
  }) => {
    rates.push({
      id: `${file.name}-${input.sheetName}-${input.cells.join('-')}`,
      serviceName: input.serviceName,
      serviceAliases: input.serviceAliases,
      destinationCodes: input.destinationCodes,
      minWeightKg: input.minWeightKg,
      maxWeightKg: input.maxWeightKg,
      unitPrice: input.unitPrice,
      currency: 'CNY', unit: 'KG', transitTime: input.transitTime,
      source: { fileName: file.name, sheetName: input.sheetName, cells: input.cells, importedAt },
    })
  }

  for (const config of [
    { sheetName: '美国海运-美西FBA卡派系列', serviceCell: 'C8', priceColumn: 2, startRow: 11,
      aliases: ['美森极致达卡派（包）', '美森极致达卡派包', '美森极致达卡派'] },
    { sheetName: '美国海运-美西FBA卡派系列', serviceCell: 'K8', priceColumn: 10, startRow: 11,
      aliases: ['美西快船卡派（包）', '美西快船卡派包', '美西快船卡派'] },
    { sheetName: '美国海运-美西FBA卡派系列', serviceCell: 'O8', priceColumn: 14, startRow: 11,
      aliases: ['美西普船卡派统配（包）', '美西普船卡派统配包', '美西普船卡派统配'] },
    { sheetName: '美国海运-美东FBA卡派系列', serviceCell: 'C8', priceColumn: 2, startRow: 10,
      aliases: ['美东美森纽约卡派（包）', '美东美森纽约卡派包', '美东美森纽约卡派'] },
    { sheetName: '美国海运-美东FBA卡派系列', serviceCell: 'G8', priceColumn: 6, startRow: 10,
      aliases: ['美东快船海卡纽约卡派（包）', '美东快船海卡纽约卡派包', '美东快船海卡纽约卡派'] },
    { sheetName: '美国海运-美东FBA卡派系列', serviceCell: 'K8', priceColumn: 10, startRow: 10,
      aliases: ['美东普船限时达纽约卡派（包）', '美东普船限时达纽约卡派包', '美东普船限时达纽约卡派'] },
    { sheetName: '美国海运-美东FBA卡派系列', serviceCell: 'V8', priceColumn: 21, startRow: 10,
      aliases: ['美东普船纽约卡派（包）', '美东普船纽约卡派包', '美东普船纽约卡派'] },
  ]) {
    const sourceSheet = workbook.Sheets[config.sheetName]
    if (!sourceSheet) {
      warnings.push(`缺少 Sheet：${config.sheetName}`)
      continue
    }
    const sourceRows = XLSX.utils.sheet_to_json<unknown[]>(sourceSheet, { header: 1, raw: true, defval: null })
    const originalService = text(sourceSheet[config.serviceCell]?.v)
    for (let rowIndex = config.startRow; rowIndex < sourceRows.length; rowIndex += 1) {
      const destination = text(sourceRows[rowIndex]?.[1]).toUpperCase()
      const price = number(sourceRows[rowIndex]?.[config.priceColumn])
      if (!destination || price == null) continue
      addSimpleKgRate({
        serviceName: originalService || config.aliases[0],
        serviceAliases: config.aliases,
        destinationCodes: [destination],
        minWeightKg: 50,
        unitPrice: price,
        sheetName: config.sheetName,
        cells: [config.serviceCell, XLSX.utils.encode_cell({ r: rowIndex, c: 1 }), XLSX.utils.encode_cell({ r: rowIndex, c: config.priceColumn })],
        transitTime: text(sourceRows[rowIndex]?.[config.priceColumn + 2]),
      })
    }
  }

  const commercialSheetName = '美国海运-商私卡快递派系列'
  const commercialSheet = workbook.Sheets[commercialSheetName]
  if (commercialSheet) {
    const commercialRows = XLSX.utils.sheet_to_json<unknown[]>(commercialSheet, { header: 1, raw: true, defval: null })
    const serviceName = text(commercialRows[6]?.[22])
    for (const rowIndex of [8, 9, 10]) {
      const rawRegion = text(commercialRows[rowIndex]?.[3])
      const region = rawRegion.match(/美[西中东]/)?.[0]
      if (!region) continue
      for (const band of [
        { column: 22, min: 12, max: 149 },
        { column: 23, min: 150, max: 249 },
        { column: 24, min: 250, max: undefined },
      ]) {
        const price = number(commercialRows[rowIndex]?.[band.column])
        if (price == null) continue
        addSimpleKgRate({
          serviceName,
          serviceAliases: ['美西普船快递派统配', '美西普船快递派 统配'],
          destinationCodes: [rawRegion, `${region}快递-商业地址`, `${region}商业地址`],
          minWeightKg: band.min, maxWeightKg: band.max, unitPrice: price,
          sheetName: commercialSheetName,
          cells: ['W7', XLSX.utils.encode_cell({ r: rowIndex, c: 3 }), XLSX.utils.encode_cell({ r: rowIndex, c: band.column })],
          transitTime: text(commercialRows[rowIndex]?.[25]),
        })
      }
    }
  } else {
    warnings.push(`缺少 Sheet：${commercialSheetName}`)
  }

  const savannahSheetName = '美国海运-萨凡纳FBA&商业卡派系列'
  const savannahSheet = workbook.Sheets[savannahSheetName]
  if (savannahSheet) {
    const savannahRows = XLSX.utils.sheet_to_json<unknown[]>(savannahSheet, { header: 1, raw: true, defval: null })
    for (let rowIndex = 8; rowIndex < savannahRows.length; rowIndex += 1) {
      const destination = text(savannahRows[rowIndex]?.[1]).toUpperCase()
      const price = number(savannahRows[rowIndex]?.[2])
      if (!destination || price == null) continue
      addSimpleKgRate({
        serviceName: '萨凡纳普船卡派专线',
        serviceAliases: ['萨凡纳普船卡派专线（包）', '萨凡纳普船卡派专线包', '萨凡纳普船卡派专线'],
        destinationCodes: [destination],
        minWeightKg: 100,
        unitPrice: price,
        sheetName: savannahSheetName,
        cells: [
          XLSX.utils.encode_cell({ r: rowIndex, c: 1 }),
          XLSX.utils.encode_cell({ r: rowIndex, c: 2 }),
        ],
        transitTime: text(savannahRows[rowIndex]?.[7]),
      })
    }
  } else {
    warnings.push(`缺少 Sheet：${savannahSheetName}`)
  }

  const ukSheetName = '英国海运-卡派&快递派系列'
  const ukSheet = workbook.Sheets[ukSheetName]
  if (ukSheet) {
    const ukRows = XLSX.utils.sheet_to_json<unknown[]>(ukSheet, { header: 1, raw: true, defval: null })
    for (const config of [
      { serviceColumn: 4, priceColumns: [4, 5] as const },
      { serviceColumn: 10, priceColumns: [10, 11] as const },
      { serviceColumn: 15, priceColumns: [15, 16] as const },
    ]) {
      const serviceName = text(ukRows[6]?.[config.serviceColumn])
      const priceBands = [
        { column: config.priceColumns[0], min: 21, max: 99.99 },
        { column: config.priceColumns[1], min: 100, max: undefined },
      ]
      for (const band of priceBands) {
        const price = number(ukRows[8]?.[band.column])
        if (!serviceName || price == null) continue
        addSimpleKgRate({
          serviceName,
          serviceAliases: aliases(serviceName),
          destinationCodes: ['英国', 'UK', 'UNITED KINGDOM'],
          minWeightKg: band.min,
          maxWeightKg: band.max,
          unitPrice: price,
          sheetName: ukSheetName,
          cells: [
            XLSX.utils.encode_cell({ r: 6, c: config.serviceColumn }),
            XLSX.utils.encode_cell({ r: 8, c: band.column }),
          ],
          transitTime: text(ukRows[8]?.[config.serviceColumn + 2]),
        })
      }
    }

    const ukCardServiceName = text(ukRows[13]?.[4])
    for (let rowIndex = 16; rowIndex <= 38; rowIndex += 1) {
      const destinations = destinationTokens(text(ukRows[rowIndex]?.[3]))
      const price = number(ukRows[rowIndex]?.[4])
      if (!ukCardServiceName || !destinations.length || price == null) continue
      addSimpleKgRate({
        serviceName: ukCardServiceName,
        serviceAliases: aliases(ukCardServiceName),
        destinationCodes: destinations,
        minWeightKg: 100,
        unitPrice: price,
        sheetName: ukSheetName,
        cells: [
          'E14',
          XLSX.utils.encode_cell({ r: rowIndex, c: 3 }),
          XLSX.utils.encode_cell({ r: rowIndex, c: 4 }),
        ],
        transitTime: text(ukRows[rowIndex]?.[6]) || text(ukRows[rowIndex]?.[12]),
      })
    }
    warnings.push('英国达到 1:250 的重货优惠、按方报价和商私卡报价暂未自动计算；当前已导入英国快递派、卡航及海卡按 KG 报价。')
  } else {
    warnings.push(`缺少 Sheet：${ukSheetName}`)
  }

  if (!rates.length) throw new Error('找到目标 Sheet，但没有解析到有效报价。')
  return {
    id: `${file.name}-${importedAt}`,
    fileName: file.name,
    versionDate: parseVersionDate(file.name, workbook),
    importedAt,
    rates,
    knownDestinationCodes: knownDestinationCodes(workbook),
    warnings,
  }
}
