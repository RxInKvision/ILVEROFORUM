// Upload media to Cloudinary and register in Supabase
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

// Load configuration from environment variables
const CLOUDINARY_CONFIG = {
  cloud_name: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.REACT_APP_CLOUDINARY_API_KEY,
  api_secret: process.env.REACT_APP_CLOUDINARY_API_SECRET,
};

const SUPABASE_CONFIG = {
  url: process.env.REACT_APP_SUPABASE_URL,
  anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
};

// Validate configuration
if (!CLOUDINARY_CONFIG.cloud_name || !CLOUDINARY_CONFIG.api_key || !CLOUDINARY_CONFIG.api_secret) {
  console.error('Error: Missing Cloudinary configuration. Please check your .env file.');
  process.exit(1);
}

if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
  console.error('Error: Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config(CLOUDINARY_CONFIG);

// Configure Supabase
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Usage instructions
if (process.argv.length < 4) {
  console.log('Usage: node upload-media.js <folder_path> <category>');
  console.log('Example: node upload-media.js ./images/abstract abstract');
  process.exit(1);
}

const folderPath = process.argv[2];
const category = process.argv[3];

// Check if folder exists
if (!fs.existsSync(folderPath)) {
  console.error(`Error: Folder '${folderPath}' does not exist.`);
  process.exit(1);
}

// Get all files in the folder
const files = fs.readdirSync(folderPath)
  .filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm'].includes(ext);
  });

console.log(`Found ${files.length} files to upload in category: ${category}`);

// Process each file
(async () => {
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const fileName = path.basename(file, path.extname(file));
    const fileExt = path.extname(file).toLowerCase();
    const mediaType = ['.mp4', '.webm'].includes(fileExt) ? 'video' : 'image';
    
    try {
      console.log(`[${successCount + errorCount + 1}/${files.length}] Uploading ${file} to Cloudinary...`);
      
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(filePath, {
        folder: category,
        resource_type: mediaType === 'video' ? 'video' : 'image',
        public_id: fileName,
      });
      
      console.log(`Successfully uploaded ${file}. URL: ${result.secure_url}`);
      
      // Add to Supabase
      const { data, error } = await supabase.from('media').insert([{
        title: fileName,
        url: result.secure_url,
        type: mediaType,
        category: category,
        tags: [],
        aspect_ratio: result.width / result.height,
        description: '',
        year: new Date().getFullYear(),
        cloudinary_id: result.public_id,
      }]);
      
      if (error) {
        console.error(`Error adding ${file} to Supabase:`, error);
        errorCount++;
      } else {
        console.log(`Added ${file} to Supabase database`);
        successCount++;
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
      errorCount++;
    }
  }
  
  console.log('\nUpload process completed!');
  console.log(`Successfully processed: ${successCount} files`);
  if (errorCount > 0) {
    console.log(`Failed to process: ${errorCount} files`);
  }
})();