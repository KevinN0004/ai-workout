export const isUpstreamFailureStatus = (status) =>
  Number.isInteger(status) && [500, 502, 503, 504].includes(status);

export const mongoReadyStateToText = (state) => {
  if (state === 0) return "disconnected";
  if (state === 1) return "connected";
  if (state === 2) return "connecting";
  if (state === 3) return "disconnecting";
  return "unknown";
};

