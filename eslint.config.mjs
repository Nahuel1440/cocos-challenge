import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Flat config replaces a rule's options instead of merging them, so every block below
// builds its `no-restricted-syntax` and `no-restricted-imports` lists from these constants.
const PARENT_RELATIVE = {
  group: ['..', '../*'],
  message: 'Use @/... (maps to src/...)',
};

const NEST_AND_PRISMA = [
  {
    group: ['@nestjs/*', '@nestjs-cls/*', 'nestjs-cls'],
    message: 'layer-boundary: domain code is pure TypeScript, no @nestjs/*.',
  },
  {
    group: ['@prisma/*', '@database'],
    message: 'layer-boundary: Prisma types stay in infrastructure.',
  },
];
const OUTER_LAYERS = (layers) =>
  layers.map((layer) => ({
    group: [
      `@/*/${layer}`,
      `@/*/${layer}/**`,
      `@/shared/${layer}`,
      `@/shared/${layer}/**`,
    ],
    message: `layer-boundary: this layer never imports ${layer}.`,
  }));

const NO_STRING_TOKEN = {
  selector:
    'CallExpression[callee.name="Inject"] > :matches(Literal, TemplateLiteral)',
  message:
    'symbol-token: inject a port with its Symbol, @Inject(ORDER_REPOSITORY), never a string.',
};

const NO_TRANSACTION = {
  selector:
    'CallExpression:matches([callee.property.name="$transaction"], [callee.property.value="$transaction"])',
  message:
    'dumb-repository: a repository joins the ambient transaction and never opens one; use UnitOfWork.run in the use case.',
};

const REPOSITORY = 'TSInterfaceDeclaration[id.name=/Repository$/]';
const PORT_METHOD_PREFIX = {
  selector: `${REPOSITORY} :matches(TSMethodSignature, TSPropertySignature[typeAnnotation.typeAnnotation.type='TSFunctionType']):not([key.name=/^(save|search|find)/])`,
  message:
    'port-method-name: a repository port method starts with save, search or find. search* may return null or an empty list, find* throws on a miss. No delete.',
};
const FIND_NEVER_NULL = {
  selector: `${REPOSITORY} :matches(TSMethodSignature[key.name=/^find/] > TSTypeAnnotation, TSPropertySignature[key.name=/^find/]) :matches(TSNullKeyword, TSUndefinedKeyword)`,
  message:
    'find-never-null: a find* port method returns a result or throws a NotFoundException; use search* when null is a valid answer.',
};
const PORT_PARAMS_OBJECT = {
  selector: `${REPOSITORY} TSMethodSignature[params.length>1]`,
  message:
    'params-object: a port method with more than one parameter takes one params object typed by a named interface.',
};
const NO_FREE_FUNCTIONS = {
  selector:
    'ExportNamedDeclaration > FunctionDeclaration, ExportDefaultDeclaration > FunctionDeclaration',
  message:
    'no-free-functions: domain code has no exported free functions; put the rule in a domain service or an entity.',
};

// Signature rules: no destructuring in the signature, no inline object types. Arrows passed straight
// to a call or `new` (.map(({ x }) => ...)) are exempt.
const SIGNATURE_OWNER =
  ':matches(FunctionDeclaration, FunctionExpression, TSEmptyBodyFunctionExpression, TSMethodSignature, ArrowFunctionExpression:not(CallExpression > ArrowFunctionExpression.arguments, NewExpression > ArrowFunctionExpression.arguments))';
const SIGNATURE_SELECTORS = [
  {
    selector: `${SIGNATURE_OWNER} > :matches(ObjectPattern, AssignmentPattern, RestElement).params`,
    message:
      'params-signature: do not destructure in the signature (also not with a default or rest); take params and destructure on the first line of the body.',
  },
  {
    selector: `${SIGNATURE_OWNER} > Identifier.params > TSTypeAnnotation > TSTypeLiteral`,
    message:
      'params-interface: type a params object with a named interface, not an inline object type.',
  },
];

const ONLY_RUN =
  'one-public-method: a domain service or use case has exactly one non-private method, named run(). Make helpers private.';
const PARAMS_OBJECT =
  'params-object: a method with more than one parameter takes one params object typed by a named interface.';
const RUN_ONLY_SELECTORS = [
  {
    selector:
      "MethodDefinition[kind=/^(method|get|set)$/][accessibility!='private'][key.name!='run']:not([key.type='PrivateIdentifier']):not([value.type='TSEmptyBodyFunctionExpression'])",
    message: ONLY_RUN,
  },
  {
    selector:
      "PropertyDefinition[accessibility!='private'] > :matches(ArrowFunctionExpression, FunctionExpression)",
    message: ONLY_RUN,
  },
  {
    selector:
      ":matches(MethodDefinition[kind='method'], TSAbstractMethodDefinition[kind='method']) > :matches(FunctionExpression, TSEmptyBodyFunctionExpression)[params.length>1]",
    message: PARAMS_OBJECT,
  },
  {
    selector:
      'PropertyDefinition > :matches(ArrowFunctionExpression, FunctionExpression)[params.length>1]',
    message: PARAMS_OBJECT,
  },
];

const restrictedImports = (...extra) => [
  'error',
  { patterns: [PARENT_RELATIVE, ...extra] },
];
const restrictedSyntax = (...selectors) => [
  'error',
  NO_STRING_TOKEN,
  ...SIGNATURE_SELECTORS,
  ...selectors,
];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.atl/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(),
      'no-restricted-syntax': restrictedSyntax(),
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'explicit', overrides: { constructors: 'no-public' } },
      ],
    },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-syntax': restrictedSyntax(NO_FREE_FUNCTIONS),
      'no-restricted-imports': restrictedImports(
        ...NEST_AND_PRISMA,
        ...OUTER_LAYERS(['application', 'infrastructure']),
      ),
    },
  },
  {
    files: ['src/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        {
          group: ['@prisma/*', '@database'],
          message: 'layer-boundary: Prisma types stay in infrastructure.',
        },
        ...OUTER_LAYERS(['infrastructure']),
      ),
    },
  },
  {
    files: ['src/**/domain/ports/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': restrictedSyntax(
        NO_FREE_FUNCTIONS,
        PORT_METHOD_PREFIX,
        FIND_NEVER_NULL,
        PORT_PARAMS_OBJECT,
      ),
    },
  },
  {
    files: ['src/**/infrastructure/**/*.ts'],
    rules: { 'no-restricted-syntax': restrictedSyntax(NO_TRANSACTION) },
  },
  {
    files: [
      'src/**/domain/services/**/*.ts',
      'src/**/application/use-cases/**/*.ts',
    ],
    ignores: ['**/__tests__/**', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': restrictedSyntax(
        NO_FREE_FUNCTIONS,
        ...RUN_ONLY_SELECTORS,
      ),
    },
  },
);
