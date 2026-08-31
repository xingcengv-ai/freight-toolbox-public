<script setup lang="ts">
import { ref, watch } from 'vue'
import { parserLabel } from '../services/importerRegistry'
import type { CompanyProfile } from '../types'

const props = defineProps<{
  companies: CompanyProfile[]
  activeCompanyId: string
}>()

const emit = defineEmits<{
  create: [name: string]
  update: [payload: { companyId: string; name: string; owner?: string }]
  delete: [companyId: string]
  select: [companyId: string]
}>()

const newCompanyName = ref('')
const editingNames = ref<Record<string, string>>({})
const editingOwners = ref<Record<string, string>>({})
const message = ref('')

watch(
  () => props.companies,
  (companies) => {
    editingNames.value = Object.fromEntries(companies.map((company) => [company.id, company.name]))
    editingOwners.value = Object.fromEntries(companies.map((company) => [company.id, company.owner || '']))
  },
  { immediate: true, deep: true },
)

function normalizedName(value: string): string {
  return value.trim()
}

function duplicated(name: string, exceptCompanyId?: string): boolean {
  return props.companies.some((company) => company.id !== exceptCompanyId && company.name === name)
}

function createCompany() {
  const name = normalizedName(newCompanyName.value)
  if (!name) {
    message.value = '请输入公司名称。'
    return
  }
  if (duplicated(name)) {
    message.value = `公司“${name}”已经存在。`
    return
  }
  emit('create', name)
  newCompanyName.value = ''
  message.value = `已创建公司“${name}”。`
}

function saveProfile(company: CompanyProfile) {
  const name = normalizedName(editingNames.value[company.id] || '')
  const owner = normalizedName(editingOwners.value[company.id] || '')
  if (!name) {
    editingNames.value[company.id] = company.name
    message.value = '公司名称不能为空。'
    return
  }
  if (duplicated(name, company.id)) {
    editingNames.value[company.id] = company.name
    message.value = `公司“${name}”已经存在。`
    return
  }
  if (name === company.name && owner === (company.owner || '')) {
    message.value = '公司资料没有变化。'
    return
  }
  const oldName = company.name
  emit('update', { companyId: company.id, name, owner: owner || undefined })
  message.value = oldName === name ? `已更新“${name}”的负责人。` : `已将“${oldName}”改名为“${name}”。`
}

function deleteCompany(company: CompanyProfile) {
  if (props.companies.length <= 1) return
  const confirmed = window.confirm(`确定删除公司“${company.name}”吗？该公司的报价版本也会一起删除，且无法恢复。`)
  if (!confirmed) return
  emit('delete', company.id)
  message.value = `已删除公司“${company.name}”。`
}
</script>

<template>
  <section class="company-management">
    <article class="panel company-management-header">
      <div>
        <p class="eyebrow">COMPANY MANAGEMENT</p>
        <h2>公司管理</h2>
        <p class="muted">每家公司拥有独立的解析格式、报价版本和查询数据。</p>
      </div>
      <form class="company-create-form" @submit.prevent="createCompany">
        <label>
          <span>新增公司</span>
          <input v-model="newCompanyName" autocomplete="off" placeholder="输入公司名称" />
        </label>
        <button type="submit">＋ 创建公司</button>
      </form>
    </article>

    <p v-if="message" class="company-action-message">{{ message }}</p>

    <div class="company-card-list">
      <article v-for="company in companies" :key="company.id" class="panel company-card" :class="{ active: company.id === activeCompanyId }">
        <div class="company-card-title">
          <div>
            <span v-if="company.id === activeCompanyId" class="current-company-tag">当前使用</span>
            <span v-else class="company-idle-tag">独立报价库</span>
            <small>创建于 {{ new Date(company.createdAt).toLocaleDateString('zh-CN') }}</small>
          </div>
          <button v-if="company.id !== activeCompanyId" class="use-company-button" type="button" @click="emit('select', company.id)">切换使用</button>
        </div>

        <form class="company-rename-form" @submit.prevent="saveProfile(company)">
          <label>
            <span>公司名称</span>
            <input v-model="editingNames[company.id]" autocomplete="off" />
          </label>
          <label>
            <span>负责人（选填）</span>
            <input v-model="editingOwners[company.id]" autocomplete="off" placeholder="可以留空" />
          </label>
          <button type="submit">保存资料</button>
        </form>

        <div class="company-card-meta">
          <div><span>解析格式</span><b>{{ parserLabel(company.parserId) }}</b></div>
          <div><span>报价版本</span><b>{{ company.datasets.length }} 个</b></div>
          <div><span>当前文件</span><b>{{ company.datasets.find((dataset) => dataset.id === company.activeDatasetId)?.fileName || company.datasets.at(-1)?.fileName || '尚未导入' }}</b></div>
        </div>

        <div class="company-danger-zone">
          <p>{{ companies.length <= 1 ? '系统中至少需要保留一家公司。' : '删除后，该公司的全部报价版本也会被删除。' }}</p>
          <button type="button" :disabled="companies.length <= 1" @click="deleteCompany(company)">删除公司</button>
        </div>
      </article>
    </div>
  </section>
</template>
