const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Custom error type so the route layer can distinguish
 * "bad input / unreachable page" from unexpected server errors
 * and return the right HTTP status + message.
 */
class AuditError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AuditError';
    this.statusCode = statusCode;
  }
}

/**
 * Basic sanity check on the URL before we ever try a network call.
 * Rejects missing protocol, unsupported protocols, etc.
 */
function validateUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new AuditError(`"${rawUrl}" is not a valid URL. Include the protocol, e.g. https://example.com`, 400);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AuditError(`Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`, 400);
  }

  return parsed.toString();
}

/**
 * Fetches a page and returns a structured audit report.
 * Throws AuditError for any expected failure (bad URL, timeout,
 * non-HTML response, unreachable host, non-2xx status).
 */
async function auditUrl(rawUrl, { timeoutMs = 8000 } = {}) {
  const url = validateUrl(rawUrl);

  const start = Date.now();
  let response;

  try {
    response = await axios.get(url, {
      timeout: timeoutMs,
      // We want to report the real status code ourselves, not throw on 4xx/5xx.
      validateStatus: () => true,
      headers: {
        'User-Agent': 'PagePulse/1.0 (+https://digitalheroesco.com)',
      },
      maxRedirects: 5,
      responseType: 'text',
    });
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new AuditError(`Request timed out after ${timeoutMs}ms.`, 504);
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      throw new AuditError(`Could not resolve host for "${url}".`, 400);
    }
    if (err.code === 'ECONNREFUSED') {
      throw new AuditError(`Connection refused by "${url}".`, 502);
    }
    throw new AuditError(`Failed to fetch "${url}": ${err.message}`, 502);
  }

  const responseTimeMs = Date.now() - start;
  const contentType = response.headers['content-type'] || '';

  if (!contentType.includes('text/html')) {
    throw new AuditError(
      `Expected an HTML page but got content-type "${contentType || 'unknown'}".`,
      415
    );
  }

  const html = response.data;
  const $ = cheerio.load(html);

  const title = $('head title').first().text().trim() || null;
  const metaDescription =
    $('head meta[name="description"]').attr('content')?.trim() || null;
  const h1Count = $('h1').length;

  const images = $('img');
  let missingAltCount = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt.trim() === '') missingAltCount += 1;
  });

  // Approximate word count from visible body text.
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.length ? bodyText.split(' ').length : 0;

  return {
    url,
    httpStatus: response.status,
    responseTimeMs,
    title,
    metaDescription,
    h1Count,
    imageCount: images.length,
    imagesMissingAlt: missingAltCount,
    wordCount,
  };
}

module.exports = { auditUrl, validateUrl, AuditError };