// An older poll must never replace state returned by a committed action.
export function createStateSync() {
 let generation = 0, pending = null;
 return {
  invalidate() { generation++; pending = null; },
  get pending() { return !!pending; },
  read(key, fetchState, apply) {
   if (pending?.key === key) return pending.promise;
   const version = ++generation;
   const promise = Promise.resolve().then(fetchState).then(value => {
    if (version === generation) apply(value);
    return value;
   }, error => { if (version === generation) throw error; }).finally(() => {
    if (pending?.version === version) pending = null;
   });
   pending = { key, version, promise };
   return promise;
  },
 };
}
