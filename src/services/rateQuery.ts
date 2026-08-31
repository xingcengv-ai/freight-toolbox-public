import type { FreightRate, QueryResult, RateDataset, RateQuery } from '../types'

function normalize(value: string): string {
  return value.replace(/[\s（）()\-_/&]/g, '').toUpperCase()
}

function serviceMatches(rate: FreightRate, input: string): boolean {
  const needle = normalize(input)
  return [rate.serviceName, ...rate.serviceAliases].some((name) => {
    const candidate = normalize(name)
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate)
  })
}

export function queryFreightRate(dataset: RateDataset, query: RateQuery): QueryResult {
  const destination = normalize(query.destinationCode)
  if (!query.serviceName.trim() || !destination || !Number.isFinite(query.weightKg) || query.weightKg <= 0) {
    return { success: false, message: '请完整填写渠道、目的仓和有效的计费重量。' }
  }

  const destinationRates = dataset.rates.filter((rate) =>
    rate.destinationCodes.some((code) => normalize(code) === destination),
  )
  if (!destinationRates.length) {
    const isKnownDestination = dataset.knownDestinationCodes?.some((code) => normalize(code) === destination)
    if (isKnownDestination) {
      return { success: false, message: `目的仓 ${query.destinationCode.toUpperCase()} 存在于报价表清单，但当前报价表中没有可用于计算的数值价格。` }
    }
    return { success: false, message: `未找到目的仓 ${query.destinationCode.toUpperCase()} 的报价。` }
  }

  const serviceRates = destinationRates.filter((rate) => serviceMatches(rate, query.serviceName))
  if (!serviceRates.length) {
    return {
      success: false,
      message: `目的仓存在，但没有匹配渠道“${query.serviceName}”。`,
      candidates: destinationRates,
    }
  }

  const matches = serviceRates.filter(
    (rate) => query.weightKg >= rate.minWeightKg && (rate.maxWeightKg == null || query.weightKg <= rate.maxWeightKg),
  )
  if (!matches.length) {
    return {
      success: false,
      message: `${query.weightKg}KG 没有命中该渠道的重量区间。`,
      candidates: serviceRates,
    }
  }
  if (matches.length > 1) {
    return { success: false, message: '发现多个重叠报价，请检查导入数据。', candidates: matches }
  }

  const rate = matches[0]
  const amount = Number((query.weightKg * rate.unitPrice).toFixed(2))
  const band = rate.maxWeightKg == null
    ? `${rate.minWeightKg}KG+`
    : `${rate.minWeightKg}-${rate.maxWeightKg}KG`

  return {
    success: true,
    rate,
    amount,
    explanation: [
      `目的地 ${query.destinationCode.toUpperCase()} 命中报价表目的地规则。`,
      `渠道匹配：${rate.serviceName}。`,
      `${query.weightKg}KG 命中 ${band} 阶梯。`,
      `基础金额：${query.weightKg} × ¥${rate.unitPrice.toFixed(2)}/KG = ¥${amount.toFixed(2)}。`,
      '当前测试版未自动叠加产品、超尺寸、报关等附加费。',
    ],
  }
}
