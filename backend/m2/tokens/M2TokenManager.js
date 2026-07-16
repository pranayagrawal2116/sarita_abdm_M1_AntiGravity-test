/**
 * Header: M2TokenManager.js
 * Purpose: Orchestrates token validation, parsing, and auto-refresh mechanisms.
 * Responsibility: Parse JWT fields, run buffer validation, and delegate renewals.
 * Methods:
 *   - initialize()
 *   - getValidAuthentication()
 *   - getValidSession()
 *   - getCurrentTokenState()
 *   - invalidate()
 *   - refreshIfRequired()
 *   - save(auth, session)
 *   - load()
 *   - remove()
 *   - validate(tokenBundle)
 *   - getGatewayToken()
 */

const Logger = require("../logging/logger");
const M2TokenStore = require("./M2TokenStore");
const M2AuthenticationManager = require("../authentication/M2AuthenticationManager");
const M2SessionManager = require("../session/M2SessionManager");
const config = require("../helpers/config");
const {
  maskStructured,
  configurationSnapshot,
  errorTrace
} = require("../logging/traceUtils");

class M2TokenManager {
  /**
   * Singleton constructor.
   * Accepts a pluggable storage provider to abstract disk persistence.
   * @param {Object} [storageProvider] - Conforming storage implementation.
   */
  constructor(storageProvider = new M2TokenStore()) {
    if (M2TokenManager.instance) {
      return M2TokenManager.instance;
    }

    this.storageProvider = storageProvider;
    this.cachedAuth = null;
    this.cachedSession = null;
    this.lastValidationTime = 0;
    this.initPromise = null; // Single-flight promise reference

    M2TokenManager.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2TokenManager} Singleton instance.
   */
  static getInstance() {
    if (!M2TokenManager.instance) {
      M2TokenManager.instance = new M2TokenManager();
    }
    return M2TokenManager.instance;
  }

  /**
   * Initializes the TokenManager authentication state.
   * Implements single-flight mutex protection to avoid parallel duplicate requests.
   * @returns {Promise<Object>} Active token bundle (auth and session objects)
   */
  async initialize() {
    Logger.info("M2TokenManager", "Method entered: initialize()", {
      configuration: configurationSnapshot(config)
    });

    if (this.initPromise) {
      Logger.info("M2TokenManager", "Initialization already in progress. Reusing active single-flight promise.", {
        exactReasonForFailure: null
      });
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        Logger.info("M2TokenManager", "Initializing TokenManager authentication state.", {
          configuration: configurationSnapshot(config)
        });
        const bundle = this.load();
        
        if (this.validate(bundle)) {
          Logger.info("M2TokenManager", "Token Loaded: Valid cached tokens found and reused.", {
            tokenState: maskStructured({
              auth: {
                success: bundle?.auth?.success,
                accessToken: bundle?.auth?.accessToken,
                expiresIn: bundle?.auth?.expiresIn,
                issuedAt: bundle?.auth?.issuedAt,
                source: bundle?.auth?.source
              },
              session: {
                success: bundle?.session?.success,
                accessToken: bundle?.session?.accessToken,
                expiresIn: bundle?.session?.expiresIn,
                createdAt: bundle?.session?.createdAt,
                source: bundle?.session?.source
              }
            }),
            exactReasonForFailure: null
          });
          return bundle;
        }

        Logger.info("M2TokenManager", "No valid cached tokens found. Launching B2B auto-recovery flow.", {
          cacheValidation: {
            hasBundle: Boolean(bundle),
            hasAuth: Boolean(bundle?.auth),
            hasSession: Boolean(bundle?.session)
          }
        });
        
        // Auth trigger
        Logger.info("M2TokenManager", "Authentication Triggered.", {
          nextMethod: "M2AuthenticationManager.authenticate"
        });
        const authObj = await M2AuthenticationManager.authenticate();
        Logger.info("M2TokenManager", "Authentication Result Received.", {
          auth: maskStructured({
            success: authObj?.success,
            accessToken: authObj?.accessToken,
            expiresIn: authObj?.expiresIn,
            issuedAt: authObj?.issuedAt,
            source: authObj?.source,
            error: authObj?.error,
            details: authObj?.details,
            status: authObj?.status,
            recoverable: authObj?.recoverable
          }),
          exactReasonForFailure: authObj?.success ? null : authObj?.details || authObj?.error
        });
        if (!authObj.success) {
          Logger.error("M2TokenManager", "Recovery failed: Gateway authentication error.", {
            auth: maskStructured(authObj),
            exactThrowLocation: "M2TokenManager.initialize() authObj.success check",
            exactReasonForFailure: authObj.details || authObj.error
          });
          throw new Error(`Authentication recovery failed: ${authObj.error}`);
        }

        // Session trigger
        Logger.info("M2TokenManager", "Session Triggered.", {
          nextMethod: "M2SessionManager.createSession"
        });
        const sessionObj = await M2SessionManager.createSession(authObj);
        Logger.info("M2TokenManager", "Session Result Received.", {
          session: maskStructured({
            success: sessionObj?.success,
            accessToken: sessionObj?.accessToken,
            expiresIn: sessionObj?.expiresIn,
            createdAt: sessionObj?.createdAt,
            source: sessionObj?.source,
            error: sessionObj?.error,
            details: sessionObj?.details,
            status: sessionObj?.status
          }),
          exactReasonForFailure: sessionObj?.success ? null : sessionObj?.details || sessionObj?.error
        });
        if (!sessionObj.success) {
          Logger.error("M2TokenManager", "Recovery failed: Gateway session creation error.", {
            session: maskStructured(sessionObj),
            exactThrowLocation: "M2TokenManager.initialize() sessionObj.success check",
            exactReasonForFailure: sessionObj.details || sessionObj.error
          });
          throw new Error(`Session recovery failed: ${sessionObj.error}`);
        }

        this.save(authObj, sessionObj);
        Logger.info("M2TokenManager", "Initialization completed successfully.", {
          tokenState: maskStructured({
            auth: { success: authObj.success, accessToken: authObj.accessToken, source: authObj.source },
            session: { success: sessionObj.success, accessToken: sessionObj.accessToken, source: sessionObj.source }
          })
        });
        return { auth: authObj, session: sessionObj };
      } catch (err) {
        Logger.error("M2TokenManager", "Initialization failed with exception.", {
          exception: errorTrace(err),
          exactReasonForFailure: err.message
        });
        throw err;
      } finally {
        this.initPromise = null; // Clear single-flight promise reference when resolved/rejected
      }
    })();

    return this.initPromise;
  }

  /**
   * Returns a valid Gateway B2B authentication token.
   * @returns {Promise<string>} B2B Auth Token
   */
  async getValidAuthentication() {
    Logger.info("M2TokenManager", "Method entered: getValidAuthentication()", {
      cachedAuth: maskStructured({
        success: this.cachedAuth?.success,
        accessToken: this.cachedAuth?.accessToken,
        expiresIn: this.cachedAuth?.expiresIn,
        issuedAt: this.cachedAuth?.issuedAt,
        source: this.cachedAuth?.source
      })
    });

    if (!this.cachedAuth) {
      Logger.info("M2TokenManager", "No cached authentication object. Calling initialize().");
      await this.initialize();
    }

    if (!M2AuthenticationManager.validateAuthentication(this.cachedAuth)) {
      Logger.info("M2TokenManager", "Cached authentication expired or invalid. Re-initializing.", {
        authenticationStatus: M2AuthenticationManager.getAuthenticationStatus(this.cachedAuth)
      });
      await this.initialize();
    }

    Logger.info("M2TokenManager", "Token Reused: Reusing cached B2B auth token.", {
      token: maskStructured({ accessToken: this.cachedAuth?.accessToken }),
      exactReasonForFailure: null
    });
    return this.cachedAuth.accessToken;
  }

  /**
   * Returns a valid B2B Session Token.
   * @returns {Promise<string>} Session Token
   */
  async getValidSession() {
    if (!this.cachedSession) {
      await this.initialize();
    }

    if (!M2SessionManager.validateSession(this.cachedSession)) {
      Logger.info("M2TokenManager", "Cached session expired. Re-initializing.");
      await this.initialize();
    }

    Logger.info("M2TokenManager", "Token Reused: Reusing cached B2B session token.");
    return this.cachedSession.accessToken;
  }

  /**
   * Proxy helper mapping to getValidAuthentication() for backward compatibility.
   * @returns {Promise<string>} Active token string
   */
  async getGatewayToken() {
    return this.getValidAuthentication();
  }

  /**
   * Exposes the current memory cached state and metadata.
   * @returns {Object} Current token state
   */
  getCurrentTokenState() {
    return {
      auth: this.cachedAuth,
      session: this.cachedSession,
      lastValidationTime: this.lastValidationTime
    };
  }

  /**
   * Invalidates active cache and deletes persistent storage file.
   */
  invalidate() {
    Logger.warn("M2TokenManager", "Token Invalid: Invalidating active authentication session.");
    this.remove();
  }

  /**
   * Automatically refreshes cache if tokens are expired or close to expiry.
   */
  async refreshIfRequired() {
    const bundle = { auth: this.cachedAuth, session: this.cachedSession };
    if (!this.validate(bundle)) {
      Logger.info("M2TokenManager", "Tokens require renewal. Refreshing.");
      await this.initialize();
    }
  }

  /**
   * Commits the active authentication and session states to local storage.
   * @param {Object} auth - Active authentication object
   * @param {Object} session - Active session object
   */
  save(auth, session) {
    this.cachedAuth = auth || null;
    this.cachedSession = session || null;
    this.lastValidationTime = Date.now();

    const bundle = {
      auth: this.cachedAuth,
      session: this.cachedSession,
      metadata: {
        creationTime: this.lastValidationTime,
        authStatus: this.cachedAuth?.success ? "SUCCESS" : "NONE",
        sessionStatus: this.cachedSession?.success ? "SUCCESS" : "NONE",
        lastValidationTime: this.lastValidationTime
      }
    };

    this.storageProvider.write(bundle);
    Logger.info("M2TokenManager", "Token Saved: Commited token bundle to storage cache.");
  }

  /**
   * Loads token data from disk and populates memory cache.
   * @returns {Object} Loaded token bundle
   */
  load() {
    Logger.info("M2TokenManager", "Loading token bundle from storage.");
    const bundle = this.storageProvider.read();
    
    this.cachedAuth = bundle?.auth || null;
    this.cachedSession = bundle?.session || null;
    this.lastValidationTime = bundle?.metadata?.lastValidationTime || 0;

    return bundle;
  }

  /**
   * Clears memory cache and unlinks files on disk.
   */
  remove() {
    this.cachedAuth = null;
    this.cachedSession = null;
    this.lastValidationTime = 0;

    this.storageProvider.delete();
    Logger.info("M2TokenManager", "Token Removed: Cleaned token cache and storage.");
  }

  /**
   * Validates if a token bundle is structured and contains unexpired values.
   * @param {Object} bundle - Bundle containing auth and session objects
   * @returns {boolean} Validity
   */
  validate(bundle) {
    Logger.info("M2TokenManager", "Validation Result: Running structural and expiry checks on token bundle.");
    
    if (!bundle || !bundle.auth || !bundle.session) {
      return false;
    }

    const isAuthValid = M2AuthenticationManager.validateAuthentication(bundle.auth);
    const isSessionValid = M2SessionManager.validateSession(bundle.session);

    return isAuthValid && isSessionValid;
  }

  // --- Static wrappers to preserve class-level calls for backward compatibility ---
  
  static async initialize() {
    return this.getInstance().initialize();
  }

  static async getValidAuthentication() {
    return this.getInstance().getValidAuthentication();
  }

  static async getValidSession() {
    return this.getInstance().getValidSession();
  }

  static async getGatewayToken() {
    return this.getInstance().getGatewayToken();
  }

  static getCurrentTokenState() {
    return this.getInstance().getCurrentTokenState();
  }

  static invalidate() {
    return this.getInstance().invalidate();
  }

  static async refreshIfRequired() {
    return this.getInstance().refreshIfRequired();
  }

  static save(auth, session) {
    return this.getInstance().save(auth, session);
  }

  static load() {
    return this.getInstance().load();
  }

  static remove() {
    return this.getInstance().remove();
  }

  static validate(bundle) {
    return this.getInstance().validate(bundle);
  }
}

// Export the singleton instance
module.exports = M2TokenManager.getInstance();
