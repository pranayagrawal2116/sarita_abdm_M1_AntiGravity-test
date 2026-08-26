const M3ConsentStore = require('./backend/m3/store/M3ConsentStore');
M3ConsentStore.load();
const fetchedConsents = M3ConsentStore.consents.filter(c => c.status === 'FETCHED');
console.log(JSON.stringify(fetchedConsents[fetchedConsents.length - 1], null, 2).substring(0, 3000));
