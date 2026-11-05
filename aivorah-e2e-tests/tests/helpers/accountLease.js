// Assigns accounts by Playwright's parallelIndex, which is unique among
// concurrently running workers - safe as long as the pool size >= worker count.
export function leaseAccount(testInfo, pool) {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error('leaseAccount: pool must be a non-empty array of account keys');
  }
  return pool[testInfo.parallelIndex % pool.length];
}
