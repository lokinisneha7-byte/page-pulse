# Page Pulse

A small web tool that audits any public URL: HTTP status, response time, title,
meta description, H1 count, images missing `alt` text, and approximate word count.

Built for the Digital Heroes SDE internship task kit (Role 03, Task A & B).

## Live demo

- Live app: **[add your deployed URL here]**
- Repo: **[add your GitHub URL here]**

## Setup

Requires Node.js 18+.

```bash
git clone <your-repo-url>
cd page-pulse
npm install
npm start        # runs on http://localhost:3000
```

Run the tests:

```bash
npm test
```

## How it works

1. Open the app in a browser and paste a URL into the input.
2. The frontend POSTs it to `/api/audit`.
3. The backend fetches the page with `axios`, parses it with `cheerio`
   (a server-side jQuery-like HTML parser), and returns a JSON report.
4. The frontend renders the report as a grid of cards.

## API contract

### `POST /api/audit`

**Request body**

```json
{ "url": "https://example.com" }
```

**Success response — `200 OK`**

```json
{
  "url": "https://example.com/",
  "httpStatus": 200,
  "responseTimeMs": 187,
  "title": "Example Domain",
  "metaDescription": null,
  "h1Count": 1,
  "imageCount": 0,
  "imagesMissingAlt": 0,
  "wordCount": 28
}
```

**Error responses**

| Status | Meaning                                              |
|--------|-------------------------------------------------------|
| `400`  | Missing/malformed URL, unsupported protocol, unresolvable host |
| `415`  | Response was not HTML (e.g. a JSON API or a PDF)      |
| `502`  | Connection refused or fetch failed for another reason |
| `504`  | Request timed out (8s default)                        |
| `500`  | Unexpected server error (never a raw crash/stack trace) |

```json
{ "error": "\"not-a-url\" is not a valid URL. Include the protocol, e.g. https://example.com" }
```

## Design decisions

**1. Parsing logic lives in `lib/audit.js`, separate from the Express route.**
`server.js` only handles HTTP concerns (status codes, request/response shape).
`lib/audit.js` is pure logic: given a URL, return a report or throw a typed
error. This is what makes the logic unit-testable without spinning up a
server or hitting the network in tests (see `tests/audit.test.js`, which
mocks `axios` entirely).

**2. A custom `AuditError` class carries an HTTP status code with it.**
Rather than catching generic errors in the route and guessing what status to
return, each failure mode (bad URL, timeout, non-HTML, unreachable host)
throws an `AuditError` with the right status code attached at the point it's
detected. The route layer just reads `err.statusCode`. This keeps error
handling centralized and means adding a new failure case never requires
touching the route.

**3. `validateStatus: () => true` on the axios call, instead of letting axios
throw on 4xx/5xx.**
A URL that returns a 404 or 500 is still a valid audit target — the whole
point of the tool is to report on pages, including broken ones. So the app
treats non-2xx HTTP statuses as data to report, not as fetch failures. Actual
fetch failures (DNS, timeout, connection refused) are the only things that
raise `AuditError`.

**If I had another day:** I'd add a job queue so slow audits don't block the
request thread, cache repeated audits of the same URL for a few minutes, and
expand the parser to flag missing `<title>`/meta description as its own
"issues" list rather than just reporting raw values.

## AI use disclosure

*(Fill this in honestly before submitting — see note below.)*