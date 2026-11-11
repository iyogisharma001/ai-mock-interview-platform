import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.CLIENT_ORIGIN = 'https://my-app.vercel.app/, https://*.netlify.app,http://localhost:5173';
const { isAllowedOrigin, allowsAnyOrigin } = await import('../src/config/cors.js');

test('exact origins, wildcard patterns and requests without an Origin header', () => {
  assert.equal(allowsAnyOrigin, false);
  assert.ok(isAllowedOrigin('https://my-app.vercel.app'), 'trailing slash in config is ignored');
  assert.ok(isAllowedOrigin('http://localhost:5173'));
  assert.ok(isAllowedOrigin('https://whiteboard-demo.netlify.app'));
  assert.ok(isAllowedOrigin('https://deploy-preview-3--whiteboard.netlify.app'));
  assert.ok(isAllowedOrigin(undefined), 'curl and health checks send no Origin');
});

test('look-alike and unrelated origins are rejected', () => {
  assert.equal(isAllowedOrigin('https://other-app.vercel.app'), false);
  assert.equal(isAllowedOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedOrigin('https://x.netlify.app.evil.com'), false);
  assert.equal(isAllowedOrigin('http://whiteboard.netlify.app'), false, 'scheme must match');
  assert.equal(isAllowedOrigin('https://netlify.app'), false);
  assert.equal(isAllowedOrigin('https://a/b.netlify.app'), false);
});
