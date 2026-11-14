import type { RequestHandler } from 'express';

/**
 * API-д зориулсан хамгаалалтын толгойнууд. HTML сервлэдэггүй тул
 * CSP маш хатуу — зөвхөн JSON хариу буцаана.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  // Токен, тайлангийн хариуг кэшлэхгүй
  res.setHeader('Cache-Control', 'no-store');
  next();
};
