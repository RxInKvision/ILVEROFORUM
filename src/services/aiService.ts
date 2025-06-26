// src/services/aiService.ts
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerationConfig,
} from "@google/generative-ai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error("Gemini API key not found. Please set REACT_APP_GEMINI_API_KEY in your .env file.");
}

const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
});

const generationConfig: GenerationConfig = {
  temperature: 0.75, // AUMENTATO ANCORA UN PO' per più creatività/diversità
  topP: 0.9,
  topK: 50, // Aumentato topK per più scelta nelle parole successive
  maxOutputTokens: 1000, // Aumentato per dare spazio a più frasi complete
  responseMimeType: "text/plain",
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export const fetchQuotesOrGenerateDetailsWithGemini = async (
  title: string,
  musician: string | null
): Promise<string[]> => {
  if (!title || !musician) {
    console.warn("Title or musician missing for Gemini query, returning generic Italian phrases.");
    return [
      `Dettagli per "${title || 'questa traccia'}" in elaborazione.`,
      "Archivio storico musicale Forum Music Village.",
      "Note e frammenti sonori da Roma.",
      "L'arte della registrazione.",
      "Un eco dalla storia della musica.",
    ];
  }

  try {
    const studioPreferences = `"Forum Studios" OPPURE "Ortophonic Recording Studios" OPPURE "Forum Music Village"`; // Usiamo "OPPURE" per chiarezza nel prompt

    // --- PROMPT ULTERIORMENTE RIVISTO ---
    const promptParts = [
      `Agisci come un critico musicale e storico della musica italiana estremamente eloquente e creativo, con base a Roma e profonda familiarità con il Forum Studios. Devi generare **da 8 a 12 FRASI O CITAZIONI UNICHE, COMPLETE e DIVERSIFICATE**, **ESCLUSIVAMENTE IN LINGUA ITALIANA**, per la traccia audio "${title}" di ${musician}.`,
      `Ogni frase deve essere un'entità a sé stante, offrendo una prospettiva differente: un dettaglio sulla sonorità, un impatto emotivo, un aneddoto storico, una possibile citazione da una recensione critica (in tal caso, usa le virgolette, es. "Un'opera che definisce un'epoca."). Evita assolutamente ripetizioni di concetti o frasi troppo simili. Ogni frase deve aggiungere nuova informazione o una nuova sfumatura.`,
      `Se rilevante e contestualizzato, puoi includere riferimenti a: ${studioPreferences}. Questa è una preferenza, non un obbligo; la priorità è la traccia e l'artista.`,
      `Le frasi devono avere una lunghezza variabile per creare dinamismo: alcune più brevi e incisive (5-8 parole), altre più descrittive e complete (fino a 20-25 parole). Assicurati che ogni frase, anche se breve, abbia un senso compiuto e non appaia come un testo interrotto casualmente, a meno che non sia stilisticamente una "eco" voluta.`,
      `Restituisci OGNI frase o citazione su una NUOVA RIGA. Non usare elenchi puntati, numeri, o QUALSIASI testo introduttivo, esplicativo o conclusivo. Fornisci SOLO l'elenco pulito delle frasi richieste, una per riga.`,
      `Esempio di varietà desiderata per un brano fittizio "Notte Romana" di "Artista X":`,
      `  "Melodie avvolgenti registrate al Forum."`,
      `  Un viaggio sonoro nel cuore di Roma.`,
      `  Artista X raggiunge nuove vette espressive.`,
      `  Sonorità che evocano antiche leggende.`,
      `  La critica lo definì "un classico istantaneo".`,
      `  Influenze jazz si fondono con la tradizione.`,
      `  Un'atmosfera notturna e malinconica.`,
      `  Ascolto consigliato in cuffia per coglierne ogni dettaglio.`
    ];
    // --- FINE PROMPT ULTERIORMENTE RIVISTO ---

    const prompt = promptParts.join("\n");

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
      safetySettings,
    });

    const responseText = result.response.text();

    if (!responseText || responseText.trim().length === 0) {
      return [
        `Nessun dettaglio specifico trovato per "${title}" (${musician}).`,
        "Archivi del Forum Music Village in consultazione.",
        "Ricerca di frammenti sonori in corso...",
      ];
    }

    const sentences = responseText
      .split('\n')
      .map(s => s.trim().replace(/^[-–—*•]\s*/, '').replace(/\.$/, '...')) // Rimuove bullets e sostituisce punto finale con ...
      .filter(s => s.length > 10 && s.length < 220) // Aumentato min e max lunghezza
      .filter(s => {
          const lowerS = s.toLowerCase();
          const exclusionPatterns = ["ecco alcune", "certo, ecco", "ecco le frasi", "frasi:", "citazioni:"];
          return !exclusionPatterns.some(pattern => lowerS.startsWith(pattern)) && s.trim() !== "" && !/^\d+\.\s*/.test(s); // Rimuove anche "1. Testo"
      });

    // Se l'AI produce poche frasi, aggiungiamo dei fallback più generici ma tematizzati
    if (sentences.length < 5 && sentences.length > 0) {
        const fallbacks = [
            "Un'eco sonora da Roma...",
            "Registrato con maestria...",
            "L'arte del suono al Forum...",
            "Storia della musica italiana...",
            "Vibrazioni uniche..."
        ];
        let i = 0;
        while(sentences.length < 5 && i < fallbacks.length) {
            if (!sentences.includes(fallbacks[i])) {
                sentences.push(fallbacks[i]);
            }
            i++;
        }
    } else if (sentences.length === 0) {
      return [
        `"${title}" (${musician}): opera da riscoprire.`,
        "Archivi sonori del Forum.",
        "Frammenti della grande musica italiana.",
        "Ricerca dettagli in corso...",
        "L'emozione di un suono storico.",
      ];
    }

    // Assicuriamoci che ci sia varietà, prendendo un set unico
    return Array.from(new Set(sentences)).slice(0, 12); // Fino a 12 frasi uniche

  } catch (error: unknown) {
    console.error(`Error generating details with Gemini for "${title}" by ${musician}:`, error);
    let errorMessage = "Si è verificato un errore generando gli approfondimenti.";
    if (error instanceof Error) {
        errorMessage = error.message;
        // Check for specific API key related errors or other identifiable issues
        if (error.message.toLowerCase().includes("api key not valid")) {
            errorMessage = "La chiave API per Gemini non è valida. Controllare la configurazione.";
        } else if (error.message.toLowerCase().includes("quota") || (error as any)?.status === "RESOURCE_EXHAUSTED") {
            errorMessage = "Quota API per Gemini superata. Riprovare più tardi.";
        }
    }
    return [
      `Errore nel recuperare dettagli per "${title}".`,
      errorMessage,
      "Si prega di controllare la console per dettagli tecnici.",
    ];
  }
};