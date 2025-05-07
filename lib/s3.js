const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Initialize S3 client with credentials and region from environment variables
 */
const s3Client = new S3Client({
  region: process.env.S3_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

module.exports = {
  /**
   * Uploads `body` to S3 under `key`, makes it public, and returns its REST URL.
   *
   * @param {string} key
   * @param {Buffer|string} body
   * @param {string} [contentType='text/html']
   * @returns {string} public URL (no query string)
   */
  uploadAndGetPublicUrl: async (key, body, contentType = 'text/html') => {
    const Bucket = process.env.S3_BUCKET;

    // Upload file to S3
    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read' // Make the object publicly readable
    });

    try {
      await s3Client.send(command);

      // Static REST URL
      const region = process.env.S3_REGION || 'ap-south-1';
      return `https://${Bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
    } catch (error) {
      console.error(`Failed to upload to S3: ${error.message}`);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }
};