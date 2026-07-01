const mongoose =
  require("mongoose");

const emailCodeSchema =
  new mongoose.Schema({
    emailHash: {
      type: String,
      required: true,
      index: true
    },

    purpose: {
      type: String,
      enum: [
        "register",
        "reset",
        "bind",
        "login",
        "change_current",
        "change_new"
      ],
      required: true
    },

    codeHash: {
      type: String,
      required: true
    },

    attempts: {
      type: Number,
      default: 0
    },

    createdAt: {
      type: Date,
      default: Date.now,
      expires: Number(process.env.EMAIL_CODE_TTL_SECONDS || 600)
    }
  });

emailCodeSchema.index({
  emailHash: 1,
  purpose: 1
});

module.exports =
  mongoose.models.EmailCode ||
  mongoose.model(
    "EmailCode",
    emailCodeSchema
  );
