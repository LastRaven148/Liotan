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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username
    })
  });
}

export async function getProfile(username) {
  return apiRequest(`${API}/profile/${username}`);
}


export async function sendAuthEmailCode(
  email,
  purpose
) {
  return apiRequest(`${API}/auth/email-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      purpose
    })
  });
}


export async function verifyAuthEmailCode(
  email,
  purpose,
  code
) {
  return apiRequest(`${API}/auth/verify-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      purpose,
      code
    })
  });
}

export async function resetPasswordApi(
  email,
  code,
  password
) {
  return apiRequest(`${API}/password/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      code,
      password
    })
  });
}

export async function loginUser(
  username,
  password
) {
  return apiRequest(`${API}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username,
      password
    })
  });
}

export async function registerUser(
  username,
  password,
  email,
  code
) {
  return apiRequest(`${API}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username,
      password,
      email,
      code
    })
  });
}

export async function uploadAvatarApi(
  username,
  file
) {
  const form =
    new FormData();

  form.append(
    "avatar",
    file
  );

  return apiRequest(`${API}/upload-avatar`, {
    method: "POST",
    body: form
  });
}

function getAttachmentType(file) {
  const mimeType =
    file.type || "";

  if (mimeType.startsWith("image/")) {
    return "photo";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "file";
}

async function getAttachmentUploadSignature(file) {
  return apiRequest(`${API}/attachments/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name:
        file.name || "file",
      mimeType:
        file.type || "application/octet-stream",
      size:
        file.size
    })
  });
}

async function uploadSmallAttachmentToCloudinary(
  file,
  sign
) {
  const form =
    new FormData();

  form.append(
    "file",
    file
  );

  form.append(
    "api_key",
    sign.apiKey
  );

  form.append(
    "timestamp",
    sign.timestamp
  );

  form.append(
    "signature",
    sign.signature
  );

  form.append(
    "folder",
    sign.folder
  );

  const cloudinaryUrl =
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/${sign.resourceType}/upload`;

  const res =
    await fetch(cloudinaryUrl, {
      method: "POST",
      body: form
    });

  const data =
    await res.json();

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
      "Ошибка загрузки файла"
    );
  }

  return data;
}

export async function uploadAttachmentApi(file) {
  if (!file) {
    throw new Error("Файл не выбран");
  }

  if (file.size <= 0) {
    throw new Error("Файл пустой");
  }

  const sign =
    await getAttachmentUploadSignature(file);

  const result =
    await uploadSmallAttachmentToCloudinary(
      file,
      sign
    );

  if (!result?.secure_url) {
    throw new Error(
      "Cloudinary не вернул ссылку на файл"
    );
  }

  return {
    url:
      result.secure_url,
    name:
      file.name || "file",
    type:
      sign.type || getAttachmentType(file),
    mimeType:
      file.type || "application/octet-stream",
    size:
      file.size,
    publicId:
      result.public_id,
    resourceType:
      result.resource_type,
    width:
      result.width || 0,
    height:
      result.height || 0,
    duration:
      result.duration || 0
  };
}

export async function updateBioApi(
  username,
  bio,
  displayName
) {
  const body = {
    bio
  };

  if (displayName !== undefined) {
    body.displayName =
      displayName;
  }

  return apiRequest(`${API}/profile/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username
    })
  });
}

export async function createGroupApi(data) {
  return apiRequest(`${API}/groups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
}

export async function getGroupsApi() {
  return apiRequest(`${API}/groups`);
}

export async function getGroupApi(groupId) {
  return apiRequest(`${API}/groups/${groupId}`);
}

export async function updateGroupApi(
  groupId,
  data
) {
  return apiRequest(`${API}/groups/${groupId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
}

export async function uploadGroupAvatarApi(
  groupId,
  file
) {
  const form =
    new FormData();

  form.append(
    "avatar",
    file
  );

  return apiRequest(`${API}/groups/${groupId}/avatar`, {
    method: "POST",
    body: form
  });
}

export async function addGroupMemberApi(
  groupId,
  username
) {
  return apiRequest(`${API}/groups/${groupId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username
    })
  });
}

export async function removeGroupMemberApi(
  groupId,
  username
) {
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