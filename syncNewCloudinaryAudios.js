// Filename: syncNewCloudinaryAudios.js
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
const BATCH_SIZE = 20;
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');
const KNOWN_AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'];

console.log(`
=================================================
  Cloudinary to Supabase NEW Audio Sync Tool
=================================================
Mode: ${DRY_RUN ? 'Dry Run (no changes will be made to Supabase)' : 'Live Run'}
Cloudinary Folders: ${CLOUDINARY_FOLDERS_TO_SCAN.join(', ')}
Supabase Table: ${SUPABASE_TABLE_NAME}
`);

/**
 * Fetches existing audio cloudinary_ids from Supabase.
 * @returns {Promise<Set<string>>} A set of existing cloudinary_ids.
 */
async function getExistingSupabaseAudioIds() {
    console.log(`Workspaceing existing audio cloudinary_ids from Supabase table '${SUPABASE_TABLE_NAME}'...`);
    const existingIds = new Set();
    let offset = 0;
    const limit = 1000;

    try {
        while (true) {
            const { data, error } = await supabase
                .from(SUPABASE_TABLE_NAME)
                .select('cloudinary_id')
                .eq('type', 'audio')
                .not('cloudinary_id', 'is', null)
                .range(offset, offset + limit - 1);

            if (error) {
                console.error('Error fetching existing audio IDs from Supabase:', error.message);
                throw error;
            }

            if (!data || data.length === 0) break;
            data.forEach(item => item.cloudinary_id && existingIds.add(item.cloudinary_id));
            if (data.length < limit) break;
            offset += limit;
        }
        console.log(`Found ${existingIds.size} existing audio cloudinary_ids in Supabase.`);
        return existingIds;
    } catch (error) {
        console.error('Failed to get existing Supabase audio IDs:', error);
        return existingIds;
    }
}

/**
 * Fetches resources from a specific Cloudinary folder, then filters for audio formats.
 * @param {string} folderName - The name of the Cloudinary folder.
 * @returns {Promise<Array<object>>} A list of Cloudinary audio resources.
 */
async function fetchAudiosFromCloudinaryFolder(folderName) {
    console.log(`Workspaceing resources from Cloudinary folder '${folderName}' (to filter for audio)...`);
    const allActualAudioResourcesInFolder = [];
    let nextCursor = null;
    let totalFetchedItemsInFolder = 0;

    try {
        do {
            // Search for resource_type:video, as audio might be categorized under video by Cloudinary's Search API
            // or if 'audio' resource_type isn't supported in this specific search context.
            let searchRequest = cloudinary.search
                .expression(`folder:"${folderName}" AND resource_type:video`) // Search for videos
                .with_field('tags') // ensure tags are included if you need them later
                .with_field('context') // ensure context (for custom metadata like alt/caption) is included
                .sort_by('public_id', 'asc')
                .max_results(100); // Max results per page for search API

            if (nextCursor) {
                searchRequest = searchRequest.next_cursor(nextCursor);
            }
            
            const result = await searchRequest.execute();
            totalFetchedItemsInFolder += result.resources.length;
            const currentBatchActualAudios = [];

            for (const resource of result.resources) {
                let isGenuineAudio = false;
                if (resource.format) {
                    const formatLower = resource.format.toLowerCase();
                    if (KNOWN_AUDIO_FORMATS.includes(formatLower)) {
                        // This item, though fetched as resource_type:video, has an audio format.
                        isGenuineAudio = true;
                    } else {
                        // This is a video file, not an audio file we're looking for.
                        // console.log(`  [FILTER-OUT Video] Item '${resource.public_id}' (format: ${formatLower}) in folder '${folderName}'. Skipping for audio sync.`);
                    }
                } else {
                    // Resource type video without a format.
                    console.warn(`  [FILTER-OUT No Format] Item '${resource.public_id}' in folder '${folderName}' has resource_type 'video' but 'format' metadata was NOT found. Skipping for audio sync.`);
                }

                if (isGenuineAudio) {
                    currentBatchActualAudios.push(resource);
                }
            }
            
            allActualAudioResourcesInFolder.push(...currentBatchActualAudios);
            nextCursor = result.next_cursor;
            console.log(`  Fetched ${result.resources.length} items (as video type) in this batch from '${folderName}'. Filtered to ${currentBatchActualAudios.length} actual audios. Total for folder: ${allActualAudioResourcesInFolder.length}. More: ${!!nextCursor}`);
        } while (nextCursor);

        console.log(`Total items (as video type) fetched by API from folder '${folderName}': ${totalFetchedItemsInFolder}`);
        console.log(`Actual audio files identified in folder '${folderName}' after filtering: ${allActualAudioResourcesInFolder.length}`);
        return allActualAudioResourcesInFolder;
    } catch (error) {
        console.error(`Error fetching or filtering resources from Cloudinary folder '${folderName}':`);
        console.error('Full error object:', error);
        if (error && error.error && error.error.message) {
            console.error('Cloudinary specific error message:', error.error.message);
        }
        return [];
    }
}

/**
 * Inserts new audio records into Supabase.
 * @param {Array<object>} audioRecords - An array of records to insert.
 */
async function insertAudiosToSupabase(audioRecords) {
    if (audioRecords.length === 0) {
        console.log('No new audio records to insert.');
        return 0;
    }
    console.log(`Attempting to insert ${audioRecords.length} new audio records into Supabase...`);
    let successCount = 0;

    for (let i = 0; i < audioRecords.length; i += BATCH_SIZE) {
        const batch = audioRecords.slice(i, i + BATCH_SIZE);
        console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(audioRecords.length / BATCH_SIZE)} (size: ${batch.length})`);

        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would insert ${batch.length} audio records:`);
            batch.forEach(record => console.log(`    - Title: ${record.title}, Cat: ${record.category}, CID: ${record.cloudinary_id}, AudioURL: ${record.url}, ThumbURL: ${record.thumbnail_url}`));
            successCount += batch.length;
            continue;
        }

        try {
            const { error } = await supabase.from(SUPABASE_TABLE_NAME).insert(batch);
            if (error) {
                console.error('  Error inserting batch into Supabase:', error.message);
                // Optionally, you could add more detailed error logging, e.g., which records failed.
            } else {
                console.log(`  Successfully inserted ${batch.length} audio records.`);
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
 * Main synchronization function for audio.
 */
async function syncNewAudios() {
    try {
        const existingSupabaseIds = await getExistingSupabaseAudioIds();
        const allNewAudioRecords = [];
        let totalCloudinaryAudiosScannedOverall = 0;

        for (const folder of CLOUDINARY_FOLDERS_TO_SCAN) {
            const cloudinaryAudiosInFolder = await fetchAudiosFromCloudinaryFolder(folder);
            // The count here is already filtered audios
            totalCloudinaryAudiosScannedOverall += cloudinaryAudiosInFolder.length;


            for (const audio of cloudinaryAudiosInFolder) { // 'audio' here is a resource identified as audio
                if (!audio.public_id) {
                    console.warn(`  Skipping audio with missing public_id in folder '${folder}':`, audio);
                    continue;
                }
                if (existingSupabaseIds.has(audio.public_id)) {
                    // console.log(`Skipping already synced audio: ${audio.public_id}`);
                    continue;
                }

                const title = audio.filename || audio.public_id.split('/').pop();
                const waveformTransformation = "w_480,h_100,c_pad,fl_waveform,co_black,b_white";
                // Audio files (even if categorized as video by API) use /video/upload for transformations
                const thumbnailUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/${waveformTransformation}/${audio.public_id}.png`;

                const record = {
                    title: title,
                    url: audio.secure_url,
                    thumbnail_url: thumbnailUrl,
                    type: 'audio', // Crucially, set type to 'audio' for Supabase
                    category: folder,
                    tags: audio.tags || [],
                    aspect_ratio: null,
                    description: audio.context?.custom?.alt || audio.context?.custom?.caption || '',
                    year: audio.created_at ? new Date(audio.created_at).getFullYear() : new Date().getFullYear(),
                    cloudinary_id: audio.public_id,
                    duration: audio.duration || null,
                    format: audio.format || null // Store the audio format
                };
                allNewAudioRecords.push(record);
            }
        }

        console.log(`\nFound ${allNewAudioRecords.length} new actual audio files across all scanned Cloudinary folders.`);

        if (allNewAudioRecords.length > 0) {
            await insertAudiosToSupabase(allNewAudioRecords);
        }

        console.log(`
=================================================
              Sync Summary (Audio)
=================================================
Total Cloudinary folders scanned: ${CLOUDINARY_FOLDERS_TO_SCAN.length}
Total actual Cloudinary audios processed (after filtering): ${totalCloudinaryAudiosScannedOverall}
Total existing audios in Supabase (before sync): ${existingSupabaseIds.size}
New audios ${DRY_RUN ? 'that would be added' : 'added'} to Supabase: ${allNewAudioRecords.length}
Mode: ${DRY_RUN ? 'Dry Run (no changes were made)' : 'Live Run'}
=================================================
        `);

    } catch (error) {
        console.error('An error occurred during the audio sync process:', error);
        process.exit(1);
    }
}

// Run the synchronization
syncNewAudios();