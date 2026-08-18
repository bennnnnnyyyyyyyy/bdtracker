const { getDashboardRawData } = require('./src/lib/sheets');
const { computeDashboardMetrics } = require('./src/lib/analytics');

async function test() {
  try {
    const raw = await getDashboardRawData(true);
    console.log('Raw calls length:', raw.calls.length);
    console.log('Raw tracker counts keys:', Object.keys(raw.trackerCounts));
    const metrics = computeDashboardMetrics(raw.calls, raw.trackerCounts, raw.agentMappings);
    console.log('Computed openers count:', metrics.openers.length);
    console.log('First opener:', metrics.openers[0]);
  } catch (e) {
    console.error('Error details:', e);
  }
}

test();
