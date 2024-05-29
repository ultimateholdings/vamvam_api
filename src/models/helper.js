/*jslint node this*/
const {Op, col, fn, where} = require("sequelize");
const {mergableObject} = require("../utils/helpers");


const stringName = (val) => (
    typeof val === "string"
    ? val
    : undefined

);
function paginationQuery(offset, maxSize) {
    let query = {};
    if (offset > 0) {
        query.limit = maxSize + 1;
        query.offset = offset - 1;
    } else {
        query.limit = maxSize;
        query.offset = offset;
    }
    return query;
}

/**this function purpose is to avoid jslint complaining about
 * usage of inline symbols in objects
 * such as {[Symbol]: value}
 *  */
function buildClause(operator, value) {
    const result = {};
    result[operator] = value;
    return result;
}

function join(model, joinName, inner = true) {
    const result = Object.create(mergableObject);
    const as = stringName(joinName);
    return result.with({as, model, required: inner});
}

function constraints(foreignKey, name, rigid = false) {
    const result = Object.create(mergableObject);
    const as = stringName(name);
    return result.with({as, constraints: rigid, foreignKey});
}

function isoDay(timestamp) {
    return new Date(timestamp).toISOString().split("T")[0];
}

function buildPeriodQuery(from, to, key = "createdAt") {
    let result = [];
    const begin = Date.parse(from);
    const end = Date.parse(to);
    if (Number.isFinite(begin)) {
        result = result.concat(
            where(fn("DATEDIFF", col(key), isoDay(begin)), Op.gte, 0)
        );
    }
    if (Number.isFinite(end)) {
        result = result.concat(
            where(fn("DATEDIFF", col(key), isoDay(end)), Op.lte, 0)
        );
    }
    return result;
}

module.exports = Object.freeze({
    buildClause,
    buildPeriodQuery,
    constraints,
    join,
    paginationQuery
});
