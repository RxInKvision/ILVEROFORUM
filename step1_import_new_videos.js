// Filename: step1_import_new_videos.js
require('dotenv').config(); // Loads .env file from the current directory (where you run `node`)
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

// --- Configuration ---
const CLOUDINARY_CONFIG = {
    cloud_name: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.REACT_APP_CLOUDINARY_API_KEY,
    api_secret: process.env.REACT_APP_CLOUDINARY_API_SECRET,
};

const SUPABASE_CONFIG = {
    url: process.env.REACT_APP_SUPABASE_URL,
    // Using anonKey as per your previous script. If inserts fail due to RLS, consider service_role_key.
    // For admin scripts performing writes, service_role_key is generally safer if RLS is active.
    serviceKey: process.env.REACT_APP_SUPABASE_SERVICE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
};

// Validate configuration
console.log('--- Loaded Configuration ---');
console.log('Cloudinary Cloud Name:', CLOUDINARY_CONFIG.cloud_name || 'NOT SET');
console.log('Cloudinary API Key:', CLOUDINARY_CONFIG.api_key ? 'Set' : 'NOT SET');
console.log('Supabase URL:', SUPABASE_CONFIG.url || 'NOT SET');
console.log('Supabase Key Type Used:', process.env.REACT_APP_SUPABASE_SERVICE_KEY ? 'Service Key' : 'Anon Key (if Service Key not set)');
console.log('---------------------------');


if (!CLOUDINARY_CONFIG.cloud_name || !CLOUDINARY_CONFIG.api_key || !CLOUDINARY_CONFIG.api_secret) {
    console.error('Error: Missing Cloudinary configuration. Please check your .env file.');
    process.exit(1);
}
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.serviceKey) { // Check serviceKey (or anonKey if that's intended)
    console.error('Error: Missing Supabase configuration (URL or Key). Please check your .env file.');
    process.exit(1);
}

cloudinary.config(CLOUDINARY_CONFIG);
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.serviceKey);

// Folders to scan in Cloudinary, based on your screenshot.
// Ensure these folder names EXACTLY match your Cloudinary folder names.
const CLOUDINARY_FOLDERS_TO_SCAN = ['00', '10-20', '70', '80', '90', 'extra', 'origins'];
// You can add "" to scan the root if you have videos there: e.g., ["", '00', '10-20', ...]
// If a folder path has subfolders like 'movies/action', it should be 'movies/action'.
// For root folders like '70', just '70' is correct.

const SUPABASE_TABLE_NAME = 'media';
const BATCH_SIZE = 20;
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');

const VALID_VIDEO_FORMATS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv', 'm4v', 'ogv'];

console.log(`
=================================================
   Step 1: Initial Cloudinary Video Import
   (Filters for actual video formats, uses folder as category)
=================================================
Mode: ${DRY_RUN ? 'Dry Run (no changes will be made to Supabase)' : 'Live Run'}
Cloudinary Folders to Scan: ${CLOUDINARY_FOLDERS_TO_SCAN.join(', ') || (CLOUDINARY_FOLDERS_TO_SCAN.includes("") ? "Root & specific folders" : "Specific folders only - Check array if root scan desired")}
Supabase Table: ${SUPABASE_TABLE_NAME}
Valid Video Formats: ${VALID_VIDEO_FORMATS.join(', ')}
`);

async function getExistingSupabaseVideoIds() {
    console.log(`Workspaceing existing video cloudinary_ids from Supabase table '${SUPABASE_TABLE_NAME}'...`);
    const existingIds = new Set();
    let offset = 0;
    const limit = 1000;

    try {
        while (true) {
            const { data, error } = await supabase
                .from(SUPABASE_TABLE_NAME)
                .select('cloudinary_id')
                .eq('type', 'video')
                .not('cloudinary_id', 'is', null)
                .range(offset, offset + limit - 1);

            if (error) {
                console.error('Error fetching existing video IDs from Supabase:', error.message);
                throw error; // Propagate error to stop the script
            }
            if (!data || data.length === 0) break;
            data.forEach(item => { if (item.cloudinary_id) existingIds.add(item.cloudinary_id); });
            if (data.length < limit) break;
            offset += limit;
        }
        console.log(`Found ${existingIds.size} existing video cloudinary_ids in Supabase.`);
        return existingIds;
    } catch (error) {
        console.error('Failed to get existing Supabase video IDs. Exiting.', error);
        process.exit(1); // Exit if we can't confirm existing IDs
    }
}

async function fetchAssetsFromCloudinaryFolder(folderName) {
    const isRootFolder = folderName === ""; // Specific check for root if you map ""
    const logIdentifier = isRootFolder ? 'Cloudinary Root' : folderName;
    console.log(`Workspaceing items with resource_type:video from Cloudinary location: '${logIdentifier}'...`);
    const itemsFromSearch = [];
    let nextCursor = null;

    try {
        do {
            // Using cloudinary.search as it's more flexible for folder logic
            // If this API call fails, it means the Search API might not be enabled/provisioned for your account.
            const searchExpression = `folder:"${folderName}" AND resource_type:video`;

            const result = await cloudinary.search
                .expression(searchExpression)
                .sort_by('public_id', 'asc')
                .max_results(100) // Search API limit per page
                .with_field('tags')
                .with_field('context')
                .with_field('format')
                .with_field('resource_type')
                .with_field('width')
                .with_field('height')
                .with_field('duration')
                .with_field('created_at')
                .next_cursor(nextCursor)
                .execute();

            itemsFromSearch.push(...result.resources);
            nextCursor = result.next_cursor;
            console.log(`  Fetched ${result.resources.length} items (Cloudinary resource_type 'video') from '${logIdentifier}'. Total for this folder so far: ${itemsFromSearch.length}. Has more: ${!!nextCursor}`);
        } while (nextCursor);

        console.log(`Total items (Cloudinary resource_type 'video') found in Cloudinary location '${logIdentifier}': ${itemsFromSearch.length}`);
        return itemsFromSearch;
    } catch (error) {
        console.error(`Error fetching items from Cloudinary location '${logIdentifier}':`);
        console.error("  Full error from Cloudinary:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        if (error.error && error.error.message) {
            console.error("  Cloudinary error message:", error.error.message);
        }
        if (error.http_code === 401 || error.http_code === 403) {
            console.error("  This might be an API key permission issue OR the Search API might not be enabled/provisioned for your Cloudinary account/plan.");
        }
        return []; // Return empty array on error for this folder
    }
}

async function insertVideosToSupabase(videoRecords) {
    if (videoRecords.length === 0) {
        console.log('No new video records to insert.');
        return 0;
    }
    console.log(`Attempting to insert ${videoRecords.length} new video records into Supabase...`);
    let successCount = 0;
    for (let i = 0; i < videoRecords.length; i += BATCH_SIZE) {
        const batch = videoRecords.slice(i, i + BATCH_SIZE);
        console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(videoRecords.length / BATCH_SIZE)} (size: ${batch.length})`);
        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would insert ${batch.length} video records:`);
            batch.forEach(record => console.log(`    - Title: ${record.title}, Category: ${record.category}, Cloudinary ID: ${record.cloudinary_id}, Format: ${record.format}`));
            successCount += batch.length;
            continue;
        }
        try {
            const { data, error } = await supabase.from(SUPABASE_TABLE_NAME).insert(batch).select();
            if (error) {
                console.error('  Error inserting batch into Supabase:', error.message);
                if (error.details) console.error('  Error Details:', error.details);
            } else {
                console.log(`  Successfully inserted ${data ? data.length : batch.length} video records.`); // data might be null on success for some configs
                successCount += (data ? data.length : batch.length);
            }
        } catch (e) {
            console.error('  Exception during Supabase insert batch:', e.message);
        }
    }
    console.log(`Total successfully inserted records (or would insert in dry run): ${successCount}`);
    return successCount;
}

function extractContextValue(context, key) {
    return (context && context.custom && context.custom[key]) ? context.custom[key] : null;
}

async function syncNewVideos() {
    try {
        await cloudinary.api.ping().catch(err => {
            console.error("Cloudinary ping failed. Check API credentials and connection.", err);
            process.exit(1);
        });
        console.log("Cloudinary connection successful (ping).");

        const existingSupabaseIds = await getExistingSupabaseVideoIds();
        const allNewVideoRecordsToInsert = [];
        let totalCloudinaryItemsScannedAsVideo = 0;
        let totalActualVideosAfterFormatFilter = 0;

        // Define your folder to category mapping here
        // Key: Cloudinary folder name, Value: Supabase category name
        const folderCategoryMapping = {
            '00': '00',
            '10-20': '10-20',
            '70': '70s Soundtracks', // Example: more descriptive category
            '80': '80s Music Videos',
            '90': '90s Film Clips',
            'extra': 'Extras',
            'origins': 'Origins',
            // If you have videos in the root that you want to categorize as 'uncategorized':
            // "": "uncategorized" // An empty string "" for the root folder
        };
        
        const foldersToProcess = CLOUDINARY_FOLDERS_TO_SCAN; // Using the array defined at the top
        // If you want to include root, add "" to CLOUDINARY_FOLDERS_TO_SCAN if not already there
        // or handle it separately:
        // if (!foldersToProcess.includes("")) foldersToProcess.push(""); // Example to add root if not mapped

        for (const folder of foldersToProcess) {
            const categoryForSupabase = folderCategoryMapping[folder] || folder; // Use mapped category or folder name itself
            const cloudinaryItemsFromSearch = await fetchAssetsFromCloudinaryFolder(folder); // Renamed function for clarity
            totalCloudinaryItemsScannedAsVideo += cloudinaryItemsFromSearch.length;

            for (const item of cloudinaryItemsFromSearch) {
                if (!item.public_id) {
                    console.warn(`  Skipping item with missing public_id in folder '${folder}':`, JSON.stringify(item).substring(0, 200));
                    continue;
                }

                const itemFormat = item.format ? item.format.toLowerCase() : '';
                if (!VALID_VIDEO_FORMATS.includes(itemFormat)) {
                    console.log(`  --> Filtering out: '${item.public_id}' from folder '${folder}' due to non-video format: '${itemFormat}' (Cloudinary resource_type: ${item.resource_type})`);
                    continue;
                }
                totalActualVideosAfterFormatFilter++;

                if (existingSupabaseIds.has(item.public_id)) {
                    continue; 
                }

                const title = item.filename || item.public_id.substring(item.public_id.lastIndexOf('/') + 1);
                
                let yearOfCreation = new Date().getFullYear();
                if (item.created_at) {
                    try {
                        const creationDate = new Date(item.created_at);
                        if (!isNaN(creationDate.getFullYear())) yearOfCreation = creationDate.getFullYear();
                    } catch (e) { /* Use default */ }
                }

                const record = {
                    title: title,
                    url: item.secure_url,
                    type: 'video',
                    category: categoryForSupabase, 
                    tags: item.tags || [],
                    aspect_ratio: (item.width && item.height) ? parseFloat((item.width / item.height).toFixed(6)) : (16 / 9),
                    description: extractContextValue(item.context, 'description') || '', 
                    year: yearOfCreation,
                    cloudinary_id: item.public_id,
                    musician: extractContextValue(item.context, 'musician') || null,
                    width: item.width || null,
                    height: item.height || null,
                    format: item.format || null,
                    duration: item.duration ? parseFloat(item.duration.toFixed(4)) : null,
                    thumbnailUrl: null, 
                };
                allNewVideoRecordsToInsert.push(record);
            }
        }

        console.log(`\nTotal items returned by Cloudinary search (resource_type:video query, across specified folders): ${totalCloudinaryItemsScannedAsVideo}`);
        console.log(`Total actual video files (after script's format filtering): ${totalActualVideosAfterFormatFilter}`);
        console.log(`Found ${allNewVideoRecordsToInsert.length} new actual videos to insert (not already in Supabase).`);

        if (allNewVideoRecordsToInsert.length > 0) {
            await insertVideosToSupabase(allNewVideoRecordsToInsert);
        } else if (totalActualVideosAfterFormatFilter > 0 && allNewVideoRecordsToInsert.length === 0) {
            console.log("All actual video files found in specified Cloudinary folders already exist in Supabase.");
        }

        console.log(`
=================================================
              Sync Summary
=================================================
Total Cloudinary folders scanned: ${foldersToProcess.length}
Total items processed from Cloudinary (matching resource_type:video query): ${totalCloudinaryItemsScannedAsVideo}
Total actual video files (after format filter): ${totalActualVideosAfterFormatFilter}
Total existing videos in Supabase (before sync): ${existingSupabaseIds.size}
New actual videos ${DRY_RUN ? 'that would be added' : 'added'} to Supabase: ${allNewVideoRecordsToInsert.length}
Mode: ${DRY_RUN ? 'Dry Run (no changes were made)' : 'Live Run'}
=================================================
        `);

    } catch (error) {
        console.error('An error occurred during the sync process:', error);
        process.exit(1);
    }
}

syncNewVideos();