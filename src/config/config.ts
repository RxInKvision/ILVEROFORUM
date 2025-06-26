/**
 * Application Configuration
 * Centralizes access to environment variables and configuration settings
 */

// Supabase Configuration
export const SUPABASE_CONFIG = {
    url: process.env.REACT_APP_SUPABASE_URL || '',
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || '',
  };
  
  // Cloudinary Configuration
  export const CLOUDINARY_CONFIG = {
    cloudName: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.REACT_APP_CLOUDINARY_API_KEY || '',
    apiSecret: process.env.REACT_APP_CLOUDINARY_API_SECRET || '',
  };
  
  // Gallery Configuration
  export const GALLERY_CONFIG = {
    defaultSeed: Number(process.env.REACT_APP_DEFAULT_SEED) || 42,
    defaultZoomLevel: Number(process.env.REACT_APP_DEFAULT_ZOOM_LEVEL) || 0.5,
  };
  
  // Validate Configuration
  const validateConfig = () => {
    const missingVars = [];
    
    if (!SUPABASE_CONFIG.url) missingVars.push('REACT_APP_SUPABASE_URL');
    if (!SUPABASE_CONFIG.anonKey) missingVars.push('REACT_APP_SUPABASE_ANON_KEY');
    if (!CLOUDINARY_CONFIG.cloudName) missingVars.push('REACT_APP_CLOUDINARY_CLOUD_NAME');
    if (!CLOUDINARY_CONFIG.apiKey) missingVars.push('REACT_APP_CLOUDINARY_API_KEY');
    if (!CLOUDINARY_CONFIG.apiSecret) missingVars.push('REACT_APP_CLOUDINARY_API_SECRET');
    
    if (missingVars.length > 0) {
      console.warn('Missing environment variables:', missingVars.join(', '));
      console.warn('Please check your .env file or environment configuration.');
    }
  };
  
  // Run validation in development mode only
  if (process.env.NODE_ENV === 'development') {
    validateConfig();
  }
  
  export default {
    supabase: SUPABASE_CONFIG,
    cloudinary: CLOUDINARY_CONFIG,
    gallery: GALLERY_CONFIG,
  };