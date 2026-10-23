// Generated from canonical plugin-system v2 schema; do not edit.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ../../../../node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "../../../../node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;

  }
});

// <stdin>
var validateArtifactRefSchema = validate21;
var pattern4 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$", "u");
var pattern5 = new RegExp("^[a-z0-9]+(?:[._-][a-z0-9]+)+$", "u");
var pattern6 = new RegExp("^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$", "u");
var pattern7 = new RegExp("^sha256:[a-f0-9]{64}$", "u");
var func1 = require_ucs2length().default;
var pattern9 = new RegExp("^[a-z0-9]+(?:[._-][a-z0-9]+)*$", "u");
function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate22.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.runId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.stageId === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.attemptId === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "attemptId" }, message: "must have required property 'attemptId'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.attemptNumber === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "attemptNumber" }, message: "must have required property 'attemptNumber'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "runId" || key0 === "stageId" || key0 === "attemptId" || key0 === "attemptNumber")) {
        const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.runId !== void 0) {
      let data0 = data.runId;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err5 = { instancePath: instancePath + "/runId", schemaPath: "#/$defs/opaqueId/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$"' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = { instancePath: instancePath + "/runId", schemaPath: "#/$defs/opaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.stageId !== void 0) {
      let data1 = data.stageId;
      if (typeof data1 === "string") {
        if (func1(data1) > 96) {
          const err7 = { instancePath: instancePath + "/stageId", schemaPath: "#/$defs/localId/maxLength", keyword: "maxLength", params: { limit: 96 }, message: "must NOT have more than 96 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!pattern9.test(data1)) {
          const err8 = { instancePath: instancePath + "/stageId", schemaPath: "#/$defs/localId/pattern", keyword: "pattern", params: { pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$" }, message: 'must match pattern "^[a-z0-9]+(?:[._-][a-z0-9]+)*$"' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/stageId", schemaPath: "#/$defs/localId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.attemptId !== void 0) {
      let data2 = data.attemptId;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err10 = { instancePath: instancePath + "/attemptId", schemaPath: "#/$defs/opaqueId/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$"' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = { instancePath: instancePath + "/attemptId", schemaPath: "#/$defs/opaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.attemptNumber !== void 0) {
      let data3 = data.attemptNumber;
      if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
        const err12 = { instancePath: instancePath + "/attemptNumber", schemaPath: "#/properties/attemptNumber/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data3 == "number" && isFinite(data3)) {
        if (data3 < 1 || isNaN(data3)) {
          const err13 = { instancePath: instancePath + "/attemptNumber", schemaPath: "#/properties/attemptNumber/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
    }
  } else {
    const err14 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  validate22.errors = vErrors;
  return errors === 0;
}
validate22.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.artifactId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "artifactId" }, message: "must have required property 'artifactId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.namespace === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "namespace" }, message: "must have required property 'namespace'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.mediaType === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mediaType" }, message: "must have required property 'mediaType'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.digest === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "digest" }, message: "must have required property 'digest'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.sizeBytes === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sizeBytes" }, message: "must have required property 'sizeBytes'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.producer === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "producer" }, message: "must have required property 'producer'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "encoding" || key0 === "artifactId" || key0 === "namespace" || key0 === "mediaType" || key0 === "digest" || key0 === "sizeBytes" || key0 === "producer")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.encoding !== void 0) {
      if ("kubeclaw-json.utf16.v1" !== data.encoding) {
        const err7 = { instancePath: instancePath + "/encoding", schemaPath: "#/properties/encoding/const", keyword: "const", params: { allowedValue: "kubeclaw-json.utf16.v1" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.artifactId !== void 0) {
      let data1 = data.artifactId;
      if (typeof data1 === "string") {
        if (!pattern4.test(data1)) {
          const err8 = { instancePath: instancePath + "/artifactId", schemaPath: "#/$defs/opaqueId/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$" }, message: 'must match pattern "^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$"' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/artifactId", schemaPath: "#/$defs/opaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.namespace !== void 0) {
      let data2 = data.namespace;
      if (typeof data2 === "string") {
        if (func1(data2) > 160) {
          const err10 = { instancePath: instancePath + "/namespace", schemaPath: "#/$defs/namespacedId/maxLength", keyword: "maxLength", params: { limit: 160 }, message: "must NOT have more than 160 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (!pattern5.test(data2)) {
          const err11 = { instancePath: instancePath + "/namespace", schemaPath: "#/$defs/namespacedId/pattern", keyword: "pattern", params: { pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)+$" }, message: 'must match pattern "^[a-z0-9]+(?:[._-][a-z0-9]+)+$"' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = { instancePath: instancePath + "/namespace", schemaPath: "#/$defs/namespacedId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.mediaType !== void 0) {
      let data3 = data.mediaType;
      if (typeof data3 === "string") {
        if (!pattern6.test(data3)) {
          const err13 = { instancePath: instancePath + "/mediaType", schemaPath: "#/properties/mediaType/pattern", keyword: "pattern", params: { pattern: "^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$" }, message: 'must match pattern "^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$"' };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = { instancePath: instancePath + "/mediaType", schemaPath: "#/properties/mediaType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.digest !== void 0) {
      let data4 = data.digest;
      if (typeof data4 === "string") {
        if (!pattern7.test(data4)) {
          const err15 = { instancePath: instancePath + "/digest", schemaPath: "#/properties/digest/pattern", keyword: "pattern", params: { pattern: "^sha256:[a-f0-9]{64}$" }, message: 'must match pattern "^sha256:[a-f0-9]{64}$"' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = { instancePath: instancePath + "/digest", schemaPath: "#/properties/digest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.sizeBytes !== void 0) {
      let data5 = data.sizeBytes;
      if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
        const err17 = { instancePath: instancePath + "/sizeBytes", schemaPath: "#/properties/sizeBytes/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (typeof data5 == "number" && isFinite(data5)) {
        if (data5 < 0 || isNaN(data5)) {
          const err18 = { instancePath: instancePath + "/sizeBytes", schemaPath: "#/properties/sizeBytes/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
    }
    if (data.producer !== void 0) {
      if (!validate22(data.producer, { instancePath: instancePath + "/producer", parentData: data, parentDataProperty: "producer", rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err19 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err19];
    } else {
      vErrors.push(err19);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
export {
  validateArtifactRefSchema
};
