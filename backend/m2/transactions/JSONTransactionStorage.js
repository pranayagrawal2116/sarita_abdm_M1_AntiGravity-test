/**
 * Header: JSONTransactionStorage.js
 * Purpose: JSON file storage implementation for M2 transaction persistence.
 * Responsibility: Reads and writes transaction objects to a local JSON file atomically and safely.
 */

const fs = require("fs");
const path = require("path");
const Logger = require("../logging/logger");
const config = require("../helpers/config");

class JSONTransactionStorage {
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

  read() {
    Logger.info("JSONTransactionStorage", `Reading transactions from file: ${config.transactionStoreFile}`);
    if (!fs.existsSync(config.transactionStoreFile)) {
      Logger.warn("JSONTransactionStorage", "Transactions file does not exist. Returning empty dictionary.");
      return {};
    }

    let data;
    try {
      data = fs.readFileSync(config.transactionStoreFile, "utf8");
    } catch (err) {
      Logger.error("JSONTransactionStorage", "Filesystem error while reading transactions file.", err);
      throw err;
    }

    if (!data || data.trim() === "") {
      Logger.warn("JSONTransactionStorage", "Transactions file is empty. Returning empty dictionary.");
      return {};
    }

    try {
      return JSON.parse(data);
    } catch (err) {
      // PROMPT #6: CORRUPTED JSON MUST FAIL CLOSED. Do not return {} and allow overwrite.
      Logger.error("JSONTransactionStorage", "FATAL: Transactions file contains invalid JSON. Failing closed to prevent corruption overwrite.", err);
      
      const backupPath = `${config.transactionStoreFile}.corrupted.${Date.now()}`;
      try {
        fs.copyFileSync(config.transactionStoreFile, backupPath);
        Logger.warn("JSONTransactionStorage", `Preserved corrupted transactions file at: ${backupPath}`);
      } catch (backupErr) {
        Logger.error("JSONTransactionStorage", "Failed to create backup of corrupted file.", backupErr);
      }
      
      throw new Error("TRANSACTION_STORE_CORRUPT: Failed to parse JSON transactions. Manual intervention required.");
    }
  }

  write(data) {
    Logger.info("JSONTransactionStorage", `Writing transactions to file: ${config.transactionStoreFile}`);
    this.init(); // Ensure directory exists

    // PROMPT #6: ATOMIC WRITE SAFETY
    let serialized;
    try {
      serialized = JSON.stringify(data || {}, null, 2);
    } catch (err) {
      Logger.error("JSONTransactionStorage", "Failed to serialize transactions to JSON.", err);
      throw err;
    }

    const tempFile = `${config.transactionStoreFile}.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`;

    try {
      fs.writeFileSync(tempFile, serialized, "utf8");
      
      // Node.js fs.renameSync overwrites the target safely on both Windows (Server 2016) and macOS.
      fs.renameSync(tempFile, config.transactionStoreFile);
      
      Logger.info("JSONTransactionStorage", "M2 transaction file written successfully and atomically.", {
        file: config.transactionStoreFile,
        transactionCount: Object.keys(data || {}).length
      });
    } catch (err) {
      Logger.error("JSONTransactionStorage", "Failed to write transactions file atomically.", err);
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupErr) {
          Logger.warn("JSONTransactionStorage", "Failed to clean up temporary file after write failure.", cleanupErr);
        }
      }
      throw err;
    }
  }
}

module.exports = JSONTransactionStorage;
