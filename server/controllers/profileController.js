const User =
  require("../models/User");

const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const deleteAccountData =
  require("../utils/deleteAccountData");

const {
  isValidBio,
  isValidUsername
} = require("../utils/validators");

function isValidDisplayName(value) {
  return (
    typeof value === "string" &&
    value.trim().length <= 20
  );
}

function emitProfileUpdated(req, profile) {
  const io =
    req.app.get("io");

  if (!io) {
    return;
  }

  io.emit(
    "userProfileUpdated",
    profile
  );
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
        { username },
        "username displayName avatar bio"
      );

    if (!user) {
      return res.status(404).json({
        error: "not found"
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

    emitProfileUpdated(req, profile);

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

    const user =
      await User.findOne({
        username
      });

    if (!user) {
      return res.status(404).json({
        error: "not found"
      });
    }

    await deleteUploadedFile({
      url: user.avatar,
      publicId: user.avatarPublicId,
      resourceType: user.avatarResourceType
    });

    const result =
      await uploadToCloudinary(
        req.file,
        {
          folder: "liotan/avatars",
          resourceType: "image"
        }
      );

    user.avatar =
      result.secure_url;

    user.avatarPublicId =
      result.public_id;

    user.avatarResourceType =
      result.resource_type;

    await user.save();

    const profile = {
      username: user.username,
      displayName: user.displayName || "",
      avatar: user.avatar || "",
      bio: user.bio || ""
    };

    emitProfileUpdated(req, profile);

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

      io.emit(
        "userDeleted",
        {
          username,
          chatIds: result.chatIds || []
        }
      );
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