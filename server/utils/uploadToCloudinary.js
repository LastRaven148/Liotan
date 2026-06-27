const cloudinary =
  require("../config/cloudinary");

const LARGE_FILE_LIMIT =
  95 * 1024 * 1024;

function getResourceType(file, options) {
  if (options.resourceType) {
    return options.resourceType;
  }

  if (file.mimetype?.startsWith("image/")) {
    return "image";
  }

  if (file.mimetype?.startsWith("video/")) {
    return "video";
  }

  return "raw";
}

function uploadToCloudinary(
  file,
  options = {}
) {

  return new Promise((
    resolve,
    reject
  ) => {

    const resourceType =
      getResourceType(
        file,
        options
      );

    const uploadOptions = {
      folder:
        options.folder || "liotan",

      resource_type:
        resourceType,

      use_filename:
        true,

      unique_filename:
        true,

      overwrite:
        false
    };

    if (resourceType === "image") {
      uploadOptions.quality =
        "auto:best";

      uploadOptions.fetch_format =
        "auto";
    }

    const done =
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      };

    const stream =
      file.size > LARGE_FILE_LIMIT
        ? cloudinary.uploader.upload_large_stream(
            {
              ...uploadOptions,
              chunk_size:
                20 * 1024 * 1024
            },
            done
          )
        : cloudinary.uploader.upload_stream(
            uploadOptions,
            done
          );

    stream.end(
      file.buffer
    );

  });

}

module.exports =
  uploadToCloudinary;