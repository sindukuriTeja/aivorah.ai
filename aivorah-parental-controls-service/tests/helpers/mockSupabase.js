// A Supabase query-builder mock that is both chainable (every method
// returns itself) AND directly awaitable (implements `.then`), since some
// routes terminate a chain with `.maybeSingle()` and others just `await`
// the chain itself (e.g. a plain multi-row select, or `.upsert()` with no
// `.select()` after it). Each call site configures its own chain via
// `supabase.from.mockImplementationOnce(() => makeChain(result))`, one per
// real `.from()` call the route makes, in call order.
function makeChain(result) {
  const chain = {};
  ['select', 'eq', 'gte', 'lte', 'upsert', 'insert', 'update', 'delete', 'order', 'in', 'or', 'like']
    .forEach((method) => { chain[method] = jest.fn(() => chain); });
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  chain.single = jest.fn().mockResolvedValue(result);
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

module.exports = { makeChain };
