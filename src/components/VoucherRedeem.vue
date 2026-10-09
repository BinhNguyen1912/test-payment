<script setup>
import { ref } from 'vue';
import RedeemCustomer from './RedeemCustomer.vue';
import RedeemMerchant from './RedeemMerchant.vue';

// Nút nổi trong dock: màn hình test luồng đổi voucher với 2 vai trò (khách hàng / thu ngân).
const open = ref(location.hash.startsWith('#redeem'));
const tab = ref('customer');
</script>

<template>
  <button class="vr-fab" @click="open = !open">🎟️ Đổi voucher</button>
  <div v-if="open" class="vr">
    <header class="vr-head">
      <b>Đổi voucher (Redeem)</b>
      <div class="vr-tabs">
        <button :class="{ on: tab === 'customer' }" @click="tab = 'customer'">Khách hàng</button>
        <button :class="{ on: tab === 'merchant' }" @click="tab = 'merchant'">Thu ngân</button>
      </div>
      <span class="vr-sp" />
      <button @click="open = false">Đóng</button>
    </header>
    <div class="vr-body">
      <RedeemCustomer v-show="tab === 'customer'" />
      <RedeemMerchant v-show="tab === 'merchant'" />
    </div>
  </div>
</template>

<style>
.vr { position: fixed; inset: 0; z-index: 9800; background: var(--bg-app, #f6fdf8); color: var(--text-main, #14301f); overflow: auto; }
.vr-head { display: flex; gap: 14px; align-items: center; padding: 12px 20px; background: #14532d; color: #fff; position: sticky; top: 0; z-index: 3; }
.vr-head button { cursor: pointer; background: #fff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; }
.vr-tabs { display: flex; gap: 6px; }
.vr-tabs button.on { background: #16a34a; color: #fff; border-color: #16a34a; }
.vr-sp { flex: 1; }
.vr-body { max-width: 1100px; margin: 0 auto; padding: 20px 20px 80px; }
</style>
