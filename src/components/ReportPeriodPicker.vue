<script setup>
// Bộ chọn kỳ báo cáo dùng chung (TRUST-913, DateRangePreset).
// v-model = { preset, from, to }. from/to chỉ có giá trị khi preset = CUSTOM.
// FE KHÔNG tự tính ngày từ preset; kỳ đã resolve được hiển thị từ response của server (prop `resolved`).
import { computed, watch } from 'vue';
import { DATE_RANGE_PRESETS } from '../api.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  resolved: { type: Object, default: null }, // { from, to } lấy từ response
  fieldErrors: { type: Object, default: () => ({}) }, // { preset: [...], from: [...], to: [...] }
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue', 'validity']);

const isCustom = computed(() => props.modelValue.preset === 'CUSTOM');

function patch(change) {
  emit('update:modelValue', { ...props.modelValue, ...change });
}

function onPreset(e) {
  const preset = e.target.value;
  // Đổi sang preset khác CUSTOM thì xóa from/to: không được gửi chúng.
  patch(preset === 'CUSTOM' ? { preset } : { preset, from: '', to: '' });
}

// Kiểm tra trước ở UI (server vẫn kiểm tra lại): đủ cả hai ngày, to >= from, tối đa 366 ngày (inclusive).
const clientError = computed(() => {
  if (!isCustom.value) return '';
  const { from, to } = props.modelValue;
  if (!from || !to) return 'Chọn đủ ngày bắt đầu và ngày kết thúc.';
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 'Ngày không hợp lệ.';
  if (b < a) return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.';
  const days = Math.round((b - a) / 86400000) + 1;
  if (days > 366) return `Khoảng thời gian ${days} ngày, tối đa 366 ngày.`;
  return '';
});

watch(clientError, (v) => emit('validity', !v), { immediate: true });

const errs = (k) => props.fieldErrors?.[k] || [];
</script>

<template>
  <div class="picker">
    <label class="fld">
      <span>Kỳ báo cáo</span>
      <select :value="modelValue.preset" :disabled="disabled" @change="onPreset">
        <option v-for="p in DATE_RANGE_PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
      <small v-for="m in errs('preset')" :key="m" class="err">{{ m }}</small>
    </label>

    <template v-if="isCustom">
      <label class="fld">
        <span>Từ ngày (giờ VN)</span>
        <input type="date" :value="modelValue.from" :disabled="disabled" @input="patch({ from: $event.target.value })" />
        <small v-for="m in errs('from')" :key="m" class="err">{{ m }}</small>
      </label>
      <label class="fld">
        <span>Đến ngày (giờ VN)</span>
        <input type="date" :value="modelValue.to" :disabled="disabled" @input="patch({ to: $event.target.value })" />
        <small v-for="m in errs('to')" :key="m" class="err">{{ m }}</small>
      </label>
    </template>

    <div v-if="resolved" class="resolved">
      Kỳ báo cáo: <strong>{{ resolved.from }} – {{ resolved.to }}</strong>
    </div>
    <small v-if="clientError" class="err block">{{ clientError }}</small>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.fld { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--text-muted); }
.fld select, .fld input { min-width: 150px; }
.resolved { font-size: 0.85rem; align-self: center; }
.err { color: var(--danger); font-size: 0.75rem; }
.err.block { flex-basis: 100%; }
</style>
