import { Cloudinary as CloudinaryCore } from 'cloudinary-core';
import { CLOUDINARY_CONFIG } from '../config/config';

// Configure Cloudinary
const cloudinaryConfig = {
  cloud_name: CLOUDINARY_CONFIG.cloudName,
  api_key: CLOUDINARY_CONFIG.apiKey,
  secure: true
};

// Create Cloudinary instance
const cloudinary = new CloudinaryCore(cloudinaryConfig);

// Helper function to get optimized image URL
export const getImageUrl = (publicId: string, options = {}) => {
  return cloudinary.url(publicId, options);
};

// Helper function to get video URL
export const getVideoUrl = (publicId: string, options = {}) => {
  return cloudinary.video(publicId, options);
};

// Helper function to get transform options
export const getTransformOptions = (width: number, height: number, quality = 'auto') => {
  return {
    width,
    height,
    crop: 'limit',
    quality,
    fetch_format: 'auto',
  };
};

export default cloudinary;