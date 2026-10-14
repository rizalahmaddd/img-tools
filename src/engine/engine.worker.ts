import * as Comlink from 'comlink';
import { makeGif, palette, pixels, probe, runJob, thumbnail, toPng } from './pipeline';

const api = { runJob, probe, thumbnail, toPng, pixels, palette, makeGif };

export type EngineApi = typeof api;

Comlink.expose(api);
