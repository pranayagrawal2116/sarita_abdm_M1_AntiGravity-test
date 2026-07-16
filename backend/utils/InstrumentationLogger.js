// utils/InstrumentationLogger.js
// Simple instrumentation logger for transaction lifecycle events.
// Writes JSON lines to a log file for later analysis.

const fs = require('fs');
const path = require('path');

// Log file location (project root)
const LOG_FILE = path.resolve(__dirname, '..', 'instrumentation.log');

/**
 * Append a JSON entry to the instrumentation log.
 * @param {string} event - Event name (e.g., 'createTransaction', 'updateTransaction').
 * @param {Object} details - Arbitrary details to record.
 */
function log(event, details) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      details,
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Fail silently to avoid breaking production flow.
    console.error('Instrumentation logger error:', err);
  }
}

module.exports = { log };
