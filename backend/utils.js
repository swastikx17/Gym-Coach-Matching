function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value;
}
function isOracleUniqueError(err) { return err && err.errorNum === 1; }
function isOracleFkError(err) { return err && (err.errorNum === 2291 || err.errorNum === 2292); }
function isOracleCheckError(err) { return err && err.errorNum === 2290; }
module.exports = { asyncHandler, cleanString, isOracleUniqueError, isOracleFkError, isOracleCheckError };
