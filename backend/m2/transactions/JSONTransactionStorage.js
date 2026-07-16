/**
 * Header: JSONTransactionStorage.js
 * Purpose: JSON file storage implementation for M2 transaction persistence.
 * Responsibility: Reads and writes transaction objects to a local JSON file.
 * Methods:
 *   - read()
 *   - write(data)
 */

const fs = require("fs");
const path = require("path");
const Logger = require("../logging/logger");
const config = require("../helpers/config");

class JSONTransactionStorage {
  /**
   * Assures that the storage directory exists.
   */
  init() {
    try {
      const dir = path.dirname(config.transactionStoreFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        Logger.info("JSONTransactionStorage", `Created directory: ${dir}`);
      }
    } catch (err) {
      Logger.error("JSONTransactionStorage", "Failed to initialize storage directory.", err);
    }
  }

  /**
   * Reads transactions from local JSON file.
   * Handles missing/corrupted file gracefully by returning an empty dictionary.
   * @returns {Object} Dictionary of transactions.
   */
  read() {
    Logger.info("JSONTransactionStorage", `Reading transactions from file: ${config.transactionStoreFile}`);
    if (!fs.existsSync(config.transactionStoreFile)) {
      Logger.warn("JSONTransactionStorage", "Transactions file does not exist. Returning empty dictionary.");
      return {};
    }

    try {
      const data = fs.readFileSync(config.transactionStoreFile, "utf8");
      return JSON.parse(data || "{}");
    } catch (err) {
      Logger.error("JSONTransactionStorage", "Failed to read or parse transactions file. Returning empty dictionary.", err);
      return {};
    }
  }

  /**
   * Commits the transactions dictionary to local JSON file.
   * @param {Object} data - Dictionary of transactions.
   */
  write(data) {
    Logger.info("JSONTransactionStorage", `Writing transactions to file: ${config.transactionStoreFile}`);
    this.init(); // Ensure directory exists

    try {
      const serialized = JSON.stringify(data || {}, null, 2);
      fs.writeFileSync(config.transactionStoreFile, serialized, "utf8");
      Logger.info("JSONTransactionStorage", "M2 transaction file written successfully.", {
        file: config.transactionStoreFile,
        transactionCount: Object.keys(data || {}).length
      });
    } catch (err) {
      Logger.error("JSONTransactionStorage", "Failed to write transactions file.", err);
    }
  }
}

module.exports = JSONTransactionStorage;
