/**
 * Header: M2TokenStore.js
 * Purpose: Storage abstraction interface for persistent M2 tokens.
 * Responsibility: Secure local storage operations (Init, Read, Write, Delete) for token caching.
 * Methods:
 *   - init()
 *   - read()
 *   - write(tokens)
 *   - delete()
 */

const fs = require("fs");
const path = require("path");
const Logger = require("../logging/logger");
const config = require("../helpers/config");

class M2TokenStore {
  /**
   * Initializes the persistent token store folder and directory.
   */
  init() {
    Logger.info("M2TokenStore", "Initializing local token storage directories.");
    try {
      if (!fs.existsSync(config.tokenStoreDir)) {
        fs.mkdirSync(config.tokenStoreDir, { recursive: true });
        Logger.info("M2TokenStore", `Created token store directory: ${config.tokenStoreDir}`);
      }
    } catch (err) {
      Logger.error("M2TokenStore", "Failed to initialize token storage directory.", err);
    }
  }

  /**
   * Reads cached token state from disk.
   * Handles missing or corrupted files gracefully.
   * @returns {Object} Token state model
   */
  read() {
    Logger.info("M2TokenStore", "Reading cached tokens from store file.");
    this.init(); // Ensure dir is initialized
    
    const filePath = path.join(config.tokenStoreDir, config.tokenStoreFile);
    if (!fs.existsSync(filePath)) {
      Logger.warn("M2TokenStore", "Token cache file does not exist. Returning empty bundle.");
      return {};
    }

    try {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);
      return parsed || {};
    } catch (err) {
      Logger.error("M2TokenStore", "Failed to read or parse token cache file. Corrupted file resolved as empty bundle.", err);
      // Clean up corrupted file
      this.delete();
      return {};
    }
  }

  /**
   * Commit updated token state to disk.
   * @param {Object} tokens - Active tokens bundle to write.
   */
  write(tokens) {
    Logger.info("M2TokenStore", "Writing updated tokens to store file.");
    this.init(); // Ensure dir is initialized

    const filePath = path.join(config.tokenStoreDir, config.tokenStoreFile);
    try {
      const serialized = JSON.stringify(tokens || {}, null, 2);
      fs.writeFileSync(filePath, serialized, "utf8");
      Logger.info("M2TokenStore", "Token state committed to disk successfully.");
    } catch (err) {
      Logger.error("M2TokenStore", "Failed to write token cache file.", err);
    }
  }

  /**
   * Cleans/deletes the cached tokens file.
   */
  delete() {
    Logger.info("M2TokenStore", "Clearing/deleting cached token storage.");
    const filePath = path.join(config.tokenStoreDir, config.tokenStoreFile);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        Logger.info("M2TokenStore", "Token cache file deleted from disk.");
      }
    } catch (err) {
      Logger.error("M2TokenStore", "Failed to delete token cache file.", err);
    }
  }

  // Static delegation wrappers to support backward compatibility
  static init() { return new M2TokenStore().init(); }
  static read() { return new M2TokenStore().read(); }
  static write(tokens) { return new M2TokenStore().write(tokens); }
  static delete() { return new M2TokenStore().delete(); }
}

module.exports = M2TokenStore;
