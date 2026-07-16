/**
 * Header: hiRequestModel.js
 * Purpose: Structure defining Gateway HIRequest parameters.
 * Responsibility: Track keys and nonces passed during transfer init calls.
 * TODO: Integrate validations and schemas.
 */

class HiRequestModel {
  constructor() {
    this.transactionId = "";
    this.consentId = "";
    this.dataPushUrl = "";
    this.hiuPublicKey = "";
    this.hiuNonce = "";
  }
}

module.exports = HiRequestModel;
