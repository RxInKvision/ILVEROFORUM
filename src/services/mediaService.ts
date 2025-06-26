// src/services/mediaService.ts
import supabase from './supabase';  

export interface MediaItem {
  id: string;
  title: string;  
  url: string;    
  type: 'image' | 'video' | 'audio';
  category: string;
  tags: string[];
  aspect_ratio: number;
  description?: string;
  year?: number;
  created_at: string;
  musician?: string | null;
  thumbnail_url?: string;  
  width?: number;
  height?: number;
  format?: string;
  duration?: number;
  videoSources?: {  
    full: string;
    medium: string;  
    thumbnail?: string;
  };
}

export const isAudioItem = (item: MediaItem): boolean => {
  if (item.type?.toLowerCase() === 'audio') return true;
  if (item.url) {
    const extension = item.url.split('.').pop()?.toLowerCase();
    return ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(extension || '');
  }
  return false;
};

export const fetchAllMedia = async (): Promise<MediaItem[]> => {
  const { data, error } = await supabase
    .from('media')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching media:', error);
    return [];
  }
  return (data as MediaItem[]) || [];
};

export const fetchCategories = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('media')
    .select('category, type, url');
  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  if (!data) return [];
  const visualItemsData = data.filter(item => !isAudioItem(item as MediaItem));
  const categories = new Set(visualItemsData.map(item => item.category).filter(cat => cat));
  return Array.from(categories) as string[];
};

const normalizeTitleForSimilarity = (str: string): string => {
    let normalizedStr = str.toLowerCase().trim();
    const patternsToRemove = [
        /\s*-\s*(dvd|blu-ray|cd|vinyl|digital|4k\s*uhd|uhd|hd|vhs|laserdisc|cassette|streaming)\s*(version|edition|release|set|box|rip)?\b/gi,
        /\s*\((dvd|blu-ray|cd|vinyl|digital|4k\s*uhd|uhd|hd|vhs|laserdisc|cassette|streaming)\s*(version|edition|release|set|box|rip)?\)\b/gi,
        /\s*-\s*(album|single|ep|ost|soundtrack|original\s*motion\s*picture\s*soundtrack|motion\s*picture\s*soundtrack|original\s*soundtrack|score|compilation|anthology|collection)\s*(version|mix|edit)?\b/gi,
        /\s*\((album|single|ep|ost|soundtrack|original\s*motion\s*picture\s*soundtrack|motion\s*picture\s*soundtrack|original\s*soundtrack|score|compilation|anthology|collection)\s*(version|mix|edit)?\)\b/gi,
        /\s*-\s*(radio\s*edit|extended\s*(mix|version)|club\s*mix|dub\s*mix|remix|edit|live|acoustic|instrumental|demo|bonus\s*track|explicit|clean|oscar|anniversary\s*edition|deluxe\s*(edition)?|expanded\s*(edition)?|special\s*(edition)?|limited\s*(edition)?|collectors?\s*edition|remastered(\s*\d{4})?|final\s*cut|directors?\s*cut|unrated|uncut|original\s*version|alternate\s*take|mono|stereo|acapella|official\s*(video|audio)?|lyric\s*video|music\s*video|trailer|teaser|preview|promo|featurette|commentary|interview|behind\s*the\s*scenes)\s*(\(\d{4}\))?\b/gi,
        /\s*\((radio\s*edit|extended\s*(mix|version)|club\s*mix|dub\s*mix|remix|edit|live|acoustic|instrumental|demo|bonus\s*track|explicit|clean|oscar|anniversary\s*edition|deluxe\s*(edition)?|expanded\s*(edition)?|special\s*(edition)?|limited\s*(edition)?|collectors?\s*edition|remastered(\s*\d{4})?|final\s*cut|directors?\s*cut|unrated|uncut|original\s*version|alternate\s*take|mono|stereo|acapella|official\s*(video|audio)?|lyric\s*video|music\s*video|trailer|teaser|preview|promo|featurette|commentary|interview|behind\s*the\s*scenes)\s*(\(\d{4}\))?\)\b/gi,
        /\s*\(\s*\d{4}\s*([a-z\s*]*)?\)\s*/gi, 
        /\s*-\s*\d{4}(\s*-\s*\d{2,4})?\b/gi,  
        /\s*\[\s*\d{4}\s*\]/gi,  
        /\s*\(?(pt\.|part|vol\.|volume)\s*\d+\)?\b/gi, 
        /\s*\[[^\]]+\]/gi,  
    ];
    for (const pattern of patternsToRemove) {
        normalizedStr = normalizedStr.replace(pattern, '');
    }
    normalizedStr = normalizedStr
        // Corrected line: removed unnecessary escapes for ? and !
        .replace(/[¿¡«»“„”"':;,.\?!*+=&^$#@<>|/\\]/g, ' ') 
        .replace(/\s-\s/g, ' ')  
        .replace(/-/g, ' ')      
        .replace(/\s+/g, ' ')    
        .trim();
    normalizedStr = normalizedStr.replace(/^(a|an|the)\s+/i, '').trim();
    return normalizedStr;
};

export const areTitlesSimilar = (title1Input?: string, title2Input?: string): boolean => {
  if (!title1Input || !title2Input) {
    return title1Input === title2Input;  
  }

  const norm1 = normalizeTitleForSimilarity(title1Input);
  const norm2 = normalizeTitleForSimilarity(title2Input);

  if (norm1 === "" || norm2 === "") {
    return norm1 === norm2;
  }

  if (norm1 === norm2) {
    return true;
  }

  const minCommonLength = 4;  
  if (norm1.length >= minCommonLength && norm2.length >= minCommonLength) {
    if (norm1.startsWith(norm2) || norm2.startsWith(norm1)) {
      return true;
    }
  }
  return false;
};