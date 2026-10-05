<script setup>
import { computed } from 'vue';
// Renders ANY JSON as tables: array of objects -> one table with every column; object -> key/value table; nested values recurse.
defineOptions({ name: 'DataView' });
const props = defineProps({ data: { default: null }, depth: { type: Number, default: 0 }, onPick: { type: Function, default: null } });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRows = (v) => Array.isArray(v) && v.length > 0 && v.every(isObj);
const cols = computed(() => {
  if (!isRows(props.data)) return [];
  const set = new Set();
  props.data.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
  return [...set];
});
const entries = computed(() => (isObj(props.data) ? Object.entries(props.data) : []));
const scalar = (v) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
const isComplex = (v) => v !== null && typeof v === 'object';
const flagClass = (k, v) => {
  if (typeof v === 'boolean') return v ? 'dv-t' : 'dv-f';
  if (/count$/i.test(k) && typeof v === 'number') return v === 0 ? 'dv-t' : 'dv-f';
  if (/^(status|state)$/i.test(k) && typeof v === 'string') return /SUCCESS|ACTIVE|POSTED|FULFILLED|APPROVED|SUCCEEDED|PAID|CLEAR/i.test(v) ? 'dv-t' : /FAIL|REJECT|CANCEL|EXPIRED|BLOCK/i.test(v) ? 'dv-f' : '';
  return '';
};
</script>

<template>
  <div class="dv">
    <p v-if="Array.isArray(data) && !data.length" class="dv-empty">Danh sách rỗng</p>
    <div v-else-if="isRows(data)" class="dv-scroll">
      <table class="dv-t">
        <thead><tr><th class="dv-i">#</th><th v-for="c in cols" :key="c">{{ c }}</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in data" :key="i" :class="{ 'dv-pick': onPick }" @click="onPick && onPick(r)">
            <td class="dv-i">{{ i + 1 }}</td>
            <td v-for="c in cols" :key="c" :class="flagClass(c, r[c])">
              <DataView v-if="isComplex(r[c])" :data="r[c]" :depth="depth + 1" />
              <template v-else>{{ scalar(r[c]) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul v-else-if="Array.isArray(data)" class="dv-list"><li v-for="(v, i) in data" :key="i"><DataView v-if="isComplex(v)" :data="v" :depth="depth + 1" /><template v-else>{{ scalar(v) }}</template></li></ul>
    <table v-else-if="isObj(data)" class="dv-t dv-kv">
      <tbody>
        <tr v-for="[k, v] in entries" :key="k">
          <th>{{ k }}</th>
          <td :class="flagClass(k, v)"><DataView v-if="isComplex(v)" :data="v" :depth="depth + 1" /><template v-else>{{ scalar(v) }}</template></td>
        </tr>
      </tbody>
    </table>
    <span v-else>{{ scalar(data) }}</span>
  </div>
</template>

<style>
.dv { font-size: 12px; color: #14301f; } .dv-empty { color: #15803d; margin: 4px 0; }
.dv-scroll { overflow: auto; max-height: 420px; border: 1px solid #bbf7d0; border-radius: 6px; }
.dv .dv-t { border-collapse: collapse; width: auto; background: #fff; } .dv .dv-t th, .dv .dv-t td { border: 1px solid #d9f2e1; padding: 3px 8px; vertical-align: top; color: #14301f; font-size: 12px; text-transform: none; letter-spacing: 0; text-align: left; background: #fff; white-space: nowrap; }
.dv .dv-t thead th { background: #dcfce7; color: #14532d; position: sticky; top: 0; z-index: 1; }
.dv .dv-kv th { background: #f0fdf4; color: #166534; font-weight: 600; width: 1%; }
.dv .dv-t td .dv { margin: 0; } .dv .dv-t td .dv-scroll { max-height: 200px; } .dv .dv-t td .dv-t { margin: -1px; }
.dv .dv-i { color: #86a894; width: 1%; text-align: right !important; }
.dv tr.dv-pick { cursor: pointer; } .dv tr.dv-pick:hover td { background: #f0fdf4; }
.dv td.dv-t, .dv td.dv-t * { } .dv .dv-t td.dv-t { color: #15803d; font-weight: 600; } .dv .dv-t td.dv-f { color: #b91c1c; font-weight: 600; background: #fef2f2; }
.dv-list { margin: 0; padding-left: 16px; }
</style>
