const { PrismaClient, Prisma } = require('../generated/prisma');

// Money columns are DECIMAL(14, 2) in the database (exact storage), but the
// services do plain JS arithmetic on them and the frontend expects JSON
// numbers. So every Decimal that leaves this client is turned into a JS
// number. 14 digits with 2 decimals fit a double exactly.

// 1. JSON: any Decimal that still slips through serializes as a number
Prisma.Decimal.prototype.toJSON = function toJSON() {
  return this.toNumber();
};

const isDecimal = (value) =>
  value !== null &&
  typeof value === 'object' &&
  (value instanceof Prisma.Decimal || Prisma.Decimal.isDecimal(value));

// Recursively replace Decimal values with numbers (plain objects and arrays
// only, so Dates, Buffers and BigInts are left alone)
const decimalsToNumbers = (value) => {
  if (isDecimal(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(decimalsToNumbers);
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        decimalsToNumbers(inner),
      ]),
    );
  }
  return value;
};

// 2. Model results (find*, create, update, upsert, delete, nested includes):
// a computed field shadows every Decimal column, read from the generated DMMF
// so a new money column is covered automatically
const toNumberOrNull = (value) =>
  value === null || value === undefined ? value : Number(value);

const decimalResultFields = Prisma.dmmf.datamodel.models.reduce(
  (acc, model) => {
    const fields = model.fields.filter(
      (field) => field.kind === 'scalar' && field.type === 'Decimal',
    );
    if (fields.length === 0) return acc;
    const modelKey = model.name.charAt(0).toLowerCase() + model.name.slice(1);
    acc[modelKey] = Object.fromEntries(
      fields.map((field) => [
        field.name,
        {
          needs: { [field.name]: true },
          compute: (row) => toNumberOrNull(row[field.name]),
        },
      ]),
    );
    return acc;
  },
  {},
);

// 3. Aggregates (_sum, _avg, ...) and raw queries are not covered by result
// extensions, so convert their Decimals here
const convertResult = async ({ args, query }) =>
  decimalsToNumbers(await query(args));

const prisma = new PrismaClient().$extends({
  name: 'decimal-money-as-number',
  result: decimalResultFields,
  query: {
    $allModels: {
      aggregate: convertResult,
      groupBy: convertResult,
    },
    $queryRaw: convertResult,
    $queryRawUnsafe: convertResult,
  },
});

module.exports = prisma;
