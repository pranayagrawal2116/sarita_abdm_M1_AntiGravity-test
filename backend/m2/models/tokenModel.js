/**
 * Header: tokenModel.js
 * Purpose: Structure defining properties of persistent cached tokens.
 * Responsibility: Enforce fields required in tokenStore file mapping.
 * TODO: Map keys to JSON schemas in future prompts.
 */

class TokenModel {
  constructor() {
    this.gatewayToken = "";
    this.gatewayTokenExpiresAt = 0;
  }
}

module.exports = TokenModel;
