/**
 * Header: hiResponseModel.js
 * Purpose: Structure defining HIP responses to Gateway data requests.
 * Responsibility: Track acknowledgement context responses.
 * TODO: Map keys to gateway schemas.
 */

class HiResponseModel {
  constructor() {
    this.transactionId = "";
    this.sessionStatus = "ACKNOWLEDGED";
    this.requestId = "";
  }
}

module.exports = HiResponseModel;
