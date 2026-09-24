/**
 * Default API version. Every controller without an explicit `version` /
 * `@Version()` is served under `/api/v1/...`.
 *
 * Breaking changes go into a new version, e.g.:
 * `@Controller({ path: 'vacancies', version: '2' })`
 */
export const API_VERSION_V1 = '1';
