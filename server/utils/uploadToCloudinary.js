const cloudinary =
  require("../config/cloudinary");

function uploadToCloudinary(
  file,
  options = {}
) {

  return new Promise((
    resolve,
    reject
  ) => {

    const uploadOptions = {
      folder:
        options.folder || "liotan",

      resource_type:
        options.resourceType || "auto",

      quality:
        "auto:best",

      fetch_format:
        "auto",

      flags:
        "preserve_transparency",

      use_filename:
        true,

      unique_filename:
        true,

      overwrite:
        false
    };

    const stream =
      cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {

          if (error) {
            reject(error);
            return;
          }

          resolve(result);

        }
      );

    stream.end(
      file.buffer
    );

  });

}

module.exports =
  uploadToCloudinary;