const express = require("express");
const router = express.Router();
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const { auth } = require("../Middlewares/authentication");

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3({});
const bucketName = process.env.AWS_BUCKET_NAME;

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
});

// Route to receive files from frontend
router.post(
  "/upload/:conversationId",
  auth,
  upload.array("files"),
  async (req, res) => {
    const convId = req.params.conversationId;
    const fileNamesArr = [];
    const timeStamp = Date.now();
    try {
      // Check if folder exists in S3, if not create it
      await createFolderInS3IfNotExists(bucketName, convId);

      // Upload each file to S3
      await Promise.all(
        req.files.map(async (file) => {
          const params = {
            Bucket: bucketName,
            Key: `${convId}/${timeStamp}-${file.originalname}`,
            Body: file.buffer,
            ContentType: file.mimetype,
          };

          await s3.upload(params).promise();

          fileNamesArr.push(`${timeStamp}-${file.originalname}`);
        })
      );

      res.status(200).json({ fileNames: fileNamesArr });
    } catch (err) {
      console.error("Error uploading files to S3:", err);
      res.status(500).send("Failed to upload files.");
    }
  }
);

// Route pour récupérer des fichiers spécifiques par leurs noms
router.get(
  "/conversationId/:conversationId/getFiles",
  auth,
  async (req, res) => {
    const convId = req.params.conversationId;
    const fileNames = req.query.fileNames.split(",");

    console.log(convId);
    console.log(fileNames);

    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      return res.status(400).json({
        error: "An array of file names is required in the query parameters.",
      });
    }

    try {
      const filesData = await Promise.all(
        fileNames.map(async (fileName) => {
          const params = {
            Bucket: bucketName,
            Key: `${convId}/${fileName}`,
          };

          try {
            const data = await s3.headObject(params).promise();
            const mimeType = data.ContentType;
            console.log(data);
            console.log(mimeType);

            if (mimeType.startsWith("image/")) {
              // For images, return the base64 encoded data
              const signedImgUrl = s3.getSignedUrl("getObject", {
                Bucket: bucketName,
                Key: params.Key,
              });

              return {
                fileName,
                type: "image",
                previewUrl: signedImgUrl,
              };
            } else {
              // For other files, generate a signed URL for downloading
              const signedUrl = s3.getSignedUrl("getObject", {
                Bucket: bucketName,
                Key: params.Key,
                //Expires: 15,
                ResponseContentDisposition: "attachment", // Indique au navigateur de télécharger le fichier plutôt que de l'afficher
              });

              return {
                fileName,
                type: "file",
                downloadUrl: signedUrl,
              };
            }
          } catch (err) {
            console.error(`Error fetching file ${fileName} from S3:`, err);
            return null; // Return null for files that couldn't be fetched
          }
        })
      );

      const filteredFilesData = filesData.filter((file) => file !== null);

      if (filteredFilesData.length === 0) {
        return res
          .status(404)
          .json({ error: "No files found matching the given names." });
      }
      filteredFilesData.forEach((file) => {
        if (file.type === "file") {
          res.set({
            "Content-Disposition": `attachment; filename="${file.fileName}"`,
          });
        }
      });

      res.status(200).json({ files: filteredFilesData });
    } catch (err) {
      console.error("Error fetching files from S3:", err);
      res.status(500).send("Failed to fetch files.");
    }
  }
);

// Function to create a folder in S3 if it doesn't already exist
async function createFolderInS3IfNotExists(bucketName, folderName) {
  console.log(bucketName, folderName);
  try {
    const params = {
      Bucket: bucketName,
      Key: `${folderName}/`, // Note: Using a slash to simulate a folder
      Body: "",
    };

    await s3.upload(params).promise();
  } catch (err) {
    if (err.code !== "EntityAlreadyExists") {
      throw err;
    }
  }
}

module.exports = router;
