"use strict";

const ARCHIVE_CONSTRUCTORS = Object.freeze({
  zip: "ZipArchive",
  tar: "TarArchive",
  json: "JsonArchive"
});

function createArchive(archiverModule, format, options) {
  const legacyFactory = typeof archiverModule === "function"
    ? archiverModule
    : archiverModule?.default;

  if (typeof legacyFactory === "function") {
    return legacyFactory(format, options);
  }

  const constructorName = ARCHIVE_CONSTRUCTORS[format];
  const ArchiveConstructor = constructorName && archiverModule?.[constructorName];
  if (typeof ArchiveConstructor === "function") {
    return new ArchiveConstructor(options);
  }

  throw new TypeError(`Unsupported archiver module export for format: ${format}`);
}

module.exports = { createArchive };
