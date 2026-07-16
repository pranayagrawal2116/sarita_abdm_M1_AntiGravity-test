/**
 * Header: authModel.js
 * Purpose: Structure defining Client Credentials authentication properties.
 * Responsibility: Enforce fields representing gateway sessions credentials.
 * TODO: Convert to schema validator/ORM model definition in future prompts.
 */

class AuthModel {
  constructor() {
    this.clientId = "";
    this.clientSecret = "";
    this.grantType = "client_credentials";
  }
}

module.exports = AuthModel;
