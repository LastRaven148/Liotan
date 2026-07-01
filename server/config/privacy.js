function boolEnv(name, defaultValue) {
  const raw = process.env[name];

  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function intEnv(name, defaultValue) {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : defaultValue;
}

const privacy = {
  // Default: server and third-party services should know as little as possible.
  minimalLogs: boolEnv("PRIVACY_MINIMAL_LOGS", true),
  logIpHash: boolEnv("PRIVACY_LOG_IP_HASH", false),
  logUserHandle: boolEnv("PRIVACY_LOG_USER_HANDLE", false),
  logQueryString: boolEnv("PRIVACY_LOG_QUERY_STRING", false),
  storeUserAgentHash: boolEnv("PRIVACY_STORE_USER_AGENT_HASH", false),
  storeDerivedDeviceName: boolEnv("PRIVACY_STORE_DERIVED_DEVICE_NAME", false),
  anonymizeUploadFolders: boolEnv("PRIVACY_ANONYMIZE_UPLOAD_FOLDERS", true),
  exposeDeviceNamesToContacts: boolEnv("PRIVACY_EXPOSE_DEVICE_NAMES_TO_CONTACTS", false),
  exposeE2eeUserEnumeration: boolEnv("PRIVACY_EXPOSE_E2EE_USER_ENUMERATION", false),
  genericAuthErrors: boolEnv("PRIVACY_GENERIC_AUTH_ERRORS", true),
  genericEmailSubjects: boolEnv("PRIVACY_GENERIC_EMAIL_SUBJECTS", true),
  exposeDevEmailCodes: boolEnv("PRIVACY_EXPOSE_DEV_EMAIL_CODES", false),
  emailCodeTtlSeconds: intEnv("EMAIL_CODE_TTL_SECONDS", 600)
};

module.exports = privacy;
