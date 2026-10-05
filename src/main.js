import { createApp } from 'vue';
import App from './App.vue';
import Shop from './components/Shop.vue';
import ActorConsole from './components/ActorConsole.vue';
import MoneyFlow from './components/MoneyFlow.vue';
import { startFieldAnnotations } from './fieldAnnotate.js';
import MerchantStudio from './components/MerchantStudio.vue';
import LineageDock from './components/LineageDock.vue';
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

const ms = document.createElement('div');
ms.id = 'merchant-studio-root';
dockContainer.appendChild(ms);
createApp(MerchantStudio).mount(ms);
startFieldAnnotations();
