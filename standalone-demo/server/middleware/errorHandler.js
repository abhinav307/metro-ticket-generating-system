export function errorHandler(err, req, res, next) {
  console.error('[API Error]', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: {
      status,
      message,
      path: req.originalUrl,
      timestamp: new Date().toISOString()
    }
  });
}
