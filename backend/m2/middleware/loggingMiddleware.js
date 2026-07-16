/**
 * Header: loggingMiddleware.js
 * Purpose: Logs details of incoming HTTP requests for M2 routes.
 * Responsibility: Capture incoming method, URL, headers, and log status code on completion.
 * TODO: Mask sensitive parameters like authorization tokens.
 */

const Logger = require("../logging/logger");

module.exports = (req, res, next) => {
  Logger.info("loggingMiddleware", `Incoming request: ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    Logger.info("loggingMiddleware", `Request completed: ${req.method} ${req.originalUrl} -> Status ${res.statusCode}`);
  });
  next();
};
