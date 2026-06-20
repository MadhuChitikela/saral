// ================================================================
// CONFIGURATION — API Keys
// ================================================================

const CONFIG = {
    // Default API Key (supports both Gemini and Groq 'gsk_' keys)
    DEFAULT_API_KEY: '',
    
    // Helper to get active API key (looks at settings storage first, then default key)
    getApiKey() {
        return localStorage.getItem('saral_gemini_key') || this.DEFAULT_API_KEY;
    }
};
