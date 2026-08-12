import { writeCatalogRecordLayer } from './lib/compile-catalog-record-layer.mjs';

const { outputPath, payload } = await writeCatalogRecordLayer();
console.log(`Compiled ${payload.recordCount} source-layer records from ${payload.sourceCount} evidence files into ${outputPath} (${payload.layeredMergeCount} layered merges).`);
