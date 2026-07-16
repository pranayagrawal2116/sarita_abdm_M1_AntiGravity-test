/**
 * Header: callbackEventModel.js
 * Purpose: Structure defining callback event log models.
 * Responsibility: Track received webhook headers and metadata.
 * TODO: Map keys to structured event schema databases.
 */

class CallbackEventModel {
  constructor() {
    this.eventId = "";
    this.eventType = "";
    this.receivedAt = "";
    this.payload = {};
  }
}

module.exports = CallbackEventModel;
