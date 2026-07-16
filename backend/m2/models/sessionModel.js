/**
 * Header: sessionModel.js
 * Purpose: Structure defining Gateway session state attributes.
 * Responsibility: Track active session token and expiry context.
 * TODO: Map properties to session schema definitions.
 */

class SessionModel {
  constructor() {
    this.accessToken = "";
    this.expiresIn = 0;
    this.createdAt = 0;
  }
}

module.exports = SessionModel;
