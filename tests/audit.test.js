const axios = require('axios');
const { auditUrl, validateUrl, AuditError } = require('../lib/audit');

jest.mock('axios');

describe('validateUrl', () => {
  test('accepts a well-formed https URL', () => {
    expect(validateUrl('https://example.com')).toBe('https://example.com/');
  });

  test('rejects a string with no protocol', () => {
    expect(() => validateUrl('example.com')).toThrow(AuditError);
  });

  test('rejects unsupported protocols like ftp', () => {
    expect(() => validateUrl('ftp://example.com')).toThrow(AuditError);
  });
});

describe('auditUrl — happy path', () => {
  beforeEach(() => jest.resetAllMocks());

  test('parses a well-formed HTML page into a full report', async () => {
    const html = `
      <html>
        <head>
          <title>  Example Page  </title>
          <meta name="description" content="A test page for Page Pulse" />
        </head>
        <body>
          <h1>Welcome</h1>
          <h1>Second heading</h1>
          <img src="a.jpg" alt="A photo" />
          <img src="b.jpg" alt="" />
          <img src="c.jpg" />
          <p>Some visible body text here for word counting purposes.</p>
        </body>
      </html>
    `;

    axios.get.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      data: html,
    });

    const report = await auditUrl('https://example.com');

    expect(report.httpStatus).toBe(200);
    expect(report.title).toBe('Example Page');
    expect(report.metaDescription).toBe('A test page for Page Pulse');
    expect(report.h1Count).toBe(2);
    expect(report.imageCount).toBe(3);
    expect(report.imagesMissingAlt).toBe(2); // empty alt + missing alt
    expect(report.wordCount).toBeGreaterThan(0);
    expect(typeof report.responseTimeMs).toBe('number');
  });
});

describe('auditUrl — failure cases', () => {
  beforeEach(() => jest.resetAllMocks());

  test('rejects an invalid URL before making a network call', async () => {
    await expect(auditUrl('not-a-url')).rejects.toThrow(AuditError);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('raises a timeout-specific error when the request times out', async () => {
    axios.get.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' });

    await expect(auditUrl('https://slow-site.example')).rejects.toThrow(/timed out/i);
  });

  test('rejects a non-HTML response (e.g. a JSON API endpoint)', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: '{"ok":true}',
    });

    await expect(auditUrl('https://api.example.com/data')).rejects.toThrow(/HTML page/i);
  });

  test('surfaces a clear error when the host cannot be resolved', async () => {
    axios.get.mockRejectedValue({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' });

    await expect(auditUrl('https://this-domain-does-not-exist-xyz123.com')).rejects.toThrow(
      /could not resolve/i
    );
  });
});