const http = require('http');
const { google } = require('googleapis');

const {
  GA4_PROPERTY_ID,
  GA4_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  OAUTH_PORT = '8080',
} = process.env;

const port = Number(OAUTH_PORT);
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const scope = 'https://www.googleapis.com/auth/analytics.manage.users';

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is missing.`);
  }
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, redirectUri);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end(`OAuth failed: ${error}`);
          reject(new Error(`OAuth failed: ${error}`));
          server.close();
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('No OAuth code received.');
          reject(new Error('No OAuth code received.'));
          server.close();
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('GA4 authorization received. You can close this tab and return to the terminal.');
        resolve(code);
        server.close();
      } catch (error) {
        reject(error);
        server.close();
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

async function main() {
  requireEnv('GA4_PROPERTY_ID', GA4_PROPERTY_ID);
  requireEnv('GA4_SERVICE_ACCOUNT_EMAIL', GA4_SERVICE_ACCOUNT_EMAIL);
  requireEnv('GOOGLE_OAUTH_CLIENT_ID', GOOGLE_OAUTH_CLIENT_ID);
  requireEnv('GOOGLE_OAUTH_CLIENT_SECRET', GOOGLE_OAUTH_CLIENT_SECRET);

  const oauth2 = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
  });

  console.log('=== Grant GA4 access to service account ===');
  console.log(`GA4 property: ${GA4_PROPERTY_ID}`);
  console.log(`Service account: ${GA4_SERVICE_ACCOUNT_EMAIL}`);
  console.log('');
  console.log('Open this URL and sign in with a Google account that has Administrator access to the GA4 property:');
  console.log(authUrl);
  console.log('');
  console.log(`Waiting for OAuth callback on ${redirectUri} ...`);

  const code = await waitForOAuthCode();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const accessToken = tokens.access_token || (await oauth2.getAccessToken()).token;
  const response = await fetch(
    `https://analyticsadmin.googleapis.com/v1alpha/properties/${GA4_PROPERTY_ID}/accessBindings`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: GA4_SERVICE_ACCOUNT_EMAIL,
        roles: ['predefinedRoles/viewer'],
      }),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GA4 Admin API failed: ${response.status} ${body}`);
  }

  console.log('');
  console.log('GA4 access granted.');
  console.log(body);
}

main().catch(error => {
  console.error('\nCould not grant GA4 access.');
  console.error(error.message);
  process.exit(1);
});
