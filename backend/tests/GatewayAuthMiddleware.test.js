const assert = require('assert');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const GatewayAuthMiddleware = require('../middlewares/GatewayAuthMiddleware');

describe('GatewayAuthMiddleware', () => {
    let req, res, next, verifyStub;
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv };
        req = { headers: {}, path: '/api/v3/hiu/consent/request/on-init' };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.stub()
        };
        next = sinon.spy();
        verifyStub = sinon.stub(jwt, 'verify');
    });

    afterEach(() => {
        process.env = originalEnv;
        sinon.restore();
    });

    it('missing Authorization rejected', () => {
        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
        assert(res.json.calledWith({ error: 'Unauthorized: Missing Authorization header' }));
    });

    it('malformed Bearer token rejected', () => {
        req.headers.authorization = 'InvalidTokenFormat';
        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
        assert(res.json.calledWith({ error: 'Unauthorized: Malformed Bearer token' }));
    });

    it('wrong algorithm rejected', () => {
        req.headers.authorization = 'Bearer test-token';
        
        // Mock getSigningKey behavior manually to trigger algorithm rejection
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            getSigningKey({ kid: 'kid-1', alg: 'HS256' }, (err) => {
                callback(err);
            });
        });

        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
        assert(res.json.calledWith({ error: 'Unauthorized: Invalid token' }));
    });

    it('wrong signature rejected', () => {
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            callback(new Error('invalid signature'));
        });
        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
    });

    it('expired token rejected', () => {
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            callback(new Error('jwt expired'));
        });
        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
    });

    it('verified Sandbox issuer accepted (default fallback)', () => {
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            assert.strictEqual(options.issuer, 'https://dev.abdm.gov.in/auth/realms/central-registry');
            assert.strictEqual(options.audience, undefined);
            callback(null, { azp: 'SBXID_010086' });
        });
        GatewayAuthMiddleware(req, res, next);
        assert(next.calledOnce);
    });

    it('old incorrect issuer rejected', () => {
        process.env.ABDM_GATEWAY_JWT_ISSUER = 'https://dev.ndhm.gov.in/auth/realms/central-registry';
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            if (options.issuer !== 'https://dev.abdm.gov.in/auth/realms/central-registry') {
                callback(new Error('jwt issuer invalid'));
            } else {
                callback(null, {});
            }
        });
        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
    });

    it('wrong issuer rejected (production simulator)', () => {
        // Assume production is loaded but we passed sandbox token
        process.env.ABDM_GATEWAY_JWT_ISSUER = 'https://prod.abdm.gov.in';
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            if (options.issuer !== 'https://dev.abdm.gov.in/auth/realms/central-registry') {
                callback(new Error('jwt issuer invalid'));
            } else {
                callback(null, {});
            }
        });
        GatewayAuthMiddleware(req, res, next);
        assert(res.status.calledWith(401));
    });

    it('audience behavior matching the verified Sandbox token (omitted aud)', () => {
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            assert.strictEqual(options.audience, undefined); // should be omitted
            callback(null, {});
        });
        GatewayAuthMiddleware(req, res, next);
        assert(next.calledOnce);
    });
    
    it('audience behavior for production (configured aud)', () => {
        process.env.ABDM_GATEWAY_JWT_AUDIENCE = 'account';
        req.headers.authorization = 'Bearer test-token';
        verifyStub.callsFake((token, getSigningKey, options, callback) => {
            assert.strictEqual(options.audience, 'account');
            callback(null, {});
        });
        GatewayAuthMiddleware(req, res, next);
        assert(next.calledOnce);
    });
});
