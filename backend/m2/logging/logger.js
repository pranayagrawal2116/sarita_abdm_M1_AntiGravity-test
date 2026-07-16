/**
 * Header: logger.js
 * Purpose: Centralized logging helper for M2 modules.
 * Responsibility: Format, filter, and write structured logs to output streams.
 * TODO: Integrate with database/file storage or advanced transport layers in future prompts.
 */

class Logger {
  /**
   * Logs an informational message.
   * @param {string} moduleName - Name of the module logging the message.
   * @param {string} message - Log message.
   * @param {Object} [meta] - Optional metadata context.
   */
  static info(moduleName, message, meta = {}) {
    const logObj = {
      timestamp: new Date().toISOString(),
      level: "INFO",
      module: moduleName,
      message,
      meta
    };
    console.log(JSON.stringify(logObj));
  }

  /**
   * Logs a warning message.
   * @param {string} moduleName - Name of the module logging the warning.
   * @param {string} message - Warning message.
   * @param {Object} [meta] - Optional metadata context.
   */
  static warn(moduleName, message, meta = {}) {
    const logObj = {
      timestamp: new Date().toISOString(),
      level: "WARN",
      module: moduleName,
      message,
      meta
    };
    console.warn(JSON.stringify(logObj));
  }

  /**
   * Logs an error message.
   * @param {string} moduleName - Name of the module logging the error.
   * @param {string} message - Error message.
   * @param {Object} [meta] - Optional metadata context or error object.
   */
  static error(moduleName, message, meta = {}) {
    const logObj = {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      module: moduleName,
      message,
      meta: meta instanceof Error ? { error: meta.message, stack: meta.stack } : meta
    };
    console.error(JSON.stringify(logObj));
  }
}

module.exports = Logger;
