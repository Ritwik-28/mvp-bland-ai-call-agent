// lib/s3.js

const AWS = require('aws-sdk');

// ensure v4 signing in all regions
const s3 = new AWS.S3({
  region: process.env.S3_REGION || 'ap-south-1',
  signatureVersion: 'v4',
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
    await s3.putObject({
      Bucket,
      Key:         key,
      Body:        body,
      ContentType: contentType,
      ACL:         'public-read',
    }).promise();

    // static REST URL
    const region = process.env.S3_REGION || 'ap-south-1';
    return `https://${Bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
  }
};
