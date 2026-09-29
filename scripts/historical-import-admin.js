#!/usr/bin/env node

const [command = 'status', ...args] = process.argv.slice(2);
const baseUrl = process.env.HISTORICAL_IMPORT_WORKER_URL;
const token = process.env.HISTORICAL_IMPORT_ADMIN_TOKEN;
if (!baseUrl || !token) {
  console.error('HISTORICAL_IMPORT_WORKER_URL and HISTORICAL_IMPORT_ADMIN_TOKEN are required.');
  process.exit(1);
}

const options = Object.fromEntries(args.filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, value = 'true'] = arg.slice(2).split('=');
  return [key, value];
}));

const routes = {
  status: ['GET', '/status', null],
  'run-next': ['POST', '/run-next', {}],
  pause: ['POST', '/control/pause', { target: options.target || 'historical' }],
  resume: ['POST', '/control/resume', { target: options.target || 'historical', year: Number(options.year || 2023) }],
  enqueue: ['POST', '/jobs', { source: options.source, date_from: options.from, date_to: options.to, status: options.status || 'pending', priority: Number(options.priority || 300) }],
  regenerate: ['POST', '/exports/regenerate', { source: options.source, month: options.month }],
};
if (command === 'pause-job' || command === 'resume-job') {
  if (!/^\d+$/.test(options.id || '')) {
    console.error('--id is required');
    process.exit(1);
  }
  routes[command] = ['POST', `/jobs/${options.id}/${command === 'pause-job' ? 'pause' : 'resume'}`, {}];
}
if (!routes[command]) {
  console.error('Usage: node scripts/historical-import-admin.js status|run-next|pause|resume|enqueue|pause-job|resume-job|regenerate [--id=123] [--target=historical|updates|all] [--year=2023] [--source=shopify] [--from=2023-01-01] [--to=2023-02-01] [--month=2023-01]');
  process.exit(1);
}

const [method, pathname, body] = routes[command];
const response = await fetch(new URL(pathname, baseUrl), {
  method,
  headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
