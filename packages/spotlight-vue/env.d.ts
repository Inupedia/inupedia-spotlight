/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_LIVE2D_BRIEFING_KEEP_LAST_MS?: string;
  readonly VITE_LIVE2D_BRIEFING_MAX_SENTENCES?: string;
  readonly VITE_SPOTLIGHT_API_KEY?: string;
  readonly VITE_SPOTLIGHT_SERVER_URL?: string;
  readonly VITE_SPOTLIGHT_SKILL_LISTING_CHAR_BUDGET?: string;
  readonly VITE_STT_MOCK?: string;
  readonly VITE_STT_MOCK_TEXT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
