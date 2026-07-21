import packageJson from '../../package.json';

/**
 * The release workflow updates package.json, making it the single source of
 * truth for both Git tags and the version rendered by the static site.
 */
export const APP_VERSION = packageJson.version;
export const APP_VERSION_TAG = `v${APP_VERSION}`;
const REPOSITORY_URL = packageJson.repository.url.replace(/\.git$/, '');
export const APP_RELEASE_URL =
  `${REPOSITORY_URL}/releases/tag/${APP_VERSION_TAG}`;
