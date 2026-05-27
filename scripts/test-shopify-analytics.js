const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is missing. Add it in GitHub Settings > Secrets and variables > Actions.`);
  }
}

async function getShopifyToken() {
  const resp = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_SECRET,
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token request failed: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`No access_token in Shopify response: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function runShopifyQL(token, shopifyql) {
  const resp = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `
          query AnalyticsProbe($query: String!) {
            shopifyqlQuery(query: $query) {
              tableData {
                columns {
                  name
                  dataType
                  displayName
                }
                rows
              }
              parseErrors
            }
          }
        `,
        variables: { query: shopifyql },
      }),
    }
  );

  const json = await resp.json();
  if (!resp.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  }

  return json.data.shopifyqlQuery;
}

async function tryQuery(token, label, query) {
  console.log(`\n=== ${label} ===`);
  console.log(query);

  try {
    const result = await runShopifyQL(token, query);
    const parseErrors = result.parseErrors || [];
    if (parseErrors.length) {
      console.log('Parse errors:');
      parseErrors.forEach(error => console.log(`- ${error}`));
      return;
    }

    console.log('Columns:');
    (result.tableData?.columns || []).forEach(column => {
      console.log(`- ${column.name} (${column.displayName})`);
    });
    console.log('Rows:');
    console.log(JSON.stringify(result.tableData?.rows || [], null, 2));
  } catch (error) {
    console.log('Query failed:');
    console.log(error.message);
  }
}

async function main() {
  requireEnv('SHOPIFY_STORE', SHOPIFY_STORE);
  requireEnv('SHOPIFY_CLIENT_ID', SHOPIFY_CLIENT_ID);
  requireEnv('SHOPIFY_CLIENT_SECRET', SHOPIFY_SECRET);

  const token = await getShopifyToken();
  console.log('Shopify token obtained.');

  const since = '2025-08-01';
  const until = 'today';

  await tryQuery(
    token,
    'Monthly sessions and conversion rate',
    `FROM sessions SHOW sessions, conversion_rate, sessions_that_completed_checkout GROUP BY month SINCE ${since} UNTIL ${until} ORDER BY month`
  );

  await tryQuery(
    token,
    'YTD sessions and conversion rate total',
    `FROM sessions SHOW sessions, conversion_rate, sessions_that_completed_checkout SINCE ${since} UNTIL ${until}`
  );

  await tryQuery(
    token,
    'Alternative visits wording',
    `FROM sessions SHOW online_store_visitors, sessions, conversion_rate SINCE ${since} UNTIL ${until}`
  );
}

main().catch(error => {
  console.error('\nShopify Analytics test failed.');
  console.error(error.message);
  process.exit(1);
});
