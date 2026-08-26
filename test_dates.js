const M3ConsentStore = require('./backend/m3/store/M3ConsentStore');
M3ConsentStore.load();
const c = M3ConsentStore.consents[M3ConsentStore.consents.length - 1];
console.log(JSON.stringify(c, null, 2));
