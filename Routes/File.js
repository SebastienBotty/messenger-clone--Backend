const express = require("express");
const router = express.Router();
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3({});

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route to receive files from frontend
router.post(
  "/upload/:conversationId",
  upload.array("files"),
  async (req, res) => {
    const bucketName = process.env.AWS_BUCKET_NAME;
    const convId = req.params.conversationId;
    try {
      // Check if folder exists in S3, if not create it
      await createFolderInS3IfNotExists(bucketName, convId);

      // Upload each file to S3
      await Promise.all(
        req.files.map(async (file) => {
          const params = {
            Bucket: bucketName,
            Key: `${convId}/${file.originalname}`,
            Body: file.buffer,
          };

          await s3.upload(params).promise();
        })
      );

      res.status(200).json({ message: "Files uploaded successfully." });
    } catch (err) {
      console.error("Error uploading files to S3:", err);
      res.status(500).send("Failed to upload files.");
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
