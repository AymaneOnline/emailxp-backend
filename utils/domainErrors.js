// Standardized domain-related error codes & helper

const DomainErrorCodes = Object.freeze({
  NO_PRIMARY: 'DOMAIN_NO_PRIMARY',
  NOT_VERIFIED: 'DOMAIN_NOT_VERIFIED',
  REGRESSED: 'DOMAIN_REGRESSED',
  MISSING_FOR_SEND: 'DOMAIN_MISSING_FOR_SEND',
  BUILD_FROM_FAILED: 'DOMAIN_BUILD_FROM_FAILED'
});

function domainError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.meta = extra;
  return err;
}

module.exports = { DomainErrorCodes, domainError };