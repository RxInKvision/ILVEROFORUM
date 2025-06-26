/**
 * Script to delete all media items from Supabase and reimport from Cloudinary with correct categories
 * The category will be determined by the Cloudinary folder structure
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Directly use environment variables rather than importing config.js (which is ES module)
const CLOUDINARY_CONFIG = {
  cloud_name: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.REACT_APP_CLOUDINARY_API_KEY,
  api_secret: process.env.REACT_APP_CLOUDINARY_API_SECRET,
};

const SUPABASE_CONFIG = {
  url: process.env.REACT_APP_SUPABASE_URL,
  anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
};

// Fallback to hardcoded values as a last resort if env vars aren't loaded
if (!CLOUDINARY_CONFIG.cloud_name) {
  console.warn("Environment variables not loaded, using hardcoded values");
  
  // Values from your .env file
  CLOUDINARY_CONFIG.cloud_name = 'dp9n1iu8t';
  CLOUDINARY_CONFIG.api_key = '391842157266487';
  CLOUDINARY_CONFIG.api_secret = 'JmhH6ZlhP7W8wMY1ge0LOPsnVaQ';
  
  SUPABASE_CONFIG.url = 'https://vpywezxnlvcykvoqsitg.supabase.co';
  SUPABASE_CONFIG.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZweXdlenhubHZjeWt2b3FzaXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3Njg4ODksImV4cCI6MjA2MjM0NDg4OX0.xWB-95WhkylnK-Qrxd3u7PRD5Bn-6yhrBt9piXOrGbQ';
}

// Debug environment variables
console.log('Configuration:');
console.log('CLOUDINARY_CLOUD_NAME:', CLOUDINARY_CONFIG.cloud_name ? 'Set' : 'NOT SET');
console.log('CLOUDINARY_API_KEY:', CLOUDINARY_CONFIG.api_key ? 'Set' : 'NOT SET');
console.log('CLOUDINARY_API_SECRET:', CLOUDINARY_CONFIG.api_secret ? 'Set' : 'NOT SET');
console.log('SUPABASE_URL:', SUPABASE_CONFIG.url ? 'Set' : 'NOT SET');
console.log('SUPABASE_ANON_KEY:', SUPABASE_CONFIG.anonKey ? 'Set' : 'NOT SET');

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
const dryRun = args.includes('--dry-run') || args.includes('-d');
const skipDelete = args.includes('--skip-delete');
const batchSize = 20; // How many records to insert in a batch

console.log(`
=================================================
   Cloudinary to Supabase Reimport Tool
=================================================
Mode: ${dryRun ? 'Dry Run (no changes will be made)' : 'Live Run'}
Skip Delete: ${skipDelete ? 'Yes' : 'No'}
`);

// Function to delete all media records from Supabase
async function deleteAllMediaRecords() {
  if (skipDelete) {
    console.log('Skipping delete operation as --skip-delete flag is set.');
    return 'media';
  }
  
  console.log('Deleting all media records from Supabase...');
  
  if (dryRun) {
    console.log('[DRY RUN] Would delete all records from the media table');
    return 'media';
  }
  
  // Determine which table to use
  let tableName = 'media'; // Default to 'media'
  
  try {
    // Try to access the 'media' table
    const { data: mediaTableData, error: mediaTableError } = await supabase
      .from('media')
      .select('count')
      .limit(1);
      
    if (mediaTableError) {
      console.log('Media table check error:', mediaTableError.message);
      
      // Try 'media_items' table instead
      const { data: mediaItemsTableData, error: mediaItemsTableError } = await supabase
        .from('media_items')
        .select('count')
        .limit(1);
        
      if (mediaItemsTableError) {
        console.error('Error: Could not find a valid table (media or media_items)');
        console.error('Media items table check error:', mediaItemsTableError.message);
        process.exit(1);
      } else {
        tableName = 'media_items';
      }
    }
    
    console.log(`Using table: ${tableName}`);
    
    // Delete all records from the table
    const { error } = await supabase
      .from(tableName)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
    if (error) {
      console.error(`Error deleting records from ${tableName} table:`, error.message);
      throw error;
    } else {
      console.log(`Successfully deleted all records from ${tableName} table.`);
    }
    
    return tableName;
  } catch (error) {
    console.error('Failed to delete records:', error.message);
    process.exit(1);
  }
}

// Map Cloudinary folders to corresponding categories
const folderToCategory = {
  'origins': 'origins',
  '70': '70',
  '80': '80',
  '90': '90',
  '00': '00',
  '10-20': '10-20',
  'extras': 'extras'
};

// Function to get all resources from Cloudinary using the search API
async function getAllCloudinaryResources() {
  console.log('Fetching all resources from Cloudinary using search API...');
  
  try {
    const allResources = [];
    
    // First get uncategorized resources (not in any folder)
    const uncategorizedResources = await getUncategorizedResources();
    allResources.push(...uncategorizedResources);
    
    // Process each folder/category
    for (const [folder, category] of Object.entries(folderToCategory)) {
      console.log(`Processing folder: ${folder}`);
      
      try {
        // Get resources from Cloudinary folder using search API
        console.log(`Searching Cloudinary for assets in folder: ${folder}`);
        
        const result = await cloudinary.search
          .expression(`folder:${folder}`)
          .sort_by('created_at', 'desc')
          .max_results(500)
          .execute();
        
        const resources = result.resources;
        
        console.log(`Found ${resources.length} resources in folder ${folder}`);
        
        // Add category information to each resource
        const resourcesWithCategory = resources.map(res => ({
          ...res,
          category: category // Use the mapped category
        }));
        
        allResources.push(...resourcesWithCategory);
      } catch (error) {
        console.error(`Error processing folder ${folder}:`, error.message);
      }
    }
    
    console.log(`Total resources found: ${allResources.length}`);
    return allResources;
  } catch (error) {
    console.error('Error fetching Cloudinary resources:', error.message);
    process.exit(1);
  }
}

// Function to get resources that are not in any folder (uncategorized)
async function getUncategorizedResources() {
  console.log('Fetching uncategorized resources (not in any folder)...');
  
  try {
    // Search for resources that don't have a folder prefix
    const result = await cloudinary.search
      .expression('!folder:*')
      .sort_by('created_at', 'desc')
      .max_results(500)
      .execute();
    
    const resources = result.resources;
    
    // Add category information to each resource
    const resourcesWithCategory = resources.map(res => ({
      ...res,
      category: 'uncategorized'
    }));
    
    console.log(`Found ${resourcesWithCategory.length} uncategorized resources`);
    return resourcesWithCategory;
  } catch (error) {
    console.error('Error fetching uncategorized resources:', error.message);
    return [];
  }
}

// Function to insert resources into Supabase in batches
async function insertResourcesIntoSupabase(resources, tableName) {
  console.log(`Inserting ${resources.length} resources into Supabase table ${tableName}...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process in batches
  for (let i = 0; i < resources.length; i += batchSize) {
    const batch = resources.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(resources.length/batchSize)}`);
    
    // Prepare records for insertion
    const records = batch.map(resource => {
      // Extract title (filename) from public_id
      const title = resource.public_id.includes('/') 
        ? resource.public_id.split('/').pop() 
        : resource.public_id;
      
      // Determine media type
      const type = resource.resource_type === 'video' ? 'video' : 'image';
      
      // Calculate aspect ratio
      const aspectRatio = resource.width && resource.height ? 
                         resource.width / resource.height : 1;
      
      // Extract tags if available
      const tags = resource.tags || [];
      
      // For 'media' table structure (from first script)
      if (tableName === 'media') {
        return {
          title,
          url: resource.secure_url,
          type,
          category: resource.category,
          aspect_ratio: aspectRatio,
          cloudinary_id: resource.public_id,
          year: new Date().getFullYear(),
          description: '',
          tags
        };
      } 
      // For 'media_items' table structure (from second script)
      else {
        return {
          title,
          description: `${title} from ${resource.category}`,
          category: resource.category,
          type,
          cloudinary_public_id: resource.public_id,
          cloudinary_url: resource.url,
          cloudinary_secure_url: resource.secure_url,
          cloudinary_resource_type: resource.resource_type,
          cloudinary_format: resource.format,
          cloudinary_version: resource.version,
          aspect_ratio: aspectRatio,
          width: resource.width || 0,
          height: resource.height || 0,
          tags,
          source: 'cloudinary',
          created_at: new Date(resource.created_at).toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    });
    
    if (dryRun) {
      console.log(`[DRY RUN] Would insert ${records.length} records into ${tableName} table`);
      successCount += records.length;
      continue;
    }
    
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(records);
        
      if (error) {
        console.error(`Error inserting batch of ${records.length} records:`, error.message);
        errorCount += records.length;
      } else {
        console.log(`Successfully inserted batch of ${records.length} records.`);
        successCount += records.length;
      }
    } catch (error) {
      console.error(`Error processing batch:`, error.message);
      errorCount += records.length;
    }
  }
  
  console.log(`
Insertion complete:
- Successfully inserted: ${successCount} records
- Failed to insert: ${errorCount} records
`);
  
  return { successCount, errorCount };
}

// Main function
async function reimportCloudinaryToSupabase() {
  try {
    // Step 1: Delete all existing records and get the table name
    const tableName = await deleteAllMediaRecords();
    
    // Step 1.5: Verify table structure
    await verifyTableStructure(tableName);
    
    // Step 2: Get all resources from Cloudinary with correct categories
    const resources = await getAllCloudinaryResources();
    
    if (resources.length === 0) {
      console.error('No resources found in Cloudinary. Please check your Cloudinary account.');
      process.exit(1);
    }
    
    // Step 3: Insert resources into Supabase
    const { successCount, errorCount } = await insertResourcesIntoSupabase(resources, tableName);
    
    console.log(`
=================================================
              Reimport Complete
=================================================
Total resources processed: ${resources.length}
Successfully imported: ${successCount}
Failed to import: ${errorCount}
Categories imported: ${[...new Set(resources.map(r => r.category))].join(', ')}
${dryRun ? 'No changes were made (dry run)' : 'Changes have been applied to Supabase'}
`);
  } catch (error) {
    console.error('Reimport failed:', error.message);
    process.exit(1);
  }
}

// Add a function to verify table structure
async function verifyTableStructure(tableName) {
  console.log(`Verifying structure of ${tableName} table...`);
  
  try {
    if (tableName === 'media') {
      // Check for category column in media table
      const { data, error } = await supabase
        .from(tableName)
        .select('category')
        .limit(1);
      
      if (error) {
        console.error(`Error: The 'category' column might be missing in ${tableName} table:`, error.message);
        console.log('Will attempt to proceed anyway, but migration might be needed.');
      } else {
        console.log(`The ${tableName} table structure looks valid.`);
      }
    }
    else if (tableName === 'media_items') {
      // Check for category column in media_items table
      const { data, error } = await supabase
        .from(tableName)
        .select('category')
        .limit(1);
      
      if (error) {
        console.error(`Error: The 'category' column might be missing in ${tableName} table:`, error.message);
        console.log('Will attempt to proceed anyway, but migration might be needed.');
      } else {
        console.log(`The ${tableName} table structure looks valid.`);
      }
    }
  } catch (error) {
    console.error('Error verifying table structure:', error.message);
  }
}

// Verify Cloudinary connection first
console.log('Verifying Cloudinary connection...');
cloudinary.api.ping((error, result) => {
  if (error) {
    console.error('Cloudinary connection failed:', error.message);
    process.exit(1);
  } else {
    console.log('Cloudinary connection successful:', result);
    // Continue with import after successful connection
    reimportCloudinaryToSupabase();
  }
});