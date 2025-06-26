/**
 * Script to synchronize existing Cloudinary media to Supabase
 * This will fetch all resources from your Cloudinary account and add them to Supabase
 * 
 * Updated to correctly extract categories from Cloudinary folder structure
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

// Function to get all folders from Cloudinary
async function getAllCloudinaryFolders() {
  console.log('Fetching folders from Cloudinary...');
  
  try {
    const result = await cloudinary.api.root_folders();
    
    console.log(`Found ${result.folders.length} root folders`);
    return result.folders.map(folder => folder.path);
  } catch (error) {
    console.error('Error fetching Cloudinary folders:', error);
    return [];
  }
}

// Function to get resources from a specific folder
async function getResourcesFromFolder(folder) {
  console.log(`Fetching resources from folder: ${folder}`);
  const allResources = [];
  
  // First get images
  let nextCursor = null;
  do {
    const options = {
      resource_type: 'image',
      type: 'upload',
      prefix: `${folder}/`,
      max_results: 500,
      ...(nextCursor && { next_cursor: nextCursor })
    };
    
    try {
      const result = await cloudinary.api.resources(options);
      allResources.push(...result.resources);
      nextCursor = result.next_cursor;
      console.log(`Retrieved ${result.resources.length} images from ${folder}. Total so far: ${allResources.length}`);
    } catch (error) {
      console.error(`Error fetching Cloudinary images from ${folder}:`, error);
      break;
    }
  } while (nextCursor);
  
  // Then get videos
  nextCursor = null;
  do {
    const options = {
      resource_type: 'video',
      type: 'upload',
      prefix: `${folder}/`,
      max_results: 500,
      ...(nextCursor && { next_cursor: nextCursor })
    };
    
    try {
      const result = await cloudinary.api.resources(options);
      allResources.push(...result.resources);
      nextCursor = result.next_cursor;
      console.log(`Retrieved ${result.resources.length} videos from ${folder}. Total so far: ${allResources.length}`);
    } catch (error) {
      console.error(`Error fetching Cloudinary videos from ${folder}:`, error);
      break;
    }
  } while (nextCursor);
  
  console.log(`Retrieved a total of ${allResources.length} resources from folder ${folder}`);
  
  // Add the category information to each resource
  return allResources.map(resource => ({
    ...resource,
    category: folder
  }));
}

// Also get resources from the root folder (not in any subfolder)
async function getRootResources() {
  console.log('Fetching resources from root (uncategorized)...');
  const allResources = [];
  
  // First get images
  let nextCursor = null;
  do {
    const options = {
      resource_type: 'image',
      type: 'upload',
      max_results: 500,
      ...(nextCursor && { next_cursor: nextCursor })
    };
    
    try {
      const result = await cloudinary.api.resources(options);
      // Filter out resources that have a / in their public_id (those are in subfolders)
      const rootResources = result.resources.filter(resource => !resource.public_id.includes('/'));
      allResources.push(...rootResources);
      nextCursor = result.next_cursor;
      console.log(`Retrieved ${rootResources.length} root images. Total so far: ${allResources.length}`);
    } catch (error) {
      console.error('Error fetching Cloudinary root images:', error);
      break;
    }
  } while (nextCursor);
  
  // Then get videos
  nextCursor = null;
  do {
    const options = {
      resource_type: 'video',
      type: 'upload',
      max_results: 500,
      ...(nextCursor && { next_cursor: nextCursor })
    };
    
    try {
      const result = await cloudinary.api.resources(options);
      // Filter out resources that have a / in their public_id (those are in subfolders)
      const rootResources = result.resources.filter(resource => !resource.public_id.includes('/'));
      allResources.push(...rootResources);
      nextCursor = result.next_cursor;
      console.log(`Retrieved ${rootResources.length} root videos. Total so far: ${allResources.length}`);
    } catch (error) {
      console.error('Error fetching Cloudinary root videos:', error);
      break;
    }
  } while (nextCursor);
  
  console.log(`Retrieved a total of ${allResources.length} resources from root folder`);
  
  // Add the category information to each resource
  return allResources.map(resource => ({
    ...resource,
    category: 'uncategorized'
  }));
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
    const category = resource.category; // Use the category we added earlier
    const title = cloudinaryId.includes('/') 
      ? cloudinaryId.split('/').pop() // For resources in folders
      : cloudinaryId; // For root resources
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
  
  // Get all folders from Cloudinary
  const folders = await getAllCloudinaryFolders();
  
  // Also get resources without a folder (root level)
  const rootResources = await getRootResources();
  
  // Get resources from each folder
  let allResources = [...rootResources];
  
  for (const folder of folders) {
    const folderResources = await getResourcesFromFolder(folder);
    allResources = [...allResources, ...folderResources];
  }
  
  console.log(`Total resources: ${allResources.length}`);
  
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
  for (let i = 0; i < allResources.length; i += batchSize) {
    const batch = allResources.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(allResources.length/batchSize)}`);
    const added = await processBatch(batch, existingMediaMap);
    addedCount += added;
  }
  
  console.log(`
=================================================
              Synchronization Complete
=================================================
Total Cloudinary resources: ${allResources.length}
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