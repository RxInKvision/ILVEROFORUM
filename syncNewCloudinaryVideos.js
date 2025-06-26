// Filename: syncNewCloudinaryVideos.js
require('dotenv').config();
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
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
};

// Cloudinary configuration for easy access to cloud_name
const CLOUDINARY_CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;

// Validate configuration
if (!CLOUDINARY_CONFIG.cloud_name || !CLOUDINARY_CONFIG.api_key || !CLOUDINARY_CONFIG.api_secret) {
    console.error('Error: Missing Cloudinary configuration. Please check your .env file.');
    process.exit(1);
}

if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    console.error('Error: Missing Supabase configuration. Please check your .env file.');
    process.exit(1);
}

if (!CLOUDINARY_CLOUD_NAME) {
    console.error("Error: REACT_APP_CLOUDINARY_CLOUD_NAME is not set in .env. Cannot generate thumbnail URLs.");
    process.exit(1);
}

// Configure Cloudinary
cloudinary.config(CLOUDINARY_CONFIG);

// Configure Supabase
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Folders to scan in Cloudinary
const CLOUDINARY_FOLDERS_TO_SCAN = ['00', '10-20', '70', '80', '90', 'extra', 'origins'];
const SUPABASE_TABLE_NAME = 'media';
const BATCH_SIZE = 20; // Number of records to insert into Supabase at a time
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');

console.log(`
=================================================
   Cloudinary to Supabase NEW Video Sync Tool
=================================================
Mode: ${DRY_RUN ? 'Dry Run (no changes will be made to Supabase)' : 'Live Run'}
Cloudinary Folders: ${CLOUDINARY_FOLDERS_TO_SCAN.join(', ')}
Supabase Table: ${SUPABASE_TABLE_NAME}
`);

/**
 * Fetches existing video cloudinary_ids from Supabase.
 * @returns {Promise<Set<string>>} A set of existing cloudinary_ids.
 */
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
                throw error;
            }

            if (!data || data.length === 0) break;
            data.forEach(item => item.cloudinary_id && existingIds.add(item.cloudinary_id));
            if (data.length < limit) break;
            offset += limit;
        }
        console.log(`Found ${existingIds.size} existing video cloudinary_ids in Supabase.`);
        return existingIds;
    } catch (error) {
        console.error('Failed to get existing Supabase video IDs:', error);
        return existingIds;
    }
}

/**
 * Fetches ACTUAL video resources from a specific Cloudinary folder, filtering out audio formats.
 * @param {string} folderName - The name of the Cloudinary folder.
 * @returns {Promise<Array<object>>} A list of Cloudinary video resources.
 */
async function fetchVideosFromCloudinaryFolder(folderName) {
    console.log(`Workspaceing videos from Cloudinary folder: '${folderName}'...`);
    const allActualVideoResourcesInFolder = [];
    let nextCursor = null;
    let totalFetchedItemsInFolder = 0;
    const knownAudioFormats = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'];

    try {
        do {
            let searchRequest = cloudinary.search
                .expression(`folder:"${folderName}" AND resource_type:video`)
                .sort_by('public_id', 'asc')
                .max_results(100);

            if (nextCursor) {
                searchRequest = searchRequest.next_cursor(nextCursor);
            }
            
            const result = await searchRequest.execute();
            totalFetchedItemsInFolder += result.resources.length;
            const currentBatchActualVideos = [];

            for (const resource of result.resources) {
                let isGenuineVideo = true;
                if (resource.format) {
                    const formatLower = resource.format.toLowerCase();
                    if (knownAudioFormats.includes(formatLower)) {
                        console.log(`  [FILTER] Item '${resource.public_id}' (format: ${resource.format}) in folder '${folderName}' is an audio file. Skipping.`);
                        isGenuineVideo = false;
                    }
                } else {
                    console.warn(`  [FILTER] Item '${resource.public_id}' in folder '${folderName}' has resource_type 'video' but 'format' metadata was NOT found. Skipping to be safe.`);
                    isGenuineVideo = false;
                }

                if (isGenuineVideo) {
                    currentBatchActualVideos.push(resource);
                }
            }
            
            allActualVideoResourcesInFolder.push(...currentBatchActualVideos);
            nextCursor = result.next_cursor;
            console.log(`  Fetched ${result.resources.length} items in this batch from '${folderName}'. Filtered to ${currentBatchActualVideos.length} actual videos. Total for folder: ${allActualVideoResourcesInFolder.length}. More: ${!!nextCursor}`);
        } while (nextCursor);

        console.log(`Total items fetched by API from folder '${folderName}': ${totalFetchedItemsInFolder}`);
        console.log(`Actual video files identified in folder '${folderName}': ${allActualVideoResourcesInFolder.length}`);
        return allActualVideoResourcesInFolder;
    } catch (error) {
        console.error(`Error fetching videos from Cloudinary folder '${folderName}':`);
        console.error('Full error object:', error);
        if (error && error.error && error.error.message) {
            console.error('Cloudinary specific error message:', error.error.message);
        }
        return [];
    }
}

/**
 * Inserts new video records into Supabase.
 * @param {Array<object>} videoRecords - An array of records to insert.
 */
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
            batch.forEach(record => console.log(`    - Title: ${record.title}, Cat: ${record.category}, CID: ${record.cloudinary_id}, VidURL: ${record.url}, ThumbURL: ${record.thumbnail_url}`));
            successCount += batch.length;
            continue;
        }

        try {
            const { error } = await supabase.from(SUPABASE_TABLE_NAME).insert(batch);
            if (error) {
                console.error('  Error inserting batch into Supabase:', error.message);
            } else {
                console.log(`  Successfully inserted ${batch.length} video records.`);
                successCount += batch.length;
            }
        } catch (e) {
            console.error('  Exception during Supabase insert batch:', e.message);
        }
    }
    console.log(`Total successfully inserted records (or would insert in dry run): ${successCount}`);
    return successCount;
}

/**
 * Main synchronization function.
 */
async function syncNewVideos() {
    try {
        const existingSupabaseIds = await getExistingSupabaseVideoIds();
        const allNewVideoRecords = [];
        let totalCloudinaryVideosScannedOverall = 0;

        for (const folder of CLOUDINARY_FOLDERS_TO_SCAN) {
            const cloudinaryVideosInFolder = await fetchVideosFromCloudinaryFolder(folder);
            totalCloudinaryVideosScannedOverall += cloudinaryVideosInFolder.length;

            for (const video of cloudinaryVideosInFolder) {
                if (!video.public_id) {
                    console.warn(`  Skipping video with missing public_id in folder '${folder}':`, video);
                    continue;
                }
                if (existingSupabaseIds.has(video.public_id)) continue;

                const title = video.filename || video.public_id.split('/').pop();
                const thumbnailTransformation = "w_480,h_270,c_fill,pg_1,q_auto,f_jpg";
                const thumbnailUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/${thumbnailTransformation}/${video.public_id}.jpg`;

                const record = {
                    title: title,
                    url: video.secure_url,
                    thumbnail_url: thumbnailUrl, // Added thumbnail URL
                    type: 'video',
                    category: folder,
                    tags: video.tags || [],
                    aspect_ratio: (video.width && video.height) ? (video.width / video.height) : (16 / 9),
                    description: '',
                    year: video.created_at ? new Date(video.created_at).getFullYear() : new Date().getFullYear(),
                    cloudinary_id: video.public_id,
                };
                allNewVideoRecords.push(record);
            }
        }

        console.log(`\nFound ${allNewVideoRecords.length} new actual video files across all scanned Cloudinary folders.`);

        if (allNewVideoRecords.length > 0) {
            await insertVideosToSupabase(allNewVideoRecords);
        }

        console.log(`
=================================================
              Sync Summary
=================================================
Total Cloudinary folders scanned: ${CLOUDINARY_FOLDERS_TO_SCAN.length}
Total actual Cloudinary videos processed (after filtering): ${totalCloudinaryVideosScannedOverall}
Total existing videos in Supabase (before sync): ${existingSupabaseIds.size}
New videos ${DRY_RUN ? 'that would be added' : 'added'} to Supabase: ${allNewVideoRecords.length}
Mode: ${DRY_RUN ? 'Dry Run (no changes were made)' : 'Live Run'}
=================================================
        `);

    } catch (error) {
        console.error('An error occurred during the sync process:', error);
        process.exit(1);
    }
}

// Run the synchronization
syncNewVideos();