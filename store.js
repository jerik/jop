const configKey = 'jop.config';
const shortlistKey = 'jop.shortlist';
const validShortlist = value => Array.isArray(value) && value.every(line => typeof line === 'string' && !/[\r\n]/.test(line));
const fileKey = 'jop.file';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function validConfig(value) {
  return value !== null && typeof value === 'object' &&
    ['owner', 'repo', 'path', 'token'].every(key => nonempty(value[key])) &&
    (value.ref === undefined || typeof value.ref === 'string');
}

function validFile(value) {
  return value !== null && typeof value === 'object' &&
    typeof value.text === 'string' &&
    (value.etag === null || typeof value.etag === 'string') &&
    nonempty(value.fetchedAt) && Number.isFinite(Date.parse(value.fetchedAt));
}

/** Persist access and the last copy using an injected localStorage interface. */
export function createStore(storage) {
  function load(key, validate) {
    try {
      const value = JSON.parse(storage.getItem(key));
      return validate(value) ? value : null;
    } catch {
      return null;
    }
  }

  function save(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  return {
    loadShortlist: () => [...new Set(load(shortlistKey, validShortlist) ?? [])],
    saveShortlist: list => save(shortlistKey, validShortlist(list) ? [...new Set(list)] : []),
    loadConfig: () => load(configKey, validConfig),
    saveConfig: config => save(configKey, config),
    clearConfig() {
      let success = true;
      for (const key of [configKey, fileKey, shortlistKey]) {
        try {
          storage.removeItem(key);
        } catch {
          success = false;
        }
      }
      return success;
    },
    loadFile: () => load(fileKey, validFile),
    saveFile: file => save(fileKey, file),
  };
}
