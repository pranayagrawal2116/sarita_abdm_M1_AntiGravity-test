/**
 * Header: errorHandlerMiddleware.js
 * Purpose: Centralized error catcher middleware.
 * Responsibility: Capture unhandled exceptions, log them, format standard JSON errors, and return status codes.
 * TODO: Map specific error instances to customized status payloads.
 */

const Logger = require("../logging/logger");

module.exports = (err, req, res, next) => {
  Logger.error("errorHandlerMiddleware", "Unhandled error intercepted.", err);
  
  const status = err.status || 500;
  const message = err.message || "An unexpected error occurred.";
  
  res.status(status).json({
    error: message,
    statusCode: status
  });
};
