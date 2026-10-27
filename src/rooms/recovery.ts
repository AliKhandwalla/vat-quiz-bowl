// A read may restore interactivity only if it belongs to the current live
// subscription. Offline events and failed/replaced channels invalidate it.
export function createRecoveryGate() {
  let epoch = 0;
  let subscribed = false;
  let disposed = false;
  return {
    beginRead: () => epoch,
    invalidate() {
      epoch += 1;
      subscribed = false;
    },
    subscribe() {
      epoch += 1;
      subscribed = true;
    },
    canConnect(ticket: number, online: boolean) {
      return !disposed && online && subscribed && ticket === epoch;
    },
    dispose() {
      disposed = true;
      epoch += 1;
      subscribed = false;
    },
  };
}
