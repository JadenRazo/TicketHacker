// No Nest application, Prisma connection, queue, or provider is started here.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.TICKETHACKER_TYPESCRIPT || 'typescript');
const noop = () => () => {};
class Logger { debug() {} log() {} warn() {} error() {} }
const common = new Proxy({ Logger, BadRequestException: class extends Error {}, NotFoundException: class extends Error {} }, { get: (target, key) => target[key] || noop });
const stubs = {
  '@nestjs/common': common,
  '@nestjs/config': {},
  '@nestjs/event-emitter': { OnEvent: noop },
  '@nestjs/bullmq': { Processor: noop, InjectQueue: noop, WorkerHost: class {} },
  '@nestjs/passport': { AuthGuard: noop },
  'class-validator': new Proxy({}, { get: () => noop }),
  '@prisma/client': { PrismaClient: class {}, Channel: { TELEGRAM: 'TELEGRAM', DISCORD: 'DISCORD' }, MessageType: { TEXT: 'TEXT' }, MessageDirection: { INBOUND: 'INBOUND', OUTBOUND: 'OUTBOUND' }, TicketStatus: { OPEN: 'OPEN', CLOSED: 'CLOSED' } },
  bullmq: {},
  grammy: { Bot: class { constructor() { throw Error('Real bot construction forbidden'); } } },
  'discord.js': { Client: class { constructor() { throw Error('Real client construction forbidden'); } } },
};
function loader(root = process.env.TICKETHACKER_SOURCE_ROOT || path.resolve(__dirname, '../src')) {
  const cache = new Map();
  return function load(relative) {
    let file = path.resolve(root, relative);
    // A selected baseline snapshot falls back only for unchanged dependencies.
    if (!fs.existsSync(file) && file.startsWith(root + path.sep)) file = path.resolve(__dirname, '../src', path.relative(root, file));
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true, emitDecoratorMetadata: false },
      fileName: file, reportDiagnostics: true,
    });
    if (compiled.diagnostics?.length) throw new Error(compiled.diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
    const source = compiled.outputText;
    const localRequire = (name) => {
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (['crypto', 'node:crypto'].includes(name)) return require(name);
      throw new Error(`Unexpected dependency in offline test: ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports,fetch){${source}\n})`, { filename: file })(
      localRequire, module, module.exports,
      (...args) => globalThis.fetch(...args),
    );
    return module.exports;
  };
}
module.exports = { loader };
