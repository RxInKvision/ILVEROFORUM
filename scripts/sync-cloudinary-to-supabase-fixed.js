/**
 * Script to synchronize existing Cloudinary media to Supabase
 * This will fetch all resources from your Cloudinary account and add them to Supabase
 * 
 * Fixed version that works with RLS disabled
 */
require('dotenv').config();
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

// Parse command line arguments
const args = process.argv.slice(2);
const forceUpdate = args.includes('--force') || args.includes('-f');
const dryRun = args.includes('--dry-run') || args.includes('-d');
const batchSize = 20; // How many records to insert in a batch

console.log(`
=================================================
   Cloudinary to Supabase Synchronization Tool
=================================================
Mode: ${dryRun ? 'Dry Run (no changes will be made)' : 'Live Run'}
Force Update: ${forceUpdate ? 'Yes' : 'No'}
`);

// Function to organize resources by folder
function organizeByFolder(resources) {
  const folderMap = {};
  
  resources.forEach(resource => {
    const path = resource.public_id;
    let folder = 'uncategorized';
    
    // Extract folder from path
    if (path.includes('/')) {
      folder = path.split('/')[0];
    }
    
    if (!folderMap[folder]) {
      folderMap[folder] = [];
    }
    
    folderMap[folder].push(resource);
  });
  
  return folderMap;
}

// Function to get all resources from Cloudinary (paginated)
async function getAllCloudinaryResources() {
  console.log('Fetching resources from Cloudinary...');
  const allResources = [];
  
  // First get images
  let nextCursor = null;
  do {
    const options = {
      resource_type: 'image',
      max_results: 500,
      ...(nextCursor && { next_cursor: nextCursor })
    };
    
    try {
      const result = await cloudinary.api.resources(options);
      allResources.push(...result.resources);
      nextCursor = result.next_cursor;
      console.log(`Retrieved ${result.resources.length} images. Total so far: ${allResources.length}`);
    } catch (error) {
      console.error('Error fetching Cloudinary images:', error);
      break;
    }
  } while (nextCursor);
  
  // Then get videos
  nextCursor = null;
  do {
    const options = {
      resource_type: 'video',
      max_results: 500,
      ...(nextCursor && { next_cursor: nextCursor })
    };
    
    try {
      const result = await cloudinary.api.resources(options);
      allResources.push(...result.resources);
      nextCursor = result.next_cursor;
      console.log(`Retrieved ${result.resources.length} videos. Total so far: ${allResources.length}`);
    } catch (error) {
      console.error('Error fetching Cloudinary videos:', error);
      break;
    }
  } while (nextCursor);
  
  console.log(`Retrieved a total of ${allResources.length} resources from Cloudinary.`);
  
  // Organize by folder
  const resourcesByFolder = organizeByFolder(allResources);
  console.log('Resources by folder:');
  Object.keys(resourcesByFolder).forEach(folder => {
    console.log(`  ${folder}: ${resourcesByFolder[folder].length} items`);
  });
  
  return allResources;
}

// Function to extract category from Cloudinary path
function extractCategory(publicId) {
  if (!publicId.includes('/')) {
    return 'uncategorized';
  }
  return publicId.split('/')[0];
}

// Function to get existing media from Supabase
async function getExistingMedia() {
  console.log('Fetching existing records from Supabase...');
  
  const { data, error } = await supabase
    .from('media')
    .select('cloudinary_id, id');
    
  if (error) {
    console.error('Error fetching from Supabase:', error);
    return [];
  }
  
  console.log(`Found ${data.length} existing records in Supabase.`);
  return data;
}

// Function to determine media type
function getMediaType(resource) {
  return resource.resource_type === 'video' ? 'video' : 'image';
}

// Function to clean up the media table and reset
async function cleanupMediaTable() {
  console.log('Cleaning up media table...');
  
  if (dryRun) {
    console.log('[DRY RUN] Would delete all records from media table');
    return;
  }
  
  // Delete all records
  const { error } = await supabase
    .from('media')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
  if (error) {
    console.error('Error cleaning up media table:', error);
  } else {
    console.log('Successfully cleaned up media table.');
  }
}

// Process resources in batches to avoid overwhelming the database
async function processBatch(resources, existingMediaMap) {
  const records = [];
  
  for (const resource of resources) {
    const cloudinaryId = resource.public_id;
    const exists = existingMediaMap.has(cloudinaryId);
    
    if (exists && !forceUpdate) {
      console.log(`Skipping '${cloudinaryId}' - already exists in Supabase.`);
      continue;
    }
    
    // Extract metadata
    const category = extractCategory(cloudinaryId);
    const title = cloudinaryId.split('/').pop();
    const type = getMediaType(resource);
    const url = resource.secure_url;
    const aspectRatio = resource.width / resource.height;
    
    // Create record for Supabase
    records.push({
      title,
      url,
      type,
      category,
      aspect_ratio: aspectRatio,
      cloudinary_id: cloudinaryId,
      year: new Date().getFullYear(),
      description: '',
      tags: []
    });
  }
  
  if (dryRun) {
    console.log(`[DRY RUN] Would add ${records.length} records`);
    return records.length;
  }
  
  if (records.length === 0) {
    return 0;
  }
  
  try {
    const { data, error } = await supabase
      .from('media')
      .insert(records);
      
    if (error) {
      console.error(`Error adding batch of ${records.length} records:`, error);
      return 0;
    } else {
      console.log(`Successfully added batch of ${records.length} records.`);
      return records.length;
    }
  } catch (error) {
    console.error(`Error processing batch:`, error);
    return 0;
  }
}

// Main function to sync resources
async function syncCloudinaryToSupabase() {
  // First, clean up the table if force update is enabled
  if (forceUpdate) {
    await cleanupMediaTable();
  }
  
  // Get all resources from Cloudinary
  const cloudinaryResources = await getAllCloudinaryResources();
  
  // Get existing media from Supabase
  const existingMedia = await getExistingMedia();
  
  // Create a map for easier lookup
  const existingMediaMap = new Map();
  existingMedia.forEach(item => {
    existingMediaMap.set(item.cloudinary_id, item.id);
  });
  
  // Stats
  let addedCount = 0;
  
  // Process in batches
  for (let i = 0; i < cloudinaryResources.length; i += batchSize) {
    const batch = cloudinaryResources.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(cloudinaryResources.length/batchSize)}`);
    const added = await processBatch(batch, existingMediaMap);
    addedCount += added;
  }
  
  console.log(`
=================================================
              Synchronization Complete
=================================================
Total Cloudinary resources: ${cloudinaryResources.length}
Total existing in Supabase: ${existingMedia.length}
${dryRun ? 'Would have added/updated' : 'Added/updated'}: ${addedCount}
${dryRun ? 'No changes were made (dry run)' : 'Changes have been applied to Supabase'}
  `);
}

// Run the sync process
syncCloudinaryToSupabase().catch(error => {
  console.error('Sync failed:', error);
  process.exit(1);
});