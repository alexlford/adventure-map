const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if ((isObject(left) || Array.isArray(left)) && (isObject(right) || Array.isArray(right))) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function typeMatches(value, type) {
  switch (type) {
    case 'null': return value === null;
    case 'array': return Array.isArray(value);
    case 'object': return isObject(value);
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    default: return true;
  }
}

const childPath = (path, key) => /^\d+$/.test(String(key)) ? `${path}[${key}]` : `${path}.${key}`;

export function validateJsonSchema(value, schema, path = '$') {
  if (!schema || typeof schema !== 'object') return [];
  const errors = [];

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !sameValue(value, schema.const)) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(candidate => sameValue(value, candidate))) {
    errors.push(`${path} must be one of ${schema.enum.map(candidate => JSON.stringify(candidate)).join(', ')}`);
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some(type => typeMatches(value, type))) {
      errors.push(`${path} must be ${allowedTypes.join(' or ')}`);
      return errors;
    }
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) errors.push(`${path} must contain at least ${schema.minLength} characters`);
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push(`${path} must match ${schema.pattern}`);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} items`);
    if (schema.uniqueItems) {
      const serialized = value.map(item => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push(`${path} must contain unique items`);
    }
    if (schema.items) value.forEach((item, index) => errors.push(...validateJsonSchema(item, schema.items, childPath(path, index))));
  }

  if (isObject(value)) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${childPath(path, key)} is required`);
    }
    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) errors.push(...validateJsonSchema(value[key], propertySchema, childPath(path, key)));
    }
    for (const [key, dependencies] of Object.entries(schema.dependentRequired || {})) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      for (const dependency of dependencies || []) {
        if (!Object.prototype.hasOwnProperty.call(value, dependency)) errors.push(`${childPath(path, dependency)} is required when ${childPath(path, key)} is present`);
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${childPath(path, key)} is not allowed`);
    }
  }

  for (const nested of schema.allOf || []) errors.push(...validateJsonSchema(value, nested, path));
  if (schema.if) {
    const matches = validateJsonSchema(value, schema.if, path).length === 0;
    if (matches && schema.then) errors.push(...validateJsonSchema(value, schema.then, path));
    if (!matches && schema.else) errors.push(...validateJsonSchema(value, schema.else, path));
  }

  return errors;
}
