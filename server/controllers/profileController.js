const User =
  require("../models/User");

const uploadToCloudinary =
  require("../utils/uploadToCloudinary");

const deleteUploadedFile =
  require("../utils/deleteUploadedFile");

const {
  isValidBio,
  isValidUsername
} = require("../utils/validators");

async function getProfile(
  req,
  res,
  next
) {

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
        "username avatar bio"
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

async function updateProfile(
  req,
  res,
  next
) {

  try {

    const username =
      req.user.username;

    const bio =
      typeof req.body.bio === "string"
        ? req.body.bio.trim()
        : "";

    if (!isValidBio(bio)) {
      return res.status(400).json({
        error: "invalid bio"
      });
    }

    await User.updateOne(
      { username },
      { bio }
    );

    res.json({
      ok: true
    });

  } catch (err) {
    next(err);
  }

}

async function uploadAvatar(
  req,
  res,
  next
) {

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

    await User.updateOne(
      { username },
      {
        avatar:
          result.secure_url,
        avatarPublicId:
          result.public_id,
        avatarResourceType:
          result.resource_type
      }
    );

    res.json({
      avatar:
        result.secure_url
    });

  } catch (err) {
    next(err);
  }

}

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar
};