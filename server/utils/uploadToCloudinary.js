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

    const stream =
      cloudinary.uploader.upload_stream(
        {
          folder:
            options.folder || "liotan",
          resource_type:
            options.resourceType || "auto"
        },
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