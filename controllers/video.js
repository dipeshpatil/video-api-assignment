const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { v4: uuidv4 } = require("uuid");

const config = require("../config/constants.json");
const Video = require("../models/video");
const ShareableLink = require("../models/share-link");

class VideoController {
  constructor() {
    this.urlBucket = {};
    this.urlAnalyticsBucket = {};
  }

  async greet(req, res) {
    return res.send("Video Route");
  }

  async uploadVideo(req, res) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { size, path, originalname } = file;

      if (size > config.FFMPEG.maxSize * 1024 * 1024) {
        return res
          .status(400)
          .json({ error: "File size exceeds the maximum limit" });
      }

      ffmpeg.ffprobe(path, (err, metadata) => {
        if (err) return res.status(500).json({ error: "Invalid video file" });

        const duration = metadata.format.duration;

        if (
          duration < config.FFMPEG.minDuration ||
          duration > config.FFMPEG.maxDuration
        ) {
          fs.unlinkSync(path); // delete file if invalid duration
          return res.status(400).json({ error: "Invalid video duration" });
        }

        Video.create({
          title: originalname,
          filePath: path,
          size,
          duration,
        })
          .then((video) => res.status(201).json(video))
          .catch((error) => res.status(500).json({ error }));
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async trimVideo(req, res) {}

  async mergeVideos(req, res) {}

  async generateShareLink(req, res) {
    try {
      const { videoId } = req.params;
      const { expiryDuration } = req.body; // Expiry time in minutes

      // Check if the video exists
      const video = await Video.findByPk(videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Generate a unique link
      const link = uuidv4();

      // Calculate the expiration time
      const expiryTime = new Date(
        Date.now() + (expiryDuration || 10) * 60 * 1000
      );

      // Store the shareable link in the database
      const shareableLink = await ShareableLink.create({
        videoId: videoId,
        link: link,
        expiryTime: expiryTime,
      });

      // Generate the shareable URL
      const shareableUrl = `${req.protocol}://${req.get("host")}/video/share/${
        shareableLink.link
      }`;

      res.status(201).json({
        message: "Shareable link generated successfully",
        url: shareableUrl,
        expiresAt: expiryTime,
        link: shareableLink.link,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async shareVideoLink(req, res) {
    try {
      const { link } = req.params;

      // Find the shareable link in the database
      const shareableLink = await ShareableLink.findOne({ where: { link } });
      if (!shareableLink) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }

      // Check if the link has expired
      if (new Date() > shareableLink.expiryTime) {
        return res.status(410).json({ error: "Link has expired" });
      }

      // Find the video associated with the link
      const video = await Video.findByPk(shareableLink.videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Send the video file
      res.sendFile(
        path.join(path.dirname(require.main.filename), video.filePath)
      ); // Ensure the video file path is correct
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getAllVideos(req, res) {
    try {
      const videos = await Video.findAll();
      res.status(200).json(videos);
    } catch (err) {
      res.status(500).json({ error: "Error fetching videos" });
    }
  }

  async getAllLinks(req, res) {
    try {
      const links = await ShareableLink.findAll();
      res.status(200).json(links);
    } catch (err) {
      res.status(500).json({ error: "Error fetching links" });
    }
  }
}

module.exports = VideoController;
