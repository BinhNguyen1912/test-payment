<script setup>
import { ref } from 'vue';
import { sessions, signIn } from '../api.js';
import ReconciliationExports from './ReconciliationExports.vue';

// Nút nổi trong dock (cạnh Merchant): mở màn hình Đối soát & Chứng từ, đăng nhập bằng tài khoản admin nhập tay
// (cùng cách MerchantStudio: dùng session `approver`, nhập đúng tk/mk admin đang dùng được trên web).
const open = ref(location.hash.startsWith('#recon'));
const adm = sessions.approver;
adm.clientId = adm.clientId || 'user';
const err = ref('');
const busy = ref(false);

async function login() {
  err.value = '';
  busy.value = true;
  try {
    await signIn(adm);
  } catch (e) {
    err.value = `${e.code || ''} ${e.message || e}`.trim();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button class="rs-fab" @click="open = !open">🧾 Đối soát &amp; Chứng từ</button>
  <div v-if="open" class="rs">
    <header class="rs-head">
      <b>Đối soát &amp; Chứng từ</b>
      <span class="rs-sp" />
      <label>Tài khoản admin <input v-model="adm.identifier" placeholder="sđt / email" autocomplete="username" /></label>
      <label>Mật khẩu <input v-model="adm.password" type="password" autocomplete="current-password" @keyup.enter="login" /></label>
      <button class="rs-go" :disabled="!adm.identifier || !adm.password || busy" @click="login">
        {{ busy ? 'Đang đăng nhập…' : adm.accessToken ? 'Đăng nhập lại' : 'Đăng nhập admin' }}
      </button>
      <span v-if="adm.accessToken" class="rs-ok">đã đăng nhập</span>
      <button @click="open = false">Đóng</button>
    </header>
    <p v-if="err" class="rs-err">{{ err }}</p>
    <div class="rs-body">
      <ReconciliationExports />
    </div>
  </div>
</template>

<style>
.rs { position: fixed; inset: 0; z-index: 9800; background: var(--bg-app); color: var(--text-main); overflow: auto; }
.rs-head { display: flex; gap: 12px; align-items: flex-end; padding: 12px 20px; background: #14532d; color: #fff; position: sticky; top: 0; z-index: 3; flex-wrap: wrap; }
.rs-head label { display: inline-flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: #bbf7d0; }
.rs-head input { width: 190px; padding: 6px 10px; border: 1px solid #86efac; border-radius: 6px; font-size: 12.5px; background: #fff; color: #14301f; }
.rs-head button { cursor: pointer; background: #fff; color: #14301f; border: 1px solid #86efac; border-radius: 6px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; }
.rs-head button.rs-go { background: #16a34a; color: #fff; border-color: #16a34a; }
.rs-head button:disabled { opacity: .5; cursor: not-allowed; }
.rs-sp { flex: 1; }
.rs-ok { color: #bbf7d0; font-weight: 600; font-size: 12.5px; align-self: center; }
.rs-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 8px 14px; margin: 8px 20px; border-radius: 6px; font-size: 12px; }
.rs-body { max-width: 1480px; margin: 0 auto; padding: 20px 20px 80px; }
</style>
