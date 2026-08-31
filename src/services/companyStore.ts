import type { CompanyProfile, CompanyRateStore, RateDataset } from '../types'

const STORAGE_KEY = 'freight-toolbox-company-rate-store-v2'
const DEFAULT_COMPANY_ID = 'company-default'

export function createDefaultStore(): CompanyRateStore {
  return {
    schemaVersion: 2,
    activeCompanyId: DEFAULT_COMPANY_ID,
    companies: [{
      id: DEFAULT_COMPANY_ID,
      name: '我的公司',
      parserId: 'UNCONFIGURED',
      datasets: [],
      createdAt: '2026-08-13T00:00:00.000Z',
    }],
  }
}

export function loadCompanyStore(): CompanyRateStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createDefaultStore()
  try {
    const parsed = JSON.parse(raw) as CompanyRateStore
    if (parsed.schemaVersion !== 2 || !parsed.companies.length) return createDefaultStore()
    return parsed
  } catch {
    return createDefaultStore()
  }
}

export function saveCompanyStore(store: CompanyRateStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function activeDataset(company: CompanyProfile): RateDataset | undefined {
  return company.datasets.find((dataset) => dataset.id === company.activeDatasetId)
    ?? company.datasets.at(-1)
}

export function addDataset(company: CompanyProfile, dataset: RateDataset): CompanyProfile {
  const datasets = [...company.datasets.filter((item) => item.id !== dataset.id), dataset]
  return { ...company, datasets, activeDatasetId: dataset.id }
}

export function newCompany(name: string): CompanyProfile {
  const createdAt = new Date().toISOString()
  return {
    id: `company-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    parserId: 'UNCONFIGURED',
    datasets: [],
    createdAt,
  }
}
