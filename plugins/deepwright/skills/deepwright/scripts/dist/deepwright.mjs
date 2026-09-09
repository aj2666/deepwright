#!/usr/bin/env node
import { createRequire as __deepwrightCreateRequire } from "node:module";
const require = __deepwrightCreateRequire(import.meta.url);

// discovery/cli.ts
import { readFile as readFile3, realpath as realpath4 } from "node:fs/promises";
import { join as join5 } from "node:path";

// config/config.ts
import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0) {
  let idx = str.indexOf("\n", start);
  if (str.charCodeAt(idx - 1) === 13)
    idx--;
  return idx;
}
function skipComment(ctx) {
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      throw new TomlError("control characters are not allowed in comments", {
        toml: ctx.s,
        ptr: ctx.p
      });
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (1) {
    while ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}
function skipUntil(ctx, sep4, end) {
  let ptr = ctx.p;
  if (!end) {
    ptr = indexOfNewline(ctx.s, ptr);
    ctx.p = ptr < 0 ? ctx.s.length : ptr;
    return;
  }
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 35) {
      skipComment(ctx);
    } else if (c === end || c === sep4) {
      return;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: ctx.s,
    ptr
  });
}

// node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
function parseString(ctx) {
  let start = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (; ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      throw new TomlError("control characters are not allowed in strings", {
        toml: ctx.s,
        ptr: ctx.p
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state)
        parsed += ctx.s.slice(sliceStart, ctx.p);
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0; j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p + 1);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: ctx.s, ptr: ctx.p + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: ctx.s, ptr: ctx.p });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p + 1;
        state = 0;
      } else if (c === 32 || c === 9) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "	";
        else if (c === 110)
          parsed += "\n";
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: ctx.s, ptr: ctx.p });
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: ctx.s,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  throw new TomlError("unfinished string", { toml: ctx.s, ptr: start });
}
function sliceAndTrimEndOf(ctx, start, end) {
  let value = ctx.s.slice(start, end);
  let commentIdx = value.indexOf("#");
  if (commentIdx > 0) {
    skipComment({ s: value, p: commentIdx, d: 0 });
    value = value.slice(0, commentIdx);
  }
  return value.trimEnd();
}
function parseValue(ctx, integersAsBigInt, end) {
  let ptr = ctx.p;
  let err = { toml: ctx.s, ptr };
  skipUntil(ctx, 44, end);
  let value = sliceAndTrimEndOf(ctx, ptr, ctx.p);
  if (!value)
    throw new TomlError("incomplete declaration: value expected", err);
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", err);
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", err);
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", err);
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid())
    throw new TomlError("invalid value", err);
  return date;
}

// node_modules/smol-toml/dist/extract.js
function extractValue(ctx, end, integersAsBigInt) {
  let ptr = ctx.p;
  let c = ctx.s.charCodeAt(ptr);
  if (c === 91 || c === 123) {
    if (!ctx.d--) {
      throw new TomlError("document contains excessively nested structures. aborting.", {
        toml: ctx.s,
        ptr
      });
    }
    let value = c === 91 ? parseArray(ctx, integersAsBigInt) : parseInlineTable(ctx, integersAsBigInt);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      throw new TomlError("invalid value", { toml: ctx.s, ptr });
    ctx.p++;
    return true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      throw new TomlError("invalid value", { toml: ctx.s, ptr });
    ctx.p++;
    return false;
  }
  return parseValue(ctx, integersAsBigInt, end);
}

// node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(ctx, end = "=") {
  let start = ctx.p;
  let dot = start - 1;
  let parsed = [];
  let endPtr = ctx.s.indexOf(end, start);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: ctx.s,
      ptr: start
    });
  }
  do {
    let c = ctx.s.charCodeAt(ctx.p = ++dot);
    if (c !== 32 && c !== 9) {
      if (c === 34 || c === 39) {
        if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2)) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        let part = parseString(ctx);
        dot = ctx.s.indexOf(".", ctx.p);
        let strEnd = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: ctx.s,
            ptr: newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        if (endPtr < ctx.p) {
          endPtr = ctx.s.indexOf(end, ctx.p);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: ctx.s,
              ptr: start
            });
          }
        }
        parsed.push(part);
      } else {
        dot = ctx.s.indexOf(".", ctx.p);
        let part = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  ctx.p = endPtr + 1;
  skipVoid(ctx, true, true);
  return parsed;
}
function parseInlineTable(ctx, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ctx.p++;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let p = ctx.p;
    let key = parseKey(ctx);
    for (let i = 0; i < key.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = {};
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: ctx.s,
          ptr: p
        });
      }
      if (!hasOwn && k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      throw new TomlError("trying to redefine an already defined value", {
        toml: ctx.s,
        ptr: ctx.p
      });
    }
    let value = extractValue(ctx, 125, integersAsBigInt);
    seen.add(t[k] = value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44) {
      throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
    }
  }
  throw new TomlError("unfinished table encountered", {
    toml: ctx.s,
    ptr: ctx.p
  });
}
function parseArray(ctx, integersAsBigInt) {
  let res = [];
  let c;
  ctx.p++;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(ctx, 93, integersAsBigInt));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44) {
      throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
    }
  }
  throw new TomlError("unfinished array encountered", {
    toml: ctx.s,
    ptr: ctx.p
  });
}

// node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let ctx = { s: toml, p: 0, d: maxDepth };
  let res = {};
  let meta = {};
  let tmp;
  let tbl = res;
  let m = meta;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      let k = parseKey(ctx, "]");
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p - 1) !== 93) {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: ctx.p - 1
          });
        }
        ctx.p++;
      }
      let p = peekTable(
        k,
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr: tmp
        });
      }
      m = p[2];
      tbl = p[1];
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(
        k,
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr: tmp
        });
      }
      p[1][p[0]] = extractValue(ctx, void 0, integersAsBigInt);
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && tmp !== 13) {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr: ctx.p
      });
    }
    skipVoid(ctx);
  }
  return res;
}

// config/config.ts
var CONFIG_FIELDS = [
  "version",
  "roles.code",
  "roles.research",
  "roles.review",
  "parallelism.swarm_workers",
  "parallelism.design_candidates",
  "parallelism.reviewers"
];
var DEFAULT_CONFIG = Object.freeze({
  version: 1,
  roles: Object.freeze({ code: "inherit-parent", research: "inherit-parent", review: "inherit-parent" }),
  parallelism: Object.freeze({ swarm_workers: 4, design_candidates: 3, reviewers: 3 })
});
var MAX_CONFIG_BYTES = 64 * 1024;
var roles = ["code", "research", "review"];
var parallelism = ["swarm_workers", "design_candidates", "reviewers"];
function defaults() {
  return {
    version: 1,
    roles: { ...DEFAULT_CONFIG.roles },
    parallelism: { ...DEFAULT_CONFIG.parallelism }
  };
}
function sources() {
  return Object.fromEntries(CONFIG_FIELDS.map((field2) => [field2, "default"]));
}
function failure(path, state, errors) {
  return {
    path,
    state,
    validation: "failed",
    ok: false,
    settings: null,
    sources: null,
    errors,
    hostValidation: "not-performed",
    unverifiedModelRoles: []
  };
}
function missing(path) {
  return {
    path,
    state: "missing",
    validation: "passed",
    ok: true,
    settings: defaults(),
    sources: sources(),
    errors: [],
    hostValidation: "not-performed",
    unverifiedModelRoles: []
  };
}
function confined(root, path) {
  const local = relative(root, path);
  return local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local);
}
function isTable(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validate(path, parsed) {
  const settings = defaults();
  const provenance = sources();
  const errors = [];
  if (Object.keys(parsed).some((key) => !["version", "roles", "parallelism"].includes(key))) {
    errors.push({ code: "unknown-field", message: "Unknown top-level configuration field." });
  }
  if (Object.hasOwn(parsed, "version")) {
    if (typeof parsed.version !== "bigint") {
      errors.push({ code: "invalid-type", field: "version", message: "version must be a TOML integer." });
    } else if (parsed.version !== 1n) {
      errors.push({ code: "unsupported-version", field: "version", message: "Only configuration version 1 is supported." });
    } else {
      provenance.version = "project";
    }
  }
  for (const section2 of ["roles", "parallelism"]) {
    if (!Object.hasOwn(parsed, section2)) continue;
    const table = parsed[section2];
    if (!isTable(table)) {
      errors.push({ code: "invalid-type", field: section2, message: section2 + " must be a TOML table." });
      continue;
    }
    const allowed = section2 === "roles" ? roles : parallelism;
    if (Object.keys(table).some((key) => !allowed.includes(key))) {
      errors.push({ code: "unknown-field", field: section2, message: "Unknown configuration field in " + section2 + "." });
    }
    if (section2 === "roles") {
      for (const role of roles) {
        if (!Object.hasOwn(table, role)) continue;
        const field2 = "roles." + role;
        const value = table[role];
        if (typeof value !== "string" || !/^[\x21-\x7e]{1,256}$/u.test(value)) {
          errors.push({
            code: "invalid-model",
            field: field2,
            message: field2 + " must be a non-empty identifier of at most 256 printable ASCII characters without whitespace."
          });
        } else {
          settings.roles[role] = value;
          provenance[field2] = "project";
        }
      }
    } else {
      for (const key of parallelism) {
        if (!Object.hasOwn(table, key)) continue;
        const field2 = "parallelism." + key;
        const value = table[key];
        if (typeof value !== "bigint" || value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
          errors.push({
            code: "invalid-parallelism",
            field: field2,
            message: field2 + " must be a positive TOML integer within JavaScript's safe integer range."
          });
        } else {
          settings.parallelism[key] = Number(value);
          provenance[field2] = "project";
        }
      }
    }
  }
  if (errors.length !== 0) return failure(path, "present", errors);
  return {
    path,
    state: "present",
    validation: "passed",
    ok: true,
    settings,
    sources: provenance,
    errors: [],
    hostValidation: "not-performed",
    unverifiedModelRoles: roles.filter((role) => settings.roles[role] !== "inherit-parent")
  };
}
async function readConfig(cwd) {
  const path = resolve(cwd, ".codex", "deepwright.toml");
  const unreadable = () => failure(path, "unreadable", [{ code: "unreadable", message: "Project configuration could not be read safely." }]);
  let root;
  let directory;
  let canonical;
  try {
    root = await realpath(cwd);
    if (!(await stat(root)).isDirectory()) return unreadable();
    const candidateDirectory = join(root, ".codex");
    try {
      await lstat(candidateDirectory);
    } catch (error) {
      if (error.code === "ENOENT") return missing(path);
      return unreadable();
    }
    directory = await realpath(candidateDirectory);
    if (!confined(root, directory)) {
      return failure(path, "unreadable", [{ code: "outside-project", message: "The configuration directory resolves outside this project." }]);
    }
    if (!(await stat(directory)).isDirectory()) return unreadable();
    const candidate = join(directory, "deepwright.toml");
    try {
      await lstat(candidate);
    } catch (error) {
      if (error.code === "ENOENT") return missing(path);
      return unreadable();
    }
    canonical = await realpath(candidate);
    if (!confined(root, canonical)) {
      return failure(path, "unreadable", [{ code: "outside-project", message: "The configuration file resolves outside this project." }]);
    }
  } catch {
    return unreadable();
  }
  let bytes;
  try {
    if (!(await stat(canonical)).isFile()) {
      return failure(path, "unreadable", [{ code: "not-regular-file", message: "Configuration must be a regular file." }]);
    }
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) {
        return failure(path, "unreadable", [{ code: "not-regular-file", message: "Configuration must be a regular file." }]);
      }
      const current = await realpath(join(directory, "deepwright.toml"));
      const currentMetadata = await stat(current);
      if (!confined(root, current) || current !== canonical || currentMetadata.dev !== metadata.dev || currentMetadata.ino !== metadata.ino) return unreadable();
      if (metadata.size > MAX_CONFIG_BYTES) {
        return failure(path, "present", [{ code: "too-large", message: "Configuration exceeds the 64 KiB limit." }]);
      }
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, null);
        if (result.bytesRead === 0) break;
        length += result.bytesRead;
      }
      if (length > MAX_CONFIG_BYTES) {
        return failure(path, "present", [{ code: "too-large", message: "Configuration exceeds the 64 KiB limit." }]);
      }
      bytes = buffer.subarray(0, length);
    } finally {
      await handle.close();
    }
  } catch {
    return unreadable();
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return failure(path, "present", [{ code: "invalid-utf8", message: "Configuration must contain valid UTF-8." }]);
  }
  try {
    return validate(path, parse(source, { integersAsBigInt: true, maxDepth: 8 }));
  } catch (error) {
    const location = error instanceof TomlError ? { line: error.line, column: error.column } : {};
    return failure(path, "present", [{ code: "invalid-toml", message: "Invalid TOML configuration.", ...location }]);
  }
}
function formatConfigTemplate() {
  return [
    "# Optional project-local preferences; never grants permission or verifies host models.",
    "version = " + DEFAULT_CONFIG.version,
    "",
    "[roles]",
    ...roles.map((role) => role + " = " + JSON.stringify(DEFAULT_CONFIG.roles[role])),
    "",
    "[parallelism]",
    ...parallelism.map((key) => key + " = " + DEFAULT_CONFIG.parallelism[key]),
    ""
  ].join("\n");
}

// doctor/doctor.ts
import { spawnSync } from "node:child_process";
import { constants as constants2 } from "node:fs";
import { access, stat as stat2 } from "node:fs/promises";
import { dirname, join as join2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var MINIMUM_NODE_VERSION = "20.19.0";
var USAGE = `Usage: deepwright doctor [--json]

Run read-only environment and installation checks.

Options:
  --json       emit a machine-readable report
  -h, --help   display help
`;
function scriptsDirectory() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return dirname(moduleDirectory);
}
function commandProbe(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5e3
  });
  const error = result.error;
  if (error?.code === "ENOENT") return { found: false, ok: false, output: "" };
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    found: error === void 0,
    ok: error === void 0 && result.status === 0,
    output
  };
}
function firstLine(value) {
  return value.split(/\r?\n/, 1)[0] ?? value;
}
function supportsNodeVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/.exec(value);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  if (major !== 20) return major > 20;
  if (minor !== 19) return minor > 19;
  if (patch !== 0) return patch > 0;
  return match[4] === void 0;
}
async function hasExecutable(path) {
  try {
    const details = await stat2(path);
    if (!details.isFile()) return false;
    await access(path, constants2.R_OK | constants2.X_OK);
    return true;
  } catch {
    return false;
  }
}
async function hasPath(path, kind) {
  try {
    const details = await stat2(path);
    return kind === "file" ? details.isFile() : details.isDirectory();
  } catch {
    return false;
  }
}
async function createReport() {
  const scripts = scriptsDirectory();
  const pluginRoot = resolve2(scripts, "../../..");
  const checks = [];
  const nodeVersion = process.versions.node;
  const supportedNode = supportsNodeVersion(nodeVersion);
  checks.push({
    id: "node",
    label: "Node.js",
    status: supportedNode ? "pass" : "fail",
    required: true,
    detail: supportedNode ? `Node.js ${nodeVersion}` : `Node.js ${nodeVersion} is unsupported; version ${MINIMUM_NODE_VERSION} or newer is required`
  });
  const git = commandProbe("git", ["--version"]);
  checks.push({
    id: "git",
    label: "Git",
    status: git.ok ? "pass" : "fail",
    required: true,
    detail: git.ok ? firstLine(git.output) : git.found ? `git failed its version probe: ${firstLine(git.output) || "unknown error"}` : "git was not found on PATH"
  });
  const gh = commandProbe("gh", ["--version"]);
  if (!gh.found) {
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: "warn",
      required: false,
      detail: "gh is not installed; GitHub watch commands will be unavailable"
    });
  } else {
    const auth = commandProbe("gh", ["auth", "status", "--hostname", "github.com"]);
    checks.push({
      id: "github",
      label: "GitHub CLI",
      status: auth.ok ? "pass" : "warn",
      required: false,
      detail: auth.ok ? `${firstLine(gh.output)}; authenticated for github.com` : `${firstLine(gh.output)}; authentication for github.com is unavailable`
    });
  }
  const bundleNames = ["deepwright.mjs", "orch.mjs", "watch-pr.mjs"];
  const missingBundles = [];
  for (const name of bundleNames) {
    if (!await hasExecutable(join2(scripts, "dist", name))) {
      missingBundles.push(`dist/${name}`);
    }
  }
  checks.push({
    id: "bundles",
    label: "CLI bundles",
    status: missingBundles.length === 0 ? "pass" : "fail",
    required: true,
    detail: missingBundles.length === 0 ? "all committed Node.js bundles are readable and executable" : `missing or non-executable: ${missingBundles.join(", ")}`
  });
  const expectedPaths = [
    { label: "package.json", path: join2(scripts, "package.json"), kind: "file" },
    { label: "deepwright", path: join2(scripts, "deepwright"), kind: "file" },
    { label: "orch/orch", path: join2(scripts, "orch", "orch"), kind: "file" },
    {
      label: "watch-pr/watch-pr",
      path: join2(scripts, "watch-pr", "watch-pr"),
      kind: "file"
    },
    { label: "SKILL.md", path: resolve2(scripts, "../SKILL.md"), kind: "file" },
    { label: "playbooks", path: resolve2(scripts, "../playbooks"), kind: "directory" },
    {
      label: ".codex-plugin/plugin.json",
      path: join2(pluginRoot, ".codex-plugin", "plugin.json"),
      kind: "file"
    }
  ];
  const missingPaths = [];
  for (const expected of expectedPaths) {
    if (!await hasPath(expected.path, expected.kind)) missingPaths.push(expected.label);
  }
  checks.push({
    id: "layout",
    label: "Plugin layout",
    status: missingPaths.length === 0 ? "pass" : "fail",
    required: true,
    detail: missingPaths.length === 0 ? "plugin-relative scripts, skill, playbooks, and manifest are present" : `missing: ${missingPaths.join(", ")}`
  });
  return {
    tool: "deepwright",
    command: "doctor",
    ok: checks.every((check) => !check.required || check.status === "pass"),
    checks,
    paths: { scriptsDirectory: scripts, pluginRoot }
  };
}
function renderHuman(report) {
  const lines = [
    `Deepwright doctor: ${report.ok ? "READY" : "FAILED"}`,
    ...report.checks.map(
      (check) => `[${check.status}] ${check.label}: ${check.detail}`
    )
  ];
  return `${lines.join("\n")}
`;
}
async function main(argv, io = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value)
}) {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }
  const json = argv.includes("--json");
  const positional = argv.filter((argument) => argument !== "--json");
  if (positional.length !== 1 || positional[0] !== "doctor") {
    io.stderr(`error: expected the 'doctor' command
${USAGE}`);
    return 64;
  }
  const report = await createReport();
  io.stdout(json ? `${JSON.stringify(report, null, 2)}
` : renderHuman(report));
  return report.ok ? 0 : 1;
}

// discovery/catalog.ts
import { dirname as dirname2, resolve as resolve3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// discovery/metadata.mjs
import { readFile, readdir, realpath as realpath2 } from "node:fs/promises";
import { isAbsolute as isAbsolute2, join as join3, relative as relative2, sep as sep2 } from "node:path";
function validName(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
function field(source, key, indent = "", kind = "string") {
  const lines = source.split("\n");
  const pattern = new RegExp("^" + indent + key + ": *(.*)$");
  const matches = lines.flatMap((line, index) => {
    const match = pattern.exec(line);
    return match === null ? [] : [{ value: match[1], index }];
  });
  if (matches.length !== 1 || !matches[0].value.trim()) {
    throw new Error("expected one non-empty, single-line " + key + " field");
  }
  for (let index = matches[0].index + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.startsWith(indent + " ") || line.startsWith(indent + "	")) {
      throw new Error(key + " must be single-line; continuation lines are unsupported");
    }
    break;
  }
  const value = matches[0].value.trim();
  if (kind === "boolean") return value;
  if (value.startsWith('"')) {
    const decoded = JSON.parse(value);
    if (typeof decoded !== "string" || !decoded.trim() || /[\r\n]/u.test(decoded)) {
      throw new Error(key + " must be a non-empty single-line string");
    }
    return decoded;
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/u.test(value)) throw new Error("invalid quoted " + key);
    const decoded = value.slice(1, -1).replace(/''/g, "'");
    if (!decoded.trim()) throw new Error(key + " must not be empty");
    return decoded;
  }
  if (/^[>|[\]{},&*!#@\u0060]/u.test(value) || /\s#|:\s/u.test(value)) {
    throw new Error(key + " uses unsupported YAML; use a quoted single-line string");
  }
  if (/^(?:null|~|true|false|yes|no|on|off|[-+]?(?:0[xob][\da-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[-+]?\d+)?|\.inf|\.nan))$/iu.test(value)) {
    throw new Error(key + " must be a string; quote non-string YAML scalars");
  }
  return value;
}
function section(source, key) {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) => line === key + ":" ? [index] : []);
  if (starts.length !== 1) throw new Error("expected one " + key + " section");
  const start = starts[0] + 1;
  let end = start;
  while (end < lines.length && (lines[end].trim() === "" || /^\s/u.test(lines[end]))) end++;
  return lines.slice(start, end).join("\n");
}
async function confinedFile(root, path) {
  const canonical = await realpath2(path);
  const local = relative2(root, canonical);
  if (local === ".." || local.startsWith(".." + sep2) || isAbsolute2(local)) {
    throw new Error("metadata path leaves the plugin skills directory: " + path);
  }
  return canonical;
}
async function loadCatalog(pluginRoot) {
  const root = await confinedFile(await realpath2(pluginRoot), join3(pluginRoot, "skills"));
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const skills = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("skill directories must not be symlinks: " + entry.name);
    if (!entry.isDirectory()) continue;
    if (!validName(entry.name)) throw new Error("invalid skill directory: " + entry.name);
    const directory = join3(root, entry.name);
    try {
      const path = await confinedFile(root, join3(directory, "SKILL.md"));
      const policyPath = await confinedFile(root, join3(directory, "agents", "openai.yaml"));
      const source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
      const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(source)?.[1];
      if (frontmatter === void 0) throw new Error("missing YAML frontmatter");
      const name = field(frontmatter, "name");
      if (name !== entry.name) throw new Error("name must match the skill directory");
      if (`deepwright:${name}`.length > 64) throw new Error("qualified skill name exceeds 64 characters");
      const description = field(frontmatter, "description");
      if (description.length > 1024) throw new Error("description exceeds 1024 characters");
      const policy = (await readFile(policyPath, "utf8")).replace(/\r\n/g, "\n");
      const policySection = section(policy, "policy");
      const implicit = field(policySection, "allow_implicit_invocation", "  ", "boolean");
      if (!/^  allow_implicit_invocation: *(true|false) *$/m.test(policySection)) {
        throw new Error("implicit policy must be an unquoted true or false boolean");
      }
      const expectedImplicit = name === "deepwright";
      if (implicit === "true" !== expectedImplicit) {
        throw new Error("implicit invocation must be " + expectedImplicit + " for " + name);
      }
      skills.push({
        name,
        description,
        displayName: field(section(policy, "interface"), "display_name", "  "),
        path,
        invocation: "$deepwright:" + name,
        implicit: implicit === "true"
      });
    } catch (error) {
      throw new Error("invalid metadata for " + entry.name + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  if (skills.length === 0) throw new Error("no skills discovered in " + root);
  return skills;
}

// discovery/catalog.ts
function defaultPluginRoot() {
  return resolve3(dirname2(fileURLToPath2(import.meta.url)), "../../../..");
}
function terminalText(value) {
  return value.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)/gu, "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "").replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, " ").trim();
}
function jsonText(value) {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    (character) => "\\u" + character.codePointAt(0).toString(16).padStart(4, "0")
  ) + "\n";
}

// discovery/workbench.ts
import { lstat as lstat2, readFile as readFile2, readdir as readdir2, realpath as realpath3, stat as stat3 } from "node:fs/promises";
import { isAbsolute as isAbsolute3, join as join4, relative as relative3, sep as sep3 } from "node:path";
function searchEntries(entries, query) {
  const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);
  return entries.filter((entry) => {
    const text = [entry.name, entry.displayName ?? "", entry.description].join(" ").toLowerCase();
    return tokens.every((token) => text.includes(token));
  });
}
async function confined2(root, target) {
  const canonical = await realpath3(target);
  const local = relative3(root, canonical);
  if (local === ".." || local.startsWith(".." + sep3) || isAbsolute3(local)) {
    throw new Error("playbook catalog path leaves its allowed directory: " + target);
  }
  return canonical;
}
async function regularFile(root, target) {
  const canonical = await confined2(root, target);
  if (!(await lstat2(target)).isFile()) {
    throw new Error("playbook catalog requires a regular, non-symlink file: " + target);
  }
  return canonical;
}
function proseLines(source) {
  let fence;
  return source.replace(/\r\n/g, "\n").split("\n").map((line) => {
    const match = /^ {0,3}(\u0060{3,}|~{3,})(.*)$/u.exec(line);
    if (fence !== void 0) {
      if (match !== null && match[1][0] === fence.marker && match[1].length >= fence.length && match[2].trim() === "") fence = void 0;
      return "";
    }
    if (match !== null) {
      fence = { marker: match[1][0], length: match[1].length };
      return "";
    }
    return line;
  });
}
function routerRows(source) {
  const lines = proseLines(source);
  const headings = lines.flatMap((line, index) => line.trim() === "## Playbook router" ? [index] : []);
  if (headings.length !== 1) throw new Error("expected exactly one Playbook router section");
  const start = headings[0] + 1;
  let end = lines.findIndex((line, index) => index >= start && /^##\s/u.test(line));
  if (end < 0) end = lines.length;
  const section2 = lines.slice(start, end);
  const headers = section2.flatMap((line, index) => /^\|\s*Request shape\s*\|\s*Playbook\s*\|$/u.test(line) ? [index] : []);
  if (headers.length !== 1) throw new Error("expected exactly one Request shape / Playbook table");
  const table = headers[0];
  if (!/^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|$/u.test(section2[table + 1] ?? "")) {
    throw new Error("invalid Playbook router table separator");
  }
  let tableEnd = section2.findIndex((line, index) => index > table + 1 && line.trim() === "");
  if (tableEnd < 0) tableEnd = section2.length;
  if (section2.some((line, index) => (index < table || index >= tableEnd) && /^\s*\|/u.test(line))) {
    throw new Error("unexpected table rows outside the Playbook router table");
  }
  const rows = [];
  const names = /* @__PURE__ */ new Set();
  for (let index = table + 2; index < tableEnd; index++) {
    const match = /^\|\s*([^|]+?)\s*\|\s*\u0060playbooks\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md\u0060\s*\|$/u.exec(section2[index]);
    if (match === null || !match[1].trim() || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(match[1])) {
      throw new Error("malformed Playbook router row at line " + (start + index + 1));
    }
    if (names.has(match[2])) throw new Error("duplicate playbook row: " + match[2]);
    names.add(match[2]);
    rows.push({ name: match[2], description: match[1].trim() });
  }
  if (rows.length === 0) throw new Error("Playbook router table has no playbooks");
  return rows.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
async function loadPlaybooks(pluginRoot) {
  const root = await realpath3(pluginRoot);
  const router = await regularFile(root, join4(root, "skills", "deepwright", "SKILL.md"));
  const rows = routerRows(await readFile2(router, "utf8"));
  const directory = await confined2(root, join4(root, "skills", "deepwright", "playbooks"));
  if (!(await stat3(directory)).isDirectory()) throw new Error("playbooks must be a directory");
  const expected = new Set(rows.map((row) => row.name + ".md"));
  for (const entry of await readdir2(directory, { withFileTypes: true })) {
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    if (!expected.has(entry.name)) throw new Error("uncatalogued playbook markdown file: " + entry.name);
    if (!entry.isFile()) throw new Error("playbooks must be regular, non-symlink files: " + entry.name);
  }
  const playbooks = [];
  for (const row of rows) {
    const path = await regularFile(directory, join4(directory, row.name + ".md"));
    playbooks.push({ ...row, path });
  }
  return playbooks;
}

// discovery/ranking.mjs
var MAX_QUERY_BYTES = 4096;
var stopWords = new Set("a an and are as at be been being by can could do does for from had has have i in into is it its me my of on or our please so than that the their them there these they this those to us use was we were what when which who will with would you your deepwright".split(" "));
function inflection(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(?:sses|shes|ches|xes|zes)$/u.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/u.test(word)) return word.slice(0, -1);
  return word;
}
function searchTerms(text) {
  return (text.normalize("NFKC").replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => !stopWords.has(word)).map(inflection);
}
function searchDocument(entry) {
  const name = searchTerms(entry.name);
  const display = searchTerms(entry.displayName ?? "");
  return [...name, ...name, ...name, ...display, ...display, ...searchTerms(entry.description)];
}
function validateSearch(query, limit = 3) {
  if (typeof query !== "string" || Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES) {
    throw new RangeError("find query must be a string of at most " + MAX_QUERY_BYTES + " UTF-8 bytes");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throw new RangeError("limit must be an integer from 1 to 10");
  }
}
function rankEntries(entries, query, limit = 3) {
  validateSearch(query, limit);
  const terms = [...new Set(searchTerms(query))];
  const exactQuery = query.normalize("NFKC").trim().toLowerCase().replace(/^\$?deepwright:/u, "");
  if (exactQuery.length === 0 || entries.length === 0) return [];
  const documents = entries.map((entry) => {
    const tokens = searchDocument(entry);
    const counts = /* @__PURE__ */ new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { entry, counts, length: tokens.length };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const frequencies = new Map(terms.map((term) => [term, documents.filter((document) => document.counts.has(term)).length]));
  const hits = documents.flatMap(({ entry, counts, length }) => {
    const exact = entry.name.normalize("NFKC").toLowerCase() === exactQuery ? 2 : (entry.displayName ?? "").normalize("NFKC").toLowerCase() === exactQuery ? 1 : 0;
    const matchedTerms = terms.filter((term) => counts.has(term));
    if (!exact && matchedTerms.length === 0) return [];
    const score = matchedTerms.reduce((sum, term) => {
      const frequency = counts.get(term);
      const documentFrequency = frequencies.get(term);
      const inverseFrequency = Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      return sum + inverseFrequency * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / averageLength));
    }, 0);
    return [{ entry, exact, matchedTerms, score }];
  });
  const exactBoost = Math.max(0, ...hits.map((hit) => hit.score)) + 1;
  return hits.map(({ entry, exact, score, matchedTerms }) => ({
    ...entry,
    score: score + exact * exactBoost,
    matchedTerms
  })).sort((left, right) => right.score - left.score || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)).slice(0, limit);
}

// discovery/cli.ts
var commands = ["home", "doctor", "skills", "skill", "playbooks", "find", "invoke", "status", "config"];
var USAGE2 = [
  "Usage: deepwright <command> [options]",
  "",
  "  home [--json]                           compact start page (also no args)",
  "  doctor [--json]                         check runtime and plugin layout",
  "  skills [query] [--compact|--json]       list or search skill metadata",
  "  playbooks [query] [--json]              browse the canonical router table",
  "  find <query> [--limit 1..10] [--json]   rank metadata; default 3 per kind",
  "  skill <name> [--json]                   inspect a skill and its invocation",
  "  invoke <name> [--host codex|agents|claude|omp] [--json]",
  "                                         print guidance; never execute it",
  "  status [--json]                         inspect package and config validity",
  "  config show|check|template [--json]     inspect settings; never write them",
  "",
  "All commands are read-only. They cannot confirm active host/session state.",
  "-h, --help displays this help. Quote a multiword search query.",
  ""
].join("\n");
var UsageError = class extends Error {
};
function parse2(argv) {
  const seen = /* @__PURE__ */ new Set();
  const positionals = [];
  let host = "codex";
  let limit = 3;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    const flag = argument === "-h" ? "--help" : argument;
    if (!["--json", "--help", "--host", "--compact", "--limit"].includes(flag)) throw new UsageError("unknown option: " + argument);
    if (seen.has(flag)) throw new UsageError("duplicate option: " + flag);
    seen.add(flag);
    if (flag === "--limit") {
      const value2 = argv[++index];
      if (value2 === void 0 || !/^(?:[1-9]|10)$/u.test(value2)) throw new UsageError("--limit must be an integer from 1 to 10");
      limit = Number(value2);
    }
    if (flag === "--host") {
      const value2 = argv[++index];
      if (value2 !== "codex" && value2 !== "agents" && value2 !== "claude" && value2 !== "omp") {
        throw new UsageError("--host must be codex, agents, claude, or omp");
      }
      host = value2;
    }
  }
  const command = positionals[0] ?? "home";
  if (!commands.includes(command)) throw new UsageError("expected a valid command");
  if (seen.has("--host") && command !== "invoke") throw new UsageError("--host is only valid with invoke");
  if (seen.has("--limit") && command !== "find") throw new UsageError("--limit is only valid with find");
  if (seen.has("--compact") && command !== "skills") throw new UsageError("--compact is only valid with skills");
  if (seen.has("--compact") && seen.has("--json")) throw new UsageError("--compact and --json are mutually exclusive");
  const value = positionals[1];
  const requiredName = command === "skill" || command === "invoke";
  const maximum = ["home", "doctor", "status"].includes(command) ? 1 : 2;
  if (positionals.length > maximum) throw new UsageError("too many arguments for " + command);
  if (requiredName && value === void 0 && !seen.has("--help")) throw new UsageError(command + " requires a skill name");
  if (requiredName && value !== void 0 && !validName(value)) throw new UsageError("invalid skill name: " + value);
  if (command === "config" && !(value === void 0 && seen.has("--help")) && !["show", "check", "template"].includes(value ?? "")) throw new UsageError("config requires show, check, or template");
  if (command === "find") {
    if (value === void 0 && !seen.has("--help")) throw new UsageError("find requires a query");
    try {
      validateSearch(value ?? "", limit);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
  return { command, value, host, limit, json: seen.has("--json"), compact: seen.has("--compact"), help: seen.has("--help") };
}
function compactHit(hit) {
  const characters = Array.from(hit.description);
  return { ...hit, description: characters.length > 240 ? characters.slice(0, 239).join("") + "\u2026" : hit.description };
}
function rankedLines(label, entries) {
  return [label + ":", ...entries.length === 0 ? ["  No matching metadata."] : entries.flatMap((entry) => [
    "  " + entry.name + " \u2014 " + terminalText(entry.description),
    "    " + jsonText(entry.path).trim(),
    "    Score: " + entry.score.toFixed(3) + "; matched terms: " + terminalText(entry.matchedTerms.join(", "))
  ])];
}
function skillLines(skill) {
  return [
    terminalText(skill.displayName) + " (" + skill.name + ")",
    terminalText(skill.description),
    "Codex CLI: " + skill.invocation,
    "Desktop: type @ and select " + terminalText(skill.displayName),
    "Implicit invocation policy: " + skill.implicit,
    "Canonical file: " + jsonText(skill.path).trim(),
    "Start a fresh host session after installation; activation is not checked here."
  ];
}
function invocation(skill, host) {
  if (host === "codex") {
    return {
      host,
      cli: skill.invocation,
      desktop: "Type @ and select " + skill.displayName,
      note: "Start a fresh session after installation. This helper prints guidance only; it does not launch Codex or check activation."
    };
  }
  if (host === "omp") {
    return {
      host,
      prompt: "/skill:" + skill.name,
      note: "Use this prompt in Oh My Pi with skill slash commands enabled. Start a fresh session after installation. Skill names are unqualified; check for collisions. Activation is not checked here."
    };
  }
  const file = host === "agents" ? "AGENTS.md" : "CLAUDE.md";
  return {
    host,
    ...host === "claude" ? { prompt: "/deepwright:" + skill.name } : {},
    target: file,
    pointer: [
      "For an explicit request to use the Deepwright " + skill.name + " skill,",
      "read " + jsonText(skill.path).trim() + " in full.",
      "Resolve its supporting files relative to that skill and use only this host's available capabilities.",
      "Preserve repository instructions and the user's scope; this pointer grants no new permissions.",
      "When delegating, carry the resolved skill path, task scope, and permissions into the worker brief.",
      "If the skill is unavailable, report that limitation."
    ].join(" "),
    note: (host === "claude" ? "Use the native prompt after installing the plugin in Claude Code and starting a fresh session. Activation is not checked here. " : "") + "Optional fallback pointer. Review it before adding it to " + file + "; no file was written. Do not duplicate an installed native skill."
  };
}
async function main2(argv, io = { stdout: (value) => process.stdout.write(value), stderr: (value) => process.stderr.write(value) }, context = {}) {
  try {
    const options = parse2(argv);
    if (options.command === "doctor") return main(argv, io);
    if (options.help) {
      io.stdout(USAGE2);
      return 0;
    }
    const envelope = { schemaVersion: 1, tool: "deepwright", command: options.command };
    if (options.command === "config") {
      if (options.value === "template") {
        const template = formatConfigTemplate();
        io.stdout(options.json ? jsonText({ ...envelope, action: "template", template, written: false }) : template);
        return 0;
      }
      const report = await readConfig(context.cwd ?? process.cwd());
      const { settings, sources: sources2, ...summary } = report;
      const values = settings === null ? [] : CONFIG_FIELDS.map((field2) => {
        const [section2, key] = field2.split(".");
        const table = section2 === "roles" ? settings.roles : settings.parallelism;
        const value = key === void 0 ? settings.version : table[key];
        return field2 + " = " + jsonText(value).trim() + " [" + sources2[field2] + "]";
      });
      io.stdout(options.json ? jsonText({ ...envelope, action: options.value, ...options.value === "show" ? report : summary }) : [
        "Project config: " + report.state + " \u2014 " + jsonText(report.path).trim(),
        "Config validation: " + report.validation + (report.state === "missing" ? " (defaults)" : ""),
        ...options.value === "show" ? values : [],
        ...report.errors.map((issue) => terminalText(issue.message) + (issue.line === void 0 ? "" : " (line " + issue.line + ", column " + issue.column + ")")),
        "Model availability: not checked. Settings are preferences, not host capability or permission."
      ].join("\n") + "\n");
      return report.ok ? 0 : 1;
    }
    const pluginRoot = await realpath4(context.pluginRoot ?? defaultPluginRoot());
    const skills = await loadCatalog(pluginRoot);
    if (options.command === "home") {
      const routes = await loadPlaybooks(pluginRoot);
      const entrypoints = skills.filter((skill) => skill.implicit);
      io.stdout(options.json ? jsonText({ ...envelope, skillCount: skills.length, playbookCount: routes.length, entrypoints }) : [
        "Deepwright \u2014 Go deep. Ship sound.",
        skills.length + " skills \xB7 " + routes.length + " playbooks \xB7 no background mode",
        "",
        ...entrypoints.map((skill) => "Start in Codex: " + skill.invocation + " <your engineering task>"),
        "Desktop: type @ and select a Deepwright skill.",
        "",
        "Find:     deepwright skills review --compact",
        'Suggest:  deepwright find "review code security"',
        "Route:    deepwright playbooks performance",
        "Inspect:  deepwright skill interrogate",
        "Invoke:   deepwright invoke interrogate",
        "Settings: deepwright config show",
        "Health:   deepwright status   /   deepwright doctor",
        "",
        "Read-only helper. Paste skill tokens into Codex, not your shell."
      ].join("\n") + "\n");
    } else if (options.command === "find") {
      const query = options.value;
      const foundSkills = rankEntries(skills, query, options.limit).map(compactHit);
      const foundPlaybooks = rankEntries(await loadPlaybooks(pluginRoot), query, options.limit).map(compactHit);
      io.stdout(options.json ? jsonText({
        ...envelope,
        query,
        limit: options.limit,
        algorithm: "bm25",
        skills: foundSkills,
        playbooks: foundPlaybooks
      }) : [
        ...rankedLines("Skills", foundSkills),
        ...rankedLines("Playbooks", foundPlaybooks),
        "Suggestions only. Read selected files in full; scores measure lexical relevance, not permission or confidence."
      ].join("\n") + "\n");
    } else if (options.command === "playbooks") {
      const matches = searchEntries(await loadPlaybooks(pluginRoot), options.value ?? "");
      io.stdout(options.json ? jsonText({ ...envelope, query: options.value ?? null, playbooks: matches }) : matches.length === 0 ? "No matching playbooks.\n" : matches.map((entry) => entry.name + " \u2014 " + terminalText(entry.description) + "\n  " + jsonText(entry.path).trim()).join("\n") + "\nAsk the Deepwright skill to use the fitting playbook; these are not separate skill tokens.\n");
    } else if (options.command === "skills") {
      const matches = searchEntries(skills, options.value ?? "");
      io.stdout(options.json ? jsonText({ ...envelope, query: options.value ?? null, skills: matches }) : matches.length === 0 ? "No matching skills.\n" : matches.map((skill) => skill.name + (skill.implicit ? " [implicit]" : "") + " \u2014 " + terminalText(skill.displayName) + (options.compact ? "" : "\n  " + terminalText(skill.description))).join("\n") + "\n");
    } else if (options.command === "status") {
      const manifest = JSON.parse(await readFile3(join5(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
      if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
        throw new Error("plugin manifest has no valid version");
      }
      const { settings: _settings, sources: sources2, ...config } = await readConfig(context.cwd ?? process.cwd());
      const projectOverrides = sources2 === null ? null : Object.values(sources2).filter((value) => value === "project").length;
      const implicitSkills = skills.filter((skill) => skill.implicit).map((skill) => skill.name);
      const hostState = {
        sessionActivation: "unknown",
        models: "unknown",
        mcp: "unknown",
        note: "Package metadata is not host state; use the host's own plugin, model, and MCP interfaces."
      };
      io.stdout(options.json ? jsonText({
        ...envelope,
        schemaVersion: 2,
        version: manifest.version,
        pluginRoot,
        skillCount: skills.length,
        implicitSkills,
        explicitSkillCount: skills.length - implicitSkills.length,
        config: { ...config, projectOverrides },
        hostState
      }) : [
        "Deepwright " + manifest.version + ": " + skills.length + " skills",
        "Implicit policy: " + (implicitSkills.join(", ") || "none"),
        "Plugin root: " + jsonText(pluginRoot).trim(),
        "Project config: " + config.state + " \u2014 " + jsonText(config.path).trim(),
        "Config validation: " + config.validation + (projectOverrides === null ? "; run deepwright config check" : "; " + projectOverrides + " project overrides"),
        "Host session activation, models, and MCP state: unknown (not available to this helper)."
      ].join("\n") + "\n");
      return config.ok ? 0 : 1;
    } else {
      const skill = skills.find((entry) => entry.name === options.value);
      if (skill === void 0) throw new UsageError("unknown skill: " + options.value + "; run deepwright skills");
      if (options.command === "skill") {
        io.stdout(options.json ? jsonText({ ...envelope, skill }) : skillLines(skill).join("\n") + "\n");
      } else {
        const guidance = invocation(skill, options.host);
        io.stdout(options.json ? jsonText({ ...envelope, skill, guidance }) : [
          "Invocation guidance only \u2014 nothing executed or written.",
          ..."cli" in guidance ? ["Codex CLI: " + guidance.cli, terminalText(guidance.desktop)] : [
            ..."prompt" in guidance && guidance.prompt ? ["Host prompt: " + guidance.prompt] : [],
            ..."pointer" in guidance ? ["Optional " + guidance.target + " pointer:", guidance.pointer] : []
          ],
          terminalText(guidance.note)
        ].join("\n") + "\n");
      }
    }
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = error instanceof UsageError ? 64 : 1;
    io.stderr(argv.includes("--json") ? jsonText({ schemaVersion: 1, tool: "deepwright", error: detail, exitCode: code }) : "error: " + terminalText(detail) + "\n" + (code === 64 ? USAGE2 : ""));
    return code;
  }
}

// doctor/entry.ts
process.exitCode = await main2(process.argv.slice(2));
/*! Bundled license information:

smol-toml/dist/date.js:
smol-toml/dist/error.js:
smol-toml/dist/util.js:
smol-toml/dist/primitive.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
