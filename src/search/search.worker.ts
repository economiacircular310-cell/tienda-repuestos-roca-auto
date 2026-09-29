/// <reference lib="webworker" />
import { getInventory } from '../data/inventory';
import { SearchEngine } from './engine';
import type { SearchRequest } from './types';

const engine = new SearchEngine(getInventory());
const median = engine.benchmark();
postMessage({ type: 'ready', stats: engine.stats('worker', median) });

self.onmessage = (e: MessageEvent<{ id: number; req: SearchRequest }>) => {
  const { id, req } = e.data;
  try {
    postMessage({ type: 'result', id, result: engine.search(req) });
  } catch (err) {
    postMessage({ type: 'error', id, error: String(err) });
  }
};
