const { google } = require('googleapis');

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const rawCredentials = process.env.GA4_CREDENTIALS;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is missing. Add it in GitHub Settings > Secrets and variables > Actions.`);
  }
}

function parseCredentials(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`GA4_CREDENTIALS is not valid JSON: ${error.message}`);
  }
}

async function main() {
  requireEnv('GA4_PROPERTY_ID', GA4_PROPERTY_ID);
  requireEnv('GA4_CREDENTIALS', rawCredentials);

  const credentials = parseCredentials(rawCredentials);
  requireEnv('GA4_CREDENTIALS.client_email', credentials.client_email);
  requireEnv('GA4_CREDENTIALS.private_key', credentials.private_key);

  console.log('=== GA4 API test ===');
  console.log(`Property ID: ${GA4_PROPERTY_ID}`);
  console.log(`Service account: ${credentials.client_email}`);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });

  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
  const res = await analyticsData.properties.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
      metrics: [{ name: 'sessions' }],
    },
  });

  const sessions = res.data?.rows?.[0]?.metricValues?.[0]?.value || '0';
  console.log(`Sessions, last 7 days: ${sessions}`);
  console.log('GA4 API access is working.');
}

main().catch(error => {
  console.error('\nGA4 API test failed.');
  console.error(error.message);
  process.exit(1);
});
