<script setup lang="ts">
import { computed, ref } from "vue";
import { downloadPriceAdjustmentWorkbook } from "../services/priceAdjustmentExport";
import { queryFreightRate } from "../services/rateQuery";
import type { QueryResult, RateDataset } from "../types";

const props = defineProps<{ dataset: RateDataset; companyName: string }>();

const waybills = ref("");
const services = ref("");
const destinations = ref("");
const weights = ref("");
const systemPrices = ref("");

interface BatchRow {
  index: number;
  waybill: string;
  service: string;
  destination: string;
  weightKg: number;
  systemPrice: number;
  result: QueryResult;
}

const rows = ref<BatchRow[]>([]);
const validationMessage = ref("");
const copyStatus = ref("");

function lines(value: string): string[] {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

const inputCounts = computed(() => ({
  waybills: lines(waybills.value).length,
  services: lines(services.value).length,
  destinations: lines(destinations.value).length,
  weights: lines(weights.value).length,
  systemPrices: lines(systemPrices.value).length,
}));

const successCount = computed(
  () => rows.value.filter((row) => row.result.success).length,
);

function generate() {
  const columns = [
    lines(waybills.value),
    lines(services.value),
    lines(destinations.value),
    lines(weights.value),
    lines(systemPrices.value),
  ];
  const counts = columns.map((column) => column.length);
  const expected = counts[0];
  copyStatus.value = "";
  if (!expected) {
    validationMessage.value = "请至少粘贴一行数据。";
    rows.value = [];
    return;
  }
  if (counts.some((count) => count !== expected)) {
    validationMessage.value = `各列行数不一致：运单号 ${counts[0]} 行、渠道 ${counts[1]} 行、目的地 ${counts[2]} 行、重量 ${counts[3]} 行、系统价格 ${counts[4]} 行。请补齐后再生成。`;
    rows.value = [];
    return;
  }

  validationMessage.value = "";
  const invalidWeightIndex = columns[3].findIndex((value) => !Number.isFinite(Number(value)) || Number(value) <= 0);
  const invalidSystemPriceIndex = columns[4].findIndex((value) => !Number.isFinite(Number(value)) || Number(value) < 0);
  if (invalidWeightIndex >= 0 || invalidSystemPriceIndex >= 0) {
    const problems = [];
    if (invalidWeightIndex >= 0) problems.push(`第 ${invalidWeightIndex + 1} 行重量不是有效正数`);
    if (invalidSystemPriceIndex >= 0) problems.push(`第 ${invalidSystemPriceIndex + 1} 行系统价格不是有效数字`);
    validationMessage.value = problems.join("；");
    rows.value = [];
    return;
  }
  rows.value = columns[0].map((waybill, index) => {
    const weightKg = Number(columns[3][index]);
    const systemPrice = Number(columns[4][index]);
    const query = {
      serviceName: columns[1][index],
      destinationCode: columns[2][index],
      weightKg,
    };
    return {
      index: index + 1,
      waybill,
      service: query.serviceName,
      destination: query.destinationCode,
      weightKg,
      systemPrice,
      result: queryFreightRate(props.dataset, query),
    };
  });
}

function tsv(): string {
  const header = [
    "序号",
    "运单号",
    "渠道",
    "目的地",
    "重量KG",
    "系统价格",
    "单价",
    "差价",
    "金额",
    "币种",
    "状态",
    "说明",
  ];
  const body = rows.value.map((row) => {
    if (row.result.success) {
      return [
        row.index,
        row.waybill,
        row.service,
        row.destination,
        row.weightKg,
        row.systemPrice.toFixed(2),
        row.result.rate.unitPrice.toFixed(2),
        (row.result.rate.unitPrice - row.systemPrice).toFixed(2),
        row.result.amount.toFixed(2),
        row.result.rate.currency,
        "成功",
        row.result.explanation.slice(0, 3).join("；"),
      ];
    }
    return [
      row.index,
      row.waybill,
      row.service,
      row.destination,
      row.weightKg,
      row.systemPrice.toFixed(2),
      "",
      "",
      "",
      "",
      "未匹配",
      row.result.message,
    ];
  });
  return [header, ...body].map((row) => row.join("\t")).join("\n");
}

async function copyResults() {
  if (!rows.value.length) return;
  await navigator.clipboard.writeText(tsv());
  copyStatus.value = "已复制，可直接粘贴到 Excel";
}

async function exportWorkbook() {
  if (!rows.value.length) return;
  try {
    const fileName = await downloadPriceAdjustmentWorkbook(rows.value.map((row) => ({
      waybill: row.waybill,
      service: row.service,
      destination: row.destination,
      weightKg: row.weightKg,
      systemPrice: row.systemPrice,
      applicationUnitPrice: row.result.success ? row.result.rate.unitPrice : undefined,
    })), props.companyName);
    copyStatus.value = `已生成 ${fileName}`;
  } catch (error) {
    copyStatus.value = error instanceof Error ? `生成失败：${error.message}` : "生成失败";
  }
}
</script>

<template>
  <section class="batch-layout">
    <article class="panel batch-input-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">BATCH QUOTE</p>
          <h2>按列粘贴，逐行对应</h2>
          <p class="muted">
            从 Excel 复制一整列，分别粘贴到下面五个框中。每一行会一一对应。
          </p>
        </div>
        <button class="secondary-button" type="button" @click="generate">
          生成批量报价
        </button>
      </div>

      <div class="paste-grid">
        <label
          ><span
            >运单号 <b>{{ inputCounts.waybills }} 行</b></span
          ><textarea v-model="waybills" spellcheck="false" />
        </label>
        <label
          ><span
            >渠道名称 <b>{{ inputCounts.services }} 行</b></span
          ><textarea v-model="services" spellcheck="false" />
        </label>
        <label
          ><span
            >目的仓 / 区域 <b>{{ inputCounts.destinations }} 行</b></span
          ><textarea v-model="destinations" spellcheck="false" />
        </label>
        <label
          ><span
            >计费重量 KG <b>{{ inputCounts.weights }} 行</b></span
          ><textarea v-model="weights" spellcheck="false" />
        </label>
        <label
          ><span
            >系统价格 <b>{{ inputCounts.systemPrices }} 行</b></span
          ><textarea v-model="systemPrices" spellcheck="false" placeholder="每行一个系统单价" />
        </label>
      </div>
      <p v-if="validationMessage" class="validation-error">
        {{ validationMessage }}
      </p>
    </article>

    <article class="panel batch-result-panel">
      <div class="batch-result-header">
        <div>
          <p class="eyebrow">BATCH RESULT</p>
          <h2>报价结果</h2>
          <p class="muted">
            共 {{ rows.length }} 行，成功 {{ successCount }} 行，未匹配
            {{ rows.length - successCount }} 行
          </p>
        </div>
        <div class="copy-group">
          <span>{{ copyStatus }}</span>
          <button
            class="copy-button"
            type="button"
            :disabled="!rows.length"
            @click="copyResults"
          >
            复制结果表
          </button>
          <button
            class="export-button"
            type="button"
            :disabled="!rows.length"
            @click="exportWorkbook"
          >
            生成异价导入表
          </button>
        </div>
      </div>

      <div v-if="rows.length" class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>运单号</th>
              <th>渠道</th>
              <th>目的地</th>
              <th>重量</th>
              <th>系统价格</th>
              <th>单价</th>
              <th>差价</th>
              <th>金额</th>
              <th>状态 / 依据</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="`${row.index}-${row.waybill}`"
              :class="{ failed: !row.result.success }"
            >
              <td>{{ row.index }}</td>
              <td class="mono">{{ row.waybill }}</td>
              <td>{{ row.service }}</td>
              <td>{{ row.destination }}</td>
              <td>{{ row.weightKg }} KG</td>
              <td class="money">¥{{ row.systemPrice.toFixed(2) }}</td>
              <template v-if="row.result.success">
                <td class="money">
                  ¥{{ row.result.rate.unitPrice.toFixed(2) }}
                </td>
                <td class="money" :class="{ negative: row.result.rate.unitPrice - row.systemPrice < 0 }">
                  {{ row.result.rate.unitPrice - row.systemPrice >= 0 ? '+' : '' }}{{ (row.result.rate.unitPrice - row.systemPrice).toFixed(2) }}
                </td>
                <td class="money">¥{{ row.result.amount.toFixed(2) }}</td>
                <td>
                  <span class="status success">成功</span
                  ><small
                    >{{ row.result.rate.source.sheetName }} ·
                    {{ row.result.rate.source.cells.join("/") }}</small
                  >
                </td>
              </template>
              <template v-else>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>
                  <span class="status error">未匹配</span
                  ><small>{{ row.result.message }}</small>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="batch-empty-state">
        <div class="batch-empty-icon" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div>
          <h3>还没有报价结果</h3>
          <p>在上方分别粘贴五列数据，然后点击“生成批量报价”。</p>
        </div>
        <div class="batch-empty-steps" aria-label="批量报价操作步骤">
          <span><b>1</b> 按列粘贴</span>
          <i></i>
          <span><b>2</b> 检查行数</span>
          <i></i>
          <span><b>3</b> 生成结果</span>
        </div>
      </div>
    </article>
  </section>
</template>
