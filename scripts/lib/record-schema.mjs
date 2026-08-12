import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJsonSchema } from './json-schema-lite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = path.join(root, 'data/event-schema.json');
export const eventRecordSchema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

function assertEnumMirror(propertyName, legacyName = propertyName) {
  const canonical = eventRecordSchema.properties?.[propertyName]?.enum || [];
  const legacy = eventRecordSchema[legacyName] || [];
  if (JSON.stringify(canonical) !== JSON.stringify(legacy)) {
    throw new Error(`event-schema.json enum drift: properties.${propertyName}.enum must match ${legacyName}`);
  }
}

assertEnumMirror('kind', 'kinds');
assertEnumMirror('discipline', 'disciplines');
assertEnumMirror('matchConfidence', 'confidence');
assertEnumMirror('coordinatePrecision', 'coordinatePrecision');

export function validatePublicRecord(record, label = record?.id || 'record') {
  return validateJsonSchema(record, eventRecordSchema, label);
}

export function validatePublicRecords(records) {
  const errors = [];
  const seenIds = new Set();
  const seenSlugs = new Map();
  for (const [index, record] of records.entries()) {
    const label = record?.id || `record[${index}]`;
    errors.push(...validatePublicRecord(record, label));
    if (record?.id) {
      if (seenIds.has(record.id)) errors.push(`${label}.id must be unique`);
      seenIds.add(record.id);
    }
    if (record?.slug) {
      if (seenSlugs.has(record.slug)) errors.push(`${label}.slug duplicates ${seenSlugs.get(record.slug)}`);
      else seenSlugs.set(record.slug, label);
    }
  }
  return errors;
}

export function assertPublicRecords(records) {
  const errors = validatePublicRecords(records);
  if (errors.length) throw new Error(`Public record schema validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
  return records;
}
