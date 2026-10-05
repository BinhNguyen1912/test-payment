import { reactive } from 'vue';
// Ids shared between the shop and the actor console. Filled ONLY from real API responses or typed by the tester.
export const ctx = reactive({ txnRef: '', orderId: '', voucherId: '', productId: '', payoutId: '', settlementId: '', pin: '' });

/** Selectable ids (from public/accounts.local.json, plus anything discovered by API). The tester can still type any value. */
export const presets = reactive({ parties: [] });
export function addPreset(id, label) {
  if (id && !presets.parties.some((p) => p.id === String(id))) presets.parties.push({ id: String(id), label });
}
