<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CompanyProfile } from '../types'

const props = defineProps<{
  companies: CompanyProfile[]
  modelValue: string
  summary?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [companyId: string]
}>()

const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const keyword = ref('')
const highlightedIndex = ref(0)

const selectedCompany = computed(() => props.companies.find((company) => company.id === props.modelValue))
const filteredCompanies = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return props.companies
  return props.companies.filter((company) => company.name.toLocaleLowerCase('zh-CN').includes(query))
})

async function toggle() {
  open.value = !open.value
  if (open.value) {
    keyword.value = ''
    highlightedIndex.value = Math.max(0, filteredCompanies.value.findIndex((company) => company.id === props.modelValue))
    await nextTick()
    searchInput.value?.focus()
  }
}

function close() {
  open.value = false
  keyword.value = ''
}

function select(companyId: string) {
  emit('update:modelValue', companyId)
  close()
}

function moveHighlight(offset: number) {
  const count = filteredCompanies.value.length
  if (!count) return
  highlightedIndex.value = (highlightedIndex.value + offset + count) % count
}

function selectHighlighted() {
  const company = filteredCompanies.value[highlightedIndex.value]
  if (company) select(company.id)
}

function onSearchInput() {
  highlightedIndex.value = 0
}

function onDocumentPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="company-select" :class="{ open }">
    <button
      class="company-select-trigger"
      type="button"
      aria-label="选择当前报价公司"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown.down.prevent="open ? moveHighlight(1) : toggle()"
      @keydown.up.prevent="open ? moveHighlight(-1) : toggle()"
      @keydown.esc="close"
    >
      <span class="company-select-trigger-copy">
        <small>当前报价公司</small>
        <b>{{ selectedCompany?.name || '请选择公司' }}</b>
      </span>
      <svg class="company-select-arrow" viewBox="0 0 20 20" aria-hidden="true">
        <path d="m6 8 4 4 4-4" />
      </svg>
    </button>

    <div v-if="open" class="company-select-popover">
      <div class="company-select-search">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13 13 3.5 3.5" />
        </svg>
        <input
          ref="searchInput"
          v-model="keyword"
          type="search"
          autocomplete="off"
          placeholder="搜索公司名称"
          aria-label="搜索公司名称"
          @input="onSearchInput"
          @keydown.down.prevent="moveHighlight(1)"
          @keydown.up.prevent="moveHighlight(-1)"
          @keydown.enter.prevent="selectHighlighted"
          @keydown.esc="close"
        />
      </div>

      <div class="company-select-options" role="listbox" aria-label="报价公司">
        <button
          v-for="(company, index) in filteredCompanies"
          :key="company.id"
          type="button"
          role="option"
          :aria-selected="company.id === modelValue"
          :class="{ selected: company.id === modelValue, highlighted: index === highlightedIndex }"
          @mouseenter="highlightedIndex = index"
          @click="select(company.id)"
        >
          <span>{{ company.name }}</span>
          <svg v-if="company.id === modelValue" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 10 3 3 7-7" />
          </svg>
        </button>
        <p v-if="!filteredCompanies.length" class="company-select-empty">没有找到“{{ keyword }}”</p>
      </div>
      <p v-if="summary" class="company-select-summary">{{ summary }}</p>
    </div>
  </div>
</template>
