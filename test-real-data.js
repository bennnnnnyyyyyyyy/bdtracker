const { getDashboardRawData } = require('./src/lib/sheets');
const { computeDashboardMetrics } = require('./src/lib/analytics');

async function testRealMetrics() {
  const rawData = await getDashboardRawData();
  console.log('Total real calls loaded:', rawData.calls.length);
  console.log('Real Openers in BD Tracker:', Object.keys(rawData.trackerCounts));

  const { openers, totals } = computeDashboardMetrics(
    rawData.calls,
    rawData.trackerCounts,
    rawData.agentMappings
  );

  console.log('\n--- REAL OPENER METRICS ---');
  openers.forEach(o => {
    console.log(`${o.opener} | Calls: ${o.calls} | Booked: ${o.booked} | Show Rate: ${(o.showRate*100).toFixed(1)}% | Onboarded: ${o.onboarded}`);
  });

  console.log('\n--- ORG TOTALS ---');
  console.log(`Total Calls: ${totals.calls} | Total Booked: ${totals.booked} | Show Rate: ${(totals.showRate*100).toFixed(1)}% | Total Onboarded: ${totals.onboarded}`);
}

testRealMetrics().catch(e => console.error('Error:', e));
