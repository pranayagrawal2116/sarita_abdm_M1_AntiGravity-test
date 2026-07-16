/**
 * Header: consentModel.js
 * Purpose: Structure defining consent metadata attributes.
 * Responsibility: Enforce fields required during patient consent requests.
 * TODO: Map keys to JSON consent schemas.
 */

class ConsentModel {
  constructor() {
    this.consentId = "";
    this.status = "";
    this.purpose = "";
    this.hiTypes = [];
    this.expiry = "";
  }
}

module.exports = ConsentModel;
