/**
 * Header: validationMiddleware.js
 * Purpose: Validates incoming request parameters using designated validators.
 * Responsibility: Run validators, intercept errors, and return HTTP 400 on violations.
 * TODO: Map routes dynamically to specific validation schemas.
 */

const Logger = require("../logging/logger");

module.exports = (validatorFunc) => {
  return (req, res, next) => {
    Logger.info("validationMiddleware", "Input validation checks triggered.");
    if (validatorFunc) {
      const err = validatorFunc(req.body);
      if (err) {
        Logger.warn("validationMiddleware", "Validation check failed.", { error: err });
        return res.status(400).json({ error: err });
      }
    }
    next();
  };
};
