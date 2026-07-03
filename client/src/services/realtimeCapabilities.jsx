import { API } from "../config/api";

import {
  apiRequest
} from "../utils/apiRequest";

export function getCallCapabilities() {
  return apiRequest(`${API}/calls/capabilities`);
}

export function getVoiceMessageCapabilities() {
  return apiRequest(`${API}/voice/capabilities`);
}


export {
  getCallRoute,
  createCallId,
  createSecurePeerConnection,
  supportsEncodedInsertableStreams
} from "./callSecurity";
