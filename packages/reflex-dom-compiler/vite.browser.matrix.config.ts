import { browserConfig } from "./vite.browser.config";

/** The full engine matrix: `playwright install firefox webkit` first. */
export default browserConfig(["chromium", "firefox", "webkit"]);
