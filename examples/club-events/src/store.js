'use strict';
// The only code that reads or writes the data file.
// Every change goes through update(), which runs changes one after another so that
// simultaneous requests cannot overwrite each other (single process only).
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'db.json');
const EMPTY = { events: [], signups: [] };

function createStore(file = process.env.DATA_FILE || DEFAULT_FILE) {
  let queue = Promise.resolve();

  async function load() {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return structuredClone(EMPTY);
      throw e;
    }
  }

  async function write(db) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, file);
  }

  // Loads the latest data, lets `change` modify it, saves it. Changes never interleave.
  function update(change) {
    const run = queue.then(async () => {
      const db = await load();
      const result = await change(db);
      await write(db);
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  return { load, update, file };
}

module.exports = { createStore };
