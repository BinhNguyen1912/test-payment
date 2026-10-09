import { createApp } from 'vue';
import App from './App.vue';
import Shop from './components/Shop.vue';
import ActorConsole from './components/ActorConsole.vue';
import MoneyFlow from './components/MoneyFlow.vue';
import OverviewFlow from './components/OverviewFlow.vue';
import { startFieldAnnotations } from './fieldAnnotate.js';
import MerchantStudio from './components/MerchantStudio.vue';
import LineageDock from './components/LineageDock.vue';
import ReconStudio from './components/ReconStudio.vue';
import PaymentReconScreen from './components/PaymentReconScreen.vue';
import VoucherRedeem from './components/VoucherRedeem.vue';
import './lineageStore.js';
import { loadLocalAccounts } from './api.js'; // installs the API lineage hook before any request is made
import './styles.css';

await loadLocalAccounts();
createApp(App).mount('#app');
const dock = document.createElement('div');
dock.id = 'lineage-dock';
document.body.appendChild(dock);
createApp(LineageDock).mount(dock);
const dockContainer = document.createElement('div');
dockContainer.id = 'app-floating-dock';
document.body.appendChild(dockContainer);

const shop = document.createElement('div');
shop.id = 'shop-root';
dockContainer.appendChild(shop);
createApp(Shop).mount(shop);

const ac = document.createElement('div');
ac.id = 'actor-console-root';
dockContainer.appendChild(ac);
createApp(ActorConsole).mount(ac);

const mf = document.createElement('div');
mf.id = 'money-flow-root';
dockContainer.appendChild(mf);
createApp(MoneyFlow).mount(mf);

const ov = document.createElement('div');
ov.id = 'overview-flow-root';
dockContainer.appendChild(ov);
createApp(OverviewFlow).mount(ov);

const ms = document.createElement('div');
ms.id = 'merchant-studio-root';
dockContainer.appendChild(ms);
createApp(MerchantStudio).mount(ms);

const rs = document.createElement('div');
rs.id = 'recon-studio-root';
dockContainer.appendChild(rs);
createApp(ReconStudio).mount(rs);

const pr = document.createElement('div');
pr.id = 'payrecon-root';
dockContainer.appendChild(pr);
createApp(PaymentReconScreen).mount(pr);

const vr = document.createElement('div');
vr.id = 'voucher-redeem-root';
dockContainer.appendChild(vr);
createApp(VoucherRedeem).mount(vr);
startFieldAnnotations();
