const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class UserInitState {
  constructor() {
    this.storePath = path.join(__dirname, '../../../data', 'user_init_state.json');
    this._ensureStore();
  }

  _ensureStore() {
    if (!fs.existsSync(path.dirname(this.storePath))) {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    }
    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, JSON.stringify({}), 'utf8');
    }
  }

  _readStore() {
    try {
      const data = fs.readFileSync(this.storePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error("Error reading UserInitState:", e);
      return {};
    }
  }

  _writeStore(state) {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      console.error("Error writing UserInitState:", e);
    }
  }

  createTransaction(data) {
    const state = this._readStore();
    const transactionId = data.transactionId || uuidv4();
    state[transactionId] = {
      ...data,
      transactionId,
      createdAt: new Date().toISOString(),
      status: "DISCOVERED"
    };
    this._writeStore(state);
    return state[transactionId];
  }

  getTransaction(transactionId) {
    const state = this._readStore();
    return state[transactionId];
  }

  updateTransaction(transactionId, updates) {
    const state = this._readStore();
    if (state[transactionId]) {
      state[transactionId] = { ...state[transactionId], ...updates, updatedAt: new Date().toISOString() };
      this._writeStore(state);
      return state[transactionId];
    }
    return null;
  }

  findTransactionByLinkRefNumber(linkRefNumber) {
    if (!linkRefNumber) return null;
    const state = this._readStore();
    return Object.values(state).find((transaction) =>
      transaction && transaction.linkRefNumber === linkRefNumber
    ) || null;
  }

  getCareContextReferenceForDocument(documentFileName) {
    if (!documentFileName) return "";
    const state = this._readStore();
    for (const transaction of Object.values(state)) {
      const match = (transaction?.careContextsMap || []).find(
        (context) => context.documentFileName === documentFileName
      );
      if (match?.referenceNumber) return match.referenceNumber;
    }
    return "";
  }
}

module.exports = new UserInitState();
