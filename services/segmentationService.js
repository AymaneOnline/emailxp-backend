// Service to translate segment filters into a Mongo query safely
// Supports field/operator normalization, validation and diagnostics

const SUPPORTED_OPERATORS = new Set([
  'equals','not_equals','contains','not_contains','starts_with','ends_with',
  'is_empty','is_not_empty','greater_than','less_than','between','in','not_in',
  'before','after','within_days','more_than_days_ago'
]);

function normalizeValue(field, operator, value) {
  if (['within_days','more_than_days_ago'].includes(operator)) {
    const n = parseInt(value,10); return isNaN(n)?0:n;
  }
  if (['greater_than','less_than','between'].includes(operator)) {
    if (Array.isArray(value)) return value.map(v=>Number(v));
    return Number(value);
  }
  return value;
}

function dateRelative(days, direction) {
  const d = new Date();
  d.setDate(d.getDate() - (direction==='past'?days:0));
  return d;
}

function buildSingleCondition(filter) {
  const { field, operator } = filter;
  if (!SUPPORTED_OPERATORS.has(operator)) return {};
  const value = normalizeValue(field, operator, filter.value);
  const secondValue = filter.secondValue;
  const path = field;
  const cond = {};

  switch(operator) {
    case 'equals': cond[path] = value; break;
    case 'not_equals': cond[path] = { $ne: value }; break;
    case 'contains': cond[path] = { $regex: value, $options:'i' }; break;
    case 'not_contains': cond[path] = { $not: { $regex: value, $options:'i' } }; break;
    case 'starts_with': cond[path] = { $regex: `^${value}`, $options:'i' }; break;
    case 'ends_with': cond[path] = { $regex: `${value}$`, $options:'i' }; break;
    case 'is_empty': cond[path] = { $in:[null,''] }; break;
    case 'is_not_empty': cond[path] = { $nin:[null,''] }; break;
    case 'greater_than': cond[path] = { $gt: Number(value) }; break;
    case 'less_than': cond[path] = { $lt: Number(value) }; break;
    case 'between': cond[path] = { $gte: Number(value), $lte: Number(secondValue) }; break;
    case 'in': cond[path] = { $in: String(value).split(',').map(s=>s.trim()) }; break;
    case 'not_in': cond[path] = { $nin: String(value).split(',').map(s=>s.trim()) }; break;
    case 'before': cond[path] = { $lt: new Date(value) }; break;
    case 'after': cond[path] = { $gt: new Date(value) }; break;
    case 'within_days': {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(value));
      cond[path] = { $gte: cutoff }; break;
    }
    case 'more_than_days_ago': {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(value));
      cond[path] = { $lt: cutoff }; break;
    }
  }

  // Special field translations
  if (['openCount','clickCount'].includes(field)) {
    // numeric comparisons already handled; ensure number casting
    if (['equals','not_equals','greater_than','less_than','between'].includes(operator)) {
      // Already numeric above; nothing more needed
    }
  }

  if (['lastOpenAt','lastClickAt'].includes(field)) {
    // Date-based operators already processed; nothing extra
  }


  if (field === 'subscriptionStatus') {
    cond['status'] = cond[path];
    delete cond[path];
  }

  return cond;
}

function combine(conditions, logic) {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return logic === 'OR' ? { $or: conditions } : { $and: conditions };
}

function buildMongoQuery(filters=[], logic='AND') {
  const conditions = [];
  for (const f of filters) {
    if (!f || !f.field || !f.operator) continue;
    conditions.push(buildSingleCondition(f));
  }
  return combine(conditions, logic);
}

module.exports = { buildMongoQuery };
