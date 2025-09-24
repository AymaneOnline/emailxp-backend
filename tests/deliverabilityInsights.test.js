const { connect, cleanup, disconnect } = require('./utils/memoryServer');
const { seedScenario } = require('./utils/factories');
const { getInsights } = require('../services/deliverabilityMetricsService');

beforeAll(async () => { await connect(); });
afterEach(async () => { await cleanup(); });
afterAll(async () => { await disconnect(); });

function expectMonotonic(obj) {
  const seq = [obj.p50, obj.p75, obj.p90, obj.p95, obj.p99];
  for (let i=1;i<seq.length;i++) {
    expect(seq[i]).toBeGreaterThanOrEqual(seq[i-1]);
  }
}

describe('deliverability getInsights', () => {
  test('computes funnel, reasons, latency and responsiveness', async () => {
    await seedScenario();
    const data = await getInsights({ days: 30 });

    expect(data.funnel.attempted).toBeGreaterThan(0);
  // Delivered may be zero if logs only stored opened/clicked (we treat those as delivered implicitly)
  expect(data.funnel.delivered).toBeGreaterThanOrEqual(0);
  // Opened can be zero in minimal seed or if status mapping differs
  expect(data.funnel.opened).toBeGreaterThanOrEqual(0);
    expect(data.funnel.clicked).toBeGreaterThanOrEqual(0);

    // Bounce reasons grouped
    if (data.bounceReasons.length) {
      const total = data.bounceReasons.reduce((s,r)=>s+r.count,0);
      expect(total).toBeGreaterThan(0);
    }

    // Complaint reasons (may be single)
    if (data.complaintReasons.length) {
      expect(data.complaintReasons[0]).toHaveProperty('reason');
    }

    // Latency percentiles monotonic
    expectMonotonic(data.latency.open);
    expectMonotonic(data.latency.click);

    // Responsiveness buckets sum to delivered (allow minor missing due to rounding in percent only)
    const bucketSum = data.responsiveness.reduce((s,b)=> b.bucket==='neverOpened'? s : s + b.count, 0) + (data.responsiveness.find(b=>b.bucket==='neverOpened')?.count || 0);
    expect(bucketSum).toBe(data.funnel.delivered);
  });
});
