const User =
  require("../models/User");

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
        {
          username
        },
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
      {
        username
      },
      {
        bio
      }
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

    const avatar =
      `/uploads/avatars/${req.file.filename}`;

    await User.updateOne(
      {
        username
      },
      {
        avatar
      }
    );

    res.json({
      avatar
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