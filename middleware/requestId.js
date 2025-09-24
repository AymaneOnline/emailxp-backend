const { randomUUID } = require('crypto');

module.exports = function requestId(req, res, next) {
  const header = req.headers['x-request-id'];
  const id = header || randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
