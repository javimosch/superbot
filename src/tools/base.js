/**
 * Base class for agent tools
 */

/**
 * Abstract base class for tools
 */
export class Tool {
  /**
   * Tool name used in function calls
   * @returns {string}
   */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Description of what the tool does
   * @returns {string}
   */
  get description() {
    throw new Error('Not implemented');
  }

  /**
   * JSON Schema for tool parameters
   * @returns {object}
   */
  get parameters() {
    throw new Error('Not implemented');
  }

  /**
   * Execute the tool
   * @param {object} params - Tool parameters
   * @returns {Promise<string>}
   */
  async execute(params) {
    throw new Error('Not implemented');
  }

  /**
   * Validate parameters against schema
   * @param {object} params - Parameters to validate
   * @returns {string[]} - Array of error messages (empty if valid)
   */
  validateParams(params) {
    const schema = this.parameters || {};
    return this._validate(params, { ...schema, type: 'object' }, '');
  }

  /**
   * Recursive validation helper
   * @private
   */
  _validate(val, schema, path) {
    const errors = [];
    const type = schema.type;
    const label = path || 'parameter';

    // Type checking
    const typeMap = {
      string: 'string',
      integer: 'number',
      number: 'number',
      boolean: 'boolean',
      array: 'object',
      object: 'object'
    };

    if (type && typeMap[type]) {
      const jsType = typeof val;
      if (type === 'array' && !Array.isArray(val)) {
        errors.push(`${label} should be an array`);
      } else if (type === 'integer' && (!Number.isInteger(val))) {
        errors.push(`${label} should be an integer`);
      } else if (type !== 'array' && jsType !== typeMap[type]) {
        errors.push(`${label} should be ${type}`);
      }
    }

    // Enum
    if (schema.enum && !schema.enum.includes(val)) {
      errors.push(`${label} must be one of ${JSON.stringify(schema.enum)}`);
    }

    // Required properties for objects
    if (type === 'object' && schema.required) {
      for (const key of schema.required) {
        if (!(key in val)) {
          errors.push(`missing required ${path ? path + '.' + key : key}`);
        }
      }
    }

    // Validate nested properties
    if (type === 'object' && schema.properties && typeof val === 'object') {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in val) {
          const nested = this._validate(val[key], propSchema, path ? `${path}.${key}` : key);
          errors.push(...nested);
        }
      }
    }

    return errors;
  }

  /**
   * Convert tool to OpenAI function schema format
   * @returns {object}
   */
  toSchema() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }
}
