const { getDashboardRawData } = require('../src/lib/sheets');

async function testLive() {
  console.log('Testing getDashboardRawData...');
  try {
    const data = await getDashboardRawData({ startDate: '2026-10-01', endDate: '2026-10-16' });
    console.log('Live data loaded successfully!');
    console.log('Calls count:', data.calls.length);
    console.log('Meetings count:', data.meetings.length);
    console.log('Data source info:', data.dataSourceInfo);
    console.log('Failed sources:', data.failedSources);
  } catch (err) {
    console.error('getDashboardRawData error:', err);
  }
}

testLive();
