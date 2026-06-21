import { API } from "../config/api";

import {
  apiRequest
} from "../utils/apiRequest";

export async function getUsers() {
  return apiRequest(`${API}/users`);
}

export async function getDialogs() {
  return apiRequest(`${API}/dialogs`);
}

export async function getPinnedChatsApi() {
  return apiRequest(`${API}/me/pinned-chats`);
}

export async function togglePinnedChatApi(username) {
  return apiRequest(`${API}/me/pinned-chats/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
}

export async function getProfile(username) {
  return apiRequest(`${API}/profile/${username}`);
}

export async function loginUser(username, password) {
  return apiRequest(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

export async function registerUser(username, password) {
  return apiRequest(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

export async function uploadAvatarApi(username, file) {
  const form = new FormData();
  form.append("avatar", file);

  return apiRequest(`${API}/upload-avatar`, {
    method: "POST",
    body: form
  });
}

export async function uploadAttachmentApi(file) {
  const form = new FormData();
  form.append("attachment", file);

  return apiRequest(`${API}/attachments/upload`, {
    method: "POST",
    body: form
  });
}

export async function updateBioApi(username, bio) {
  return apiRequest(`${API}/profile/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bio })
  });
}

export async function searchUsers(query) {
  return apiRequest(
    `${API}/users/search?q=${encodeURIComponent(query)}`
  );
}

export async function getArchivedChatsApi() {
  return apiRequest(`${API}/me/archived-chats`);
}

export async function toggleArchivedChatApi(username) {
  return apiRequest(`${API}/me/archived-chats/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
}

export async function createGroupApi(data) {
  return apiRequest(`${API}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function getGroupsApi() {
  return apiRequest(`${API}/groups`);
}

export async function getGroupApi(groupId) {
  return apiRequest(`${API}/groups/${groupId}`);
}

export async function updateGroupApi(groupId, data) {
  return apiRequest(`${API}/groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function uploadGroupAvatarApi(groupId, file) {
  const form = new FormData();
  form.append("avatar", file);

  return apiRequest(`${API}/groups/${groupId}/avatar`, {
    method: "POST",
    body: form
  });
}

export async function addGroupMemberApi(groupId, username) {
  return apiRequest(`${API}/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
}

export async function removeGroupMemberApi(groupId, username) {
  return apiRequest(
    `${API}/groups/${groupId}/members/${encodeURIComponent(username)}`,
    {
      method: "DELETE"
    }
  );
}

export async function leaveGroupApi(groupId) {
  return apiRequest(`${API}/groups/${groupId}/leave`, {
    method: "POST"
  });
}

export async function deleteGroupApi(groupId) {
  return apiRequest(`${API}/groups/${groupId}`, {
    method: "DELETE"
  });
}

export async function deleteAccountApi() {
  return apiRequest(`${API}/me`, {
    method: "DELETE"
  });
}