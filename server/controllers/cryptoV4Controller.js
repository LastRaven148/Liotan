"use strict";

module.exports = {
  ...require("./cryptoV4/identityDevices"),
  ...require("./cryptoV4/conversations"),
  ...require("./cryptoV4/media"),
  ...require("./cryptoV4/deletion"),
  ...require("./cryptoV4/transparency")
};
