export function isSameBrowserDevice(previousDeviceId, currentDeviceId) {
  return Boolean(previousDeviceId && currentDeviceId && previousDeviceId === currentDeviceId);
}

export function shouldRequireTrustedDeviceApproval({ hasTrustedDevice, isNewDevice }) {
  return Boolean(hasTrustedDevice && isNewDevice);
}
