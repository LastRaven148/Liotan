const User =
  require("../models/User");

const { uploadToR2 } =
  require("../utils/uploadToR2");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const { buildSanitizedAvatarFile } =
  require("../utils/avatarProcessing");

const deleteAccountData =
  require("../utils/deleteAccountData");

const {
  normalizeMime,
  assertAllowedAvatar,
  assertSafeFileBuffer
} = require("../middleware/uploadSecurity");

const {
  isValidBio,
  isValidUsername
} = require("../utils/validators");

const { getRelatedUsernames, usersAreRelated } = require("../utils/userRelations");

function withAvatarCacheBust(url) {
  if (!url) return "";
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

function isValidDisplayName(value) {
  return (
    typeof value === "string" &&
    value.trim().length <= 20
  );
}

async function emitProfileUpdated(req, profile) {
  const io = req.app.get("io");

  if (!io || !profile?.username) {
    return;
  }

  const related = await getRelatedUsernames(profile.username).catch(() => []);
  [...new Set([profile.username, ...related])].forEach(username => {
    io.to(username).emit("userProfileUpdated", profile);
  });
}

async function getProfile(req, res, next) {
  try {
    const username =
      req.params.username;

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: "invalid username"
      });
    }

    const user =
      await User.findOne(
        { username, emailVerified: true },
        "username displayName avatar bio"
      );

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const requester = req.user.username;
    const related = requester === username || await usersAreRelated(requester, username);

    if (!related) {
      return res.json({
        username: user.username,
        displayName: user.displayName || "",
        avatar: "",
        bio: "",
        limited: true
      });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const username =
      req.user.username;

    const bio =
      typeof req.body.bio === "string"
        ? req.body.bio.trim()
        : "";

    const hasDisplayName =
      Object.prototype.hasOwnProperty.call(
        req.body,
        "displayName"
      );

    const displayName =
      hasDisplayName &&
      typeof req.body.displayName === "string"
        ? req.body.displayName.trim()
        : undefined;

    if (!isValidBio(bio)) {
      return res.status(400).json({
        error: "invalid bio"
      });
    }

    if (
      hasDisplayName &&
      !isValidDisplayName(displayName)
    ) {
      return res.status(400).json({
        error: "invalid display name"
      });
    }

    const update = {
      bio
    };

    if (hasDisplayName) {
      update.displayName =
        displayName || "";
    }

    const user =
      await User.findOneAndUpdate(
        { username },
        update,
        {
          returnDocument: "after",
          fields: "username displayName avatar bio"
        }
      );

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const profile = {
      username: user.username,
      displayName: user.displayName || "",
      avatar: user.avatar || "",
      bio: user.bio || ""
    };

    await emitProfileUpdated(req, profile);

    res.json({
      ok: true,
      ...profile
    });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    const username =
      req.user.username;

    if (!req.file) {
      return res.status(400).json({
        error: "no file"
      });
    }

    const mimeType = normalizeMime(req.file.mimetype);
    assertAllowedAvatar({
      mimeType,
      fileName: req.file.originalname,
      size: req.file.size
    });
    assertSafeFileBuffer({
      buffer: req.file.buffer,
      mimeType
    });

    const user =
      await User.findOne({
        username
      });

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const oldAvatar = {
      url: user.avatar,
      storageKey: user.avatarStorageKey,
      storageType: user.avatarStorageType
    };

    const sanitizedAvatar = buildSanitizedAvatarFile(req.file, mimeType);

    const result =
      await uploadToR2(
        sanitizedAvatar,
        {
          folder: "liotan/avatars",
          mimeType
        }
      );

    user.avatar =
      withAvatarCacheBust(result.url);

    user.avatarStorageKey =
      result.key;

    user.avatarStorageType =
      result.storageType;

    await user.save();

    await deleteUploadedFile(oldAvatar);

    const profile = {
      username: user.username,
      displayName: user.displayName || "",
      avatar: user.avatar || "",
      bio: user.bio || ""
    };

    await emitProfileUpdated(req, profile);

    res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const username =
      req.user.username;

    const result =
      await deleteAccountData(username);

    if (!result.ok) {
      return res.status(404).json({
        error: "not found"
      });
    }

    const io =
      req.app.get("io");

    if (io) {
      io.to(username).emit(
        "accountDeleted",
        {
          username
        }
      );

      const related = await getRelatedUsernames(username).catch(() => []);
      [...new Set([username, ...related])].forEach(target => {
        io.to(target).emit("userDeleted", {
          username,
          chatIds: result.chatIds || []
        });
      });
    }

    res.json({
      ok: true
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAccount
};