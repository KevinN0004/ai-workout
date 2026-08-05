export const isUpstreamFailureStatus = (status) =>
  Number.isInteger(status) && [500, 502, 503, 504].includes(status);
