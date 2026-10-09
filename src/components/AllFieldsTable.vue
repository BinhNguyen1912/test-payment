<script setup>
// Renders EVERY field the BE returned (union of keys across rows). Nested objects/arrays are shown as compact JSON,
// so nothing the API sends is hidden by a hand-picked column list.
import { computed } from 'vue';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  title: { type: String, default: 'Tất cả field BE trả về' },
  open: { type: Boolean, default: false },
  table: { type: String, default: '' }, // DB table(s) the data is read from
});

const list = computed(() => (Array.isArray(props.rows) ? props.rows : props.rows ? [props.rows] : []));
const columns = computed(() => {
  const seen = [];
  for (const r of list.value) for (const k of Object.keys(r || {})) if (!seen.includes(k)) seen.push(k);
  return seen;
});
const cell = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
</script>

<template>
  <details v-if="list.length" :open="open" style="margin-top: 8px;">
    <summary class="muted" style="cursor: pointer; font-size: 0.8rem;">{{ title }} ({{ list.length }} dòng × {{ columns.length }} cột)<code v-if="table" style="margin-left: 8px; background: #eef2ff; color: #3730a3; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem;">DB: {{ table }}</code></summary>
    <div class="table-container" style="max-height: 360px; overflow: auto;">
      <table>
        <thead><tr><th v-for="c in columns" :key="c" class="mono" style="font-size: 0.7rem; white-space: nowrap;">{{ c }}</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in list" :key="i">
            <td v-for="c in columns" :key="c" class="mono" style="font-size: 0.7rem; max-width: 320px; word-break: break-all;">{{ cell(r?.[c]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>
