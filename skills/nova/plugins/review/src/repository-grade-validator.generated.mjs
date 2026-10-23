// Generated from repositoryGradeSchema; do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// grade-runtime:fast-deep-equal
var require_fast_deep_equal = __commonJS({
  "grade-runtime:fast-deep-equal"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// grade-runtime:ajv/dist/runtime/equal
var require_equal = __commonJS({
  "grade-runtime:ajv/dist/runtime/equal"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();

    exports.default = equal;
  }
});

// <stdin>
var validate = validate20;
var stdin_default = validate20;
var schema31 = { "type": "object", "additionalProperties": false, "required": ["fast", "standard", "deep"], "properties": { "fast": { "type": "object", "additionalProperties": false, "required": ["componentBudget", "boundaryBudget", "maxPrimaryJobs", "maxContextExpansionJobs", "maxVerificationJobs", "maxInputTokensPerJob", "maxContextTokensPerJob", "maxPromptBytesPerJob", "maxInitialInputTokens", "maxContextExpansionInputTokens", "maxVerificationInputTokens", "maxTotalInputTokens", "maxEstimatedCostUsd", "maxWallTimeSeconds", "estimatedSecondsPerJob", "inputUsdPerMillionTokens", "outputUsdPerMillionTokens", "concurrency", "maxRetries", "maxRetryAttemptsPerPhase", "enabledLenses"], "properties": { "componentBudget": { "type": "object", "additionalProperties": false, "required": ["maxFiles", "maxBytes", "maxTokens"], "properties": { "maxFiles": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxTokens": { "type": "integer", "minimum": 1, "maximum": 1e8 } } }, "boundaryBudget": { "type": "object", "additionalProperties": false, "required": ["maxFiles", "maxBytes", "maxTokens", "maxRelations", "maxSlices"], "properties": { "maxFiles": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxTokens": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxRelations": { "type": "integer", "minimum": 1, "maximum": 1e5 }, "maxSlices": { "type": "integer", "minimum": 1, "maximum": 1e4 } } }, "maxPrimaryJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxContextExpansionJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxVerificationJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxInputTokensPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxContextTokensPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxPromptBytesPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxInitialInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxContextExpansionInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxVerificationInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxTotalInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxEstimatedCostUsd": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e6 }, "maxWallTimeSeconds": { "type": "integer", "minimum": 1, "maximum": 604800 }, "estimatedSecondsPerJob": { "type": "integer", "minimum": 1, "maximum": 86400 }, "inputUsdPerMillionTokens": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e4 }, "outputUsdPerMillionTokens": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e4 }, "concurrency": { "type": "integer", "minimum": 1, "maximum": 32 }, "maxRetries": { "type": "integer", "minimum": 0, "maximum": 10 }, "maxRetryAttemptsPerPhase": { "type": "integer", "minimum": 0, "maximum": 1e4 }, "enabledLenses": { "type": "array", "uniqueItems": true, "items": { "enum": ["architecture", "contracts", "security", "lifecycle", "resilience", "deployment", "simplification"] } } } }, "standard": { "type": "object", "additionalProperties": false, "required": ["componentBudget", "boundaryBudget", "maxPrimaryJobs", "maxContextExpansionJobs", "maxVerificationJobs", "maxInputTokensPerJob", "maxContextTokensPerJob", "maxPromptBytesPerJob", "maxInitialInputTokens", "maxContextExpansionInputTokens", "maxVerificationInputTokens", "maxTotalInputTokens", "maxEstimatedCostUsd", "maxWallTimeSeconds", "estimatedSecondsPerJob", "inputUsdPerMillionTokens", "outputUsdPerMillionTokens", "concurrency", "maxRetries", "maxRetryAttemptsPerPhase", "enabledLenses"], "properties": { "componentBudget": { "type": "object", "additionalProperties": false, "required": ["maxFiles", "maxBytes", "maxTokens"], "properties": { "maxFiles": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxTokens": { "type": "integer", "minimum": 1, "maximum": 1e8 } } }, "boundaryBudget": { "type": "object", "additionalProperties": false, "required": ["maxFiles", "maxBytes", "maxTokens", "maxRelations", "maxSlices"], "properties": { "maxFiles": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxTokens": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxRelations": { "type": "integer", "minimum": 1, "maximum": 1e5 }, "maxSlices": { "type": "integer", "minimum": 1, "maximum": 1e4 } } }, "maxPrimaryJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxContextExpansionJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxVerificationJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxInputTokensPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxContextTokensPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxPromptBytesPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxInitialInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxContextExpansionInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxVerificationInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxTotalInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxEstimatedCostUsd": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e6 }, "maxWallTimeSeconds": { "type": "integer", "minimum": 1, "maximum": 604800 }, "estimatedSecondsPerJob": { "type": "integer", "minimum": 1, "maximum": 86400 }, "inputUsdPerMillionTokens": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e4 }, "outputUsdPerMillionTokens": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e4 }, "concurrency": { "type": "integer", "minimum": 1, "maximum": 32 }, "maxRetries": { "type": "integer", "minimum": 0, "maximum": 10 }, "maxRetryAttemptsPerPhase": { "type": "integer", "minimum": 0, "maximum": 1e4 }, "enabledLenses": { "type": "array", "uniqueItems": true, "items": { "enum": ["architecture", "contracts", "security", "lifecycle", "resilience", "deployment", "simplification"] } } } }, "deep": { "type": "object", "additionalProperties": false, "required": ["componentBudget", "boundaryBudget", "maxPrimaryJobs", "maxContextExpansionJobs", "maxVerificationJobs", "maxInputTokensPerJob", "maxContextTokensPerJob", "maxPromptBytesPerJob", "maxInitialInputTokens", "maxContextExpansionInputTokens", "maxVerificationInputTokens", "maxTotalInputTokens", "maxEstimatedCostUsd", "maxWallTimeSeconds", "estimatedSecondsPerJob", "inputUsdPerMillionTokens", "outputUsdPerMillionTokens", "concurrency", "maxRetries", "maxRetryAttemptsPerPhase", "enabledLenses"], "properties": { "componentBudget": { "type": "object", "additionalProperties": false, "required": ["maxFiles", "maxBytes", "maxTokens"], "properties": { "maxFiles": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxTokens": { "type": "integer", "minimum": 1, "maximum": 1e8 } } }, "boundaryBudget": { "type": "object", "additionalProperties": false, "required": ["maxFiles", "maxBytes", "maxTokens", "maxRelations", "maxSlices"], "properties": { "maxFiles": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxBytes": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxTokens": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxRelations": { "type": "integer", "minimum": 1, "maximum": 1e5 }, "maxSlices": { "type": "integer", "minimum": 1, "maximum": 1e4 } } }, "maxPrimaryJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxContextExpansionJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxVerificationJobs": { "type": "integer", "minimum": 1, "maximum": 1e4 }, "maxInputTokensPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxContextTokensPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxPromptBytesPerJob": { "type": "integer", "minimum": 1, "maximum": 1e8 }, "maxInitialInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxContextExpansionInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxVerificationInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxTotalInputTokens": { "type": "integer", "minimum": 1, "maximum": 1e9 }, "maxEstimatedCostUsd": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e6 }, "maxWallTimeSeconds": { "type": "integer", "minimum": 1, "maximum": 604800 }, "estimatedSecondsPerJob": { "type": "integer", "minimum": 1, "maximum": 86400 }, "inputUsdPerMillionTokens": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e4 }, "outputUsdPerMillionTokens": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e4 }, "concurrency": { "type": "integer", "minimum": 1, "maximum": 32 }, "maxRetries": { "type": "integer", "minimum": 0, "maximum": 10 }, "maxRetryAttemptsPerPhase": { "type": "integer", "minimum": 0, "maximum": 1e4 }, "enabledLenses": { "type": "array", "uniqueItems": true, "items": { "enum": ["architecture", "contracts", "security", "lifecycle", "resilience", "deployment", "simplification"] } } } } } };
var func1 = Object.prototype.hasOwnProperty;
var func0 = require_equal().default;
function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.fast === void 0 && (missing0 = "fast") || data.standard === void 0 && (missing0 = "standard") || data.deep === void 0 && (missing0 = "deep")) {
        validate20.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "fast" || key0 === "standard" || key0 === "deep")) {
            validate20.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.fast !== void 0) {
            let data0 = data.fast;
            const _errs2 = errors;
            if (errors === _errs2) {
              if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
                let missing1;
                if (data0.componentBudget === void 0 && (missing1 = "componentBudget") || data0.boundaryBudget === void 0 && (missing1 = "boundaryBudget") || data0.maxPrimaryJobs === void 0 && (missing1 = "maxPrimaryJobs") || data0.maxContextExpansionJobs === void 0 && (missing1 = "maxContextExpansionJobs") || data0.maxVerificationJobs === void 0 && (missing1 = "maxVerificationJobs") || data0.maxInputTokensPerJob === void 0 && (missing1 = "maxInputTokensPerJob") || data0.maxContextTokensPerJob === void 0 && (missing1 = "maxContextTokensPerJob") || data0.maxPromptBytesPerJob === void 0 && (missing1 = "maxPromptBytesPerJob") || data0.maxInitialInputTokens === void 0 && (missing1 = "maxInitialInputTokens") || data0.maxContextExpansionInputTokens === void 0 && (missing1 = "maxContextExpansionInputTokens") || data0.maxVerificationInputTokens === void 0 && (missing1 = "maxVerificationInputTokens") || data0.maxTotalInputTokens === void 0 && (missing1 = "maxTotalInputTokens") || data0.maxEstimatedCostUsd === void 0 && (missing1 = "maxEstimatedCostUsd") || data0.maxWallTimeSeconds === void 0 && (missing1 = "maxWallTimeSeconds") || data0.estimatedSecondsPerJob === void 0 && (missing1 = "estimatedSecondsPerJob") || data0.inputUsdPerMillionTokens === void 0 && (missing1 = "inputUsdPerMillionTokens") || data0.outputUsdPerMillionTokens === void 0 && (missing1 = "outputUsdPerMillionTokens") || data0.concurrency === void 0 && (missing1 = "concurrency") || data0.maxRetries === void 0 && (missing1 = "maxRetries") || data0.maxRetryAttemptsPerPhase === void 0 && (missing1 = "maxRetryAttemptsPerPhase") || data0.enabledLenses === void 0 && (missing1 = "enabledLenses")) {
                  validate20.errors = [{ instancePath: instancePath + "/fast", schemaPath: "#/properties/fast/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" }];
                  return false;
                } else {
                  const _errs4 = errors;
                  for (const key1 in data0) {
                    if (!func1.call(schema31.properties.fast.properties, key1)) {
                      validate20.errors = [{ instancePath: instancePath + "/fast", schemaPath: "#/properties/fast/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" }];
                      return false;
                      break;
                    }
                  }
                  if (_errs4 === errors) {
                    if (data0.componentBudget !== void 0) {
                      let data1 = data0.componentBudget;
                      const _errs5 = errors;
                      if (errors === _errs5) {
                        if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                          let missing2;
                          if (data1.maxFiles === void 0 && (missing2 = "maxFiles") || data1.maxBytes === void 0 && (missing2 = "maxBytes") || data1.maxTokens === void 0 && (missing2 = "maxTokens")) {
                            validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget", schemaPath: "#/properties/fast/properties/componentBudget/required", keyword: "required", params: { missingProperty: missing2 }, message: "must have required property '" + missing2 + "'" }];
                            return false;
                          } else {
                            const _errs7 = errors;
                            for (const key2 in data1) {
                              if (!(key2 === "maxFiles" || key2 === "maxBytes" || key2 === "maxTokens")) {
                                validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget", schemaPath: "#/properties/fast/properties/componentBudget/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" }];
                                return false;
                                break;
                              }
                            }
                            if (_errs7 === errors) {
                              if (data1.maxFiles !== void 0) {
                                let data2 = data1.maxFiles;
                                const _errs8 = errors;
                                if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                                  validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxFiles", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxFiles/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                  return false;
                                }
                                if (errors === _errs8) {
                                  if (typeof data2 == "number" && isFinite(data2)) {
                                    if (data2 > 1e4 || isNaN(data2)) {
                                      validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxFiles", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxFiles/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                      return false;
                                    } else {
                                      if (data2 < 1 || isNaN(data2)) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxFiles", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxFiles/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                        return false;
                                      }
                                    }
                                  }
                                }
                                var valid2 = _errs8 === errors;
                              } else {
                                var valid2 = true;
                              }
                              if (valid2) {
                                if (data1.maxBytes !== void 0) {
                                  let data3 = data1.maxBytes;
                                  const _errs10 = errors;
                                  if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                                    validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxBytes", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                    return false;
                                  }
                                  if (errors === _errs10) {
                                    if (typeof data3 == "number" && isFinite(data3)) {
                                      if (data3 > 1e8 || isNaN(data3)) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxBytes", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxBytes/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                        return false;
                                      } else {
                                        if (data3 < 1 || isNaN(data3)) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxBytes", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    }
                                  }
                                  var valid2 = _errs10 === errors;
                                } else {
                                  var valid2 = true;
                                }
                                if (valid2) {
                                  if (data1.maxTokens !== void 0) {
                                    let data4 = data1.maxTokens;
                                    const _errs12 = errors;
                                    if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                                      validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxTokens", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs12) {
                                      if (typeof data4 == "number" && isFinite(data4)) {
                                        if (data4 > 1e8 || isNaN(data4)) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxTokens", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                          return false;
                                        } else {
                                          if (data4 < 1 || isNaN(data4)) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget/maxTokens", schemaPath: "#/properties/fast/properties/componentBudget/properties/maxTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid2 = _errs12 === errors;
                                  } else {
                                    var valid2 = true;
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          validate20.errors = [{ instancePath: instancePath + "/fast/componentBudget", schemaPath: "#/properties/fast/properties/componentBudget/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                          return false;
                        }
                      }
                      var valid1 = _errs5 === errors;
                    } else {
                      var valid1 = true;
                    }
                    if (valid1) {
                      if (data0.boundaryBudget !== void 0) {
                        let data5 = data0.boundaryBudget;
                        const _errs14 = errors;
                        if (errors === _errs14) {
                          if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                            let missing3;
                            if (data5.maxFiles === void 0 && (missing3 = "maxFiles") || data5.maxBytes === void 0 && (missing3 = "maxBytes") || data5.maxTokens === void 0 && (missing3 = "maxTokens") || data5.maxRelations === void 0 && (missing3 = "maxRelations") || data5.maxSlices === void 0 && (missing3 = "maxSlices")) {
                              validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget", schemaPath: "#/properties/fast/properties/boundaryBudget/required", keyword: "required", params: { missingProperty: missing3 }, message: "must have required property '" + missing3 + "'" }];
                              return false;
                            } else {
                              const _errs16 = errors;
                              for (const key3 in data5) {
                                if (!(key3 === "maxFiles" || key3 === "maxBytes" || key3 === "maxTokens" || key3 === "maxRelations" || key3 === "maxSlices")) {
                                  validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget", schemaPath: "#/properties/fast/properties/boundaryBudget/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" }];
                                  return false;
                                  break;
                                }
                              }
                              if (_errs16 === errors) {
                                if (data5.maxFiles !== void 0) {
                                  let data6 = data5.maxFiles;
                                  const _errs17 = errors;
                                  if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                                    validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxFiles", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxFiles/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                    return false;
                                  }
                                  if (errors === _errs17) {
                                    if (typeof data6 == "number" && isFinite(data6)) {
                                      if (data6 > 1e4 || isNaN(data6)) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxFiles", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxFiles/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                        return false;
                                      } else {
                                        if (data6 < 1 || isNaN(data6)) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxFiles", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxFiles/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    }
                                  }
                                  var valid3 = _errs17 === errors;
                                } else {
                                  var valid3 = true;
                                }
                                if (valid3) {
                                  if (data5.maxBytes !== void 0) {
                                    let data7 = data5.maxBytes;
                                    const _errs19 = errors;
                                    if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
                                      validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxBytes", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs19) {
                                      if (typeof data7 == "number" && isFinite(data7)) {
                                        if (data7 > 1e8 || isNaN(data7)) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxBytes", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxBytes/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                          return false;
                                        } else {
                                          if (data7 < 1 || isNaN(data7)) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxBytes", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid3 = _errs19 === errors;
                                  } else {
                                    var valid3 = true;
                                  }
                                  if (valid3) {
                                    if (data5.maxTokens !== void 0) {
                                      let data8 = data5.maxTokens;
                                      const _errs21 = errors;
                                      if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxTokens", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs21) {
                                        if (typeof data8 == "number" && isFinite(data8)) {
                                          if (data8 > 1e8 || isNaN(data8)) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxTokens", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                            return false;
                                          } else {
                                            if (data8 < 1 || isNaN(data8)) {
                                              validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxTokens", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid3 = _errs21 === errors;
                                    } else {
                                      var valid3 = true;
                                    }
                                    if (valid3) {
                                      if (data5.maxRelations !== void 0) {
                                        let data9 = data5.maxRelations;
                                        const _errs23 = errors;
                                        if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxRelations", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxRelations/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs23) {
                                          if (typeof data9 == "number" && isFinite(data9)) {
                                            if (data9 > 1e5 || isNaN(data9)) {
                                              validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxRelations", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxRelations/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e5 }, message: "must be <= 100000" }];
                                              return false;
                                            } else {
                                              if (data9 < 1 || isNaN(data9)) {
                                                validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxRelations", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxRelations/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid3 = _errs23 === errors;
                                      } else {
                                        var valid3 = true;
                                      }
                                      if (valid3) {
                                        if (data5.maxSlices !== void 0) {
                                          let data10 = data5.maxSlices;
                                          const _errs25 = errors;
                                          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxSlices", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxSlices/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                            return false;
                                          }
                                          if (errors === _errs25) {
                                            if (typeof data10 == "number" && isFinite(data10)) {
                                              if (data10 > 1e4 || isNaN(data10)) {
                                                validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxSlices", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxSlices/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                return false;
                                              } else {
                                                if (data10 < 1 || isNaN(data10)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget/maxSlices", schemaPath: "#/properties/fast/properties/boundaryBudget/properties/maxSlices/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                  return false;
                                                }
                                              }
                                            }
                                          }
                                          var valid3 = _errs25 === errors;
                                        } else {
                                          var valid3 = true;
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            validate20.errors = [{ instancePath: instancePath + "/fast/boundaryBudget", schemaPath: "#/properties/fast/properties/boundaryBudget/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                            return false;
                          }
                        }
                        var valid1 = _errs14 === errors;
                      } else {
                        var valid1 = true;
                      }
                      if (valid1) {
                        if (data0.maxPrimaryJobs !== void 0) {
                          let data11 = data0.maxPrimaryJobs;
                          const _errs27 = errors;
                          if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                            validate20.errors = [{ instancePath: instancePath + "/fast/maxPrimaryJobs", schemaPath: "#/properties/fast/properties/maxPrimaryJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                            return false;
                          }
                          if (errors === _errs27) {
                            if (typeof data11 == "number" && isFinite(data11)) {
                              if (data11 > 1e4 || isNaN(data11)) {
                                validate20.errors = [{ instancePath: instancePath + "/fast/maxPrimaryJobs", schemaPath: "#/properties/fast/properties/maxPrimaryJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                return false;
                              } else {
                                if (data11 < 1 || isNaN(data11)) {
                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxPrimaryJobs", schemaPath: "#/properties/fast/properties/maxPrimaryJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                  return false;
                                }
                              }
                            }
                          }
                          var valid1 = _errs27 === errors;
                        } else {
                          var valid1 = true;
                        }
                        if (valid1) {
                          if (data0.maxContextExpansionJobs !== void 0) {
                            let data12 = data0.maxContextExpansionJobs;
                            const _errs29 = errors;
                            if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
                              validate20.errors = [{ instancePath: instancePath + "/fast/maxContextExpansionJobs", schemaPath: "#/properties/fast/properties/maxContextExpansionJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                              return false;
                            }
                            if (errors === _errs29) {
                              if (typeof data12 == "number" && isFinite(data12)) {
                                if (data12 > 1e4 || isNaN(data12)) {
                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxContextExpansionJobs", schemaPath: "#/properties/fast/properties/maxContextExpansionJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                  return false;
                                } else {
                                  if (data12 < 1 || isNaN(data12)) {
                                    validate20.errors = [{ instancePath: instancePath + "/fast/maxContextExpansionJobs", schemaPath: "#/properties/fast/properties/maxContextExpansionJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                    return false;
                                  }
                                }
                              }
                            }
                            var valid1 = _errs29 === errors;
                          } else {
                            var valid1 = true;
                          }
                          if (valid1) {
                            if (data0.maxVerificationJobs !== void 0) {
                              let data13 = data0.maxVerificationJobs;
                              const _errs31 = errors;
                              if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                                validate20.errors = [{ instancePath: instancePath + "/fast/maxVerificationJobs", schemaPath: "#/properties/fast/properties/maxVerificationJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                return false;
                              }
                              if (errors === _errs31) {
                                if (typeof data13 == "number" && isFinite(data13)) {
                                  if (data13 > 1e4 || isNaN(data13)) {
                                    validate20.errors = [{ instancePath: instancePath + "/fast/maxVerificationJobs", schemaPath: "#/properties/fast/properties/maxVerificationJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                    return false;
                                  } else {
                                    if (data13 < 1 || isNaN(data13)) {
                                      validate20.errors = [{ instancePath: instancePath + "/fast/maxVerificationJobs", schemaPath: "#/properties/fast/properties/maxVerificationJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                      return false;
                                    }
                                  }
                                }
                              }
                              var valid1 = _errs31 === errors;
                            } else {
                              var valid1 = true;
                            }
                            if (valid1) {
                              if (data0.maxInputTokensPerJob !== void 0) {
                                let data14 = data0.maxInputTokensPerJob;
                                const _errs33 = errors;
                                if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxInputTokensPerJob", schemaPath: "#/properties/fast/properties/maxInputTokensPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                  return false;
                                }
                                if (errors === _errs33) {
                                  if (typeof data14 == "number" && isFinite(data14)) {
                                    if (data14 > 1e8 || isNaN(data14)) {
                                      validate20.errors = [{ instancePath: instancePath + "/fast/maxInputTokensPerJob", schemaPath: "#/properties/fast/properties/maxInputTokensPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                      return false;
                                    } else {
                                      if (data14 < 1 || isNaN(data14)) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/maxInputTokensPerJob", schemaPath: "#/properties/fast/properties/maxInputTokensPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                        return false;
                                      }
                                    }
                                  }
                                }
                                var valid1 = _errs33 === errors;
                              } else {
                                var valid1 = true;
                              }
                              if (valid1) {
                                if (data0.maxContextTokensPerJob !== void 0) {
                                  let data15 = data0.maxContextTokensPerJob;
                                  const _errs35 = errors;
                                  if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
                                    validate20.errors = [{ instancePath: instancePath + "/fast/maxContextTokensPerJob", schemaPath: "#/properties/fast/properties/maxContextTokensPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                    return false;
                                  }
                                  if (errors === _errs35) {
                                    if (typeof data15 == "number" && isFinite(data15)) {
                                      if (data15 > 1e8 || isNaN(data15)) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/maxContextTokensPerJob", schemaPath: "#/properties/fast/properties/maxContextTokensPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                        return false;
                                      } else {
                                        if (data15 < 1 || isNaN(data15)) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/maxContextTokensPerJob", schemaPath: "#/properties/fast/properties/maxContextTokensPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    }
                                  }
                                  var valid1 = _errs35 === errors;
                                } else {
                                  var valid1 = true;
                                }
                                if (valid1) {
                                  if (data0.maxPromptBytesPerJob !== void 0) {
                                    let data16 = data0.maxPromptBytesPerJob;
                                    const _errs37 = errors;
                                    if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)) && isFinite(data16))) {
                                      validate20.errors = [{ instancePath: instancePath + "/fast/maxPromptBytesPerJob", schemaPath: "#/properties/fast/properties/maxPromptBytesPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs37) {
                                      if (typeof data16 == "number" && isFinite(data16)) {
                                        if (data16 > 1e8 || isNaN(data16)) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/maxPromptBytesPerJob", schemaPath: "#/properties/fast/properties/maxPromptBytesPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                          return false;
                                        } else {
                                          if (data16 < 1 || isNaN(data16)) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/maxPromptBytesPerJob", schemaPath: "#/properties/fast/properties/maxPromptBytesPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid1 = _errs37 === errors;
                                  } else {
                                    var valid1 = true;
                                  }
                                  if (valid1) {
                                    if (data0.maxInitialInputTokens !== void 0) {
                                      let data17 = data0.maxInitialInputTokens;
                                      const _errs39 = errors;
                                      if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17))) {
                                        validate20.errors = [{ instancePath: instancePath + "/fast/maxInitialInputTokens", schemaPath: "#/properties/fast/properties/maxInitialInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs39) {
                                        if (typeof data17 == "number" && isFinite(data17)) {
                                          if (data17 > 1e9 || isNaN(data17)) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/maxInitialInputTokens", schemaPath: "#/properties/fast/properties/maxInitialInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                            return false;
                                          } else {
                                            if (data17 < 1 || isNaN(data17)) {
                                              validate20.errors = [{ instancePath: instancePath + "/fast/maxInitialInputTokens", schemaPath: "#/properties/fast/properties/maxInitialInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid1 = _errs39 === errors;
                                    } else {
                                      var valid1 = true;
                                    }
                                    if (valid1) {
                                      if (data0.maxContextExpansionInputTokens !== void 0) {
                                        let data18 = data0.maxContextExpansionInputTokens;
                                        const _errs41 = errors;
                                        if (!(typeof data18 == "number" && (!(data18 % 1) && !isNaN(data18)) && isFinite(data18))) {
                                          validate20.errors = [{ instancePath: instancePath + "/fast/maxContextExpansionInputTokens", schemaPath: "#/properties/fast/properties/maxContextExpansionInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs41) {
                                          if (typeof data18 == "number" && isFinite(data18)) {
                                            if (data18 > 1e9 || isNaN(data18)) {
                                              validate20.errors = [{ instancePath: instancePath + "/fast/maxContextExpansionInputTokens", schemaPath: "#/properties/fast/properties/maxContextExpansionInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                              return false;
                                            } else {
                                              if (data18 < 1 || isNaN(data18)) {
                                                validate20.errors = [{ instancePath: instancePath + "/fast/maxContextExpansionInputTokens", schemaPath: "#/properties/fast/properties/maxContextExpansionInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid1 = _errs41 === errors;
                                      } else {
                                        var valid1 = true;
                                      }
                                      if (valid1) {
                                        if (data0.maxVerificationInputTokens !== void 0) {
                                          let data19 = data0.maxVerificationInputTokens;
                                          const _errs43 = errors;
                                          if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)) && isFinite(data19))) {
                                            validate20.errors = [{ instancePath: instancePath + "/fast/maxVerificationInputTokens", schemaPath: "#/properties/fast/properties/maxVerificationInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                            return false;
                                          }
                                          if (errors === _errs43) {
                                            if (typeof data19 == "number" && isFinite(data19)) {
                                              if (data19 > 1e9 || isNaN(data19)) {
                                                validate20.errors = [{ instancePath: instancePath + "/fast/maxVerificationInputTokens", schemaPath: "#/properties/fast/properties/maxVerificationInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                return false;
                                              } else {
                                                if (data19 < 1 || isNaN(data19)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxVerificationInputTokens", schemaPath: "#/properties/fast/properties/maxVerificationInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                  return false;
                                                }
                                              }
                                            }
                                          }
                                          var valid1 = _errs43 === errors;
                                        } else {
                                          var valid1 = true;
                                        }
                                        if (valid1) {
                                          if (data0.maxTotalInputTokens !== void 0) {
                                            let data20 = data0.maxTotalInputTokens;
                                            const _errs45 = errors;
                                            if (!(typeof data20 == "number" && (!(data20 % 1) && !isNaN(data20)) && isFinite(data20))) {
                                              validate20.errors = [{ instancePath: instancePath + "/fast/maxTotalInputTokens", schemaPath: "#/properties/fast/properties/maxTotalInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                              return false;
                                            }
                                            if (errors === _errs45) {
                                              if (typeof data20 == "number" && isFinite(data20)) {
                                                if (data20 > 1e9 || isNaN(data20)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxTotalInputTokens", schemaPath: "#/properties/fast/properties/maxTotalInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                  return false;
                                                } else {
                                                  if (data20 < 1 || isNaN(data20)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/fast/maxTotalInputTokens", schemaPath: "#/properties/fast/properties/maxTotalInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                    return false;
                                                  }
                                                }
                                              }
                                            }
                                            var valid1 = _errs45 === errors;
                                          } else {
                                            var valid1 = true;
                                          }
                                          if (valid1) {
                                            if (data0.maxEstimatedCostUsd !== void 0) {
                                              let data21 = data0.maxEstimatedCostUsd;
                                              const _errs47 = errors;
                                              if (errors === _errs47) {
                                                if (typeof data21 == "number" && isFinite(data21)) {
                                                  if (data21 > 1e6 || isNaN(data21)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/fast/maxEstimatedCostUsd", schemaPath: "#/properties/fast/properties/maxEstimatedCostUsd/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                                                    return false;
                                                  } else {
                                                    if (data21 <= 0 || isNaN(data21)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/fast/maxEstimatedCostUsd", schemaPath: "#/properties/fast/properties/maxEstimatedCostUsd/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                      return false;
                                                    }
                                                  }
                                                } else {
                                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxEstimatedCostUsd", schemaPath: "#/properties/fast/properties/maxEstimatedCostUsd/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                  return false;
                                                }
                                              }
                                              var valid1 = _errs47 === errors;
                                            } else {
                                              var valid1 = true;
                                            }
                                            if (valid1) {
                                              if (data0.maxWallTimeSeconds !== void 0) {
                                                let data22 = data0.maxWallTimeSeconds;
                                                const _errs49 = errors;
                                                if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)) && isFinite(data22))) {
                                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxWallTimeSeconds", schemaPath: "#/properties/fast/properties/maxWallTimeSeconds/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                  return false;
                                                }
                                                if (errors === _errs49) {
                                                  if (typeof data22 == "number" && isFinite(data22)) {
                                                    if (data22 > 604800 || isNaN(data22)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/fast/maxWallTimeSeconds", schemaPath: "#/properties/fast/properties/maxWallTimeSeconds/maximum", keyword: "maximum", params: { comparison: "<=", limit: 604800 }, message: "must be <= 604800" }];
                                                      return false;
                                                    } else {
                                                      if (data22 < 1 || isNaN(data22)) {
                                                        validate20.errors = [{ instancePath: instancePath + "/fast/maxWallTimeSeconds", schemaPath: "#/properties/fast/properties/maxWallTimeSeconds/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                        return false;
                                                      }
                                                    }
                                                  }
                                                }
                                                var valid1 = _errs49 === errors;
                                              } else {
                                                var valid1 = true;
                                              }
                                              if (valid1) {
                                                if (data0.estimatedSecondsPerJob !== void 0) {
                                                  let data23 = data0.estimatedSecondsPerJob;
                                                  const _errs51 = errors;
                                                  if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)) && isFinite(data23))) {
                                                    validate20.errors = [{ instancePath: instancePath + "/fast/estimatedSecondsPerJob", schemaPath: "#/properties/fast/properties/estimatedSecondsPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                    return false;
                                                  }
                                                  if (errors === _errs51) {
                                                    if (typeof data23 == "number" && isFinite(data23)) {
                                                      if (data23 > 86400 || isNaN(data23)) {
                                                        validate20.errors = [{ instancePath: instancePath + "/fast/estimatedSecondsPerJob", schemaPath: "#/properties/fast/properties/estimatedSecondsPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 86400 }, message: "must be <= 86400" }];
                                                        return false;
                                                      } else {
                                                        if (data23 < 1 || isNaN(data23)) {
                                                          validate20.errors = [{ instancePath: instancePath + "/fast/estimatedSecondsPerJob", schemaPath: "#/properties/fast/properties/estimatedSecondsPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                          return false;
                                                        }
                                                      }
                                                    }
                                                  }
                                                  var valid1 = _errs51 === errors;
                                                } else {
                                                  var valid1 = true;
                                                }
                                                if (valid1) {
                                                  if (data0.inputUsdPerMillionTokens !== void 0) {
                                                    let data24 = data0.inputUsdPerMillionTokens;
                                                    const _errs53 = errors;
                                                    if (errors === _errs53) {
                                                      if (typeof data24 == "number" && isFinite(data24)) {
                                                        if (data24 > 1e4 || isNaN(data24)) {
                                                          validate20.errors = [{ instancePath: instancePath + "/fast/inputUsdPerMillionTokens", schemaPath: "#/properties/fast/properties/inputUsdPerMillionTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                          return false;
                                                        } else {
                                                          if (data24 <= 0 || isNaN(data24)) {
                                                            validate20.errors = [{ instancePath: instancePath + "/fast/inputUsdPerMillionTokens", schemaPath: "#/properties/fast/properties/inputUsdPerMillionTokens/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                            return false;
                                                          }
                                                        }
                                                      } else {
                                                        validate20.errors = [{ instancePath: instancePath + "/fast/inputUsdPerMillionTokens", schemaPath: "#/properties/fast/properties/inputUsdPerMillionTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                        return false;
                                                      }
                                                    }
                                                    var valid1 = _errs53 === errors;
                                                  } else {
                                                    var valid1 = true;
                                                  }
                                                  if (valid1) {
                                                    if (data0.outputUsdPerMillionTokens !== void 0) {
                                                      let data25 = data0.outputUsdPerMillionTokens;
                                                      const _errs55 = errors;
                                                      if (errors === _errs55) {
                                                        if (typeof data25 == "number" && isFinite(data25)) {
                                                          if (data25 > 1e4 || isNaN(data25)) {
                                                            validate20.errors = [{ instancePath: instancePath + "/fast/outputUsdPerMillionTokens", schemaPath: "#/properties/fast/properties/outputUsdPerMillionTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                            return false;
                                                          } else {
                                                            if (data25 <= 0 || isNaN(data25)) {
                                                              validate20.errors = [{ instancePath: instancePath + "/fast/outputUsdPerMillionTokens", schemaPath: "#/properties/fast/properties/outputUsdPerMillionTokens/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                              return false;
                                                            }
                                                          }
                                                        } else {
                                                          validate20.errors = [{ instancePath: instancePath + "/fast/outputUsdPerMillionTokens", schemaPath: "#/properties/fast/properties/outputUsdPerMillionTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                          return false;
                                                        }
                                                      }
                                                      var valid1 = _errs55 === errors;
                                                    } else {
                                                      var valid1 = true;
                                                    }
                                                    if (valid1) {
                                                      if (data0.concurrency !== void 0) {
                                                        let data26 = data0.concurrency;
                                                        const _errs57 = errors;
                                                        if (!(typeof data26 == "number" && (!(data26 % 1) && !isNaN(data26)) && isFinite(data26))) {
                                                          validate20.errors = [{ instancePath: instancePath + "/fast/concurrency", schemaPath: "#/properties/fast/properties/concurrency/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                          return false;
                                                        }
                                                        if (errors === _errs57) {
                                                          if (typeof data26 == "number" && isFinite(data26)) {
                                                            if (data26 > 32 || isNaN(data26)) {
                                                              validate20.errors = [{ instancePath: instancePath + "/fast/concurrency", schemaPath: "#/properties/fast/properties/concurrency/maximum", keyword: "maximum", params: { comparison: "<=", limit: 32 }, message: "must be <= 32" }];
                                                              return false;
                                                            } else {
                                                              if (data26 < 1 || isNaN(data26)) {
                                                                validate20.errors = [{ instancePath: instancePath + "/fast/concurrency", schemaPath: "#/properties/fast/properties/concurrency/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                                return false;
                                                              }
                                                            }
                                                          }
                                                        }
                                                        var valid1 = _errs57 === errors;
                                                      } else {
                                                        var valid1 = true;
                                                      }
                                                      if (valid1) {
                                                        if (data0.maxRetries !== void 0) {
                                                          let data27 = data0.maxRetries;
                                                          const _errs59 = errors;
                                                          if (!(typeof data27 == "number" && (!(data27 % 1) && !isNaN(data27)) && isFinite(data27))) {
                                                            validate20.errors = [{ instancePath: instancePath + "/fast/maxRetries", schemaPath: "#/properties/fast/properties/maxRetries/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                            return false;
                                                          }
                                                          if (errors === _errs59) {
                                                            if (typeof data27 == "number" && isFinite(data27)) {
                                                              if (data27 > 10 || isNaN(data27)) {
                                                                validate20.errors = [{ instancePath: instancePath + "/fast/maxRetries", schemaPath: "#/properties/fast/properties/maxRetries/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" }];
                                                                return false;
                                                              } else {
                                                                if (data27 < 0 || isNaN(data27)) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxRetries", schemaPath: "#/properties/fast/properties/maxRetries/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                                  return false;
                                                                }
                                                              }
                                                            }
                                                          }
                                                          var valid1 = _errs59 === errors;
                                                        } else {
                                                          var valid1 = true;
                                                        }
                                                        if (valid1) {
                                                          if (data0.maxRetryAttemptsPerPhase !== void 0) {
                                                            let data28 = data0.maxRetryAttemptsPerPhase;
                                                            const _errs61 = errors;
                                                            if (!(typeof data28 == "number" && (!(data28 % 1) && !isNaN(data28)) && isFinite(data28))) {
                                                              validate20.errors = [{ instancePath: instancePath + "/fast/maxRetryAttemptsPerPhase", schemaPath: "#/properties/fast/properties/maxRetryAttemptsPerPhase/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                              return false;
                                                            }
                                                            if (errors === _errs61) {
                                                              if (typeof data28 == "number" && isFinite(data28)) {
                                                                if (data28 > 1e4 || isNaN(data28)) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/fast/maxRetryAttemptsPerPhase", schemaPath: "#/properties/fast/properties/maxRetryAttemptsPerPhase/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                                  return false;
                                                                } else {
                                                                  if (data28 < 0 || isNaN(data28)) {
                                                                    validate20.errors = [{ instancePath: instancePath + "/fast/maxRetryAttemptsPerPhase", schemaPath: "#/properties/fast/properties/maxRetryAttemptsPerPhase/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                                    return false;
                                                                  }
                                                                }
                                                              }
                                                            }
                                                            var valid1 = _errs61 === errors;
                                                          } else {
                                                            var valid1 = true;
                                                          }
                                                          if (valid1) {
                                                            if (data0.enabledLenses !== void 0) {
                                                              let data29 = data0.enabledLenses;
                                                              const _errs63 = errors;
                                                              if (errors === _errs63) {
                                                                if (Array.isArray(data29)) {
                                                                  var valid4 = true;
                                                                  const len0 = data29.length;
                                                                  for (let i0 = 0; i0 < len0; i0++) {
                                                                    let data30 = data29[i0];
                                                                    const _errs65 = errors;
                                                                    if (!(data30 === "architecture" || data30 === "contracts" || data30 === "security" || data30 === "lifecycle" || data30 === "resilience" || data30 === "deployment" || data30 === "simplification")) {
                                                                      validate20.errors = [{ instancePath: instancePath + "/fast/enabledLenses/" + i0, schemaPath: "#/properties/fast/properties/enabledLenses/items/enum", keyword: "enum", params: { allowedValues: schema31.properties.fast.properties.enabledLenses.items.enum }, message: "must be equal to one of the allowed values" }];
                                                                      return false;
                                                                    }
                                                                    var valid4 = _errs65 === errors;
                                                                    if (!valid4) {
                                                                      break;
                                                                    }
                                                                  }
                                                                  if (valid4) {
                                                                    let i1 = data29.length;
                                                                    let j0;
                                                                    if (i1 > 1) {
                                                                      outer0: for (; i1--; ) {
                                                                        for (j0 = i1; j0--; ) {
                                                                          if (func0(data29[i1], data29[j0])) {
                                                                            validate20.errors = [{ instancePath: instancePath + "/fast/enabledLenses", schemaPath: "#/properties/fast/properties/enabledLenses/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" }];
                                                                            return false;
                                                                            break outer0;
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                } else {
                                                                  validate20.errors = [{ instancePath: instancePath + "/fast/enabledLenses", schemaPath: "#/properties/fast/properties/enabledLenses/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                                  return false;
                                                                }
                                                              }
                                                              var valid1 = _errs63 === errors;
                                                            } else {
                                                              var valid1 = true;
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                validate20.errors = [{ instancePath: instancePath + "/fast", schemaPath: "#/properties/fast/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                return false;
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.standard !== void 0) {
              let data31 = data.standard;
              const _errs66 = errors;
              if (errors === _errs66) {
                if (data31 && typeof data31 == "object" && !Array.isArray(data31)) {
                  let missing4;
                  if (data31.componentBudget === void 0 && (missing4 = "componentBudget") || data31.boundaryBudget === void 0 && (missing4 = "boundaryBudget") || data31.maxPrimaryJobs === void 0 && (missing4 = "maxPrimaryJobs") || data31.maxContextExpansionJobs === void 0 && (missing4 = "maxContextExpansionJobs") || data31.maxVerificationJobs === void 0 && (missing4 = "maxVerificationJobs") || data31.maxInputTokensPerJob === void 0 && (missing4 = "maxInputTokensPerJob") || data31.maxContextTokensPerJob === void 0 && (missing4 = "maxContextTokensPerJob") || data31.maxPromptBytesPerJob === void 0 && (missing4 = "maxPromptBytesPerJob") || data31.maxInitialInputTokens === void 0 && (missing4 = "maxInitialInputTokens") || data31.maxContextExpansionInputTokens === void 0 && (missing4 = "maxContextExpansionInputTokens") || data31.maxVerificationInputTokens === void 0 && (missing4 = "maxVerificationInputTokens") || data31.maxTotalInputTokens === void 0 && (missing4 = "maxTotalInputTokens") || data31.maxEstimatedCostUsd === void 0 && (missing4 = "maxEstimatedCostUsd") || data31.maxWallTimeSeconds === void 0 && (missing4 = "maxWallTimeSeconds") || data31.estimatedSecondsPerJob === void 0 && (missing4 = "estimatedSecondsPerJob") || data31.inputUsdPerMillionTokens === void 0 && (missing4 = "inputUsdPerMillionTokens") || data31.outputUsdPerMillionTokens === void 0 && (missing4 = "outputUsdPerMillionTokens") || data31.concurrency === void 0 && (missing4 = "concurrency") || data31.maxRetries === void 0 && (missing4 = "maxRetries") || data31.maxRetryAttemptsPerPhase === void 0 && (missing4 = "maxRetryAttemptsPerPhase") || data31.enabledLenses === void 0 && (missing4 = "enabledLenses")) {
                    validate20.errors = [{ instancePath: instancePath + "/standard", schemaPath: "#/properties/standard/required", keyword: "required", params: { missingProperty: missing4 }, message: "must have required property '" + missing4 + "'" }];
                    return false;
                  } else {
                    const _errs68 = errors;
                    for (const key4 in data31) {
                      if (!func1.call(schema31.properties.standard.properties, key4)) {
                        validate20.errors = [{ instancePath: instancePath + "/standard", schemaPath: "#/properties/standard/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" }];
                        return false;
                        break;
                      }
                    }
                    if (_errs68 === errors) {
                      if (data31.componentBudget !== void 0) {
                        let data32 = data31.componentBudget;
                        const _errs69 = errors;
                        if (errors === _errs69) {
                          if (data32 && typeof data32 == "object" && !Array.isArray(data32)) {
                            let missing5;
                            if (data32.maxFiles === void 0 && (missing5 = "maxFiles") || data32.maxBytes === void 0 && (missing5 = "maxBytes") || data32.maxTokens === void 0 && (missing5 = "maxTokens")) {
                              validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget", schemaPath: "#/properties/standard/properties/componentBudget/required", keyword: "required", params: { missingProperty: missing5 }, message: "must have required property '" + missing5 + "'" }];
                              return false;
                            } else {
                              const _errs71 = errors;
                              for (const key5 in data32) {
                                if (!(key5 === "maxFiles" || key5 === "maxBytes" || key5 === "maxTokens")) {
                                  validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget", schemaPath: "#/properties/standard/properties/componentBudget/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" }];
                                  return false;
                                  break;
                                }
                              }
                              if (_errs71 === errors) {
                                if (data32.maxFiles !== void 0) {
                                  let data33 = data32.maxFiles;
                                  const _errs72 = errors;
                                  if (!(typeof data33 == "number" && (!(data33 % 1) && !isNaN(data33)) && isFinite(data33))) {
                                    validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxFiles", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxFiles/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                    return false;
                                  }
                                  if (errors === _errs72) {
                                    if (typeof data33 == "number" && isFinite(data33)) {
                                      if (data33 > 1e4 || isNaN(data33)) {
                                        validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxFiles", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxFiles/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                        return false;
                                      } else {
                                        if (data33 < 1 || isNaN(data33)) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxFiles", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxFiles/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    }
                                  }
                                  var valid7 = _errs72 === errors;
                                } else {
                                  var valid7 = true;
                                }
                                if (valid7) {
                                  if (data32.maxBytes !== void 0) {
                                    let data34 = data32.maxBytes;
                                    const _errs74 = errors;
                                    if (!(typeof data34 == "number" && (!(data34 % 1) && !isNaN(data34)) && isFinite(data34))) {
                                      validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxBytes", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs74) {
                                      if (typeof data34 == "number" && isFinite(data34)) {
                                        if (data34 > 1e8 || isNaN(data34)) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxBytes", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxBytes/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                          return false;
                                        } else {
                                          if (data34 < 1 || isNaN(data34)) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxBytes", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid7 = _errs74 === errors;
                                  } else {
                                    var valid7 = true;
                                  }
                                  if (valid7) {
                                    if (data32.maxTokens !== void 0) {
                                      let data35 = data32.maxTokens;
                                      const _errs76 = errors;
                                      if (!(typeof data35 == "number" && (!(data35 % 1) && !isNaN(data35)) && isFinite(data35))) {
                                        validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxTokens", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs76) {
                                        if (typeof data35 == "number" && isFinite(data35)) {
                                          if (data35 > 1e8 || isNaN(data35)) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxTokens", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                            return false;
                                          } else {
                                            if (data35 < 1 || isNaN(data35)) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget/maxTokens", schemaPath: "#/properties/standard/properties/componentBudget/properties/maxTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid7 = _errs76 === errors;
                                    } else {
                                      var valid7 = true;
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            validate20.errors = [{ instancePath: instancePath + "/standard/componentBudget", schemaPath: "#/properties/standard/properties/componentBudget/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                            return false;
                          }
                        }
                        var valid6 = _errs69 === errors;
                      } else {
                        var valid6 = true;
                      }
                      if (valid6) {
                        if (data31.boundaryBudget !== void 0) {
                          let data36 = data31.boundaryBudget;
                          const _errs78 = errors;
                          if (errors === _errs78) {
                            if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                              let missing6;
                              if (data36.maxFiles === void 0 && (missing6 = "maxFiles") || data36.maxBytes === void 0 && (missing6 = "maxBytes") || data36.maxTokens === void 0 && (missing6 = "maxTokens") || data36.maxRelations === void 0 && (missing6 = "maxRelations") || data36.maxSlices === void 0 && (missing6 = "maxSlices")) {
                                validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget", schemaPath: "#/properties/standard/properties/boundaryBudget/required", keyword: "required", params: { missingProperty: missing6 }, message: "must have required property '" + missing6 + "'" }];
                                return false;
                              } else {
                                const _errs80 = errors;
                                for (const key6 in data36) {
                                  if (!(key6 === "maxFiles" || key6 === "maxBytes" || key6 === "maxTokens" || key6 === "maxRelations" || key6 === "maxSlices")) {
                                    validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget", schemaPath: "#/properties/standard/properties/boundaryBudget/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" }];
                                    return false;
                                    break;
                                  }
                                }
                                if (_errs80 === errors) {
                                  if (data36.maxFiles !== void 0) {
                                    let data37 = data36.maxFiles;
                                    const _errs81 = errors;
                                    if (!(typeof data37 == "number" && (!(data37 % 1) && !isNaN(data37)) && isFinite(data37))) {
                                      validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxFiles", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxFiles/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs81) {
                                      if (typeof data37 == "number" && isFinite(data37)) {
                                        if (data37 > 1e4 || isNaN(data37)) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxFiles", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxFiles/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                          return false;
                                        } else {
                                          if (data37 < 1 || isNaN(data37)) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxFiles", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxFiles/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid8 = _errs81 === errors;
                                  } else {
                                    var valid8 = true;
                                  }
                                  if (valid8) {
                                    if (data36.maxBytes !== void 0) {
                                      let data38 = data36.maxBytes;
                                      const _errs83 = errors;
                                      if (!(typeof data38 == "number" && (!(data38 % 1) && !isNaN(data38)) && isFinite(data38))) {
                                        validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxBytes", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs83) {
                                        if (typeof data38 == "number" && isFinite(data38)) {
                                          if (data38 > 1e8 || isNaN(data38)) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxBytes", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxBytes/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                            return false;
                                          } else {
                                            if (data38 < 1 || isNaN(data38)) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxBytes", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid8 = _errs83 === errors;
                                    } else {
                                      var valid8 = true;
                                    }
                                    if (valid8) {
                                      if (data36.maxTokens !== void 0) {
                                        let data39 = data36.maxTokens;
                                        const _errs85 = errors;
                                        if (!(typeof data39 == "number" && (!(data39 % 1) && !isNaN(data39)) && isFinite(data39))) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxTokens", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs85) {
                                          if (typeof data39 == "number" && isFinite(data39)) {
                                            if (data39 > 1e8 || isNaN(data39)) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxTokens", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                              return false;
                                            } else {
                                              if (data39 < 1 || isNaN(data39)) {
                                                validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxTokens", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid8 = _errs85 === errors;
                                      } else {
                                        var valid8 = true;
                                      }
                                      if (valid8) {
                                        if (data36.maxRelations !== void 0) {
                                          let data40 = data36.maxRelations;
                                          const _errs87 = errors;
                                          if (!(typeof data40 == "number" && (!(data40 % 1) && !isNaN(data40)) && isFinite(data40))) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxRelations", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxRelations/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                            return false;
                                          }
                                          if (errors === _errs87) {
                                            if (typeof data40 == "number" && isFinite(data40)) {
                                              if (data40 > 1e5 || isNaN(data40)) {
                                                validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxRelations", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxRelations/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e5 }, message: "must be <= 100000" }];
                                                return false;
                                              } else {
                                                if (data40 < 1 || isNaN(data40)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxRelations", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxRelations/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                  return false;
                                                }
                                              }
                                            }
                                          }
                                          var valid8 = _errs87 === errors;
                                        } else {
                                          var valid8 = true;
                                        }
                                        if (valid8) {
                                          if (data36.maxSlices !== void 0) {
                                            let data41 = data36.maxSlices;
                                            const _errs89 = errors;
                                            if (!(typeof data41 == "number" && (!(data41 % 1) && !isNaN(data41)) && isFinite(data41))) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxSlices", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxSlices/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                              return false;
                                            }
                                            if (errors === _errs89) {
                                              if (typeof data41 == "number" && isFinite(data41)) {
                                                if (data41 > 1e4 || isNaN(data41)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxSlices", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxSlices/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                  return false;
                                                } else {
                                                  if (data41 < 1 || isNaN(data41)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget/maxSlices", schemaPath: "#/properties/standard/properties/boundaryBudget/properties/maxSlices/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                    return false;
                                                  }
                                                }
                                              }
                                            }
                                            var valid8 = _errs89 === errors;
                                          } else {
                                            var valid8 = true;
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            } else {
                              validate20.errors = [{ instancePath: instancePath + "/standard/boundaryBudget", schemaPath: "#/properties/standard/properties/boundaryBudget/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                              return false;
                            }
                          }
                          var valid6 = _errs78 === errors;
                        } else {
                          var valid6 = true;
                        }
                        if (valid6) {
                          if (data31.maxPrimaryJobs !== void 0) {
                            let data42 = data31.maxPrimaryJobs;
                            const _errs91 = errors;
                            if (!(typeof data42 == "number" && (!(data42 % 1) && !isNaN(data42)) && isFinite(data42))) {
                              validate20.errors = [{ instancePath: instancePath + "/standard/maxPrimaryJobs", schemaPath: "#/properties/standard/properties/maxPrimaryJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                              return false;
                            }
                            if (errors === _errs91) {
                              if (typeof data42 == "number" && isFinite(data42)) {
                                if (data42 > 1e4 || isNaN(data42)) {
                                  validate20.errors = [{ instancePath: instancePath + "/standard/maxPrimaryJobs", schemaPath: "#/properties/standard/properties/maxPrimaryJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                  return false;
                                } else {
                                  if (data42 < 1 || isNaN(data42)) {
                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxPrimaryJobs", schemaPath: "#/properties/standard/properties/maxPrimaryJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                    return false;
                                  }
                                }
                              }
                            }
                            var valid6 = _errs91 === errors;
                          } else {
                            var valid6 = true;
                          }
                          if (valid6) {
                            if (data31.maxContextExpansionJobs !== void 0) {
                              let data43 = data31.maxContextExpansionJobs;
                              const _errs93 = errors;
                              if (!(typeof data43 == "number" && (!(data43 % 1) && !isNaN(data43)) && isFinite(data43))) {
                                validate20.errors = [{ instancePath: instancePath + "/standard/maxContextExpansionJobs", schemaPath: "#/properties/standard/properties/maxContextExpansionJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                return false;
                              }
                              if (errors === _errs93) {
                                if (typeof data43 == "number" && isFinite(data43)) {
                                  if (data43 > 1e4 || isNaN(data43)) {
                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxContextExpansionJobs", schemaPath: "#/properties/standard/properties/maxContextExpansionJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                    return false;
                                  } else {
                                    if (data43 < 1 || isNaN(data43)) {
                                      validate20.errors = [{ instancePath: instancePath + "/standard/maxContextExpansionJobs", schemaPath: "#/properties/standard/properties/maxContextExpansionJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                      return false;
                                    }
                                  }
                                }
                              }
                              var valid6 = _errs93 === errors;
                            } else {
                              var valid6 = true;
                            }
                            if (valid6) {
                              if (data31.maxVerificationJobs !== void 0) {
                                let data44 = data31.maxVerificationJobs;
                                const _errs95 = errors;
                                if (!(typeof data44 == "number" && (!(data44 % 1) && !isNaN(data44)) && isFinite(data44))) {
                                  validate20.errors = [{ instancePath: instancePath + "/standard/maxVerificationJobs", schemaPath: "#/properties/standard/properties/maxVerificationJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                  return false;
                                }
                                if (errors === _errs95) {
                                  if (typeof data44 == "number" && isFinite(data44)) {
                                    if (data44 > 1e4 || isNaN(data44)) {
                                      validate20.errors = [{ instancePath: instancePath + "/standard/maxVerificationJobs", schemaPath: "#/properties/standard/properties/maxVerificationJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                      return false;
                                    } else {
                                      if (data44 < 1 || isNaN(data44)) {
                                        validate20.errors = [{ instancePath: instancePath + "/standard/maxVerificationJobs", schemaPath: "#/properties/standard/properties/maxVerificationJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                        return false;
                                      }
                                    }
                                  }
                                }
                                var valid6 = _errs95 === errors;
                              } else {
                                var valid6 = true;
                              }
                              if (valid6) {
                                if (data31.maxInputTokensPerJob !== void 0) {
                                  let data45 = data31.maxInputTokensPerJob;
                                  const _errs97 = errors;
                                  if (!(typeof data45 == "number" && (!(data45 % 1) && !isNaN(data45)) && isFinite(data45))) {
                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxInputTokensPerJob", schemaPath: "#/properties/standard/properties/maxInputTokensPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                    return false;
                                  }
                                  if (errors === _errs97) {
                                    if (typeof data45 == "number" && isFinite(data45)) {
                                      if (data45 > 1e8 || isNaN(data45)) {
                                        validate20.errors = [{ instancePath: instancePath + "/standard/maxInputTokensPerJob", schemaPath: "#/properties/standard/properties/maxInputTokensPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                        return false;
                                      } else {
                                        if (data45 < 1 || isNaN(data45)) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/maxInputTokensPerJob", schemaPath: "#/properties/standard/properties/maxInputTokensPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    }
                                  }
                                  var valid6 = _errs97 === errors;
                                } else {
                                  var valid6 = true;
                                }
                                if (valid6) {
                                  if (data31.maxContextTokensPerJob !== void 0) {
                                    let data46 = data31.maxContextTokensPerJob;
                                    const _errs99 = errors;
                                    if (!(typeof data46 == "number" && (!(data46 % 1) && !isNaN(data46)) && isFinite(data46))) {
                                      validate20.errors = [{ instancePath: instancePath + "/standard/maxContextTokensPerJob", schemaPath: "#/properties/standard/properties/maxContextTokensPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs99) {
                                      if (typeof data46 == "number" && isFinite(data46)) {
                                        if (data46 > 1e8 || isNaN(data46)) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/maxContextTokensPerJob", schemaPath: "#/properties/standard/properties/maxContextTokensPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                          return false;
                                        } else {
                                          if (data46 < 1 || isNaN(data46)) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/maxContextTokensPerJob", schemaPath: "#/properties/standard/properties/maxContextTokensPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid6 = _errs99 === errors;
                                  } else {
                                    var valid6 = true;
                                  }
                                  if (valid6) {
                                    if (data31.maxPromptBytesPerJob !== void 0) {
                                      let data47 = data31.maxPromptBytesPerJob;
                                      const _errs101 = errors;
                                      if (!(typeof data47 == "number" && (!(data47 % 1) && !isNaN(data47)) && isFinite(data47))) {
                                        validate20.errors = [{ instancePath: instancePath + "/standard/maxPromptBytesPerJob", schemaPath: "#/properties/standard/properties/maxPromptBytesPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs101) {
                                        if (typeof data47 == "number" && isFinite(data47)) {
                                          if (data47 > 1e8 || isNaN(data47)) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/maxPromptBytesPerJob", schemaPath: "#/properties/standard/properties/maxPromptBytesPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                            return false;
                                          } else {
                                            if (data47 < 1 || isNaN(data47)) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/maxPromptBytesPerJob", schemaPath: "#/properties/standard/properties/maxPromptBytesPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid6 = _errs101 === errors;
                                    } else {
                                      var valid6 = true;
                                    }
                                    if (valid6) {
                                      if (data31.maxInitialInputTokens !== void 0) {
                                        let data48 = data31.maxInitialInputTokens;
                                        const _errs103 = errors;
                                        if (!(typeof data48 == "number" && (!(data48 % 1) && !isNaN(data48)) && isFinite(data48))) {
                                          validate20.errors = [{ instancePath: instancePath + "/standard/maxInitialInputTokens", schemaPath: "#/properties/standard/properties/maxInitialInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs103) {
                                          if (typeof data48 == "number" && isFinite(data48)) {
                                            if (data48 > 1e9 || isNaN(data48)) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/maxInitialInputTokens", schemaPath: "#/properties/standard/properties/maxInitialInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                              return false;
                                            } else {
                                              if (data48 < 1 || isNaN(data48)) {
                                                validate20.errors = [{ instancePath: instancePath + "/standard/maxInitialInputTokens", schemaPath: "#/properties/standard/properties/maxInitialInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid6 = _errs103 === errors;
                                      } else {
                                        var valid6 = true;
                                      }
                                      if (valid6) {
                                        if (data31.maxContextExpansionInputTokens !== void 0) {
                                          let data49 = data31.maxContextExpansionInputTokens;
                                          const _errs105 = errors;
                                          if (!(typeof data49 == "number" && (!(data49 % 1) && !isNaN(data49)) && isFinite(data49))) {
                                            validate20.errors = [{ instancePath: instancePath + "/standard/maxContextExpansionInputTokens", schemaPath: "#/properties/standard/properties/maxContextExpansionInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                            return false;
                                          }
                                          if (errors === _errs105) {
                                            if (typeof data49 == "number" && isFinite(data49)) {
                                              if (data49 > 1e9 || isNaN(data49)) {
                                                validate20.errors = [{ instancePath: instancePath + "/standard/maxContextExpansionInputTokens", schemaPath: "#/properties/standard/properties/maxContextExpansionInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                return false;
                                              } else {
                                                if (data49 < 1 || isNaN(data49)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/standard/maxContextExpansionInputTokens", schemaPath: "#/properties/standard/properties/maxContextExpansionInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                  return false;
                                                }
                                              }
                                            }
                                          }
                                          var valid6 = _errs105 === errors;
                                        } else {
                                          var valid6 = true;
                                        }
                                        if (valid6) {
                                          if (data31.maxVerificationInputTokens !== void 0) {
                                            let data50 = data31.maxVerificationInputTokens;
                                            const _errs107 = errors;
                                            if (!(typeof data50 == "number" && (!(data50 % 1) && !isNaN(data50)) && isFinite(data50))) {
                                              validate20.errors = [{ instancePath: instancePath + "/standard/maxVerificationInputTokens", schemaPath: "#/properties/standard/properties/maxVerificationInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                              return false;
                                            }
                                            if (errors === _errs107) {
                                              if (typeof data50 == "number" && isFinite(data50)) {
                                                if (data50 > 1e9 || isNaN(data50)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/standard/maxVerificationInputTokens", schemaPath: "#/properties/standard/properties/maxVerificationInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                  return false;
                                                } else {
                                                  if (data50 < 1 || isNaN(data50)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxVerificationInputTokens", schemaPath: "#/properties/standard/properties/maxVerificationInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                    return false;
                                                  }
                                                }
                                              }
                                            }
                                            var valid6 = _errs107 === errors;
                                          } else {
                                            var valid6 = true;
                                          }
                                          if (valid6) {
                                            if (data31.maxTotalInputTokens !== void 0) {
                                              let data51 = data31.maxTotalInputTokens;
                                              const _errs109 = errors;
                                              if (!(typeof data51 == "number" && (!(data51 % 1) && !isNaN(data51)) && isFinite(data51))) {
                                                validate20.errors = [{ instancePath: instancePath + "/standard/maxTotalInputTokens", schemaPath: "#/properties/standard/properties/maxTotalInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                return false;
                                              }
                                              if (errors === _errs109) {
                                                if (typeof data51 == "number" && isFinite(data51)) {
                                                  if (data51 > 1e9 || isNaN(data51)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxTotalInputTokens", schemaPath: "#/properties/standard/properties/maxTotalInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                    return false;
                                                  } else {
                                                    if (data51 < 1 || isNaN(data51)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/standard/maxTotalInputTokens", schemaPath: "#/properties/standard/properties/maxTotalInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                      return false;
                                                    }
                                                  }
                                                }
                                              }
                                              var valid6 = _errs109 === errors;
                                            } else {
                                              var valid6 = true;
                                            }
                                            if (valid6) {
                                              if (data31.maxEstimatedCostUsd !== void 0) {
                                                let data52 = data31.maxEstimatedCostUsd;
                                                const _errs111 = errors;
                                                if (errors === _errs111) {
                                                  if (typeof data52 == "number" && isFinite(data52)) {
                                                    if (data52 > 1e6 || isNaN(data52)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/standard/maxEstimatedCostUsd", schemaPath: "#/properties/standard/properties/maxEstimatedCostUsd/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                                                      return false;
                                                    } else {
                                                      if (data52 <= 0 || isNaN(data52)) {
                                                        validate20.errors = [{ instancePath: instancePath + "/standard/maxEstimatedCostUsd", schemaPath: "#/properties/standard/properties/maxEstimatedCostUsd/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                        return false;
                                                      }
                                                    }
                                                  } else {
                                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxEstimatedCostUsd", schemaPath: "#/properties/standard/properties/maxEstimatedCostUsd/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                    return false;
                                                  }
                                                }
                                                var valid6 = _errs111 === errors;
                                              } else {
                                                var valid6 = true;
                                              }
                                              if (valid6) {
                                                if (data31.maxWallTimeSeconds !== void 0) {
                                                  let data53 = data31.maxWallTimeSeconds;
                                                  const _errs113 = errors;
                                                  if (!(typeof data53 == "number" && (!(data53 % 1) && !isNaN(data53)) && isFinite(data53))) {
                                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxWallTimeSeconds", schemaPath: "#/properties/standard/properties/maxWallTimeSeconds/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                    return false;
                                                  }
                                                  if (errors === _errs113) {
                                                    if (typeof data53 == "number" && isFinite(data53)) {
                                                      if (data53 > 604800 || isNaN(data53)) {
                                                        validate20.errors = [{ instancePath: instancePath + "/standard/maxWallTimeSeconds", schemaPath: "#/properties/standard/properties/maxWallTimeSeconds/maximum", keyword: "maximum", params: { comparison: "<=", limit: 604800 }, message: "must be <= 604800" }];
                                                        return false;
                                                      } else {
                                                        if (data53 < 1 || isNaN(data53)) {
                                                          validate20.errors = [{ instancePath: instancePath + "/standard/maxWallTimeSeconds", schemaPath: "#/properties/standard/properties/maxWallTimeSeconds/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                          return false;
                                                        }
                                                      }
                                                    }
                                                  }
                                                  var valid6 = _errs113 === errors;
                                                } else {
                                                  var valid6 = true;
                                                }
                                                if (valid6) {
                                                  if (data31.estimatedSecondsPerJob !== void 0) {
                                                    let data54 = data31.estimatedSecondsPerJob;
                                                    const _errs115 = errors;
                                                    if (!(typeof data54 == "number" && (!(data54 % 1) && !isNaN(data54)) && isFinite(data54))) {
                                                      validate20.errors = [{ instancePath: instancePath + "/standard/estimatedSecondsPerJob", schemaPath: "#/properties/standard/properties/estimatedSecondsPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                      return false;
                                                    }
                                                    if (errors === _errs115) {
                                                      if (typeof data54 == "number" && isFinite(data54)) {
                                                        if (data54 > 86400 || isNaN(data54)) {
                                                          validate20.errors = [{ instancePath: instancePath + "/standard/estimatedSecondsPerJob", schemaPath: "#/properties/standard/properties/estimatedSecondsPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 86400 }, message: "must be <= 86400" }];
                                                          return false;
                                                        } else {
                                                          if (data54 < 1 || isNaN(data54)) {
                                                            validate20.errors = [{ instancePath: instancePath + "/standard/estimatedSecondsPerJob", schemaPath: "#/properties/standard/properties/estimatedSecondsPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                            return false;
                                                          }
                                                        }
                                                      }
                                                    }
                                                    var valid6 = _errs115 === errors;
                                                  } else {
                                                    var valid6 = true;
                                                  }
                                                  if (valid6) {
                                                    if (data31.inputUsdPerMillionTokens !== void 0) {
                                                      let data55 = data31.inputUsdPerMillionTokens;
                                                      const _errs117 = errors;
                                                      if (errors === _errs117) {
                                                        if (typeof data55 == "number" && isFinite(data55)) {
                                                          if (data55 > 1e4 || isNaN(data55)) {
                                                            validate20.errors = [{ instancePath: instancePath + "/standard/inputUsdPerMillionTokens", schemaPath: "#/properties/standard/properties/inputUsdPerMillionTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                            return false;
                                                          } else {
                                                            if (data55 <= 0 || isNaN(data55)) {
                                                              validate20.errors = [{ instancePath: instancePath + "/standard/inputUsdPerMillionTokens", schemaPath: "#/properties/standard/properties/inputUsdPerMillionTokens/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                              return false;
                                                            }
                                                          }
                                                        } else {
                                                          validate20.errors = [{ instancePath: instancePath + "/standard/inputUsdPerMillionTokens", schemaPath: "#/properties/standard/properties/inputUsdPerMillionTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                          return false;
                                                        }
                                                      }
                                                      var valid6 = _errs117 === errors;
                                                    } else {
                                                      var valid6 = true;
                                                    }
                                                    if (valid6) {
                                                      if (data31.outputUsdPerMillionTokens !== void 0) {
                                                        let data56 = data31.outputUsdPerMillionTokens;
                                                        const _errs119 = errors;
                                                        if (errors === _errs119) {
                                                          if (typeof data56 == "number" && isFinite(data56)) {
                                                            if (data56 > 1e4 || isNaN(data56)) {
                                                              validate20.errors = [{ instancePath: instancePath + "/standard/outputUsdPerMillionTokens", schemaPath: "#/properties/standard/properties/outputUsdPerMillionTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                              return false;
                                                            } else {
                                                              if (data56 <= 0 || isNaN(data56)) {
                                                                validate20.errors = [{ instancePath: instancePath + "/standard/outputUsdPerMillionTokens", schemaPath: "#/properties/standard/properties/outputUsdPerMillionTokens/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                                return false;
                                                              }
                                                            }
                                                          } else {
                                                            validate20.errors = [{ instancePath: instancePath + "/standard/outputUsdPerMillionTokens", schemaPath: "#/properties/standard/properties/outputUsdPerMillionTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                            return false;
                                                          }
                                                        }
                                                        var valid6 = _errs119 === errors;
                                                      } else {
                                                        var valid6 = true;
                                                      }
                                                      if (valid6) {
                                                        if (data31.concurrency !== void 0) {
                                                          let data57 = data31.concurrency;
                                                          const _errs121 = errors;
                                                          if (!(typeof data57 == "number" && (!(data57 % 1) && !isNaN(data57)) && isFinite(data57))) {
                                                            validate20.errors = [{ instancePath: instancePath + "/standard/concurrency", schemaPath: "#/properties/standard/properties/concurrency/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                            return false;
                                                          }
                                                          if (errors === _errs121) {
                                                            if (typeof data57 == "number" && isFinite(data57)) {
                                                              if (data57 > 32 || isNaN(data57)) {
                                                                validate20.errors = [{ instancePath: instancePath + "/standard/concurrency", schemaPath: "#/properties/standard/properties/concurrency/maximum", keyword: "maximum", params: { comparison: "<=", limit: 32 }, message: "must be <= 32" }];
                                                                return false;
                                                              } else {
                                                                if (data57 < 1 || isNaN(data57)) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/standard/concurrency", schemaPath: "#/properties/standard/properties/concurrency/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                                  return false;
                                                                }
                                                              }
                                                            }
                                                          }
                                                          var valid6 = _errs121 === errors;
                                                        } else {
                                                          var valid6 = true;
                                                        }
                                                        if (valid6) {
                                                          if (data31.maxRetries !== void 0) {
                                                            let data58 = data31.maxRetries;
                                                            const _errs123 = errors;
                                                            if (!(typeof data58 == "number" && (!(data58 % 1) && !isNaN(data58)) && isFinite(data58))) {
                                                              validate20.errors = [{ instancePath: instancePath + "/standard/maxRetries", schemaPath: "#/properties/standard/properties/maxRetries/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                              return false;
                                                            }
                                                            if (errors === _errs123) {
                                                              if (typeof data58 == "number" && isFinite(data58)) {
                                                                if (data58 > 10 || isNaN(data58)) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/standard/maxRetries", schemaPath: "#/properties/standard/properties/maxRetries/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" }];
                                                                  return false;
                                                                } else {
                                                                  if (data58 < 0 || isNaN(data58)) {
                                                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxRetries", schemaPath: "#/properties/standard/properties/maxRetries/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                                    return false;
                                                                  }
                                                                }
                                                              }
                                                            }
                                                            var valid6 = _errs123 === errors;
                                                          } else {
                                                            var valid6 = true;
                                                          }
                                                          if (valid6) {
                                                            if (data31.maxRetryAttemptsPerPhase !== void 0) {
                                                              let data59 = data31.maxRetryAttemptsPerPhase;
                                                              const _errs125 = errors;
                                                              if (!(typeof data59 == "number" && (!(data59 % 1) && !isNaN(data59)) && isFinite(data59))) {
                                                                validate20.errors = [{ instancePath: instancePath + "/standard/maxRetryAttemptsPerPhase", schemaPath: "#/properties/standard/properties/maxRetryAttemptsPerPhase/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                                return false;
                                                              }
                                                              if (errors === _errs125) {
                                                                if (typeof data59 == "number" && isFinite(data59)) {
                                                                  if (data59 > 1e4 || isNaN(data59)) {
                                                                    validate20.errors = [{ instancePath: instancePath + "/standard/maxRetryAttemptsPerPhase", schemaPath: "#/properties/standard/properties/maxRetryAttemptsPerPhase/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                                    return false;
                                                                  } else {
                                                                    if (data59 < 0 || isNaN(data59)) {
                                                                      validate20.errors = [{ instancePath: instancePath + "/standard/maxRetryAttemptsPerPhase", schemaPath: "#/properties/standard/properties/maxRetryAttemptsPerPhase/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                                      return false;
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                              var valid6 = _errs125 === errors;
                                                            } else {
                                                              var valid6 = true;
                                                            }
                                                            if (valid6) {
                                                              if (data31.enabledLenses !== void 0) {
                                                                let data60 = data31.enabledLenses;
                                                                const _errs127 = errors;
                                                                if (errors === _errs127) {
                                                                  if (Array.isArray(data60)) {
                                                                    var valid9 = true;
                                                                    const len1 = data60.length;
                                                                    for (let i2 = 0; i2 < len1; i2++) {
                                                                      let data61 = data60[i2];
                                                                      const _errs129 = errors;
                                                                      if (!(data61 === "architecture" || data61 === "contracts" || data61 === "security" || data61 === "lifecycle" || data61 === "resilience" || data61 === "deployment" || data61 === "simplification")) {
                                                                        validate20.errors = [{ instancePath: instancePath + "/standard/enabledLenses/" + i2, schemaPath: "#/properties/standard/properties/enabledLenses/items/enum", keyword: "enum", params: { allowedValues: schema31.properties.standard.properties.enabledLenses.items.enum }, message: "must be equal to one of the allowed values" }];
                                                                        return false;
                                                                      }
                                                                      var valid9 = _errs129 === errors;
                                                                      if (!valid9) {
                                                                        break;
                                                                      }
                                                                    }
                                                                    if (valid9) {
                                                                      let i3 = data60.length;
                                                                      let j1;
                                                                      if (i3 > 1) {
                                                                        outer1: for (; i3--; ) {
                                                                          for (j1 = i3; j1--; ) {
                                                                            if (func0(data60[i3], data60[j1])) {
                                                                              validate20.errors = [{ instancePath: instancePath + "/standard/enabledLenses", schemaPath: "#/properties/standard/properties/enabledLenses/uniqueItems", keyword: "uniqueItems", params: { i: i3, j: j1 }, message: "must NOT have duplicate items (items ## " + j1 + " and " + i3 + " are identical)" }];
                                                                              return false;
                                                                              break outer1;
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  } else {
                                                                    validate20.errors = [{ instancePath: instancePath + "/standard/enabledLenses", schemaPath: "#/properties/standard/properties/enabledLenses/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                                    return false;
                                                                  }
                                                                }
                                                                var valid6 = _errs127 === errors;
                                                              } else {
                                                                var valid6 = true;
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                } else {
                  validate20.errors = [{ instancePath: instancePath + "/standard", schemaPath: "#/properties/standard/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                  return false;
                }
              }
              var valid0 = _errs66 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.deep !== void 0) {
                let data62 = data.deep;
                const _errs130 = errors;
                if (errors === _errs130) {
                  if (data62 && typeof data62 == "object" && !Array.isArray(data62)) {
                    let missing7;
                    if (data62.componentBudget === void 0 && (missing7 = "componentBudget") || data62.boundaryBudget === void 0 && (missing7 = "boundaryBudget") || data62.maxPrimaryJobs === void 0 && (missing7 = "maxPrimaryJobs") || data62.maxContextExpansionJobs === void 0 && (missing7 = "maxContextExpansionJobs") || data62.maxVerificationJobs === void 0 && (missing7 = "maxVerificationJobs") || data62.maxInputTokensPerJob === void 0 && (missing7 = "maxInputTokensPerJob") || data62.maxContextTokensPerJob === void 0 && (missing7 = "maxContextTokensPerJob") || data62.maxPromptBytesPerJob === void 0 && (missing7 = "maxPromptBytesPerJob") || data62.maxInitialInputTokens === void 0 && (missing7 = "maxInitialInputTokens") || data62.maxContextExpansionInputTokens === void 0 && (missing7 = "maxContextExpansionInputTokens") || data62.maxVerificationInputTokens === void 0 && (missing7 = "maxVerificationInputTokens") || data62.maxTotalInputTokens === void 0 && (missing7 = "maxTotalInputTokens") || data62.maxEstimatedCostUsd === void 0 && (missing7 = "maxEstimatedCostUsd") || data62.maxWallTimeSeconds === void 0 && (missing7 = "maxWallTimeSeconds") || data62.estimatedSecondsPerJob === void 0 && (missing7 = "estimatedSecondsPerJob") || data62.inputUsdPerMillionTokens === void 0 && (missing7 = "inputUsdPerMillionTokens") || data62.outputUsdPerMillionTokens === void 0 && (missing7 = "outputUsdPerMillionTokens") || data62.concurrency === void 0 && (missing7 = "concurrency") || data62.maxRetries === void 0 && (missing7 = "maxRetries") || data62.maxRetryAttemptsPerPhase === void 0 && (missing7 = "maxRetryAttemptsPerPhase") || data62.enabledLenses === void 0 && (missing7 = "enabledLenses")) {
                      validate20.errors = [{ instancePath: instancePath + "/deep", schemaPath: "#/properties/deep/required", keyword: "required", params: { missingProperty: missing7 }, message: "must have required property '" + missing7 + "'" }];
                      return false;
                    } else {
                      const _errs132 = errors;
                      for (const key7 in data62) {
                        if (!func1.call(schema31.properties.deep.properties, key7)) {
                          validate20.errors = [{ instancePath: instancePath + "/deep", schemaPath: "#/properties/deep/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" }];
                          return false;
                          break;
                        }
                      }
                      if (_errs132 === errors) {
                        if (data62.componentBudget !== void 0) {
                          let data63 = data62.componentBudget;
                          const _errs133 = errors;
                          if (errors === _errs133) {
                            if (data63 && typeof data63 == "object" && !Array.isArray(data63)) {
                              let missing8;
                              if (data63.maxFiles === void 0 && (missing8 = "maxFiles") || data63.maxBytes === void 0 && (missing8 = "maxBytes") || data63.maxTokens === void 0 && (missing8 = "maxTokens")) {
                                validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget", schemaPath: "#/properties/deep/properties/componentBudget/required", keyword: "required", params: { missingProperty: missing8 }, message: "must have required property '" + missing8 + "'" }];
                                return false;
                              } else {
                                const _errs135 = errors;
                                for (const key8 in data63) {
                                  if (!(key8 === "maxFiles" || key8 === "maxBytes" || key8 === "maxTokens")) {
                                    validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget", schemaPath: "#/properties/deep/properties/componentBudget/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" }];
                                    return false;
                                    break;
                                  }
                                }
                                if (_errs135 === errors) {
                                  if (data63.maxFiles !== void 0) {
                                    let data64 = data63.maxFiles;
                                    const _errs136 = errors;
                                    if (!(typeof data64 == "number" && (!(data64 % 1) && !isNaN(data64)) && isFinite(data64))) {
                                      validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxFiles", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxFiles/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs136) {
                                      if (typeof data64 == "number" && isFinite(data64)) {
                                        if (data64 > 1e4 || isNaN(data64)) {
                                          validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxFiles", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxFiles/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                          return false;
                                        } else {
                                          if (data64 < 1 || isNaN(data64)) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxFiles", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxFiles/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid12 = _errs136 === errors;
                                  } else {
                                    var valid12 = true;
                                  }
                                  if (valid12) {
                                    if (data63.maxBytes !== void 0) {
                                      let data65 = data63.maxBytes;
                                      const _errs138 = errors;
                                      if (!(typeof data65 == "number" && (!(data65 % 1) && !isNaN(data65)) && isFinite(data65))) {
                                        validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxBytes", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs138) {
                                        if (typeof data65 == "number" && isFinite(data65)) {
                                          if (data65 > 1e8 || isNaN(data65)) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxBytes", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxBytes/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                            return false;
                                          } else {
                                            if (data65 < 1 || isNaN(data65)) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxBytes", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid12 = _errs138 === errors;
                                    } else {
                                      var valid12 = true;
                                    }
                                    if (valid12) {
                                      if (data63.maxTokens !== void 0) {
                                        let data66 = data63.maxTokens;
                                        const _errs140 = errors;
                                        if (!(typeof data66 == "number" && (!(data66 % 1) && !isNaN(data66)) && isFinite(data66))) {
                                          validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxTokens", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs140) {
                                          if (typeof data66 == "number" && isFinite(data66)) {
                                            if (data66 > 1e8 || isNaN(data66)) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxTokens", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                              return false;
                                            } else {
                                              if (data66 < 1 || isNaN(data66)) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget/maxTokens", schemaPath: "#/properties/deep/properties/componentBudget/properties/maxTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid12 = _errs140 === errors;
                                      } else {
                                        var valid12 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            } else {
                              validate20.errors = [{ instancePath: instancePath + "/deep/componentBudget", schemaPath: "#/properties/deep/properties/componentBudget/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                              return false;
                            }
                          }
                          var valid11 = _errs133 === errors;
                        } else {
                          var valid11 = true;
                        }
                        if (valid11) {
                          if (data62.boundaryBudget !== void 0) {
                            let data67 = data62.boundaryBudget;
                            const _errs142 = errors;
                            if (errors === _errs142) {
                              if (data67 && typeof data67 == "object" && !Array.isArray(data67)) {
                                let missing9;
                                if (data67.maxFiles === void 0 && (missing9 = "maxFiles") || data67.maxBytes === void 0 && (missing9 = "maxBytes") || data67.maxTokens === void 0 && (missing9 = "maxTokens") || data67.maxRelations === void 0 && (missing9 = "maxRelations") || data67.maxSlices === void 0 && (missing9 = "maxSlices")) {
                                  validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget", schemaPath: "#/properties/deep/properties/boundaryBudget/required", keyword: "required", params: { missingProperty: missing9 }, message: "must have required property '" + missing9 + "'" }];
                                  return false;
                                } else {
                                  const _errs144 = errors;
                                  for (const key9 in data67) {
                                    if (!(key9 === "maxFiles" || key9 === "maxBytes" || key9 === "maxTokens" || key9 === "maxRelations" || key9 === "maxSlices")) {
                                      validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget", schemaPath: "#/properties/deep/properties/boundaryBudget/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" }];
                                      return false;
                                      break;
                                    }
                                  }
                                  if (_errs144 === errors) {
                                    if (data67.maxFiles !== void 0) {
                                      let data68 = data67.maxFiles;
                                      const _errs145 = errors;
                                      if (!(typeof data68 == "number" && (!(data68 % 1) && !isNaN(data68)) && isFinite(data68))) {
                                        validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxFiles", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxFiles/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs145) {
                                        if (typeof data68 == "number" && isFinite(data68)) {
                                          if (data68 > 1e4 || isNaN(data68)) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxFiles", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxFiles/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                            return false;
                                          } else {
                                            if (data68 < 1 || isNaN(data68)) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxFiles", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxFiles/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid13 = _errs145 === errors;
                                    } else {
                                      var valid13 = true;
                                    }
                                    if (valid13) {
                                      if (data67.maxBytes !== void 0) {
                                        let data69 = data67.maxBytes;
                                        const _errs147 = errors;
                                        if (!(typeof data69 == "number" && (!(data69 % 1) && !isNaN(data69)) && isFinite(data69))) {
                                          validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxBytes", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs147) {
                                          if (typeof data69 == "number" && isFinite(data69)) {
                                            if (data69 > 1e8 || isNaN(data69)) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxBytes", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxBytes/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                              return false;
                                            } else {
                                              if (data69 < 1 || isNaN(data69)) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxBytes", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid13 = _errs147 === errors;
                                      } else {
                                        var valid13 = true;
                                      }
                                      if (valid13) {
                                        if (data67.maxTokens !== void 0) {
                                          let data70 = data67.maxTokens;
                                          const _errs149 = errors;
                                          if (!(typeof data70 == "number" && (!(data70 % 1) && !isNaN(data70)) && isFinite(data70))) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxTokens", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                            return false;
                                          }
                                          if (errors === _errs149) {
                                            if (typeof data70 == "number" && isFinite(data70)) {
                                              if (data70 > 1e8 || isNaN(data70)) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxTokens", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                                return false;
                                              } else {
                                                if (data70 < 1 || isNaN(data70)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxTokens", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                  return false;
                                                }
                                              }
                                            }
                                          }
                                          var valid13 = _errs149 === errors;
                                        } else {
                                          var valid13 = true;
                                        }
                                        if (valid13) {
                                          if (data67.maxRelations !== void 0) {
                                            let data71 = data67.maxRelations;
                                            const _errs151 = errors;
                                            if (!(typeof data71 == "number" && (!(data71 % 1) && !isNaN(data71)) && isFinite(data71))) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxRelations", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxRelations/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                              return false;
                                            }
                                            if (errors === _errs151) {
                                              if (typeof data71 == "number" && isFinite(data71)) {
                                                if (data71 > 1e5 || isNaN(data71)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxRelations", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxRelations/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e5 }, message: "must be <= 100000" }];
                                                  return false;
                                                } else {
                                                  if (data71 < 1 || isNaN(data71)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxRelations", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxRelations/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                    return false;
                                                  }
                                                }
                                              }
                                            }
                                            var valid13 = _errs151 === errors;
                                          } else {
                                            var valid13 = true;
                                          }
                                          if (valid13) {
                                            if (data67.maxSlices !== void 0) {
                                              let data72 = data67.maxSlices;
                                              const _errs153 = errors;
                                              if (!(typeof data72 == "number" && (!(data72 % 1) && !isNaN(data72)) && isFinite(data72))) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxSlices", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxSlices/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                return false;
                                              }
                                              if (errors === _errs153) {
                                                if (typeof data72 == "number" && isFinite(data72)) {
                                                  if (data72 > 1e4 || isNaN(data72)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxSlices", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxSlices/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                    return false;
                                                  } else {
                                                    if (data72 < 1 || isNaN(data72)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget/maxSlices", schemaPath: "#/properties/deep/properties/boundaryBudget/properties/maxSlices/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                      return false;
                                                    }
                                                  }
                                                }
                                              }
                                              var valid13 = _errs153 === errors;
                                            } else {
                                              var valid13 = true;
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              } else {
                                validate20.errors = [{ instancePath: instancePath + "/deep/boundaryBudget", schemaPath: "#/properties/deep/properties/boundaryBudget/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                                return false;
                              }
                            }
                            var valid11 = _errs142 === errors;
                          } else {
                            var valid11 = true;
                          }
                          if (valid11) {
                            if (data62.maxPrimaryJobs !== void 0) {
                              let data73 = data62.maxPrimaryJobs;
                              const _errs155 = errors;
                              if (!(typeof data73 == "number" && (!(data73 % 1) && !isNaN(data73)) && isFinite(data73))) {
                                validate20.errors = [{ instancePath: instancePath + "/deep/maxPrimaryJobs", schemaPath: "#/properties/deep/properties/maxPrimaryJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                return false;
                              }
                              if (errors === _errs155) {
                                if (typeof data73 == "number" && isFinite(data73)) {
                                  if (data73 > 1e4 || isNaN(data73)) {
                                    validate20.errors = [{ instancePath: instancePath + "/deep/maxPrimaryJobs", schemaPath: "#/properties/deep/properties/maxPrimaryJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                    return false;
                                  } else {
                                    if (data73 < 1 || isNaN(data73)) {
                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxPrimaryJobs", schemaPath: "#/properties/deep/properties/maxPrimaryJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                      return false;
                                    }
                                  }
                                }
                              }
                              var valid11 = _errs155 === errors;
                            } else {
                              var valid11 = true;
                            }
                            if (valid11) {
                              if (data62.maxContextExpansionJobs !== void 0) {
                                let data74 = data62.maxContextExpansionJobs;
                                const _errs157 = errors;
                                if (!(typeof data74 == "number" && (!(data74 % 1) && !isNaN(data74)) && isFinite(data74))) {
                                  validate20.errors = [{ instancePath: instancePath + "/deep/maxContextExpansionJobs", schemaPath: "#/properties/deep/properties/maxContextExpansionJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                  return false;
                                }
                                if (errors === _errs157) {
                                  if (typeof data74 == "number" && isFinite(data74)) {
                                    if (data74 > 1e4 || isNaN(data74)) {
                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxContextExpansionJobs", schemaPath: "#/properties/deep/properties/maxContextExpansionJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                      return false;
                                    } else {
                                      if (data74 < 1 || isNaN(data74)) {
                                        validate20.errors = [{ instancePath: instancePath + "/deep/maxContextExpansionJobs", schemaPath: "#/properties/deep/properties/maxContextExpansionJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                        return false;
                                      }
                                    }
                                  }
                                }
                                var valid11 = _errs157 === errors;
                              } else {
                                var valid11 = true;
                              }
                              if (valid11) {
                                if (data62.maxVerificationJobs !== void 0) {
                                  let data75 = data62.maxVerificationJobs;
                                  const _errs159 = errors;
                                  if (!(typeof data75 == "number" && (!(data75 % 1) && !isNaN(data75)) && isFinite(data75))) {
                                    validate20.errors = [{ instancePath: instancePath + "/deep/maxVerificationJobs", schemaPath: "#/properties/deep/properties/maxVerificationJobs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                    return false;
                                  }
                                  if (errors === _errs159) {
                                    if (typeof data75 == "number" && isFinite(data75)) {
                                      if (data75 > 1e4 || isNaN(data75)) {
                                        validate20.errors = [{ instancePath: instancePath + "/deep/maxVerificationJobs", schemaPath: "#/properties/deep/properties/maxVerificationJobs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                        return false;
                                      } else {
                                        if (data75 < 1 || isNaN(data75)) {
                                          validate20.errors = [{ instancePath: instancePath + "/deep/maxVerificationJobs", schemaPath: "#/properties/deep/properties/maxVerificationJobs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    }
                                  }
                                  var valid11 = _errs159 === errors;
                                } else {
                                  var valid11 = true;
                                }
                                if (valid11) {
                                  if (data62.maxInputTokensPerJob !== void 0) {
                                    let data76 = data62.maxInputTokensPerJob;
                                    const _errs161 = errors;
                                    if (!(typeof data76 == "number" && (!(data76 % 1) && !isNaN(data76)) && isFinite(data76))) {
                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxInputTokensPerJob", schemaPath: "#/properties/deep/properties/maxInputTokensPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                      return false;
                                    }
                                    if (errors === _errs161) {
                                      if (typeof data76 == "number" && isFinite(data76)) {
                                        if (data76 > 1e8 || isNaN(data76)) {
                                          validate20.errors = [{ instancePath: instancePath + "/deep/maxInputTokensPerJob", schemaPath: "#/properties/deep/properties/maxInputTokensPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                          return false;
                                        } else {
                                          if (data76 < 1 || isNaN(data76)) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/maxInputTokensPerJob", schemaPath: "#/properties/deep/properties/maxInputTokensPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      }
                                    }
                                    var valid11 = _errs161 === errors;
                                  } else {
                                    var valid11 = true;
                                  }
                                  if (valid11) {
                                    if (data62.maxContextTokensPerJob !== void 0) {
                                      let data77 = data62.maxContextTokensPerJob;
                                      const _errs163 = errors;
                                      if (!(typeof data77 == "number" && (!(data77 % 1) && !isNaN(data77)) && isFinite(data77))) {
                                        validate20.errors = [{ instancePath: instancePath + "/deep/maxContextTokensPerJob", schemaPath: "#/properties/deep/properties/maxContextTokensPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs163) {
                                        if (typeof data77 == "number" && isFinite(data77)) {
                                          if (data77 > 1e8 || isNaN(data77)) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/maxContextTokensPerJob", schemaPath: "#/properties/deep/properties/maxContextTokensPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                            return false;
                                          } else {
                                            if (data77 < 1 || isNaN(data77)) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/maxContextTokensPerJob", schemaPath: "#/properties/deep/properties/maxContextTokensPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid11 = _errs163 === errors;
                                    } else {
                                      var valid11 = true;
                                    }
                                    if (valid11) {
                                      if (data62.maxPromptBytesPerJob !== void 0) {
                                        let data78 = data62.maxPromptBytesPerJob;
                                        const _errs165 = errors;
                                        if (!(typeof data78 == "number" && (!(data78 % 1) && !isNaN(data78)) && isFinite(data78))) {
                                          validate20.errors = [{ instancePath: instancePath + "/deep/maxPromptBytesPerJob", schemaPath: "#/properties/deep/properties/maxPromptBytesPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                          return false;
                                        }
                                        if (errors === _errs165) {
                                          if (typeof data78 == "number" && isFinite(data78)) {
                                            if (data78 > 1e8 || isNaN(data78)) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/maxPromptBytesPerJob", schemaPath: "#/properties/deep/properties/maxPromptBytesPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e8 }, message: "must be <= 100000000" }];
                                              return false;
                                            } else {
                                              if (data78 < 1 || isNaN(data78)) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/maxPromptBytesPerJob", schemaPath: "#/properties/deep/properties/maxPromptBytesPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                return false;
                                              }
                                            }
                                          }
                                        }
                                        var valid11 = _errs165 === errors;
                                      } else {
                                        var valid11 = true;
                                      }
                                      if (valid11) {
                                        if (data62.maxInitialInputTokens !== void 0) {
                                          let data79 = data62.maxInitialInputTokens;
                                          const _errs167 = errors;
                                          if (!(typeof data79 == "number" && (!(data79 % 1) && !isNaN(data79)) && isFinite(data79))) {
                                            validate20.errors = [{ instancePath: instancePath + "/deep/maxInitialInputTokens", schemaPath: "#/properties/deep/properties/maxInitialInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                            return false;
                                          }
                                          if (errors === _errs167) {
                                            if (typeof data79 == "number" && isFinite(data79)) {
                                              if (data79 > 1e9 || isNaN(data79)) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/maxInitialInputTokens", schemaPath: "#/properties/deep/properties/maxInitialInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                return false;
                                              } else {
                                                if (data79 < 1 || isNaN(data79)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/deep/maxInitialInputTokens", schemaPath: "#/properties/deep/properties/maxInitialInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                  return false;
                                                }
                                              }
                                            }
                                          }
                                          var valid11 = _errs167 === errors;
                                        } else {
                                          var valid11 = true;
                                        }
                                        if (valid11) {
                                          if (data62.maxContextExpansionInputTokens !== void 0) {
                                            let data80 = data62.maxContextExpansionInputTokens;
                                            const _errs169 = errors;
                                            if (!(typeof data80 == "number" && (!(data80 % 1) && !isNaN(data80)) && isFinite(data80))) {
                                              validate20.errors = [{ instancePath: instancePath + "/deep/maxContextExpansionInputTokens", schemaPath: "#/properties/deep/properties/maxContextExpansionInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                              return false;
                                            }
                                            if (errors === _errs169) {
                                              if (typeof data80 == "number" && isFinite(data80)) {
                                                if (data80 > 1e9 || isNaN(data80)) {
                                                  validate20.errors = [{ instancePath: instancePath + "/deep/maxContextExpansionInputTokens", schemaPath: "#/properties/deep/properties/maxContextExpansionInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                  return false;
                                                } else {
                                                  if (data80 < 1 || isNaN(data80)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/deep/maxContextExpansionInputTokens", schemaPath: "#/properties/deep/properties/maxContextExpansionInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                    return false;
                                                  }
                                                }
                                              }
                                            }
                                            var valid11 = _errs169 === errors;
                                          } else {
                                            var valid11 = true;
                                          }
                                          if (valid11) {
                                            if (data62.maxVerificationInputTokens !== void 0) {
                                              let data81 = data62.maxVerificationInputTokens;
                                              const _errs171 = errors;
                                              if (!(typeof data81 == "number" && (!(data81 % 1) && !isNaN(data81)) && isFinite(data81))) {
                                                validate20.errors = [{ instancePath: instancePath + "/deep/maxVerificationInputTokens", schemaPath: "#/properties/deep/properties/maxVerificationInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                return false;
                                              }
                                              if (errors === _errs171) {
                                                if (typeof data81 == "number" && isFinite(data81)) {
                                                  if (data81 > 1e9 || isNaN(data81)) {
                                                    validate20.errors = [{ instancePath: instancePath + "/deep/maxVerificationInputTokens", schemaPath: "#/properties/deep/properties/maxVerificationInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                    return false;
                                                  } else {
                                                    if (data81 < 1 || isNaN(data81)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxVerificationInputTokens", schemaPath: "#/properties/deep/properties/maxVerificationInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                      return false;
                                                    }
                                                  }
                                                }
                                              }
                                              var valid11 = _errs171 === errors;
                                            } else {
                                              var valid11 = true;
                                            }
                                            if (valid11) {
                                              if (data62.maxTotalInputTokens !== void 0) {
                                                let data82 = data62.maxTotalInputTokens;
                                                const _errs173 = errors;
                                                if (!(typeof data82 == "number" && (!(data82 % 1) && !isNaN(data82)) && isFinite(data82))) {
                                                  validate20.errors = [{ instancePath: instancePath + "/deep/maxTotalInputTokens", schemaPath: "#/properties/deep/properties/maxTotalInputTokens/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                  return false;
                                                }
                                                if (errors === _errs173) {
                                                  if (typeof data82 == "number" && isFinite(data82)) {
                                                    if (data82 > 1e9 || isNaN(data82)) {
                                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxTotalInputTokens", schemaPath: "#/properties/deep/properties/maxTotalInputTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" }];
                                                      return false;
                                                    } else {
                                                      if (data82 < 1 || isNaN(data82)) {
                                                        validate20.errors = [{ instancePath: instancePath + "/deep/maxTotalInputTokens", schemaPath: "#/properties/deep/properties/maxTotalInputTokens/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                        return false;
                                                      }
                                                    }
                                                  }
                                                }
                                                var valid11 = _errs173 === errors;
                                              } else {
                                                var valid11 = true;
                                              }
                                              if (valid11) {
                                                if (data62.maxEstimatedCostUsd !== void 0) {
                                                  let data83 = data62.maxEstimatedCostUsd;
                                                  const _errs175 = errors;
                                                  if (errors === _errs175) {
                                                    if (typeof data83 == "number" && isFinite(data83)) {
                                                      if (data83 > 1e6 || isNaN(data83)) {
                                                        validate20.errors = [{ instancePath: instancePath + "/deep/maxEstimatedCostUsd", schemaPath: "#/properties/deep/properties/maxEstimatedCostUsd/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                                                        return false;
                                                      } else {
                                                        if (data83 <= 0 || isNaN(data83)) {
                                                          validate20.errors = [{ instancePath: instancePath + "/deep/maxEstimatedCostUsd", schemaPath: "#/properties/deep/properties/maxEstimatedCostUsd/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                          return false;
                                                        }
                                                      }
                                                    } else {
                                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxEstimatedCostUsd", schemaPath: "#/properties/deep/properties/maxEstimatedCostUsd/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                      return false;
                                                    }
                                                  }
                                                  var valid11 = _errs175 === errors;
                                                } else {
                                                  var valid11 = true;
                                                }
                                                if (valid11) {
                                                  if (data62.maxWallTimeSeconds !== void 0) {
                                                    let data84 = data62.maxWallTimeSeconds;
                                                    const _errs177 = errors;
                                                    if (!(typeof data84 == "number" && (!(data84 % 1) && !isNaN(data84)) && isFinite(data84))) {
                                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxWallTimeSeconds", schemaPath: "#/properties/deep/properties/maxWallTimeSeconds/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                      return false;
                                                    }
                                                    if (errors === _errs177) {
                                                      if (typeof data84 == "number" && isFinite(data84)) {
                                                        if (data84 > 604800 || isNaN(data84)) {
                                                          validate20.errors = [{ instancePath: instancePath + "/deep/maxWallTimeSeconds", schemaPath: "#/properties/deep/properties/maxWallTimeSeconds/maximum", keyword: "maximum", params: { comparison: "<=", limit: 604800 }, message: "must be <= 604800" }];
                                                          return false;
                                                        } else {
                                                          if (data84 < 1 || isNaN(data84)) {
                                                            validate20.errors = [{ instancePath: instancePath + "/deep/maxWallTimeSeconds", schemaPath: "#/properties/deep/properties/maxWallTimeSeconds/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                            return false;
                                                          }
                                                        }
                                                      }
                                                    }
                                                    var valid11 = _errs177 === errors;
                                                  } else {
                                                    var valid11 = true;
                                                  }
                                                  if (valid11) {
                                                    if (data62.estimatedSecondsPerJob !== void 0) {
                                                      let data85 = data62.estimatedSecondsPerJob;
                                                      const _errs179 = errors;
                                                      if (!(typeof data85 == "number" && (!(data85 % 1) && !isNaN(data85)) && isFinite(data85))) {
                                                        validate20.errors = [{ instancePath: instancePath + "/deep/estimatedSecondsPerJob", schemaPath: "#/properties/deep/properties/estimatedSecondsPerJob/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                        return false;
                                                      }
                                                      if (errors === _errs179) {
                                                        if (typeof data85 == "number" && isFinite(data85)) {
                                                          if (data85 > 86400 || isNaN(data85)) {
                                                            validate20.errors = [{ instancePath: instancePath + "/deep/estimatedSecondsPerJob", schemaPath: "#/properties/deep/properties/estimatedSecondsPerJob/maximum", keyword: "maximum", params: { comparison: "<=", limit: 86400 }, message: "must be <= 86400" }];
                                                            return false;
                                                          } else {
                                                            if (data85 < 1 || isNaN(data85)) {
                                                              validate20.errors = [{ instancePath: instancePath + "/deep/estimatedSecondsPerJob", schemaPath: "#/properties/deep/properties/estimatedSecondsPerJob/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                              return false;
                                                            }
                                                          }
                                                        }
                                                      }
                                                      var valid11 = _errs179 === errors;
                                                    } else {
                                                      var valid11 = true;
                                                    }
                                                    if (valid11) {
                                                      if (data62.inputUsdPerMillionTokens !== void 0) {
                                                        let data86 = data62.inputUsdPerMillionTokens;
                                                        const _errs181 = errors;
                                                        if (errors === _errs181) {
                                                          if (typeof data86 == "number" && isFinite(data86)) {
                                                            if (data86 > 1e4 || isNaN(data86)) {
                                                              validate20.errors = [{ instancePath: instancePath + "/deep/inputUsdPerMillionTokens", schemaPath: "#/properties/deep/properties/inputUsdPerMillionTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                              return false;
                                                            } else {
                                                              if (data86 <= 0 || isNaN(data86)) {
                                                                validate20.errors = [{ instancePath: instancePath + "/deep/inputUsdPerMillionTokens", schemaPath: "#/properties/deep/properties/inputUsdPerMillionTokens/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                                return false;
                                                              }
                                                            }
                                                          } else {
                                                            validate20.errors = [{ instancePath: instancePath + "/deep/inputUsdPerMillionTokens", schemaPath: "#/properties/deep/properties/inputUsdPerMillionTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                            return false;
                                                          }
                                                        }
                                                        var valid11 = _errs181 === errors;
                                                      } else {
                                                        var valid11 = true;
                                                      }
                                                      if (valid11) {
                                                        if (data62.outputUsdPerMillionTokens !== void 0) {
                                                          let data87 = data62.outputUsdPerMillionTokens;
                                                          const _errs183 = errors;
                                                          if (errors === _errs183) {
                                                            if (typeof data87 == "number" && isFinite(data87)) {
                                                              if (data87 > 1e4 || isNaN(data87)) {
                                                                validate20.errors = [{ instancePath: instancePath + "/deep/outputUsdPerMillionTokens", schemaPath: "#/properties/deep/properties/outputUsdPerMillionTokens/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                                return false;
                                                              } else {
                                                                if (data87 <= 0 || isNaN(data87)) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/deep/outputUsdPerMillionTokens", schemaPath: "#/properties/deep/properties/outputUsdPerMillionTokens/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                                                  return false;
                                                                }
                                                              }
                                                            } else {
                                                              validate20.errors = [{ instancePath: instancePath + "/deep/outputUsdPerMillionTokens", schemaPath: "#/properties/deep/properties/outputUsdPerMillionTokens/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                              return false;
                                                            }
                                                          }
                                                          var valid11 = _errs183 === errors;
                                                        } else {
                                                          var valid11 = true;
                                                        }
                                                        if (valid11) {
                                                          if (data62.concurrency !== void 0) {
                                                            let data88 = data62.concurrency;
                                                            const _errs185 = errors;
                                                            if (!(typeof data88 == "number" && (!(data88 % 1) && !isNaN(data88)) && isFinite(data88))) {
                                                              validate20.errors = [{ instancePath: instancePath + "/deep/concurrency", schemaPath: "#/properties/deep/properties/concurrency/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                              return false;
                                                            }
                                                            if (errors === _errs185) {
                                                              if (typeof data88 == "number" && isFinite(data88)) {
                                                                if (data88 > 32 || isNaN(data88)) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/deep/concurrency", schemaPath: "#/properties/deep/properties/concurrency/maximum", keyword: "maximum", params: { comparison: "<=", limit: 32 }, message: "must be <= 32" }];
                                                                  return false;
                                                                } else {
                                                                  if (data88 < 1 || isNaN(data88)) {
                                                                    validate20.errors = [{ instancePath: instancePath + "/deep/concurrency", schemaPath: "#/properties/deep/properties/concurrency/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                                                    return false;
                                                                  }
                                                                }
                                                              }
                                                            }
                                                            var valid11 = _errs185 === errors;
                                                          } else {
                                                            var valid11 = true;
                                                          }
                                                          if (valid11) {
                                                            if (data62.maxRetries !== void 0) {
                                                              let data89 = data62.maxRetries;
                                                              const _errs187 = errors;
                                                              if (!(typeof data89 == "number" && (!(data89 % 1) && !isNaN(data89)) && isFinite(data89))) {
                                                                validate20.errors = [{ instancePath: instancePath + "/deep/maxRetries", schemaPath: "#/properties/deep/properties/maxRetries/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                                return false;
                                                              }
                                                              if (errors === _errs187) {
                                                                if (typeof data89 == "number" && isFinite(data89)) {
                                                                  if (data89 > 10 || isNaN(data89)) {
                                                                    validate20.errors = [{ instancePath: instancePath + "/deep/maxRetries", schemaPath: "#/properties/deep/properties/maxRetries/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" }];
                                                                    return false;
                                                                  } else {
                                                                    if (data89 < 0 || isNaN(data89)) {
                                                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxRetries", schemaPath: "#/properties/deep/properties/maxRetries/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                                      return false;
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                              var valid11 = _errs187 === errors;
                                                            } else {
                                                              var valid11 = true;
                                                            }
                                                            if (valid11) {
                                                              if (data62.maxRetryAttemptsPerPhase !== void 0) {
                                                                let data90 = data62.maxRetryAttemptsPerPhase;
                                                                const _errs189 = errors;
                                                                if (!(typeof data90 == "number" && (!(data90 % 1) && !isNaN(data90)) && isFinite(data90))) {
                                                                  validate20.errors = [{ instancePath: instancePath + "/deep/maxRetryAttemptsPerPhase", schemaPath: "#/properties/deep/properties/maxRetryAttemptsPerPhase/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                                                  return false;
                                                                }
                                                                if (errors === _errs189) {
                                                                  if (typeof data90 == "number" && isFinite(data90)) {
                                                                    if (data90 > 1e4 || isNaN(data90)) {
                                                                      validate20.errors = [{ instancePath: instancePath + "/deep/maxRetryAttemptsPerPhase", schemaPath: "#/properties/deep/properties/maxRetryAttemptsPerPhase/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" }];
                                                                      return false;
                                                                    } else {
                                                                      if (data90 < 0 || isNaN(data90)) {
                                                                        validate20.errors = [{ instancePath: instancePath + "/deep/maxRetryAttemptsPerPhase", schemaPath: "#/properties/deep/properties/maxRetryAttemptsPerPhase/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                                        return false;
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                                var valid11 = _errs189 === errors;
                                                              } else {
                                                                var valid11 = true;
                                                              }
                                                              if (valid11) {
                                                                if (data62.enabledLenses !== void 0) {
                                                                  let data91 = data62.enabledLenses;
                                                                  const _errs191 = errors;
                                                                  if (errors === _errs191) {
                                                                    if (Array.isArray(data91)) {
                                                                      var valid14 = true;
                                                                      const len2 = data91.length;
                                                                      for (let i4 = 0; i4 < len2; i4++) {
                                                                        let data92 = data91[i4];
                                                                        const _errs193 = errors;
                                                                        if (!(data92 === "architecture" || data92 === "contracts" || data92 === "security" || data92 === "lifecycle" || data92 === "resilience" || data92 === "deployment" || data92 === "simplification")) {
                                                                          validate20.errors = [{ instancePath: instancePath + "/deep/enabledLenses/" + i4, schemaPath: "#/properties/deep/properties/enabledLenses/items/enum", keyword: "enum", params: { allowedValues: schema31.properties.deep.properties.enabledLenses.items.enum }, message: "must be equal to one of the allowed values" }];
                                                                          return false;
                                                                        }
                                                                        var valid14 = _errs193 === errors;
                                                                        if (!valid14) {
                                                                          break;
                                                                        }
                                                                      }
                                                                      if (valid14) {
                                                                        let i5 = data91.length;
                                                                        let j2;
                                                                        if (i5 > 1) {
                                                                          outer2: for (; i5--; ) {
                                                                            for (j2 = i5; j2--; ) {
                                                                              if (func0(data91[i5], data91[j2])) {
                                                                                validate20.errors = [{ instancePath: instancePath + "/deep/enabledLenses", schemaPath: "#/properties/deep/properties/enabledLenses/uniqueItems", keyword: "uniqueItems", params: { i: i5, j: j2 }, message: "must NOT have duplicate items (items ## " + j2 + " and " + i5 + " are identical)" }];
                                                                                return false;
                                                                                break outer2;
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    } else {
                                                                      validate20.errors = [{ instancePath: instancePath + "/deep/enabledLenses", schemaPath: "#/properties/deep/properties/enabledLenses/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                                      return false;
                                                                    }
                                                                  }
                                                                  var valid11 = _errs191 === errors;
                                                                } else {
                                                                  var valid11 = true;
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  } else {
                    validate20.errors = [{ instancePath: instancePath + "/deep", schemaPath: "#/properties/deep/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                    return false;
                  }
                }
                var valid0 = _errs130 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate20.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
export {
  stdin_default as default,
  validate
};
