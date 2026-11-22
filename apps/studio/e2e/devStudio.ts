/**
 * The studio's development server, which the Prompter's, the study's and the components' browser
 * tests need: only a development build reaches the scripted replies and study mode
 * (`src/prompter/devPrompter.ts`), so they can't use the built studio at `baseURL`. CI starts it on
 * 4182 (`playwright.config.ts`); a local run whose server is elsewhere says so in
 * `STORYSTAGE_DEV_STUDIO`, so it never reaches another checkout's server on 4182.
 */
export const DEV_STUDIO = (process.env.STORYSTAGE_DEV_STUDIO ?? 'http://localhost:4182').replace(
  /\/$/,
  '',
);
