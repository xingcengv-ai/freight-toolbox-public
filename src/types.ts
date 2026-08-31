export interface SourceLocator {
  fileName: string
  sheetName: string
  cells: string[]
  importedAt: string
}

export interface FreightRate {
  id: string
  serviceName: string
  serviceAliases: string[]
  destinationCodes: string[]
  minWeightKg: number
  maxWeightKg?: number
  unitPrice: number
  currency: 'CNY'
  unit: 'KG'
  transitTime?: string
  compensationTime?: string
  schedule?: string
  source: SourceLocator
}

export interface RateDataset {
  id: string
  fileName: string
  versionDate?: string
  importedAt: string
  rates: FreightRate[]
  knownDestinationCodes?: string[]
  warnings: string[]
}

export type CompanyParserId = 'LCL_SOUTH_V1' | 'LCL_EAST_V1' | 'UNCONFIGURED'

export interface CompanyProfile {
  id: string
  name: string
  owner?: string
  parserId: CompanyParserId
  activeDatasetId?: string
  datasets: RateDataset[]
  createdAt: string
}

export interface CompanyRateStore {
  schemaVersion: 2
  activeCompanyId: string
  companies: CompanyProfile[]
}

export interface RateQuery {
  serviceName: string
  destinationCode: string
  weightKg: number
}

export interface QuerySuccess {
  success: true
  rate: FreightRate
  amount: number
  explanation: string[]
}

export interface QueryFailure {
  success: false
  message: string
  candidates?: FreightRate[]
}

export type QueryResult = QuerySuccess | QueryFailure
