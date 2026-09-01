<script setup lang="ts">
import { computed, ref } from 'vue'
import BatchQuote from './components/BatchQuote.vue'
import CompanyManagement from './components/CompanyManagement.vue'
import CompanySelect from './components/CompanySelect.vue'
import { activeDataset, addDataset, loadCompanyStore, newCompany, saveCompanyStore } from './services/companyStore'
import { importCompanyWorkbook, parserLabel } from './services/importerRegistry'
import { queryFreightRate } from './services/rateQuery'
import type { QueryResult } from './types'

const companyStore = ref(loadCompanyStore())
const serviceName = ref('')
const destinationCode = ref('')
const weightKg = ref<number | undefined>()
const result = ref<QueryResult | null>(null)
const importStatus = ref('请先选择公司并导入报价表')
const importing = ref(false)
const activeView = ref<'single' | 'batch' | 'companies'>('single')

const selectedCompany = computed(() => companyStore.value.companies.find((company) => company.id === companyStore.value.activeCompanyId)!)
const dataset = computed(() => activeDataset(selectedCompany.value))
const importedTime = computed(() => dataset.value ? new Date(dataset.value.importedAt).toLocaleString('zh-CN') : '')
const uniqueDestinations = computed(() => new Set(dataset.value?.rates.flatMap((rate) => rate.destinationCodes) ?? []).size)
const uniqueServices = computed(() => new Set(dataset.value?.rates.map((rate) => rate.serviceName) ?? []).size)
const companySelectSummary = computed(() => [
  parserLabel(selectedCompany.value.parserId),
  selectedCompany.value.owner ? `负责人：${selectedCompany.value.owner}` : '',
  `${selectedCompany.value.datasets.length} 个报价版本`,
].filter(Boolean).join(' · '))

function selectCompany(companyId: string) {
  companyStore.value.activeCompanyId = companyId
  result.value = null
  importStatus.value = dataset.value ? `已切换到 ${selectedCompany.value.name}` : '该公司尚未导入报价表'
  saveCompanyStore(companyStore.value)
}

function createCompany(name: string) {
  const company = newCompany(name)
  companyStore.value.companies.push(company)
  selectCompany(company.id)
}

function updateCompanyProfile(payload: { companyId: string; name: string; owner?: string }) {
  const company = companyStore.value.companies.find((item) => item.id === payload.companyId)
  if (!company) return
  company.name = payload.name
  company.owner = payload.owner
  importStatus.value = `公司资料已更新：${payload.name}`
  saveCompanyStore(companyStore.value)
}

function deleteCompany(companyId: string) {
  if (companyStore.value.companies.length <= 1) return
  const remainingCompanies = companyStore.value.companies.filter((company) => company.id !== companyId)
  companyStore.value.companies = remainingCompanies
  if (companyStore.value.activeCompanyId === companyId) {
    companyStore.value.activeCompanyId = remainingCompanies[0].id
  }
  result.value = null
  importStatus.value = `当前公司：${selectedCompany.value.name}`
  saveCompanyStore(companyStore.value)
}

function runQuery() {
  if (!dataset.value) {
    result.value = { success: false, message: `公司“${selectedCompany.value.name}”尚未导入可查询的报价表。` }
    return
  }
  result.value = queryFreightRate(dataset.value, {
    serviceName: serviceName.value,
    destinationCode: destinationCode.value,
    weightKg: Number(weightKg.value),
  })
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  result.value = null
  try {
    const importResult = await importCompanyWorkbook(selectedCompany.value.parserId, file)
    const imported = importResult.dataset
    const companyIndex = companyStore.value.companies.findIndex((company) => company.id === selectedCompany.value.id)
    const configuredCompany = { ...selectedCompany.value, parserId: importResult.parserId }
    companyStore.value.companies[companyIndex] = addDataset(configuredCompany, imported)
    saveCompanyStore(companyStore.value)
    const detectedMessage = importResult.autoDetected ? `，已自动识别为${parserLabel(importResult.parserId)}` : ''
    importStatus.value = `${selectedCompany.value.name} 导入成功：${imported.rates.length} 条阶梯报价${detectedMessage}`
  } catch (error) {
    importStatus.value = error instanceof Error ? `导入失败：${error.message}` : '导入失败'
  } finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar panel">
      <div class="brand-area">
        <div class="brand-mark">价</div>
        <div class="brand-copy">
          <p class="eyebrow">FREIGHT RATE DESK</p>
          <h1>海运报价查询系统</h1>
        </div>
        <span class="prototype-tag">测试版</span>
      </div>
      <nav class="view-tabs" aria-label="工作模式">
        <button :class="{ active: activeView === 'single' }" @click="activeView = 'single'">单票查询</button>
        <button :class="{ active: activeView === 'batch' }" @click="activeView = 'batch'">批量报价</button>
        <button :class="{ active: activeView === 'companies' }" @click="activeView = 'companies'">公司管理</button>
      </nav>
      <div class="topbar-company">
        <CompanySelect
          :companies="companyStore.companies"
          :model-value="companyStore.activeCompanyId"
          :summary="companySelectSummary"
          @update:model-value="selectCompany"
        />
      </div>
    </header>

    <template v-if="activeView === 'single'">
    <section class="hero-grid">
      <article class="query-panel panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">QUICK QUOTE</p>
            <h2>查一个准确报价</h2>
          </div>
          <span class="live-dot">{{ dataset ? '数据已就绪' : '等待导入' }}</span>
        </div>

        <form @submit.prevent="runQuery" class="query-form">
          <label>
            <span>渠道名称</span>
            <input v-model="serviceName" autocomplete="off" placeholder="请输入渠道名称" />
          </label>
          <div class="form-row">
            <label>
              <span>目的仓代码</span>
              <input v-model="destinationCode" autocomplete="off" placeholder="请输入目的仓代码" />
            </label>
            <label>
              <span>计费重量</span>
              <div class="unit-input">
                <input v-model.number="weightKg" type="number" min="0.01" step="0.01" />
                <b>KG</b>
              </div>
            </label>
          </div>
          <button class="primary-button" type="submit">查询报价 <span>→</span></button>
        </form>
      </article>

      <article class="result-panel panel" :class="{ empty: !result }">
        <template v-if="result?.success">
          <p class="eyebrow">QUOTE RESULT</p>
          <div class="price-line">
            <span>¥</span><strong>{{ result.amount.toFixed(2) }}</strong>
          </div>
          <p class="price-caption">基础运费 · 人民币</p>
          <div class="rate-chip-row">
            <span>{{ result.rate.serviceName }}</span>
            <span>{{ result.rate.unitPrice.toFixed(2) }} 元/KG</span>
          </div>
          <ol class="explanation-list">
            <li v-for="line in result.explanation" :key="line">{{ line }}</li>
          </ol>
          <div class="source-box">
            <span>报价来源</span>
            <b>{{ result.rate.source.sheetName }}</b>
            <small>{{ result.rate.source.cells.join(' · ') }}</small>
          </div>
        </template>
        <template v-else-if="result">
          <div class="empty-symbol error">!</div>
          <h3>没有找到唯一报价</h3>
          <p>{{ result.message }}</p>
        </template>
        <template v-else>
          <div class="empty-symbol">¥</div>
          <h3>等待查询</h3>
          <p>输入渠道、目的仓和计费重量后，点击“查询报价”查看金额和匹配依据。</p>
        </template>
      </article>
    </section>

    <section class="data-panel panel">
      <div class="section-heading data-heading">
        <div>
          <p class="eyebrow">RATE DATA</p>
          <h2>导入更新报价表</h2>
          <p class="muted">文件只会导入当前公司“{{ selectedCompany.name }}”，不会覆盖其他公司的报价。</p>
        </div>
        <label class="upload-button" :class="{ disabled: importing }">
          <input type="file" accept=".xlsx,.xls" :disabled="importing" @change="onFileChange" />
          {{ importing ? '正在解析…' : '选择 Excel 文件' }}
        </label>
      </div>

      <div class="dataset-grid">
        <div><span>当前文件</span><b>{{ dataset?.fileName || '尚未导入' }}</b></div>
        <div><span>版本日期</span><b>{{ dataset?.versionDate || '未识别' }}</b></div>
        <div><span>渠道数量</span><b>{{ uniqueServices }}</b></div>
        <div><span>目的仓数量</span><b>{{ uniqueDestinations }}</b></div>
      </div>
      <div class="import-footer">
        <span>{{ importStatus }}</span>
        <small v-if="dataset">数据时间：{{ importedTime }}</small>
      </div>
      <ul v-if="dataset?.warnings.length" class="warning-list">
        <li v-for="warning in dataset.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </section>
    </template>

    <BatchQuote v-else-if="activeView === 'batch' && dataset" :dataset="dataset" :company-name="selectedCompany.name" />
    <section v-else-if="activeView === 'batch'" class="panel no-company-data">
      <div class="empty-symbol">表</div><h2>这家公司还没有报价数据</h2>
      <p>当前解析格式：{{ parserLabel(selectedCompany.parserId) }}。配置解析器并导入 Excel 后即可批量查询。</p>
    </section>
    <CompanyManagement
      v-else
      :companies="companyStore.companies"
      :active-company-id="companyStore.activeCompanyId"
      @create="createCompany"
      @update="updateCompanyProfile"
      @delete="deleteCompany"
      @select="selectCompany"
    />

    <footer>当前覆盖：美国海运及英国海运部分 KG 阶梯报价</footer>
  </main>
</template>
