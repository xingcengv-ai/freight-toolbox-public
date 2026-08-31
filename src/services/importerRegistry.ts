import * as XLSX from 'xlsx'
import type { CompanyParserId, RateDataset } from '../types'
import { importRateWorkbook } from './excelImporter'

type CompanyImporter = (file: File) => Promise<RateDataset>

const importers: Partial<Record<CompanyParserId, CompanyImporter>> = {
  LCL_SOUTH_V1: importRateWorkbook,
  LCL_EAST_V1: importRateWorkbook,
}

const REQUIRED_SHEETS = [
  '美国海运-亚马逊快递派系列',
  '美国海运-美西FBA卡派系列',
  '美国海运-美东FBA卡派系列',
  '目的仓',
] as const

async function detectCompanyParser(file: File): Promise<CompanyParserId> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', bookSheets: true })
  const missingSheets = REQUIRED_SHEETS.filter((sheetName) => !workbook.SheetNames.includes(sheetName))
  if (missingSheets.length) {
    throw new Error(`无法自动识别这份报价表，缺少关键 Sheet：${missingSheets.join('、')}`)
  }
  return /华东/.test(file.name) ? 'LCL_EAST_V1' : 'LCL_SOUTH_V1'
}

export interface CompanyImportResult {
  dataset: RateDataset
  parserId: CompanyParserId
  autoDetected: boolean
}

export async function importCompanyWorkbook(parserId: CompanyParserId, file: File): Promise<CompanyImportResult> {
  const autoDetected = parserId === 'UNCONFIGURED'
  const resolvedParserId = autoDetected ? await detectCompanyParser(file) : parserId
  const importer = importers[resolvedParserId]
  if (!importer) {
    throw new Error('这家公司还没有配置对应的 Excel 解析器，请先根据它的报价表开发解析规则。')
  }
  return {
    dataset: await importer(file),
    parserId: resolvedParserId,
    autoDetected,
  }
}

export function parserLabel(parserId: CompanyParserId): string {
  if (parserId === 'LCL_SOUTH_V1') return 'LCL 华南格式'
  if (parserId === 'LCL_EAST_V1') return 'LCL 华东格式'
  return '首次导入时自动识别'
}
